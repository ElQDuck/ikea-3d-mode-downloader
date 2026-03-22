#!/usr/bin/env node

/**
 * Advanced Integration Test - Direct GLB Extraction from IKEA
 * Uses JavaScript execution and network monitoring
 */

import { IkeaScraperPuppeteerImpl } from '../src/components/browser-scraper'
import type { IkeaScraperPuppeteerConfig } from '../src/types'
import { logger } from '../src/utils/logger'
import { PuppeteerBrowserManager } from '../src/components/browser-manager'
import * as fs from 'fs'
import * as path from 'path'

const TEST_URLS = [
  {
    url: 'https://www.ikea.com/no/no/p/soederhamn-hjornesofa-4-seters-med-apen-ende-tonerud-gra-s19452073/#content',
    region: 'no_NO',
    name: 'Soderhamn Sofa (Norwegian)',
  },
  {
    url: 'https://www.ikea.com/de/de/p/poaeng-schaukelstuhl-eichenfurnier-weiss-lasiert-gunnared-beige-s59502052/',
    region: 'de_DE',
    name: 'Poang Chair (German)',
  },
]

const tmpDir = path.join(process.cwd(), 'tmp')
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true })
}

async function extractGlbDirect(url: string, browserManager: PuppeteerBrowserManager): Promise<string | null> {
  const page = await browserManager.createPage()
  
  try {
    logger.info('Loading page...')
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })

    // Wait for JavaScript to execute
    logger.info('Waiting for JavaScript execution...')
    await new Promise(r => setTimeout(r, 3000))

    // Execute JavaScript to find GLB URLs
    const glbUrl = await page.evaluate(() => {
      // Method 1: Check window globals
      const globals = (window as any)
      if (globals.glbUrl) return globals.glbUrl
      if (globals.modelUrl) return globals.modelUrl
      if (globals.__IKEA_GLB_URL__) return globals.__IKEA_GLB_URL__

      // Method 2: Check all script tags for embedded URLs
      for (const script of document.scripts) {
        if (script.textContent) {
          const match = script.textContent.match(/https:\/\/[^"'\s]+\.glb/g)
          if (match) return match[0]
        }
      }

      // Method 3: Check visible elements
      const images = document.querySelectorAll('img[src*=".glb"], img[src*=".gltf"]')
      if (images.length > 0) {
        return (images[0] as HTMLImageElement).src
      }

      // Method 4: Check all DOM attributes
      for (const el of document.querySelectorAll('*')) {
        for (const attr of el.attributes) {
          if (attr.value && attr.value.includes('.glb')) {
            return attr.value
          }
        }
      }

      return null
    })

    if (glbUrl) {
      logger.info(`Found GLB URL: ${glbUrl}`)
      return glbUrl
    }

    logger.warn('No GLB URL found after JavaScript execution')
    return null
  } finally {
    await page.close()
  }
}

async function runAdvancedTest() {
  logger.info('🚀 Starting Advanced IKEA Scraper Integration Tests')
  logger.info(`📂 Using temporary directory: ${tmpDir}`)

  const config: IkeaScraperPuppeteerConfig = {
    timeout: 60000,
    maxRetries: 2,
    retryDelay: 2000,
    usePuppeteer: true,
    browserConfig: {
      headless: true,
      timeout: 60000,
      tmpDir: tmpDir,
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
  await browserManager.initialize(config.browserConfig)

  let passedTests = 0
  let failedTests = 0

  try {
    for (const testCase of TEST_URLS) {
      logger.info(`\n📦 Testing: ${testCase.name}`)
      logger.info(`🔗 URL: ${testCase.url}`)

      try {
        const glbUrl = await extractGlbDirect(testCase.url, browserManager)

        if (!glbUrl) {
          logger.error(`  ✗ Failed to extract GLB URL`)
          failedTests++
          continue
        }

        // Try to download the GLB
        logger.info(`  • Downloading GLB file...`)
        const response = await fetch(glbUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; IKEA-3D-Downloader)',
          },
        })

        if (!response.ok) {
          logger.error(`  ✗ Download failed: HTTP ${response.status}`)
          failedTests++
          continue
        }

        const buffer = await response.arrayBuffer()
        logger.info(`  ✓ GLB downloaded: ${(buffer.byteLength / 1024).toFixed(2)} KB`)

        // Save the file
        const fileName = `${testCase.name.replace(/\s/g, '_')}.glb`
        const outputPath = path.join(tmpDir, fileName)
        fs.writeFileSync(outputPath, Buffer.from(buffer))
        logger.info(`  ✓ Saved to: ${outputPath}`)

        passedTests++
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        logger.error(`  ✗ Test failed: ${message}`)
        failedTests++
      }
    }
  } finally {
    await browserManager.shutdown()
  }

  logger.info('\n' + '='.repeat(60))
  logger.info(`📊 Test Results: ${passedTests} passed, ${failedTests} failed`)
  logger.info('='.repeat(60))

  process.exit(failedTests > 0 ? 1 : 0)
}

runAdvancedTest().catch((error) => {
  logger.error('Fatal error:', error)
  process.exit(1)
})
