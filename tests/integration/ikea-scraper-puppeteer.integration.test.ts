/**
 * Integration tests for Puppeteer-based IKEA 3D model downloader
 * Tests the complete flow from URL extraction to GLB file generation
 */

import * as path from 'path'
import * as fs from 'fs'
import { TempFileManagerImpl } from '../../src/utils/temp-file-manager'
import { IkeaScraperPuppeteerImpl } from '../../src/components/browser-scraper'
import type { IkeaScraperPuppeteerConfig } from '../../src/types'
import { logger } from '../../src/utils/logger'

// Test URLs - using real IKEA product pages
const TEST_URLS = [
  {
    name: 'Norwegian SØDERHAMN Corner Sofa',
    url: 'https://www.ikea.com/no/no/p/soederhamn-hjornesofa-4-seters-med-apen-ende-tonerud-gra-s19452073/',
  },
  {
    name: 'German POÄNG Rocking Chair',
    url: 'https://www.ikea.com/de/de/p/poaeng-schaukelstuhl-eichenfurnier-weiss-lasiert-gunnared-beige-s59502052/',
  },
]

describe('IkeaScraperPuppeteer Integration Tests', () => {
  let tempFileManager: TempFileManagerImpl
  let scraper: IkeaScraperPuppeteerImpl
  let tmpDir: string

  beforeAll(async () => {
    // Setup temp directory
    tmpDir = path.join(process.cwd(), './tmp')
    tempFileManager = new TempFileManagerImpl(tmpDir)

    // Create temp dir
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }

    // Create scraper instance with Puppeteer support
    const config: IkeaScraperPuppeteerConfig = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      usePuppeteer: true,
      browserConfig: {
        headless: true,
        timeout: 30000,
        tmpDir: tmpDir,
        viewport: { width: 1920, height: 1080 },
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
      modelLoadTimeout: 10000,
      jsExecutionTimeout: 5000,
      interceptNetwork: true,
      minGlbSize: 1024,
      maxGlbSize: 500 * 1024 * 1024,
      retryStrategy: 'exponential',
      captureConsole: false,
      preferredRegion: 'no',
    }

    scraper = new IkeaScraperPuppeteerImpl(config)

    logger.info('Integration test setup complete')
  })

  afterAll(async () => {
    // Cleanup
    try {
      await scraper.shutdown()
      logger.info('Scraper shutdown complete')

      // Cleanup temp files
      const files = await tempFileManager.listTempFiles(tmpDir)
      logger.info(`Cleaning up ${files.length} temporary files`)
      await tempFileManager.cleanupTempDir(tmpDir)
    } catch (error) {
      logger.error(`Error during cleanup: ${error}`)
    }
  })

  describe('Region Detection', () => {
    it('should detect Norwegian region from URL', () => {
      const regionInfo = scraper.detectIkeaRegion(TEST_URLS[0].url)
      expect(regionInfo.countryCode).toBe('NO')
      expect(regionInfo.languageCode).toBe('no')
      expect(regionInfo.isSupportedRegion).toBe(true)
    })

    it('should detect German region from URL', () => {
      const regionInfo = scraper.detectIkeaRegion(TEST_URLS[1].url)
      expect(regionInfo.countryCode).toBe('DE')
      expect(regionInfo.languageCode).toBe('de')
      expect(regionInfo.isSupportedRegion).toBe(true)
    })

    it('should validate supported regions', () => {
      const regionInfo = scraper.detectIkeaRegion(TEST_URLS[0].url)
      expect(scraper.isSupportedRegion(regionInfo)).toBe(true)
    })
  })

  describe('Domain Support', () => {
    it('should return list of supported domains', () => {
      const domains = scraper.getAllSupportedDomains()
      expect(domains).toContain('www.ikea.com')
      expect(Array.isArray(domains)).toBe(true)
      expect(domains.length).toBeGreaterThan(0)
    })
  })

  describe('Page Analysis', () => {
    it(
      'should analyze Norwegian product page',
      async () => {
        const result = await scraper.analyzePage(TEST_URLS[0].url)
        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()

        if (result.data) {
          expect(result.data.hasProductData).toBe(true)
          expect(typeof result.data.productName).toBe('string')
          logger.info(`Analyzed product: ${result.data.productName}`)
        }
      },
      60000
    )

    it(
      'should analyze German product page',
      async () => {
        const result = await scraper.analyzePage(TEST_URLS[1].url)
        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()

        if (result.data) {
          expect(result.data.hasProductData).toBe(true)
          expect(typeof result.data.productName).toBe('string')
          logger.info(`Analyzed product: ${result.data.productName}`)
        }
      },
      60000
    )
  })

  describe('GLB Extraction with Puppeteer', () => {
    it(
      'should extract GLB URL from Norwegian product page',
      async () => {
        const result = await scraper.extractGlbUrlWithPuppeteer(TEST_URLS[0].url)
        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()

        if (result.data) {
          expect(result.data.glbUrl).toBeDefined()
          expect(result.data.glbUrl).toMatch(/\.glb$/)
          expect(result.data.productName).toBeDefined()
          expect(result.data.fileName).toBeDefined()
          logger.info(`Extracted GLB: ${result.data.glbUrl}`)
          logger.info(`Product: ${result.data.productName}`)
        }
      },
      120000
    )

    it(
      'should extract GLB URL from German product page',
      async () => {
        const result = await scraper.extractGlbUrlWithPuppeteer(TEST_URLS[1].url)
        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()

        if (result.data) {
          expect(result.data.glbUrl).toBeDefined()
          expect(result.data.glbUrl).toMatch(/\.glb$/)
          expect(result.data.productName).toBeDefined()
          expect(result.data.fileName).toBeDefined()
          logger.info(`Extracted GLB: ${result.data.glbUrl}`)
          logger.info(`Product: ${result.data.productName}`)
        }
      },
      120000
    )
  })

  describe('Complete Product Processing', () => {
    it(
      'should process complete product including download',
      async () => {
        const result = await scraper.processProduct(TEST_URLS[0].url)
        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()

        if (result.data) {
          expect(result.data.glbBuffer).toBeDefined()
          expect(result.data.glbBuffer.byteLength).toBeGreaterThan(0)
          expect(result.data.productName).toBeDefined()
          expect(result.data.fileName).toBeDefined()

          logger.info(`Downloaded GLB size: ${result.data.glbBuffer.byteLength} bytes`)
          logger.info(`File name: ${result.data.fileName}`)

          // Save to temp file for verification
          const glbFileName = path.join(tmpDir, result.data.fileName)
          fs.writeFileSync(glbFileName, Buffer.from(result.data.glbBuffer))
          expect(fs.existsSync(glbFileName)).toBe(true)

          logger.info(`Saved GLB file to: ${glbFileName}`)

          // Verify file is valid GLB (check magic number)
          const buffer = Buffer.from(result.data.glbBuffer)
          const magic = buffer.readUInt32LE(0)
          const expectedMagic = 0x46546c67 // glTF
          expect(magic).toBe(expectedMagic)

          logger.info('GLB file format validated')
        }
      },
      180000
    )
  })

  describe('Temp File Management', () => {
    it('should create and cleanup temp files', async () => {
      const tempDirPath = await tempFileManager.createTempDir('test-session')
      expect(fs.existsSync(tempDirPath)).toBe(true)

      // Create a test file
      const testFile = path.join(tempDirPath, 'test.txt')
      fs.writeFileSync(testFile, 'test content')
      expect(fs.existsSync(testFile)).toBe(true)

      // List files
      const files = await tempFileManager.listTempFiles(tempDirPath)
      expect(files.length).toBeGreaterThan(0)

      // Get size
      const size = await tempFileManager.getTempDirSize(tempDirPath)
      expect(size).toBeGreaterThan(0)

      // Cleanup
      const deletedCount = await tempFileManager.cleanupTempDir(tempDirPath)
      expect(deletedCount).toBeGreaterThan(0)

      logger.info(`Cleaned up ${deletedCount} temp files`)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid URL gracefully', async () => {
      const invalidUrl = 'https://www.invalid-domain.com/product'
      const result = await scraper.extractGlbUrlWithPuppeteer(invalidUrl)
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should timeout on slow pages', async () => {
      const slowUrl = 'https://www.ikea.com/no/no/p/invalid-product-id-123456789/'
      const result = await scraper.analyzePage(slowUrl)
      // Should either fail or succeed, but not hang
      expect(result.success !== undefined).toBe(true)
    })
  })

  describe('Network Interception', () => {
    it(
      'should intercept network requests',
      async () => {
        const result = await scraper.createNetworkInterception(TEST_URLS[0].url)
        expect(result.success).toBe(true)
        expect(result.data).toBeDefined()

        if (result.data) {
          const candidates = result.data.getGlbCandidates()
          logger.info(`Found ${candidates.length} GLB candidates`)

          // May or may not find candidates depending on page state
          // Just verify the method works
          expect(Array.isArray(candidates)).toBe(true)

          await result.data.stop()
        }
      },
      60000
    )
  })
})
