#!/usr/bin/env node

/**
 * Final Integration Test - Complete GLB Extraction and Download
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
    
    // Extended JavaScript execution with multiple strategies
    const glbUrl = await page.evaluate(() => {
      return new Promise<string | null>((resolve) => {
        // Strategy 1: Check window globals
        const checkGlobals = () => {
          const globals = (window as any)
          const keys = [
            'glbUrl', 'modelUrl', '__IKEA_GLB_URL__', 
            'rotera', 'model', 'viewer', '__model__',
            '_glb', '_model'
          ]
          for (const key of keys) {
            if (globals[key] && typeof globals[key] === 'string' && globals[key].includes('.glb')) {
              return globals[key]
            }
          }
          return null
        }

        // Strategy 2: Search script contents
        const checkScripts = () => {
          for (const script of document.scripts) {
            if (script.textContent && script.textContent.length < 1000000) {
              const match = script.textContent.match(/https:\/\/[^"'\s<>]+\.glb/g)
              if (match) {
                // Return the first valid-looking one
                for (const m of match) {
                  if (!m.includes('google') && !m.includes('cdn') && m.includes('glb')) {
                    return m
                  }
                }
              }
            }
          }
          return null
        }

        // Strategy 3: Check all DOM elements
        const checkDom = () => {
          const images = document.querySelectorAll('img, picture, source')
          for (const el of images) {
            for (const attr of el.attributes) {
              if (attr.value && attr.value.includes('.glb')) {
                return attr.value
              }
            }
          }
          return null
        }

        // Strategy 4: Monitor fetch/XHR
        let foundUrl: string | null = null
        const originalFetch = window.fetch
        window.fetch = ((...args: any[]) => {
          const url = args[0]
          const urlStr = typeof url === 'string' ? url : url?.url || ''
          if (urlStr.includes('.glb')) {
            foundUrl = urlStr
          }
          return originalFetch(...args)
        }) as any

        // Try immediately
        let result = checkGlobals() || checkScripts() || checkDom()
        if (result) {
          resolve(result)
          return
        }

        // Wait and retry
        let attempts = 0
        const retryInterval = setInterval(() => {
          attempts++
          result = foundUrl || checkGlobals() || checkScripts() || checkDom()
          if (result || attempts > 30) {
            clearInterval(retryInterval)
            resolve(result)
          }
        }, 200)

        // Max wait 6 seconds
        setTimeout(() => {
          clearInterval(retryInterval)
          resolve(foundUrl || checkGlobals() || checkScripts() || checkDom())
        }, 6000)
      })
    })

    if (!glbUrl) {
      logger.warn('  ⚠️  No GLB URL found after JavaScript evaluation')
      return null
    }

    logger.info(`  ✓ Found GLB URL: ${glbUrl.substring(0, 100)}...`)

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

    const buffer = await response.arrayBuffer()
    logger.info(`  ✓ Downloaded: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`)

    return { glbUrl, buffer }
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
  const results: Array<{ name: string; success: boolean; fileName?: string; size?: number }> = []

  try {
    for (const testCase of TEST_URLS) {
      logger.info(`\n📦 TEST: ${testCase.name}`)
      logger.info(`   URL: ${testCase.url.substring(0, 80)}...`)

      try {
        const result = await extractAndDownloadGlb(testCase.url, browserManager)

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
