/**
 * Main Coordinator - orchestrates the entire processing pipeline
 * Manages state, coordinates components, and updates UI
 */

import type { CoordinatorConfig, ProcessingPipeline, UIUpdateEvent } from './types'
import { IkeaScraperImpl } from './components/ikea-scraper'
import { GlbConverterImpl } from './components/glb-converter'
import { ZipPackerImpl } from './components/zip-packer'
import { validateIkeaUrl } from './utils/validators'
import { logger } from './utils/logger'

export interface Coordinator {
  processProduct(url: string): Promise<Blob | null>
  cancelCurrentProcess(): Promise<void>
  reset(): void
  on(event: string, callback: (evt: UIUpdateEvent) => void): () => void
  getHistory(): ProcessingPipeline[]
  cleanup(): Promise<void>
}

export type ProcessingState =
  | 'IDLE'
  | 'VALIDATING'
  | 'SCRAPING'
  | 'DOWNLOADING'
  | 'CONVERTING'
  | 'PACKING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ERROR'

export class CoordinatorImpl implements Coordinator {
  private _config: CoordinatorConfig
  private _pipeline: ProcessingPipeline
  private _eventListeners: Map<string, Set<(evt: UIUpdateEvent) => void>> = new Map()
  private _isProcessing: boolean = false
  private _currentState: ProcessingState = 'IDLE'
  private _progress: number = 0
  private _history: ProcessingPipeline[] = []
  private _abortController: AbortController | null = null
  private _scraper: IkeaScraperImpl
  private _converter: GlbConverterImpl
  private _packer: ZipPackerImpl
  private _lastBlob: Blob | null = null
  private _lastFileName: string | null = null

  constructor(config: CoordinatorConfig) {
    this._config = config
    this._pipeline = { url: '' }
    this._scraper = new IkeaScraperImpl(config.scraperConfig)
    this._converter = new GlbConverterImpl(config.converterConfig)
    this._packer = new ZipPackerImpl(config.packerConfig)
  }

  /**
   * Process a product URL through the entire pipeline
   * @param url - The IKEA product URL to process
   * @returns Blob of the generated ZIP file or null on error
   */
  async processProduct(url: string): Promise<Blob | null> {
    // Prevent concurrent processing
    if (this._isProcessing) {
      logger.warn('Processing already in progress')
      this._emitEvent('error', {
        type: 'error',
        message: 'Processing already in progress. Please wait.',
      })
      return null
    }

    this._isProcessing = true
    this._abortController = new AbortController()
    this._pipeline = { url }

    try {
      // Step 1: Validate URL
      this._setState('VALIDATING')
      this._updateProgress(5, 'Validating URL...')

      if (!validateIkeaUrl(url)) {
        throw new Error('Invalid IKEA URL. Please provide a valid ikea.com product URL.')
      }

      // Step 2: Extract and download GLB
      this._setState('SCRAPING')
      this._updateProgress(15, 'Extracting GLB URL from product page...')

      const scraperResult = await this._scraper.processProduct(url)
      if (!scraperResult.success || !scraperResult.data) {
        const errorMsg = scraperResult.error?.message || 'Failed to extract GLB URL'
        throw new Error(errorMsg)
      }

      this._pipeline.productName = scraperResult.data.productName
      this._pipeline.glbBuffer = scraperResult.data.glbBuffer
      this._updateProgress(50, 'GLB file downloaded successfully')

      // Step 3: Convert GLB to OBJ
      this._setState('CONVERTING')
      this._updateProgress(55, 'Converting GLB to OBJ format...')

      if (!scraperResult.data.glbBuffer) {
        throw new Error('No GLB buffer available for conversion')
      }

      const converterResult = await this._converter.convert({
        glbBuffer: scraperResult.data.glbBuffer,
        productName: scraperResult.data.productName,
      })

      if (!converterResult.success || !converterResult.data) {
        const errorMsg = converterResult.error?.message || 'Failed to convert GLB'
        throw new Error(errorMsg)
      }

      this._pipeline.objContent = converterResult.data.objContent
      this._pipeline.mtlContent = converterResult.data.mtlContent
      this._pipeline.textures = converterResult.data.textures
      this._updateProgress(80, 'Conversion completed')

      // Step 4: Pack into ZIP
      this._setState('PACKING')
      this._updateProgress(85, 'Creating ZIP archive...')

      const packResult = await this._packer.pack({
        objContent: converterResult.data.objContent,
        mtlContent: converterResult.data.mtlContent,
        textures: converterResult.data.textures,
        productName: scraperResult.data.productName,
      })

      if (!packResult.success || !packResult.data) {
        const errorMsg = packResult.error?.message || 'Failed to create ZIP'
        throw new Error(errorMsg)
      }

      this._pipeline.zipBlob = packResult.data.zipBlob
      this._lastBlob = packResult.data.zipBlob
      this._lastFileName = packResult.data.fileName

      // Mark as completed
      this._setState('COMPLETED')
      this._updateProgress(100, 'Processing completed successfully!')

      logger.info('Product processing pipeline completed successfully')
      this._emitEvent('success', {
        type: 'success',
        message: 'Download ready! Click the download button to save your file.',
        data: {
          fileName: packResult.data.fileName,
          fileSize: packResult.data.zipBlob.size,
        },
      })

      // Add to history
      this._history.push({ ...this._pipeline })

      return packResult.data.zipBlob
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error during processing'
      logger.error('Pipeline error:', message)

      this._setState('ERROR')
      this._updateProgress(0, message)

      this._emitEvent('error', {
        type: 'error',
        message,
        data: {
          suggestion: this._getErrorSuggestion(message),
        },
      })

      return null
    } finally {
      this._isProcessing = false
      this._abortController = null
    }
  }

