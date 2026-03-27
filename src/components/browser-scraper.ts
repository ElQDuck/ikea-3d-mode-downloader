/**
 * IKEA Scraper with Puppeteer support
 * Extends existing IkeaScraperImpl with server-side capabilities
 */

import type {
  IkeaScraperPuppeteerConfig,
  IkeaScraperPuppeteer,
  PageContentAnalysis,
  NetworkInterceptionContext,
  Model3dLoaderTrigger,
  ExtractionStrategy,
  ExtractionAttempt,
  ExtractionReport,
  GlbExtractionResult,
  ManagedPage,
} from '../types'
import type { ProcessingResult, IkeaRegionInfo } from '../types'
import { IkeaScraperImpl } from './ikea-scraper'
import { PuppeteerBrowserManager } from './browser-manager'
import { NetworkInterceptionImpl } from './network-interceptor'
import { logger } from '../utils/logger'
import {
  detectRegionFromUrl,
  isValidIkeaUrl,
  extractProductId,
  delay,
  calculateExponentialBackoff,
  calculateLinearBackoff,
  raceWithTimeout,
} from '../utils/browser-utils'
import { sanitizeFilename, normalizeUrl } from '../utils/browser-utils'

const SUPPORTED_IKEA_REGIONS = [
  { countryCode: 'NO', languageCode: 'no', locale: 'no_NO' },
  { countryCode: 'SE', languageCode: 'sv', locale: 'sv_SE' },
  { countryCode: 'DE', languageCode: 'de', locale: 'de_DE' },
  { countryCode: 'GB', languageCode: 'en', locale: 'en_GB' },
  { countryCode: 'US', languageCode: 'en', locale: 'en_US' },
  { countryCode: 'FR', languageCode: 'fr', locale: 'fr_FR' },
  { countryCode: 'IT', languageCode: 'it', locale: 'it_IT' },
  { countryCode: 'NL', languageCode: 'nl', locale: 'nl_NL' },
  { countryCode: 'BE', languageCode: 'nl', locale: 'nl_BE' },
  { countryCode: 'AT', languageCode: 'de', locale: 'de_AT' },
  { countryCode: 'CH', languageCode: 'de', locale: 'de_CH' },
  { countryCode: 'ES', languageCode: 'es', locale: 'es_ES' },
  { countryCode: 'PL', languageCode: 'pl', locale: 'pl_PL' },
  { countryCode: 'CZ', languageCode: 'cs', locale: 'cs_CZ' },
  { countryCode: 'RU', languageCode: 'ru', locale: 'ru_RU' },
]

export class IkeaScraperPuppeteerImpl extends IkeaScraperImpl implements IkeaScraperPuppeteer {
  private _browserManager: PuppeteerBrowserManager | null = null
  private _puppeteerConfig: IkeaScraperPuppeteerConfig
  private _extractionReports: Map<string, ExtractionReport> = new Map()
  private _supportedDomains: Set<string>

  constructor(config: IkeaScraperPuppeteerConfig) {
    super(config)
    this._puppeteerConfig = config
    this._supportedDomains = this._initializeSupportedDomains()
  }

