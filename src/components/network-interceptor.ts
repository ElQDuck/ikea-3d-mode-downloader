/**
 * Network Interception System
 * Monitors network requests to capture GLB model downloads
 */

import type {
  NetworkInterceptionContext,
  ManagedPage,
  InterceptedNetworkRequest,
  InterceptedNetworkResponse,
  GlbNetworkCandidate,
} from '../types'
import { logger } from '../utils/logger'
import { rankConfidence } from '../utils/browser-utils'
import safePeekFromPuppeteerResponse, { MAX_PEEK_BYTES, BUFFER_TIMEOUT_MS, MAX_CONTENT_LENGTH_FOR_UNCHECKED_BUFFER } from '../utils/safe-peek'
import { validateGlbPeek } from '../utils/validate-glb'

export class GlbRequestMatcher {
  matches(url: string): boolean {
    if (!url) return false

    const raw = url.split('#')[0].split('?')[0]
    const urlLower = raw.toLowerCase()

    // Accept protocol-less URLs starting with //
    if (urlLower.startsWith('//')) {
      // treat as potential model
      if (urlLower.endsWith('.glb') || urlLower.endsWith('.gltf')) return true
      // fallthrough to pattern checks
    }

    // Check file extension (ignoring query/fragment)
    if (urlLower.endsWith('.glb') || urlLower.endsWith('.gltf')) {
      return true
    }

    // Patterns for model-like URLs
    const glbPatterns = [/\.(glb|gltf|bin)$/i, /rotera|3d[-_]model|model[-_]data/i, /v1\/([a-z0-9-]+)?glb/i]

    return glbPatterns.some((pattern) => pattern.test(urlLower))
  }
}

export class NetworkLogger {
  private _requests: Map<string, InterceptedNetworkRequest> = new Map()
  private _responses: Map<string, InterceptedNetworkResponse> = new Map()

  logRequest(url: string, request: InterceptedNetworkRequest): void {
    this._requests.set(url, request)
  }

  logResponse(url: string, response: InterceptedNetworkResponse): void {
    this._responses.set(url, response)
  }

  getRequests(): InterceptedNetworkRequest[] {
    return Array.from(this._requests.values())
  }

  getResponses(): Map<string, InterceptedNetworkResponse> {
    return new Map(this._responses)
  }

  clear(): void {
    this._requests.clear()
    this._responses.clear()
  }

  exportAsJson(): string {
    return JSON.stringify(
      {
        requests: Array.from(this._requests.values()),
        responses: Array.from(this._responses.entries()).map(([url, response]) => ({
          url,
          statusCode: response.statusCode,
          contentType: response.contentType,
          contentLength: response.contentLength,
        })),
      },
      null,
      2
    )
  }
}

export class NetworkInterceptionImpl implements NetworkInterceptionContext {
  private _page: ManagedPage
  private _logger: NetworkLogger
  private _glbMatcher: GlbRequestMatcher
  private _isActive: boolean = false
  private _candidates: GlbNetworkCandidate[] = []
  private _requestListeners: Array<(data: unknown) => void> = []
  private _responseListeners: Array<(data: unknown) => void> = []

  constructor(page: ManagedPage) {
    this._page = page
    this._logger = new NetworkLogger()
    this._glbMatcher = new GlbRequestMatcher()
  }

  async start(): Promise<void> {
    try {
      logger.info('Starting network interception')

      await this._setupInterception()
      this._isActive = true

      logger.info('Network interception started')
    } catch (error) {
      logger.error(`Failed to start network interception: ${error}`)
      throw error
    }
  }

  async stop(): Promise<void> {
    try {
      logger.info('Stopping network interception')
      await this._teardownInterception()
      this._isActive = false
      logger.info('Network interception stopped')
    } catch (error) {
      logger.error(`Failed to stop network interception: ${error}`)
    }
  }

  getGlbCandidates(): GlbNetworkCandidate[] {
    return [...this._candidates]
  }

  getBestCandidate(): GlbNetworkCandidate | null {
    if (this._candidates.length === 0) {
      return null
    }

    // Sort by confidence and size
    const sorted = [...this._candidates].sort((a, b) => {
      const confidenceOrder = { high: 3, medium: 2, low: 1 }
      const aConfidence = confidenceOrder[a.confidence]
      const bConfidence = confidenceOrder[b.confidence]

      if (aConfidence !== bConfidence) {
        return bConfidence - aConfidence
      }

      // If same confidence, prefer larger files (more likely to be complete)
      const aSize = a.size || 0
      const bSize = b.size || 0
      return bSize - aSize
    })

    return sorted[0] || null
  }

  reset(): void {
    this._candidates = []
    this._logger.clear()
    logger.debug('Network interception data reset')
  }

  getRawLog(): Array<{ url: string; timestamp: number }> {
    return this._logger.getRequests().map(req => ({
      url: req.url,
      timestamp: req.timestamp,
    }))
  }

  // Private methods