  /**
   * Cancel the current processing
   */
  async cancelCurrentProcess(): Promise<void> {
    if (!this._isProcessing) {
      return
    }

    logger.info('Cancelling current process')
    this._setState('CANCELLED')
    this._updateProgress(0, 'Processing cancelled')

    if (this._abortController) {
      this._abortController.abort()
    }

    await this._scraper.cleanup()
    this._converter.cleanup()

    this._isProcessing = false
    this._emitEvent('cancelled', {
      type: 'status',
      message: 'Processing cancelled',
    })
  }

  /**
   * Reset the coordinator state
   */
  reset(): void {
    logger.info('Resetting coordinator')
    this._pipeline = { url: '' }
    this._currentState = 'IDLE'
    this._progress = 0
    this._lastBlob = null
    this._lastFileName = null

    this._emitEvent('reset', {
      type: 'status',
      message: 'Ready for new processing',
    })
  }

  /**
   * Subscribe to coordinator events
   * @param event - Event name
   * @param callback - Callback function
   * @returns Unsubscribe function
   */
  on(event: string, callback: (evt: UIUpdateEvent) => void): () => void {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, new Set())
    }

    const listeners = this._eventListeners.get(event)
    listeners?.add(callback)

    // Return unsubscribe function
    return () => {
      listeners?.delete(callback)
    }
  }

  /**
   * Get processing history
   */
  getHistory(): ProcessingPipeline[] {
    return [...this._history]
  }

  /**
   * Download the last processed file
   */
  downloadLastFile(): { blob: Blob; fileName: string } | null {
    if (!this._lastBlob || !this._lastFileName) {
      return null
    }

    return {
      blob: this._lastBlob,
      fileName: this._lastFileName,
    }
  }

  /**
   * Get current processing state
   */
  getState(): ProcessingState {
    return this._currentState
  }

  /**
   * Get current progress percentage
   */
  getProgress(): number {
    return this._progress
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up coordinator')
    await this.cancelCurrentProcess()
    await this._scraper.cleanup()
    this._converter.cleanup()
    this._eventListeners.clear()
  }

  // --- Private Methods ---

  /**
   * Set the current processing state
   */
  private _setState(state: ProcessingState): void {
    this._currentState = state
    logger.debug(`State: ${state}`)
  }

  /**
   * Update progress and emit event
   */
  private _updateProgress(progress: number, message: string): void {
    this._progress = Math.min(100, Math.max(0, progress))
    this._emitEvent('progress', {
      type: 'progress',
      message,
      progress: this._progress,
    })
  }

  /**
   * Emit event to all listeners
   */
  private _emitEvent(event: string, data: UIUpdateEvent): void {
    const listeners = this._eventListeners.get(event)
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data)
        } catch (error) {
          logger.error(`Error in event listener for '${event}':`, error)
        }
      })
    }

    // Also emit to 'all' listeners
    if (event !== 'all') {
      const allListeners = this._eventListeners.get('all')
      if (allListeners) {
        allListeners.forEach((callback) => {
          try {
            callback(data)
          } catch (error) {
            logger.error("Error in 'all' event listener:", error)
          }
        })
      }
    }
  }

  /**
   * Get helpful error suggestion based on error message
   */
  private _getErrorSuggestion(errorMessage: string): string {
    if (errorMessage.includes('CORS')) {
      return 'CORS error detected. Try using a VPN or proxy, or use manual mode.'
    }
    if (errorMessage.includes('timeout')) {
      return 'Request timed out. Please check your internet connection and try again.'
    }
    if (errorMessage.includes('Invalid') && errorMessage.includes('URL')) {
      return 'Please provide a valid IKEA product URL (from ikea.com).'
    }
    if (errorMessage.includes('GLB')) {
      return 'The extracted file is not a valid GLB model. Try a different IKEA product.'
    }
    return 'Please try again or contact support if the issue persists.'
  }
}
