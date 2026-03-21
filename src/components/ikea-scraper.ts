/**
 * IKEA Scraper component
 * Extracts GLB URLs from IKEA product pages and downloads the 3D models
 */

import type { IkeaScraperConfig, GlbExtractionResult, ScraperResult } from '../types'
import type { ProcessingResult } from '../types'
import { validateIkeaUrl, validateGlbBuffer, sanitizeFilename } from '../utils/validators'
import { ProcessingException } from '../utils/errors'
import { logger } from '../utils/logger'

export interface IkeaScraper {
  extractGlbUrl(productUrl: string): Promise<ProcessingResult<GlbExtractionResult>>
  downloadGlb(glbUrl: string): Promise<ProcessingResult<ArrayBuffer>>
  processProduct(productUrl: string): Promise<ProcessingResult<ScraperResult>>
}

export class IkeaScraperImpl implements IkeaScraper {
  private _config: IkeaScraperConfig
  private _cache: Map<string, { data: GlbExtractionResult; timestamp: number }> = new Map()
  private _cacheTimeout: number = 3600000 // 1 hour in milliseconds
  private _interceptedUrls: Set<string> = new Set()
  private _networkInterceptionEnabled: boolean = false
  private _timeoutHandle: ReturnType<typeof setTimeout> | null = null

  constructor(config: IkeaScraperConfig) {
    this._config = config
  }

  /**
   * Extracts GLB URL from IKEA product page using multiple strategies
   * @param productUrl - The IKEA product URL
   * @returns ProcessingResult with GlbExtractionResult or error
   */
  async extractGlbUrl(productUrl: string): Promise<ProcessingResult<GlbExtractionResult>> {
    const timestamp = Date.now()

    try {
      // Validate URL format
      if (!validateIkeaUrl(productUrl)) {
        logger.warn('Invalid IKEA URL:', productUrl)
        return {
          success: false,
          error: {
            code: 'INVALID_URL',
            message: 'URL must be from ikea.com domain',
          },
          timestamp,
        }
      }

      // Check cache first
      const cached = this._cache.get(productUrl)
      if (cached && Date.now() - cached.timestamp < this._cacheTimeout) {
        logger.info('Returning cached GLB URL for:', productUrl)
        return {
          success: true,
          data: cached.data,
          timestamp,
        }
      }

      // Try extraction strategies in order
      const result =
        (await this._tryNetworkInterception(productUrl)) ||
        (await this._tryDomScanning(productUrl)) ||
        (await this._tryScriptGlobals(productUrl)) ||
        (await this._tryDataAttributes(productUrl)) ||
        (await this._tryPerformanceObserver(productUrl)) ||
        (await this._tryManualMode())

      if (!result) {
        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: 'Could not extract GLB URL from page. Please try manual mode.',
          },
          timestamp,
        }
      }

      // Cache the result
      this._cache.set(productUrl, { data: result, timestamp: Date.now() })

