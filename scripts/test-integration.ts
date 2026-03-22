#!/usr/bin/env node

/**
 * Standalone Integration Test for IKEA Scraper with Puppeteer
 * Run with: npx tsx scripts/test-integration.ts
 * This test runs outside of Jest to properly support Puppeteer
 */

import { IkeaScraperPuppeteerImpl } from '../src/components/browser-scraper'
import type { IkeaScraperPuppeteerConfig } from '../src/types'
import { logger } from '../src/utils/logger'
import * as fs from 'fs'
import * as path from 'path'

// Test data
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

// Ensure tmp directory exists
const tmpDir = path.join(process.cwd(), 'tmp')
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true })
}

async function runIntegrationTests() {
  logger.info('🚀 Starting IKEA Scraper Integration Tests')
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
    modelLoadTimeout: 30000,
    jsExecutionTimeout: 30000,
    interceptNetwork: true,
    minGlbSize: 1000,
    maxGlbSize: 500000000,
    retryStrategy: 'exponential',
    captureConsole: true,
  }

  const scraper = new IkeaScraperPuppeteerImpl(config)
  let passedTests = 0
  let failedTests = 0

  try {
    for (const testCase of TEST_URLS) {
      logger.info(`\n📦 Testing: ${testCase.name}`)
      logger.info(`🔗 URL: ${testCase.url}`)

      try {
        // Test 1: Page Analysis
        logger.info('  • Analyzing page...')
        const analysisResult = await scraper.analyzePage(testCase.url)

        if (!analysisResult.success) {
          logger.error(`  ✗ Page analysis failed: ${analysisResult.error?.message}`)
          failedTests++
          continue
        }

        if (!analysisResult.data) {
          logger.error('  ✗ No analysis data returned')
          failedTests++
          continue
        }

        logger.info(`  ✓ Page analyzed successfully`)
        logger.info(`    - Has product data: ${analysisResult.data.hasProductData}`)
        logger.info(`    - Has 3D viewer: ${analysisResult.data.has3dViewer}`)
        logger.info(`    - Detected GLB URLs: ${analysisResult.data.detectedGlbUrls.length}`)
        logger.info(`    - Console messages: ${analysisResult.data.consoleMessages.length}`)

        // Test 2: Extract GLB URL with Puppeteer
        logger.info('  • Extracting GLB URL...')
        const extractionResult = await scraper.extractGlbUrlWithPuppeteer(testCase.url)

        if (!extractionResult.success) {
          logger.error(`  ✗ GLB extraction failed: ${extractionResult.error?.message}`)
          failedTests++
          continue
        }

        if (!extractionResult.data) {
          logger.error('  ✗ No extraction data returned')
          failedTests++
          continue
        }

        logger.info(`  ✓ GLB URL extracted successfully`)
        logger.info(`    - URL: ${extractionResult.data.glbUrl.substring(0, 80)}...`)
        logger.info(`    - Product: ${extractionResult.data.productName}`)
        logger.info(`    - Filename: ${extractionResult.data.fileName}`)

        // Test 3: Download GLB
        logger.info('  • Downloading GLB file...')
        const downloadResult = await scraper.downloadGlb(extractionResult.data.glbUrl)

        if (!downloadResult.success) {
          logger.error(`  ✗ GLB download failed: ${downloadResult.error?.message}`)
          failedTests++
          continue
        }

        if (!downloadResult.data) {
          logger.error('  ✗ No download data returned')
          failedTests++
          continue
        }

        logger.info(`  ✓ GLB downloaded successfully`)
        logger.info(`    - Size: ${(downloadResult.data.byteLength / 1024).toFixed(2)} KB`)

        // Test 4: Save GLB to file
        const outputPath = path.join(tmpDir, `${extractionResult.data.productName}.glb`)
        fs.writeFileSync(outputPath, Buffer.from(downloadResult.data))
        logger.info(`  ✓ GLB saved to ${outputPath}`)

        passedTests++
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        logger.error(`  ✗ Test failed with error: ${message}`)
        failedTests++
      }
    }
  } finally {
    // Cleanup
    logger.info('\n🧹 Cleaning up resources...')
    await scraper.cleanup()
  }

  // Summary
  logger.info('\n' + '='.repeat(60))
  logger.info(`📊 Test Results: ${passedTests} passed, ${failedTests} failed`)
  logger.info('='.repeat(60))

  // Exit with appropriate code
  process.exit(failedTests > 0 ? 1 : 0)
}

// Run tests
runIntegrationTests().catch((error) => {
  logger.error('Fatal error during integration tests:', error)
  process.exit(1)
})
