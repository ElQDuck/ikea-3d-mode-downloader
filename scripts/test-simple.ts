#!/usr/bin/env node

/**
 * Simple Integration Test - Direct GLB Extraction
 */

import { logger } from '../src/utils/logger'
import { PuppeteerBrowserManager } from '../src/components/browser-manager'
import * as fs from 'fs'
import * as path from 'path'

const TEST_URLS = [
  {
    url: 'https://www.ikea.com/no/no/p/soederhamn-hjornesofa-4-seters-med-apen-ende-tonerud-gra-s19452073/#content',
    name: 'Soderhamn Sofa',
  },
  {
    url: 'https://www.ikea.com/de/de/p/poaeng-schaukelstuhl-eichenfurnier-weiss-lasiert-gunnared-beige-s59502052/',
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

async function extractGlbUrl(page: any, url: string): Promise<string | null> {
  try {
    // Strategy 1: Check for GLB in scripts synchronously
    const glbFromScript = await page.evaluate(() => {
      const scripts = Array.from(document.scripts)
      for (const script of scripts) {
        if (script.textContent) {
          const match = script.textContent.match(/https:\/\/[^"'\s<>]+\.glb[^"'\s<>]*/i)
          if (match) {
            return match[0]
          }
        }
      }
      return null
    })

    if (glbFromScript) {
      return glbFromScript as string
    }

    // Strategy 2: Check DOM attributes
    const glbFromDom = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*')
      for (const el of allElements) {
        for (const attr of el.attributes) {
          if (attr.value && attr.value.match(/https:\/\/[^"'\s<>]+\.glb/i)) {
            return attr.value
          }
        }
      }
      return null
    })

    if (glbFromDom) {
      return glbFromDom as string
    }

    // Strategy 3: Wait for networkidle and check again
    await new Promise(r => setTimeout(r, 2000))
    
    const glbAfterWait = await page.evaluate(() => {
      const scripts = Array.from(document.scripts)
      for (const script of scripts) {
        if (script.textContent && script.textContent.length < 100000) {
          const match = script.textContent.match(/https:\/\/[^"'\s<>]+\.glb[^"'\s<>]*/i)
          if (match) {
            return match[0]
          }
        }
      }
      return null
    })

    return (glbAfterWait as string) || null
  } catch (error) {
    logger.warn(`Error extracting GLB URL: ${error}`)
    return null
  }
}

async function runTest() {
  logger.info('\n' + '='.repeat(70))
  logger.info('🚀 SIMPLE IKEA 3D GLB EXTRACTION TEST')
  logger.info('='.repeat(70))

  const browserManager = new PuppeteerBrowserManager()
  await browserManager.initialize({
    headless: true,
    timeout: 60000,
    tmpDir: tmpDir,
  })

  let passedTests = 0
  let failedTests = 0

  try {
    for (const testCase of TEST_URLS) {
      logger.info(`\n📦 ${testCase.name}`)
      logger.info(`   ${testCase.url}`)

      const page = await browserManager.createPage()
      try {
        logger.info('   Loading page...')
        await page.goto(testCase.url, { waitUntil: 'networkidle2', timeout: 30000 })

        logger.info('   Searching for GLB URL...')
        const glbUrl = await extractGlbUrl(page, testCase.url)

        if (!glbUrl) {
          logger.error('   ✗ No GLB URL found')
          failedTests++
          continue
        }

        logger.info(`   ✓ Found: ${glbUrl.substring(0, 100)}...`)

        logger.info('   Downloading...')
        const response = await fetch(glbUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (IKEA-3D-Downloader/1.0)',
            'Referer': testCase.url,
          },
        })

        if (!response.ok) {
          logger.error(`   ✗ Download failed: HTTP ${response.status}`)
          failedTests++
          continue
        }

        const buffer = await response.arrayBuffer()
        const fileName = `${testCase.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.glb`
        const outputPath = path.join(outputDir, fileName)

        fs.writeFileSync(outputPath, Buffer.from(buffer))

        logger.info(`   ✓ Downloaded ${(buffer.byteLength / 1024).toFixed(2)} KB`)
        logger.info(`   💾 Saved to ${fileName}`)

        passedTests++
      } catch (error) {
        logger.error(`   ✗ Error: ${error}`)
        failedTests++
      } finally {
        await page.close()
      }
    }
  } finally {
    await browserManager.shutdown()
  }

  logger.info('\n' + '='.repeat(70))
  logger.info(`✓ Passed: ${passedTests}/${TEST_URLS.length}`)
  logger.info(`✗ Failed: ${failedTests}/${TEST_URLS.length}`)
  logger.info('='.repeat(70))

  if (passedTests > 0) {
    logger.info(`\n✨ GLB files available in: ${outputDir}`)
    const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.glb'))
    files.forEach(f => {
      const size = fs.statSync(path.join(outputDir, f)).size
      logger.info(`   • ${f} (${(size / 1024).toFixed(2)} KB)`)
    })
  }

  process.exit(failedTests > 0 ? 1 : 0)
}

runTest().catch((error) => {
  logger.error('Fatal error:', error)
  process.exit(1)
})
