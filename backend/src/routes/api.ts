import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { createJob, getJob, updateJob } from '../store/jobStore';
import { processProduct } from '../services/playwrightService';
import * as os from 'os';
import archiver from 'archiver';
import * as THREE from 'three';

const router = Router();
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? '/app/downloads';

router.post('/fetch-product', (req: Request, res: Response) => {
  const { url } = req.body as { url?: string };

  if (!url || !url.includes('ikea.com')) {
    res.status(400).json({ error: 'Invalid or non-IKEA URL' });
    return;
  }

  const jobId = uuidv4();
  createJob(jobId);

  processProduct(jobId, url).catch((err: unknown) => {
    updateJob(jobId, {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  });

  res.json({ jobId });
});

router.get('/status/:id', (req: Request, res: Response) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});

router.get('/preview/:id', (req: Request, res: Response) => {
  const job = getJob(req.params.id);
  if (!job || job.status !== 'done' || !job.filename) {
    res.status(404).json({ error: 'File not ready' });
    return;
  }

  const filePath = path.join(DOWNLOADS_DIR, job.filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File missing from disk' });
    return;
  }

  res.setHeader('Content-Type', 'model/gltf-binary');
  res.setHeader('Cache-Control', 'no-store');

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('error', () => res.status(500).end());
  // No deletion — file lives until /download/:id is called
});

router.get('/download/:id', (req: Request, res: Response) => {
  const job = getJob(req.params.id);
  if (!job || job.status !== 'done' || !job.filename) {
    res.status(404).json({ error: 'File not ready' });
    return;
  }

  const filePath = path.join(DOWNLOADS_DIR, job.filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File missing from disk' });
    return;
  }

  res.setHeader('Content-Disposition', `attachment; filename="${job.filename}"`);
  res.setHeader('Content-Type', 'model/gltf-binary');

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('error', () => res.status(500).end());
  stream.on('close', () => {
    // Clean up after download
    fs.unlink(filePath, () => {});
  });
});

// Convert downloaded GLB -> OBJ + MTL + textures, return ZIP
router.get('/convert/:id', async (req: Request, res: Response) => {
  const job = getJob(req.params.id);
  let glbPath: string | null = null;
  // Debug helper: allow direct file path via ?file=<filename> to convert without job store
  const qfile = typeof req.query.file === 'string' ? req.query.file : undefined;
  if (qfile) {
    // Normalize and disallow absolute or parent paths. Only allow basenames or relative names.
    const safeName = path.basename(qfile);
    const candidate = path.join(DOWNLOADS_DIR, safeName);
    if (candidate.startsWith(path.normalize(DOWNLOADS_DIR))) {
      glbPath = candidate;
    }
  }

  if (!glbPath) {
    if (!job || job.status !== 'done' || !job.filename) {
      res.status(404).json({ error: 'File not ready' });
      return;
    }
    const jobFilename = job.filename as string;
    glbPath = path.join(DOWNLOADS_DIR, jobFilename);
  }
  if (!fs.existsSync(glbPath)) {
    res.status(404).json({ error: 'File missing from disk' });
    return;
  }

  // Create temp dir
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `conv-${req.params.id}-`));
  try {
    // Use Blender headless to convert GLB -> OBJ + MTL + textures
    // Invoke blender Python script; Blender is installed in the image
    const { execFileSync } = await import('child_process');
    const blenderScript = path.join(__dirname, '..', '..', 'scripts', 'blender_convert.py');
    try {
      // Attempt to decode Draco-compressed GLB using the included Node helper.
      // If decoding succeeds we'll pass the decoded file to Blender.
      const decodedPath = path.join(tmpDir, 'decoded.glb');
      try {
        execFileSync('node', [path.join(__dirname, '..', '..', 'scripts', 'decode-draco.mjs'), glbPath, decodedPath], {
          stdio: 'inherit',
          timeout: 60_000,
        });
        if (fs.existsSync(decodedPath) && fs.statSync(decodedPath).size > 0) {
          glbPath = decodedPath;
        }
      } catch (e) {
        // Decoding failed or not needed — continue with original GLB and let Blender attempt import
      }

      execFileSync('blender', ['--background', '--python', blenderScript], {
        env: { ...process.env, BLENDER_IN: glbPath, BLENDER_OUT_DIR: tmpDir },
        stdio: 'inherit',
        timeout: 120000,
      });
    } catch (e) {
      throw new Error('Blender conversion failed: ' + (e instanceof Error ? e.message : String(e)));
    }

    // After Blender runs, expect model.obj + model.mtl + textures in tmpDir
    const objPath = path.join(tmpDir, 'model.obj');
    const mtlPath = path.join(tmpDir, 'model.mtl');
    const textures: { filename: string; data?: Buffer }[] = [];
    if (fs.existsSync(objPath)) {
      // collect textures referenced in the MTL if present
      if (fs.existsSync(mtlPath)) {
        let mtlText = fs.readFileSync(mtlPath, 'utf8');
        // Normalize any map_Kd paths to basenames because Blender may emit paths
        mtlText = mtlText
          .split(/\r?\n/)
          .map((line) => {
            const m = line.match(/^(map_Kd)\s+(.*)$/);
            if (m) {
              const key = m[1];
              const full = m[2].trim();
              const b = path.basename(full);
              textures.push({ filename: b });
              return `${key} ${b}`;
            }
            return line;
          })
          .join('\n');
        // Overwrite mtl file with normalized entries so the ZIP is consistent
        fs.writeFileSync(mtlPath, mtlText, 'utf8');
      }
    }

    // Use Blender-produced files and give them friendly names in the ZIP
    const baseName = path.basename(glbPath).replace(/\.glb$/i, '') || `model-${req.params.id}`;
    const objFilename = `${baseName}.obj`;
    const mtlFilename = `${baseName}.mtl`;
    const blenderObjPath = path.join(tmpDir, 'model.obj');
    const blenderMtlPath = path.join(tmpDir, 'model.mtl');

    // Zip and stream
    const zipName = `${baseName}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);

    if (fs.existsSync(blenderObjPath)) archive.file(blenderObjPath, { name: objFilename });
    if (fs.existsSync(blenderMtlPath)) archive.file(blenderMtlPath, { name: mtlFilename });
    for (const t of textures) {
      const p = path.join(tmpDir, t.filename);
      // If file doesn't exist, skip it silently (Blender may embed textures)
      if (fs.existsSync(p)) archive.file(p, { name: t.filename });
    }

    await archive.finalize();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message ?? String(err) });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});

export default router;