  async extractGlbUrlWithPuppeteer(
    productUrl: string
  ): Promise<ProcessingResult<GlbExtractionResult>> {
    const timestamp = Date.now()
    const attempts: ExtractionAttempt[] = []

    try {
      // Initialize browser if needed
      if (!this._browserManager) {
        this._browserManager = new PuppeteerBrowserManager()
        await this._browserManager.initialize(this._puppeteerConfig.browserConfig)
      }

      // Validate and analyze URL
      const regionInfo = this.detectIkeaRegion(productUrl)
      if (!this.isSupportedRegion(regionInfo)) {
        logger.warn(`Unsupported IKEA region: ${regionInfo.locale}`)
      }

      // Try extraction strategies in order
      const strategies: Array<[ExtractionStrategy, () => Promise<GlbExtractionResult | null>]> = [
        ['network-interception', () => this._executeNetworkInterceptionStrategy(productUrl)],
        ['dom-scanning', () => this._executeDomScanningStrategy(productUrl)],
        ['script-globals', () => this._executeScriptGlobalsStrategy(productUrl)],
        ['data-attributes', () => this._executeDataAttributesStrategy(productUrl)],
        ['performance-observer', () => this._executePerformanceObserverStrategy(productUrl)],
      ]

      for (const [strategy, executor] of strategies) {
        const attemptStart = Date.now()

        try {
          logger.info(`Attempting extraction with strategy: ${strategy}`)
          const result = await executor()

          if (result) {
            attempts.push({
              strategy,
              success: true,
              candidate: {
                url: result.glbUrl,
                source: 'network',
                confidence: 'high',
                detectedAt: Date.now(),
              },
              durationMs: Date.now() - attemptStart,
              confidence: 'high',
            })

            // Store report
            const report: ExtractionReport = {
              url: productUrl,
              attempts,
              selectedCandidate: {
                url: result.glbUrl,
                source: 'network',
                confidence: 'high',
                detectedAt: Date.now(),
              },
              totalDurationMs: Date.now() - timestamp,
              environment: 'node',
              strategy: 'puppeteer',
            }
            this._extractionReports.set(productUrl, report)

            return {
              success: true,
              data: result,
              timestamp,
            }
          }

          attempts.push({
            strategy,
            success: false,
            durationMs: Date.now() - attemptStart,
            confidence: 'low',
          })
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          logger.warn(`Strategy ${strategy} failed: ${msg}`)
          attempts.push({
            strategy,
            success: false,
            error: msg,
            durationMs: Date.now() - attemptStart,
            confidence: 'low',
          })
        }
      }

      // If all strategies fail, fall back to parent implementation
      logger.info('All Puppeteer strategies failed, falling back to parent implementation')
      return await super.extractGlbUrl(productUrl)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      logger.error(`Puppeteer extraction failed: ${msg}`)

      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: msg,
        },
        timestamp,
      }
    }
  }

  async analyzePage(productUrl: string): Promise<ProcessingResult<PageContentAnalysis>> {
    const timestamp = Date.now()

    try {
      // Initialize browser if needed
      if (!this._browserManager) {
        this._browserManager = new PuppeteerBrowserManager()
        await this._browserManager.initialize(this._puppeteerConfig.browserConfig)
      }

      const page = await this._browserManager.createPage()

      try {
        await page.goto(productUrl, { timeout: this._puppeteerConfig.timeout })

        const analysis = await page.evaluate<PageContentAnalysis>(() => {
          const hasThreeJsScripts = Array.from(document.scripts).some(script =>
            script.src.includes('three') || script.textContent?.includes('THREE')
          )

          const has3dViewer =
            !!document.querySelector('[class*="3d"]') ||
            !!document.querySelector('[class*="viewer"]') ||
            !!document.querySelector('[id*="model"]')

          const productName = (document.querySelector('h1') as HTMLElement)?.textContent || undefined

          const detectedGlbUrls: any[] = []
          document.querySelectorAll('[src*=".glb"], [href*=".glb"]').forEach(el => {
            const url = (el as HTMLElement).getAttribute('src') || (el as HTMLElement).getAttribute('href')
            if (url) {
              detectedGlbUrls.push({
                url,
                source: 'dom',
                confidence: 'medium',
                detectedAt: Date.now(),
              })
            }
          })

          return {
            hasProductData: !!document.body,
            hasThreeJsScripts,
            has3dViewer,
            productName,
            detectedGlbUrls,
            scriptGlobals: {},
            dataAttributes: {},
            consoleMessages: [],
          }
        })

        return {
          success: true,
          data: analysis,
          timestamp,
        }
      } finally {
        await page.close()
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: msg,
        },
        timestamp,
      }
    }
  }

  async createNetworkInterception(
    productUrl: string
  ): Promise<ProcessingResult<NetworkInterceptionContext>> {
    const timestamp = Date.now()

    try {
      // Initialize browser if needed
      if (!this._browserManager) {
        this._browserManager = new PuppeteerBrowserManager()
        await this._browserManager.initialize(this._puppeteerConfig.browserConfig)
      }

      const page = await this._browserManager.createPage()
      const interception = new NetworkInterceptionImpl(page)

      await interception.start()
      await page.goto(productUrl, { timeout: this._puppeteerConfig.timeout })

      // Wait a bit for network requests
      await delay(2000)

      return {
        success: true,
        data: interception,
        timestamp,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        error: {
          code: 'NETWORK_INTERCEPTION_FAILED',
          message: msg,
        },
        timestamp,
      }
    }
  }

  create3dModelLoader(page: ManagedPage): Model3dLoaderTrigger {
    return {
      async trigger(): Promise<void> {
        // Try to click on 3D viewer elements
        await page.evaluate(() => {
          const viewer3dElement = document.querySelector('[class*="3d-viewer"], [id*="viewer"], [class*="model-view"]')
          if (viewer3dElement instanceof HTMLElement) {
            viewer3dElement.click()
          }
        })
      },

      async waitForModel(timeoutMs: number): Promise<boolean> {
        try {
          await raceWithTimeout(
            page.evaluate(() => {
              return new Promise<boolean>(resolve => {
                const checkInterval = setInterval(() => {
                  const images = document.querySelectorAll('img[src*=".glb"], img[src*=".gltf"]')
                  if (images.length > 0) {
                    clearInterval(checkInterval)
                    resolve(true)
                  }
                }, 500)

                setTimeout(() => {
                  clearInterval(checkInterval)
                  resolve(false)
                }, timeoutMs)
              })
            }),
            timeoutMs,
            'Model load'
          )
          return true
        } catch {
          return false
        }
      },

      async isModelLoaded(): Promise<boolean> {
        return page.evaluate(() => {
          const hasGlb = document.querySelector('[src*=".glb"], [src*=".gltf"]')
          const has3dElement = document.querySelector('[class*="3d"], [class*="viewer"]')
          return !!(hasGlb || has3dElement)
        })
      },

      async getLoadingProgress(): Promise<number> {
        return page.evaluate(() => {
          const progressBar = document.querySelector('[class*="progress"]')
          if (progressBar instanceof HTMLElement) {
            const width = progressBar.style.width
            return parseInt(width, 10) || 0
          }
          return 50 // Assume 50% if we can't determine
        })
      },
    }
  }

  detectIkeaRegion(url: string): IkeaRegionInfo {
    const region = detectRegionFromUrl(url)

    if (region) {
      const supported = SUPPORTED_IKEA_REGIONS.find(
        r => r.languageCode === region.languageCode && r.countryCode === region.countryCode.toUpperCase()
      )

      if (supported) {
        return {
          countryCode: supported.countryCode,
          languageCode: supported.languageCode,
          domain: 'ikea.com',
          locale: supported.locale,
          isSupportedRegion: true,
        }
      }
    }

    return {
      countryCode: 'GB',
      languageCode: 'en',
      domain: 'ikea.com',
      locale: 'en_GB',
      isSupportedRegion: false,
    }
  }

  isSupportedRegion(regionInfo: IkeaRegionInfo): boolean {
    return regionInfo.isSupportedRegion
  }

  getAllSupportedDomains(): string[] {
    return Array.from(this._supportedDomains)
  }

  async shutdown(): Promise<void> {
    try {
      if (this._browserManager) {
        await this._browserManager.shutdown()
        this._browserManager = null
      }
    } catch (error) {
      logger.error(`Error during shutdown: ${error}`)
    }
  }

  // Private extraction strategies

  private async _executeNetworkInterceptionStrategy(productUrl: string): Promise<GlbExtractionResult | null> {
    try {
      if (!this._browserManager) return null

      const page = await this._browserManager.createPage()

      try {
        const interception = new NetworkInterceptionImpl(page)
        await interception.start()

        await page.goto(productUrl, { timeout: this._puppeteerConfig.modelLoadTimeout })

        // Trigger model loading
        const loader = this.create3dModelLoader(page)
        await loader.trigger()

        // Wait for model
        const loaded = await loader.waitForModel(this._puppeteerConfig.modelLoadTimeout)

        await interception.stop()

        if (loaded) {
          const bestCandidate = interception.getBestCandidate()
          if (bestCandidate) {
            const productName = await page.evaluate<string>(() => {
              return (document.querySelector('h1') as HTMLElement)?.textContent || 'Unknown'
            })

            return {
              glbUrl: bestCandidate.url,
              productName,
              fileName: sanitizeFilename(productName) + '.glb',
            }
          }
        }

        return null
      } finally {
        await page.close()
      }
    } catch (error) {
      logger.warn(`Network interception strategy failed: ${error}`)
      return null
    }
  }

  private async _executeDomScanningStrategy(productUrl: string): Promise<GlbExtractionResult | null> {
    try {
      if (!this._browserManager) return null

      const page = await this._browserManager.createPage()

      try {
        await page.goto(productUrl, { timeout: this._puppeteerConfig.timeout })

        const glbUrl = await page.evaluate<string | null>(() => {
          // Look for GLB URLs in DOM
          const elements = document.querySelectorAll('[src*=".glb"], [href*=".glb"], [data-url*=".glb"]')
          for (const el of elements) {
            const url = (el as HTMLElement).getAttribute('src') ||
              (el as HTMLElement).getAttribute('href') ||
              (el as HTMLElement).getAttribute('data-url')
            if (url && url.includes('.glb')) {
              return url
            }
          }
          return null
        })

        if (glbUrl) {
          const productName = await page.evaluate<string>(() => {
            return (document.querySelector('h1') as HTMLElement)?.textContent || 'Unknown'
          })

          const normalized = normalizeUrl(glbUrl, productUrl)

          return {
            glbUrl: normalized,
            productName,
            fileName: sanitizeFilename(productName) + '.glb',
          }
        }

        return null
      } finally {
        await page.close()
      }
    } catch (error) {
      logger.warn(`DOM scanning strategy failed: ${error}`)
      return null
    }
  }

  private async _executeScriptGlobalsStrategy(productUrl: string): Promise<GlbExtractionResult | null> {
    try {
      if (!this._browserManager) return null

      const page = await this._browserManager.createPage()

      try {
        await page.goto(productUrl, { timeout: this._puppeteerConfig.timeout })

        const glbUrl = await page.evaluate<string | null>(() => {
          // Check window objects for GLB URLs
          const candidates = [
            (window as any).__IKEA__?.modelUrl,
            (window as any).modelData?.url,
            (window as any).productData?.modelUrl,
            (window as any).ikeaData?.glbUrl,
            (window as any).app?.state?.model?.url,
          ]

          for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.includes('.glb')) {
              return candidate
            }
          }
          return null
        })

        if (glbUrl) {
          const productName = await page.evaluate<string>(() => {
            return (document.querySelector('h1') as HTMLElement)?.textContent || 'Unknown'
          })
          const normalized = normalizeUrl(glbUrl, productUrl)

          return {
            glbUrl: normalized,
            productName,
            fileName: sanitizeFilename(productName) + '.glb',
          }
        }

        return null
      } finally {
        await page.close()
      }
    } catch (error) {
      logger.warn(`Script globals strategy failed: ${error}`)
      return null
    }
  }

  private async _executeDataAttributesStrategy(productUrl: string): Promise<GlbExtractionResult | null> {
    try {
      if (!this._browserManager) return null

      const page = await this._browserManager.createPage()

      try {
        await page.goto(productUrl, { timeout: this._puppeteerConfig.timeout })

        const glbUrl = await page.evaluate<string | null>(() => {
          // Check all data-* attributes
          const allElements = document.querySelectorAll('[data-model], [data-glb], [data-url], [data-src]')
          for (const el of allElements) {
            const url = (el as HTMLElement).getAttribute('data-model') ||
              (el as HTMLElement).getAttribute('data-glb') ||
              (el as HTMLElement).getAttribute('data-url') ||
              (el as HTMLElement).getAttribute('data-src')
            if (url && url.includes('.glb')) {
              return url
            }
          }
          return null
        })

        if (glbUrl) {
          const productName = await page.evaluate<string>(() => {
            return (document.querySelector('h1') as HTMLElement)?.textContent || 'Unknown'
          })
          const normalized = normalizeUrl(glbUrl, productUrl)

          return {
            glbUrl: normalized,
            productName,
            fileName: sanitizeFilename(productName) + '.glb',
          }
        }

        return null
      } finally {
        await page.close()
      }
    } catch (error) {
      logger.warn(`Data attributes strategy failed: ${error}`)
      return null
    }
  }

  private async _executePerformanceObserverStrategy(productUrl: string): Promise<GlbExtractionResult | null> {
    try {
      if (!this._browserManager) return null

      const page = await this._browserManager.createPage()

      try {
        await page.goto(productUrl, { timeout: this._puppeteerConfig.timeout })

        const glbUrl = await page.evaluate<string | null>(async () => {
          return new Promise<string | null>(resolve => {
            const observer = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                if (entry.name && entry.name.includes('.glb')) {
                  resolve(entry.name)
                }
              }
            })

            observer.observe({ entryTypes: ['resource'] })

            setTimeout(() => {
              observer.disconnect()
              resolve(null)
            }, 5000)
          })
        })

        if (glbUrl) {
          const productName = await page.evaluate<string>(() => {
            return (document.querySelector('h1') as HTMLElement)?.textContent || 'Unknown'
          })

          return {
            glbUrl,
            productName,
            fileName: sanitizeFilename(productName) + '.glb',
          }
        }

        return null
      } finally {
        await page.close()
      }
    } catch (error) {
      logger.warn(`Performance observer strategy failed: ${error}`)
      return null
    }
  }

  private _initializeSupportedDomains(): Set<string> {
    const domains = new Set<string>()
    domains.add('www.ikea.com')
    for (const region of SUPPORTED_IKEA_REGIONS) {
      domains.add(`www.ikea.com/${region.languageCode}/${region.languageCode}`)
    }
    return domains
  }
}
