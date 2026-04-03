import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { createJob, getJob, updateJob } from '../store/jobStore';
import { processProduct } from '../services/playwrightService';

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

export default router;