  private async _setupInterception(): Promise<void> {
    // Evaluate script in page context to monitor network requests
    await this._page.evaluate(() => {
      ;(window as any)._capturedNetworkRequests = []

      // Monitor fetch
      const originalFetch = window.fetch
      ;(window as any).fetch = function (input: unknown, init?: unknown) {
        const url = (input instanceof Request ? input.url : String(input)) as string
        ;(window as any)._capturedNetworkRequests.push({
          url,
          type: 'fetch',
          timestamp: Date.now(),
        })
        return originalFetch.call(this, input as RequestInfo, init as RequestInit)
      }

      // Monitor XMLHttpRequest
      const originalOpen = XMLHttpRequest.prototype.open
      XMLHttpRequest.prototype.open = function (
        method: string,
        url: string,
        ...rest: unknown[]
      ) {
        ;(window as any)._capturedNetworkRequests.push({
          url,
          type: 'xhr',
          method,
          timestamp: Date.now(),
        })
        return (originalOpen as any).apply(this, [method, url, ...rest])
      }

      // Monitor image loads
      const originalImageSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
      if (originalImageSrc?.set) {
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
          set(value: string) {
            ;(window as any)._capturedNetworkRequests.push({
              url: value,
              type: 'image',
              timestamp: Date.now(),
            })
            originalImageSrc.set?.call(this, value)
          },
          get: originalImageSrc.get,
        })
      }
    })

    // Listen for responses and check for GLB files
    const responseHandler = (response: unknown) => {
      void this._handleResponse(response)
    }
    this._page.on('response', responseHandler)
    this._responseListeners.push(responseHandler)
  }

  private async _teardownInterception(): Promise<void> {
    // Clean up listeners
    for (const cb of this._responseListeners) {
      try {
        this._page.off('response', cb)
      } catch (_) {}
    }
    this._requestListeners = []
    this._responseListeners = []
  }

  private async _handleResponse(response: unknown): Promise<void> {
    try {
      const responseObj = response as any
      const url = responseObj.url?.() || responseObj.url || ''
      const status = responseObj.status?.() || responseObj.status || 0
      const headersGetter = responseObj.headers?.() || responseObj.headers || {}
      const contentType = (headersGetter['content-type'] || headersGetter['Content-Type'] || '') as string
      const contentLengthRaw = headersGetter['content-length'] || headersGetter['Content-Length']
      const contentLength = contentLengthRaw !== undefined && contentLengthRaw !== null && contentLengthRaw !== ''
        ? Number.isFinite(Number(contentLengthRaw)) ? Number(contentLengthRaw) : parseInt(String(contentLengthRaw || '0'), 10)
        : undefined

      if (!url) {
        return
      }

      // Log all responses
      const logEntry: InterceptedNetworkRequest = {
        url,
        method: 'GET',
        headers: { 'content-type': contentType },
        resourceType: 'fetch',
        timestamp: Date.now(),
      }
      this._logger.logRequest(url, logEntry)

      // Quick rejects by extension for textual or JS bundles or images/fonts
      const quickRejectExts = ['.js', '.mjs', '.css', '.html', '.htm', '.json', '.map', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff', '.woff2', '.ttf']
      const rawPath = url.split('#')[0].split('?')[0]
      const pathnameLower = rawPath.toLowerCase()
      for (const ext of quickRejectExts) {
        if (pathnameLower.endsWith(ext)) {
          logger.debug(`Ignoring by quick-reject extension: ${url} -> ${ext}`)
          return
        }
      }

      // Only treat as candidate if extension looks like GLB/GLTF or content-type indicates binary model or peek indicates GLB
      const raw = url.split('#')[0].split('?')[0]
      const urlLower = raw.toLowerCase()
      const looksLikeExtension = urlLower.endsWith('.glb') || urlLower.endsWith('.gltf') || urlLower.endsWith('.bin')
      const contentTypeIsModel = !!contentType && /model\/(gltf-binary)/i.test(contentType)

      let isCandidate = false

      if (looksLikeExtension) isCandidate = true
      // check content-disposition filename
      const disposition = headersGetter['content-disposition'] || headersGetter['Content-Disposition'] || ''
      if (!isCandidate && typeof disposition === 'string' && /filename=.*\.glb/i.test(disposition)) isCandidate = true
      if (!isCandidate && contentTypeIsModel) isCandidate = true

      // If still ambiguous, attempt safe peek and validate
      if (!isCandidate && typeof responseObj.buffer === 'function') {
        try {
          const peek = await safePeekFromPuppeteerResponse(responseObj)
          if (!peek.ok) {
            logger.debug(`Peek rejected for ${url}: ${peek.reason || 'no-reason'}`)
          } else if (peek.peekBuffer && validateGlbPeek(peek.peekBuffer, peek.contentLength)) {
            isCandidate = true
          }
        } catch (e) {
          logger.debug(`Peek failed for ${url}: ${String(e)}`)
        }
      }

      if (status >= 200 && status < 300 && isCandidate) {
        const candidate = this._rankCandidate(url, {
          statusCode: status,
          contentType: contentType as string,
          contentLength: contentLength || 0,
          body: Buffer.alloc(0),
          headers: headersGetter,
        })

        // Store minimal metadata; do NOT buffer full body here
        this._candidates.push({
          url,
          source: 'network',
          confidence: candidate.confidence,
          detectedAt: candidate.detectedAt,
          contentType: candidate.contentType,
          size: candidate.size,
        })
        logger.debug(`Found GLB candidate: ${url} (${candidate.confidence}) size=${contentLength || 0}`)
      }
    } catch (error) {
      logger.warn(`Error handling response: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private _rankCandidate(url: string, response: InterceptedNetworkResponse): GlbNetworkCandidate {
    const confidence = rankConfidence(
      response.contentLength,
      response.contentType,
      true
    )

    return {
      url,
      source: 'network',
      confidence,
      detectedAt: Date.now(),
      contentType: response.contentType,
      size: response.contentLength,
    }
  }
}
