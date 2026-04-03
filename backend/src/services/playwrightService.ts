import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { updateJob } from '../store/jobStore';

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? '/app/downloads';

export async function processProduct(jobId: string, ikeaUrl: string): Promise<void> {
  const browser = await chromium.launch({
    args: ['--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  let glbBuffer: Buffer | null = null;
  let glbFilename = `model-${jobId}.glb`;

  // Strategy 1: Intercept GLB at network level — must be registered BEFORE goto()
  await page.route('**/*.glb*', async (route) => {
    if (glbBuffer !== null) {
      await route.abort();
      return;
    }

    updateJob(jobId, { status: 'downloading', message: 'Intercepted GLB request, downloading...' });

    const response = await route.fetch();
    glbBuffer = await response.body();

    const url = route.request().url();
    const urlPath = new URL(url).pathname;
    const basename = path.basename(urlPath).split('?')[0];
    if (basename.endsWith('.glb')) glbFilename = basename;

    await route.fulfill({ response });
  });

  // Strategy 2: JSON-LD static extraction (parallel fallback)
  const jsonLdPromise: Promise<string | null> = page
    .waitForLoadState('domcontentloaded')
    .then(() =>
      page.evaluate((): string | null => {
        const scripts = Array.from(
          document.querySelectorAll('script[type="application/ld+json"]')
        );
        for (const el of scripts) {
          try {
            const data = JSON.parse(el.textContent ?? '');
            const items: unknown[] = Array.isArray(data) ? data : [data];
            for (const item of items) {
              const obj = item as Record<string, unknown>;
              if (obj['@type'] === '3DModel' && Array.isArray(obj['encoding'])) {
                const encodings = obj['encoding'] as Array<Record<string, string>>;
                const iqp3 = encodings.find((e) => /glb.*iqp3/i.test(e['contentUrl'] ?? ''));
                const rqp3 = encodings.find((e) => /glb.*rqp3/i.test(e['contentUrl'] ?? ''));
                const fallback = encodings.find((e) => /\.glb/i.test(e['contentUrl'] ?? ''));
                return (iqp3 ?? rqp3 ?? fallback)?.['contentUrl'] ?? null;
              }
            }
          } catch {}
        }
        return null;
      })
    )
    .catch(() => null);

  updateJob(jobId, { status: 'navigating', message: 'Loading IKEA product page...' });

  try {
    await page.goto(ikeaUrl, { waitUntil: 'networkidle', timeout: 60_000 });
  } catch {
    // networkidle may timeout on heavy pages — continue anyway
  }

  // Click the 3D viewer button to trigger model load
  updateJob(jobId, { status: 'waiting_for_3d', message: 'Activating 3D viewer...' });

  const xrButtonSelectors = [
    '.pipf-xr-button',
    '.pip-xr-button',
    '[data-testid="xr-button"]',
    'button[aria-label*="3D"]',
    'button[aria-label*="View in 3D"]',
    '[aria-label*="3D"]',
  ];

  for (const sel of xrButtonSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 3_000 })) {
        await btn.click();
        break;
      }
    } catch {}
  }

  // Wait up to 30s for route interception
  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      if (glbBuffer !== null) {
        clearInterval(interval);
        resolve();
      }
    }, 500);
    setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, 30_000);
  });

  // Fallback: use JSON-LD URL
  if (glbBuffer === null) {
    const jsonLdUrl = await jsonLdPromise;
    if (jsonLdUrl) {
      updateJob(jobId, { status: 'downloading', message: 'Downloading via JSON-LD URL...' });
      const apiResp = await context.request.get(jsonLdUrl);
      glbBuffer = await apiResp.body();
      const basename = path.basename(new URL(jsonLdUrl).pathname).split('?')[0];
      if (basename.endsWith('.glb')) glbFilename = basename;
    }
  }

  await browser.close();

  if (glbBuffer === null) {
    updateJob(jobId, { status: 'error', error: 'No 3D model (GLB) found on this page.' });
    return;
  }

  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }

  const filePath = path.join(DOWNLOADS_DIR, glbFilename);
  fs.writeFileSync(filePath, glbBuffer);

  updateJob(jobId, {
    status: 'done',
    message: 'Model ready for download.',
    filename: glbFilename,
  });
}
