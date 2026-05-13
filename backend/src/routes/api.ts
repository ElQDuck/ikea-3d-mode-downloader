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
    // Process all .mtl files Blender might have written in tmpDir — be defensive
    try {
      const mtlFiles = fs.readdirSync(tmpDir).filter((f) => f.toLowerCase().endsWith('.mtl'));
      const imageFiles = (() => {
        try {
          return fs.readdirSync(tmpDir).filter((f) => {
            const e = path.extname(f).toLowerCase();
            return ['.png', '.jpg', '.jpeg', '.tga', '.bmp'].includes(e);
          });
        } catch (e) {
          return [] as string[];
        }
      })();

      const prefer = ['basecolor', 'base_color', 'base-color', 'albedo', 'diffuse', 'color', 'kd'];
      const pickDiffuse = () => {
        for (const p of prefer) {
          const found = imageFiles.find((x) => x.toLowerCase().includes(p));
          if (found) return found;
        }
        return imageFiles[0] as string | undefined;
      };

      const allowedLine = /^(#.*|newmtl\s+.+|Ns\s+.+|Ka\s+.+|Kd\s+.+|Ks\s+.+|Ke\s+.+|Ni\s+.+|d\s+.+|illum\s+.+|map_\w+\b.*|bump\b.*|disp\b.*|decal\b.*)$/i;

      for (const mfile of mtlFiles) {
        const mpath = path.join(tmpDir, mfile);
        let mtlText = fs.readFileSync(mpath, 'utf8');
        const lines = mtlText.split(/\r?\n/);
        const outLines: string[] = [];
        const referenced: string[] = [];

        for (let line of lines) {
          if (!line || line.trim().length === 0) {
            outLines.push(line);
            continue;
          }
          if (!allowedLine.test(line)) {
            continue; // drop garbage
          }

          const m = line.match(/^(map_\w+|bump|disp|decal)\b(.*)$/i);
          if (m) {
            const key = m[1];
            const rest = m[2].trim();
            const tokens = rest.split(/\s+/).filter(Boolean);
            const full = tokens.length ? tokens[tokens.length - 1] : rest;
            const b = path.basename(full || '');
            // If the filename token is valid and exists in our imageFiles, keep it.
            if (b && b !== '.' && imageFiles.includes(b)) {
              referenced.push(b);
              outLines.push(`${key} ${b}`);
            } else {
              // If this is the diffuse slot, try to inject a reasonable diffuse image
              if (/^map_Kd$/i.test(key)) {
                const diffuse = pickDiffuse();
                if (diffuse) {
                  referenced.push(diffuse);
                  outLines.push(`map_Kd ${diffuse}`);
                }
                // otherwise drop the invalid map_Kd line
              }
              // For other map types (bump, disp, etc.) we skip invalid entries to avoid
              // leaving lines like "map_Bump ." which break some importers.
            }
            continue;
          }

          outLines.push(line);
        }

        const hasMapKd = outLines.some((L) => /^map_Kd\b/i.test(L));
        if (!hasMapKd) {
          const diffuse = pickDiffuse();
          if (diffuse) {
            let inserted = false;
            for (let i = 0; i < outLines.length; i++) {
              if (/^newmtl\b/i.test(outLines[i])) {
                outLines.splice(i + 1, 0, `map_Kd ${diffuse}`);
                referenced.push(diffuse);
                inserted = true;
                break;
              }
            }
            if (!inserted) {
              outLines.push(`map_Kd ${diffuse}`);
              referenced.push(diffuse);
            }
          }
        }

        // Inject common auxiliary maps (normals -> bump, occlusion -> map_Ka) if we have matching images
        const pickByCandidates = (candidates: string[]) => {
          for (const p of candidates) {
            const found = imageFiles.find((x) => x.toLowerCase().includes(p));
            if (found) return found;
          }
          return undefined;
        };

        const normalCandidate = pickByCandidates(['normal', 'norm', 'nrm']);
        const occlusionCandidate = pickByCandidates(['occlusion', 'ao', 'ambientocclusion']);

        // Determine material block ranges so we insert per-material if missing
        const materialIndices: number[] = [];
        for (let i = 0; i < outLines.length; i++) {
          if (/^newmtl\b/i.test(outLines[i])) materialIndices.push(i);
        }
        materialIndices.push(outLines.length); // sentinel for end

        for (let mi = 0; mi < materialIndices.length - 1; mi++) {
          const start = materialIndices[mi];
          const end = materialIndices[mi + 1];
          const block = outLines.slice(start, end);
          const hasBump = block.some((L) => /^(bump|map_Bump)\b/i.test(L));
          const hasMapKa = block.some((L) => /^map_Ka\b/i.test(L));

          const insertPos = start + 1; // after newmtl
          const inserts: string[] = [];
          if (!hasBump && normalCandidate) {
            inserts.push(`map_Bump ${normalCandidate}`);
            referenced.push(normalCandidate);
          }
          if (!hasMapKa && occlusionCandidate) {
            inserts.push(`map_Ka ${occlusionCandidate}`);
            referenced.push(occlusionCandidate);
          }

          if (inserts.length > 0) {
            // splice at correct position — adjust indices because we're mutating outLines
            outLines.splice(insertPos, 0, ...inserts);
            // adjust subsequent materialIndices positions to account for inserted lines
            for (let k = mi + 1; k < materialIndices.length; k++) materialIndices[k] += inserts.length;
          }
        }

        fs.writeFileSync(mpath, outLines.join('\n'), 'utf8');

        for (const b of referenced) {
          if (b) textures.push({ filename: b });
        }
      }
    } catch (e) {
      // ignore — we'll still include any images found in tmpDir as a fallback
    }
    }

    // Use Blender-produced files and give them friendly names in the ZIP
    const baseName = path.basename(glbPath).replace(/\.glb$/i, '') || `model-${req.params.id}`;
    const objFilename = `${baseName}.obj`;
    const mtlFilename = `${baseName}.mtl`;
    const blenderObjPath = path.join(tmpDir, 'model.obj');
    const blenderMtlPath = path.join(tmpDir, 'model.mtl');

    // If Blender wrote an OBJ that references 'model.mtl' (or other name), rewrite the OBJ
    // so its mtllib points to the MTL name we will place in the ZIP (mtlFilename).
    const modifiedObjPath = path.join(tmpDir, 'model.forzip.obj');
    try {
      if (fs.existsSync(blenderObjPath)) {
        const objText = fs.readFileSync(blenderObjPath, 'utf8');
        // Replace the first mtllib line to reference the final mtlFilename
        const newObjText = objText.replace(/^mtllib\s+.*$/m, `mtllib ${mtlFilename}`);
        fs.writeFileSync(modifiedObjPath, newObjText, 'utf8');
      }
    } catch (e) {
      // if anything fails, fall back to using original blenderObjPath
    }

    // Zip and stream
    const zipName = `${baseName}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);

    if (fs.existsSync(modifiedObjPath)) archive.file(modifiedObjPath, { name: objFilename });
    else if (fs.existsSync(blenderObjPath)) archive.file(blenderObjPath, { name: objFilename });
    if (fs.existsSync(blenderMtlPath)) archive.file(blenderMtlPath, { name: mtlFilename });
    for (const t of textures) {
      const p = path.join(tmpDir, t.filename);
      // If file doesn't exist, skip it silently (Blender may embed textures)
      if (fs.existsSync(p)) archive.file(p, { name: t.filename });
    }

    // Fallback: include any image files found in tmpDir (png/jpg/jpeg/gif/bmp)
    // This helps when Blender exported images but MTL parsing missed them.
    const imgExt = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tga', '.ktx2', '.ktx'];
    try {
      const files = fs.readdirSync(tmpDir);
      for (const f of files) {
        const ext = path.extname(f).toLowerCase();
        if (imgExt.includes(ext)) {
          const p = path.join(tmpDir, f);
          // Avoid double-adding files we've already added via textures list
          if (!textures.find((t) => t.filename === f)) {
            archive.file(p, { name: f });
          }
        }
      }
    } catch (e) {
      // ignore
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
