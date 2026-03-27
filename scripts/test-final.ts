#!/usr/bin/env node

/**
 * Final Integration Test - Complete GLB Extraction and Download
 */

import { IkeaScraperPuppeteerImpl } from '../src/components/browser-scraper'
import { NetworkInterceptionImpl } from '../src/components/network-interceptor'
import type { IkeaScraperPuppeteerConfig } from '../src/types'
import { logger } from '../src/utils/logger'
import { validateFullGlb } from '../src/utils/validate-glb'
import { PuppeteerBrowserManager } from '../src/components/browser-manager'
import * as fs from 'fs'
import * as path from 'path'

const TEST_URLS = [
  {
    url: 'https://www.ikea.com/no/no/p/soederhamn-hjornesofa-4-seters-med-apen-ende-tonerud-gra-s19452073/#content',
    region: 'no_NO',
    name: 'Soderhamn Sofa',
  },
  {
    url: 'https://www.ikea.com/de/de/p/poaeng-schaukelstuhl-eichenfurnier-weiss-lasiert-gunnared-beige-s59502052/',
    region: 'de_DE',
    name: 'Poang Chair',
  },
]

const tmpDir = path.join(process.cwd(), 'tmp', 'browser-sessions')
const outputDir = path.join(process.cwd(), 'tmp', 'downloaded_models')

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true })
}
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

async function extractAndDownloadGlb(
  url: string,
  browserManager: PuppeteerBrowserManager
): Promise<{ glbUrl: string; buffer: ArrayBuffer } | null> {
  const page = await browserManager.createPage()
  
  try {
    logger.info('  Loading page with network idle detection...')
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })

    logger.info('  Executing JavaScript to find GLB URL...')
    // Prefer network interception (CDP/page response monitoring) to detect
    // GLB downloads. This avoids executing large in-page scripts which can
    // fail when transpiler helpers are present.
    const interception = new NetworkInterceptionImpl(page)
    await interception.start()

    // Trigger navigation / model load
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })

    // Try to auto-click possible 3D viewer buttons (small inline function)
    try {
      await page.evaluate(() => {
        const selectors = ['[class*="3d-viewer"]', '[id*="viewer"]', 'button']
        for (const sel of selectors) {
          const el = document.querySelector(sel)
          if (el && el instanceof HTMLElement) {
            el.click()
            break
          }
        }
      })
    } catch (e) {
      // Non-fatal
      logger.debug(`Auto-click failed: ${e}`)
    }

    // Wait a short while for network requests to occur
    await new Promise((r) => setTimeout(r, 2500))

    // Give some time for in-page network requests to complete
    await new Promise((r) => setTimeout(r, 1500))

    await interception.stop()

    const best = interception.getBestCandidate()
    if (!best) {
      logger.warn('  ⚠️  No GLB candidate detected via network interception')
      return null
    }

    const glbUrl = best.url
    logger.info(`  ✓ Found GLB URL: ${glbUrl.substring(0, 200)}...`)

    // Download the GLB
    logger.info('  Downloading GLB file...')
    const response = await fetch(glbUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; IKEA-3D-Downloader/1.0)',
        'Accept': 'application/octet-stream',
        'Referer': url,
      },
    })

    if (!response.ok) {
      logger.error(`  ✗ Download failed: HTTP ${response.status}`)
      return null
    }

    const MAX_FULL_SAVE_SIZE = 1000 * 1024 * 1024 // 1000MB

    const contentLengthHeader = response.headers.get('content-length')
    const contentType = response.headers.get('content-type') || ''
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined

    if (contentType && (contentType.toLowerCase().startsWith('text/') || contentType.toLowerCase().includes('javascript') || contentType.toLowerCase().includes('html'))) {
      logger.warn(`  ✗ Remote reported textual content-type: ${contentType}`)
      return null
    }

    if (typeof contentLength === 'number' && contentLength > MAX_FULL_SAVE_SIZE) {
      logger.error(`  ✗ Remote file too large to save: ${contentLength} bytes`)
      return null
    }

    // Read with timeout and max size enforcement
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    try {
      const ab = await response.arrayBuffer()
      clearTimeout(timer)
      const buf = Buffer.from(ab)
      const valid = validateFullGlb(buf)
      if (valid.ok) {
        logger.info(`  ✓ Downloaded: ${(buf.length / 1024 / 1024).toFixed(2)} MB`)
        return { glbUrl, buffer: ab }
      } else {
        // Save invalid buffer and metadata
        const ts = Date.now()
        const safeName = url.replace(/https?:\/\//, '').replace(/[^a-z0-9]/gi, '_').toLowerCase()
        const invalidDir = path.join(process.cwd(), 'tmp', 'invalid')
        if (!fs.existsSync(invalidDir)) fs.mkdirSync(invalidDir, { recursive: true })
        const binPath = path.join(invalidDir, `${ts}-${safeName}.bin`)
        const metaPath = path.join(invalidDir, `${ts}-${safeName}.json`)
        fs.writeFileSync(binPath, buf)
        const meta = {
          url: glbUrl,
          headers: Object.fromEntries(response.headers.entries()),
          reason: valid.reason,
          peek: buf.slice(0, 64).toString('hex'),
        }
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2))
        logger.warn(`  ✗ Invalid GLB saved: ${binPath}, metadata: ${metaPath}`)
        return null
      }
    } catch (e) {
      clearTimeout(timer)
      logger.error(`  ✗ Error reading response: ${String(e)}`)
      return null
    }
  } finally {
    await page.close()
  }
}

