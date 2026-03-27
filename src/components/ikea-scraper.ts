/**
 * IKEA Scraper component
 * Extracts GLB URLs from IKEA product pages and downloads the 3D models
 */

import type { IkeaScraperConfig, GlbExtractionResult, ScraperResult } from '../types'
import type { ProcessingResult } from '../types'
import { validateIkeaUrl, validateGlbBuffer, sanitizeFilename } from '../utils/validators'
import { normalizeUrl } from '../utils/browser-utils'
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
         (await this._tryRoteraApi(productUrl)) ||
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
    // Skip network interception in browser environment (not needed there)
    if (typeof window !== 'undefined' && typeof process === 'undefined') {
      logger.debug('Network interception not available in browser environment')
      return
    }

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
   * Parse IKEA URL to extract country, language, and product ID
   */
  private _parseIkeaUrl(url: string): { productId: string | null; country: string | null; language: string | null } {
    const result = {
      productId: null as string | null,
      country: null as string | null,
      language: null as string | null,
    }

    try {
      // Extract country and language from URL
      const countryLanguageMatch = url.match(/ikea\.com\/([^/]+)\/([^/]+)/)
      if (countryLanguageMatch) {
        result.country = countryLanguageMatch[1]
        result.language = countryLanguageMatch[2]
      }

      // Extract product ID from URL
      const productIdMatch = url.match(/s(\d+)(?:\/|#|\?|$)/)
      if (productIdMatch) {
        result.productId = productIdMatch[1]
      }
    } catch {
      // URL parsing failed
    }

    return result
  }

   /**
    * Try to extract GLB URL via Rotera API
    */
   private async _tryRoteraApi(productUrl: string): Promise<GlbExtractionResult | null> {
     try {
       // Skip API calls in browser environment (CORS restrictions)
       if (typeof window !== 'undefined' && typeof process === 'undefined') {
         logger.debug('Rotera API not available in browser environment (CORS restrictions)')
         return null
       }

       const { productId, country, language } = this._parseIkeaUrl(productUrl)

       if (!productId || !country || !language) {
         logger.debug('Could not extract all required parameters from URL for Rotera API')
         return null
       }

       const apiUrl = `https://web-api.ikea.com/${country}/${language}/rotera/data/model/${productId}/`
       logger.info('Attempting Rotera API extraction:', apiUrl)

       const controller = new AbortController()
       const timeoutId = setTimeout(() => controller.abort(), this._config.timeout)

       const response = await fetch(apiUrl, {
         signal: controller.signal,
         headers: {
           'Accept': 'application/json',
        },
       })

       clearTimeout(timeoutId)

       if (!response.ok) {
         logger.debug(`Rotera API returned ${response.status}: ${response.statusText}`)
         return null
       }

       const data = await response.json() as Record<string, unknown>

       // Validate response structure and extract modelUrl
       if (!data || typeof data !== 'object') {
         logger.debug('Rotera API response is not a valid object')
         return null
       }

        const modelUrl = data.modelUrl
        if (!modelUrl || typeof modelUrl !== 'string') {
          logger.debug('Rotera API response does not contain modelUrl field')
          return null
        }

        // Handle relative paths
        // Normalize URL relative to the API base
        let glbUrl = modelUrl
        try {
          glbUrl = new URL(modelUrl, `https://web-api.ikea.com/${country}/${language}/`).toString()
        } catch {
          // fallback
          if (!glbUrl.startsWith('http')) {
            glbUrl = `https://web-api.ikea.com/${country}/${language}${glbUrl}`
          }
        }

       // Ensure GLB extension
       if (!glbUrl.endsWith('.glb')) {
         logger.debug('Model URL from Rotera API does not end with .glb extension')
         return null
       }

       logger.info('Successfully extracted GLB URL from Rotera API:', glbUrl)

       return {
         glbUrl,
         productName: this._extractProductName(glbUrl),
         fileName: this._extractFileName(glbUrl),
       }
     } catch (error) {
       const message = error instanceof Error ? error.message : 'Unknown error'
       logger.debug('Rotera API extraction failed:', message)
       return null
     }
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
      const raw = Array.from(this._interceptedUrls)[0]
      const glbUrl = normalizeUrl(raw, _productUrl)
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
       // Strategy 1: Look for model-viewer elements
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

       // Strategy 2: Look for img tags with GLB
       const imgs = document.querySelectorAll('img[src*=".glb"]')
       if (imgs.length > 0) {
         const glbUrl = (imgs[0] as HTMLImageElement).src
         return {
           glbUrl,
           productName: this._extractProductName(glbUrl),
           fileName: this._extractFileName(glbUrl),
         }
       }

       // Strategy 3: Search all script tags for GLB URLs
       const scripts = document.querySelectorAll('script')
       for (const script of scripts) {
         if (script.textContent) {
           const match = script.textContent.match(/https:\/\/[^"'\s<>]*\.glb[^"'\s<>]*/i)
           if (match) {
             const glbUrl = match[0]
             return {
               glbUrl,
               productName: this._extractProductName(glbUrl),
               fileName: this._extractFileName(glbUrl),
             }
           }
         }
       }

       // Strategy 4: Search all element attributes for GLB URLs
       const allElements = document.querySelectorAll('*')
       for (const element of allElements) {
         for (const attr of element.attributes) {
           if (attr.value && attr.value.includes('.glb')) {
             const match = attr.value.match(/https:\/\/[^"'\s<>]*\.glb[^"'\s<>]*/i)
             if (match) {
               const glbUrl = match[0]
               return {
                 glbUrl,
                 productName: this._extractProductName(glbUrl),
                 fileName: this._extractFileName(glbUrl),
               }
             }
           }
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
       const globalNames = [
         'glbUrl', 'modelUrl', 'productModel', 'window_interceptedGlbUrl',
         '__IKEA_GLB_URL__', '__glbUrl', '__modelUrl', '__model',
         'ikea', 'rotera', 'viewer', 'viewer3d', 'model3d',
         '_glb', '_model', '__data', '__initial',
       ]

       for (const name of globalNames) {
         const value = (window as unknown as Record<string, unknown>)[name]
         if (typeof value === 'string' && value.includes('.glb')) {
           return {
             glbUrl: value,
             productName: this._extractProductName(value),
             fileName: this._extractFileName(value),
           }
         }
       }

       // Check nested objects
       const ikeaGlobal = (window as unknown as Record<string, unknown>)['__IKEA__'] as Record<string, unknown> | undefined
       if (ikeaGlobal) {
         for (const key in ikeaGlobal) {
           const val = ikeaGlobal[key]
           if (typeof val === 'string' && val.includes('.glb')) {
             return {
               glbUrl: val,
               productName: this._extractProductName(val),
               fileName: this._extractFileName(val),
             }
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

       // Try to automatically trigger the 3D viewer
       try {
         // Look for buttons that might trigger 3D viewer
         const buttons = document.querySelectorAll('button')
         for (const button of buttons) {
           const text = button.textContent?.toLowerCase() || ''
           if (text.includes('3d') || text.includes('view') || text.includes('product') || text.includes('model')) {
             logger.debug(`Auto-triggering button: ${button.textContent}`)
             button.click()
             await new Promise(r => setTimeout(r, 1000))
             break
           }
         }

         // Also try clicking elements with 3D-related classes
         const viewer3dElements = document.querySelectorAll('[class*="3d"], [class*="viewer"], [id*="viewer"]')
         if (viewer3dElements.length > 0) {
           logger.debug(`Clicking 3D viewer element: ${viewer3dElements[0].className}`)
           ;(viewer3dElements[0] as HTMLElement).click()
           await new Promise(r => setTimeout(r, 1000))
         }
       } catch (e) {
         logger.debug(`Error auto-triggering viewer: ${e}`)
       }

       // Show a message directing the user to click "View in 3D"
       const message =
         'Please click the "View in 3D" button on the IKEA product page to load the model. Waiting for GLB URL...'
       logger.info(message)

       // Wait for network activity (15 second timeout)
       return await new Promise<GlbExtractionResult | null>((resolve) => {
         const timeout = setTimeout(() => {
           logger.debug('Manual mode timeout reached')
           resolve(null)
         }, 15000)

         const checkForGlb = setInterval(() => {
           // Check if GLB URL was captured via network interception
           if (this._interceptedUrls.size > 0) {
             clearInterval(checkForGlb)
             clearTimeout(timeout)
             const glbUrl = Array.from(this._interceptedUrls)[0]
             logger.info(`Found GLB URL via network interception: ${glbUrl}`)
             resolve({
               glbUrl,
               productName: this._extractProductName(glbUrl),
               fileName: this._extractFileName(glbUrl),
             })
             return
           }

           // Check DOM again in case it was updated
           const scripts = document.querySelectorAll('script')
           for (const script of scripts) {
             if (script.textContent) {
               const match = script.textContent.match(/https:\/\/[^"'\s<>]*\.glb[^"'\s<>]*/i)
               if (match) {
                 clearInterval(checkForGlb)
                 clearTimeout(timeout)
                 const glbUrl = match[0]
                 logger.info(`Found GLB URL in script: ${glbUrl}`)
                 resolve({
                   glbUrl,
                   productName: this._extractProductName(glbUrl),
                   fileName: this._extractFileName(glbUrl),
                 })
                 return
               }
             }
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