      return {
        success: true,
        data: result,
        timestamp,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred'
      logger.error('Failed to extract GLB URL:', message)
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message,
        },
        timestamp,
      }
    }
  }

  /**
   * Downloads GLB file from the provided URL
   * @param glbUrl - The GLB file URL
   * @returns ProcessingResult with ArrayBuffer or error
   */
  async downloadGlb(glbUrl: string): Promise<ProcessingResult<ArrayBuffer>> {
    const timestamp = Date.now()

    try {
      logger.info('Downloading GLB from URL:', glbUrl)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this._config.timeout)

      const response = await fetch(glbUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/octet-stream',
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const buffer = await response.arrayBuffer()

      // Validate GLB format
      if (!validateGlbBuffer(buffer)) {
        return {
          success: false,
          error: {
            code: 'GLB_PARSE_ERROR',
            message: 'Downloaded file is not a valid GLB file',
          },
          timestamp,
        }
      }

      logger.info('Successfully downloaded GLB file')
      return {
        success: true,
        data: buffer,
        timestamp,
      }
    } catch (error) {
      let message = 'Failed to download GLB file'
      let code: 'NETWORK_ERROR' | 'GLB_PARSE_ERROR' = 'NETWORK_ERROR'

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          message = 'Download timeout. Please try again.'
        } else if (error.message.includes('CORS')) {
          message = 'CORS error: Try using manual mode'
          code = 'NETWORK_ERROR'
        } else {
          message = error.message
        }
      }

      logger.error('GLB download error:', message)
      return {
        success: false,
        error: {
          code,
          message,
        },
        timestamp,
      }
    }
  }

  /**
   * Complete product processing: extract GLB URL and download it
   * @param productUrl - The IKEA product URL
   * @returns ProcessingResult with ScraperResult or error
   */
  async processProduct(productUrl: string): Promise<ProcessingResult<ScraperResult>> {
    const timestamp = Date.now()

    try {
      // Step 1: Extract GLB URL
      logger.info('Starting product processing for:', productUrl)
      const extractionResult = await this.extractGlbUrl(productUrl)

      if (!extractionResult.success || !extractionResult.data) {
        return {
          success: false,
          error: extractionResult.error,
          timestamp,
        }
      }

      // Step 2: Download GLB file
      const downloadResult = await this.downloadGlb(extractionResult.data.glbUrl)

      if (!downloadResult.success || !downloadResult.data) {
        return {
          success: false,
          error: downloadResult.error,
          timestamp,
        }
      }

      logger.info('Product processing completed successfully')
      return {
        success: true,
        data: {
          glbBuffer: downloadResult.data,
          productName: extractionResult.data.productName,
          fileName: extractionResult.data.fileName,
        },
        timestamp,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred'
      logger.error('Product processing failed:', message)
      return {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message,
        },
        timestamp,
      }
    }
  }

  /**
   * Enable network interception to detect GLB downloads
   */
  enableNetworkInterception(): void {
    if (this._networkInterceptionEnabled) {
      return
    }

    logger.info('Enabling network interception')
    this._networkInterceptionEnabled = true

    // Intercept fetch
    const originalFetch = window.fetch
    window.fetch = ((...args: Parameters<typeof fetch>) => {
      const url = args[0]
      const urlString = typeof url === 'string' ? url : url instanceof Request ? url.url : ''

      if (urlString && urlString.endsWith('.glb')) {
        this._interceptedUrls.add(urlString)
      }

      return originalFetch(...args)
    }) as typeof fetch

    // Intercept XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, async: boolean = true, user?: string, password?: string) {
      const urlString = typeof url === 'string' ? url : url.toString()
      if (urlString && urlString.endsWith('.glb')) {
        this.addEventListener('load', () => {
          if (urlString) {
            window.window_interceptedGlbUrl = urlString
          }
        })
      }
      return originalOpen.call(this, method, urlString, async, user, password)
    }
  }

  /**
   * Disable network interception
   */
  disableNetworkInterception(): void {
    logger.info('Disabling network interception')
    this._networkInterceptionEnabled = false
    this._interceptedUrls.clear()
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up scraper resources')
    this.disableNetworkInterception()
    this._cache.clear()
    if (this._timeoutHandle !== null) {
      clearTimeout(this._timeoutHandle)
    }
  }

  // --- Private extraction strategy methods ---

  /**
   * Try to extract GLB URL via network interception
   */
  private async _tryNetworkInterception(_productUrl: string): Promise<GlbExtractionResult | null> {
    if (!this._networkInterceptionEnabled) {
      return null
    }

    if (this._interceptedUrls.size > 0) {
      const glbUrl = Array.from(this._interceptedUrls)[0]
      return {
        glbUrl,
        productName: this._extractProductName(glbUrl),
        fileName: this._extractFileName(glbUrl),
      }
    }

    return null
  }

  /**
   * Try to extract GLB URL by scanning DOM for model-viewer elements
   */
  private async _tryDomScanning(_productUrl: string): Promise<GlbExtractionResult | null> {
    try {
      // Look for model-viewer elements
      const modelViewers = document.querySelectorAll('model-viewer')
      for (const viewer of modelViewers) {
        const src = viewer.getAttribute('src')
        const model = viewer.getAttribute('model')
        const glbUrl = src || model

        if (glbUrl && glbUrl.endsWith('.glb')) {
          return {
            glbUrl,
            productName: this._extractProductName(glbUrl),
            fileName: this._extractFileName(glbUrl),
          }
        }
      }

      // Look for img tags with GLB
      const imgs = document.querySelectorAll('img[src*=".glb"]')
      if (imgs.length > 0) {
        const glbUrl = (imgs[0] as HTMLImageElement).src
        return {
          glbUrl,
          productName: this._extractProductName(glbUrl),
          fileName: this._extractFileName(glbUrl),
        }
      }
    } catch {
      // DOM scanning failed, continue to next strategy
    }

    return null
  }

  /**
   * Try to extract GLB URL from global variables
   */
  private async _tryScriptGlobals(_productUrl: string): Promise<GlbExtractionResult | null> {
    try {
      // Check for common global variable names
      const globalNames = ['glbUrl', 'modelUrl', 'productModel', 'window_interceptedGlbUrl']

      for (const name of globalNames) {
        const value = (window as unknown as Record<string, unknown>)[name]
        if (typeof value === 'string' && value.endsWith('.glb')) {
          return {
            glbUrl: value,
            productName: this._extractProductName(value),
            fileName: this._extractFileName(value),
          }
        }
      }
    } catch {
      // Global variable access failed, continue
    }

    return null
  }

  /**
   * Try to extract GLB URL from data attributes
   */
  private async _tryDataAttributes(_productUrl: string): Promise<GlbExtractionResult | null> {
    try {
      // Look for data attributes containing GLB URLs
      const elements = document.querySelectorAll('[data-model], [data-glb], [data-glb-url]')
      for (const element of elements) {
        const glbUrl =
          element.getAttribute('data-glb-url') ||
          element.getAttribute('data-model') ||
          element.getAttribute('data-glb')

        if (glbUrl && glbUrl.endsWith('.glb')) {
          return {
            glbUrl,
            productName: this._extractProductName(glbUrl),
            fileName: this._extractFileName(glbUrl),
          }
        }
      }
    } catch {
      // Data attribute search failed, continue
    }

    return null
  }

  /**
   * Try to extract GLB URL using PerformanceObserver to monitor network
   */
  private async _tryPerformanceObserver(_productUrl: string): Promise<GlbExtractionResult | null> {
    try {
      const entries = performance.getEntriesByType('resource')
      for (const entry of entries) {
        if (entry.name && entry.name.endsWith('.glb')) {
          return {
            glbUrl: entry.name,
            productName: this._extractProductName(entry.name),
            fileName: this._extractFileName(entry.name),
          }
        }
      }
    } catch {
      // Performance observer failed, continue
    }

    return null
  }

  /**
   * Manual mode: prompt user to click "View in 3D" and wait for network activity
   */
  private async _tryManualMode(): Promise<GlbExtractionResult | null> {
    try {
      logger.info('Entering manual mode - waiting for GLB URL detection')

      // Show a message directing the user to click "View in 3D"
      const message =
        'Please click the "View in 3D" button on the IKEA product page to load the model.'
      logger.info(message)

      // Wait for network activity (10 second timeout)
      return await new Promise<GlbExtractionResult | null>((resolve) => {
        const timeout = setTimeout(() => {
          resolve(null)
        }, 10000)

        const checkForGlb = setInterval(() => {
          if (this._interceptedUrls.size > 0) {
            clearInterval(checkForGlb)
            clearTimeout(timeout)
            const glbUrl = Array.from(this._interceptedUrls)[0]
            resolve({
              glbUrl,
              productName: this._extractProductName(glbUrl),
              fileName: this._extractFileName(glbUrl),
            })
          }
        }, 500)
      })
    } catch {
      return null
    }
  }

  /**
   * Extract product name from URL or use default
   */
  private _extractProductName(url: string): string {
    try {
      const urlObj = new URL(url)
      const parts = urlObj.pathname.split('/')
      const fileName = parts[parts.length - 1] || 'ikea-model'
      return sanitizeFilename(fileName.replace(/\.glb$/, ''))
    } catch {
      return 'ikea-model'
    }
  }

  /**
   * Extract file name from URL
   */
  private _extractFileName(url: string): string {
    try {
      const urlObj = new URL(url)
      const parts = urlObj.pathname.split('/')
      return parts[parts.length - 1] || 'model.glb'
    } catch {
      return 'model.glb'
    }
  }
}