async function runFinalTest() {
  logger.info('\n' + '='.repeat(70))
  logger.info('🚀 FINAL INTEGRATION TEST - IKEA 3D Model Downloader')
  logger.info('='.repeat(70))
  logger.info(`📂 Session directory: ${tmpDir}`)
  logger.info(`📁 Output directory: ${outputDir}`)

  const config: IkeaScraperPuppeteerConfig = {
    timeout: 60000,
    maxRetries: 2,
    retryDelay: 2000,
    usePuppeteer: true,
    browserConfig: {
      headless: true,
      timeout: 60000,
      tmpDir: tmpDir,
      wsEndpoint: process.env.BROWSER_WS_ENDPOINT || undefined,
    },
    modelLoadTimeout: 15000,
    jsExecutionTimeout: 15000,
    interceptNetwork: true,
    minGlbSize: 1000,
    maxGlbSize: 500000000,
    retryStrategy: 'exponential',
    captureConsole: true,
  }

  const browserManager = new PuppeteerBrowserManager()
  // Allow passing a WS endpoint via env var
  if (process.env.BROWSER_WS_ENDPOINT) {
    ;(config.browserConfig as any).wsEndpoint = process.env.BROWSER_WS_ENDPOINT
  }
  await browserManager.initialize(config.browserConfig)

  let passedTests = 0
  let failedTests = 0
  const results: Array<{ name: string; success: boolean; fileName?: string; size?: number }> = []

  try {
    for (const testCase of TEST_URLS) {
      logger.info(`\n📦 TEST: ${testCase.name}`)
      logger.info(`   URL: ${testCase.url.substring(0, 80)}...`)

        try {
        // Retry download/extract up to 2 attempts
        let result: { glbUrl: string; buffer: ArrayBuffer } | null = null
        let attempt = 0
        while (attempt < 2) {
          attempt++
          result = await extractAndDownloadGlb(testCase.url, browserManager)
          if (result) break
          logger.info(`Retrying extraction/download (attempt ${attempt + 1}) after delay...`)
          await new Promise(r => setTimeout(r, 1500))
        }

        if (!result) {
          logger.error(`  ✗ FAILED - Could not extract/download GLB`)
          failedTests++
          results.push({ name: testCase.name, success: false })
          continue
        }

        // Save the file
        const safeFileName = testCase.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
        const fileName = `${safeFileName}.glb`
        const outputPath = path.join(outputDir, fileName)
        
        // result is confirmed non-null above
        fs.writeFileSync(outputPath, Buffer.from(result.buffer))
        
        logger.info(`  ✓ SUCCESS`)
        logger.info(`    File: ${fileName}`)
        logger.info(`    Size: ${(result.buffer.byteLength / 1024 / 1024).toFixed(2)} MB`)
        logger.info(`    Path: ${outputPath}`)

        passedTests++
        results.push({
          name: testCase.name,
          success: true,
          fileName,
          size: result.buffer.byteLength,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        logger.error(`  ✗ ERROR: ${message}`)
        failedTests++
        results.push({ name: testCase.name, success: false })
      }
    }
  } finally {
    logger.info('\n🧹 Cleaning up...')
    await browserManager.shutdown()
  }

  // Print summary
  logger.info('\n' + '='.repeat(70))
  logger.info('📊 TEST RESULTS SUMMARY')
  logger.info('='.repeat(70))
  
  for (const result of results) {
    if (result.success) {
      logger.info(`✓ ${result.name}`)
      logger.info(`  └─ ${result.fileName} (${(result.size! / 1024).toFixed(2)} KB)`)
    } else {
      logger.info(`✗ ${result.name}`)
    }
  }

  logger.info('\n' + '='.repeat(70))
  logger.info(`PASSED: ${passedTests}/${TEST_URLS.length}`)
  logger.info(`FAILED: ${failedTests}/${TEST_URLS.length}`)
  logger.info('='.repeat(70))

  if (passedTests > 0) {
    logger.info(`\n✨ GLB files saved to: ${outputDir}`)
    logger.info('   Files are ready for download!')
  }

  process.exit(failedTests > 0 ? 1 : 0)
}

runFinalTest().catch((error) => {
  logger.error('\n💥 FATAL ERROR:', error)
  process.exit(1)
})
