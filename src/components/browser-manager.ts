/**
 * Browser Manager implementation using Puppeteer
 * Handles browser lifecycle, page management, and resource cleanup
 */

import puppeteer from 'puppeteer'
import type { Browser, Page } from 'puppeteer'
import type {
  BrowserManager,
  ManagedPage,
  BrowserSessionConfig,
  BrowserResourceSnapshot,
  PageNavigationOptions,
  PageEvent,
  PageEventHandler,
  ScreenshotOptions,
} from '../types'
import { TempFileManagerImpl } from '../utils/temp-file-manager'
import { logger } from '../utils/logger'
import { delay } from '../utils/browser-utils'

export class PuppeteerBrowserManager implements BrowserManager {
  private _browser: Browser | null = null
  private _config: BrowserSessionConfig | null = null
  private _pages: Map<Page, ManagedPage> = new Map()
  private _isReady: boolean = false
  private _createdAt: number = Date.now()
  private _healthCheckInterval: NodeJS.Timeout | null = null
  private _tempFileManager: TempFileManagerImpl

  constructor() {
    this._tempFileManager = new TempFileManagerImpl()
  }

  async initialize(config: BrowserSessionConfig): Promise<void> {
    try {
      this._config = config
      logger.info('Initializing Puppeteer browser manager')

      // Create temp directory
      await this._tempFileManager.createTempDir('puppeteer-session')

      // Launch browser
      const args = config.args || []
      args.push('--no-sandbox', '--disable-setuid-sandbox')

      this._browser = await puppeteer.launch({
        headless: config.headless,
        args,
        defaultViewport: config.viewport || { width: 1920, height: 1080 },
      })

      this._isReady = true
      logger.info('Puppeteer browser launched successfully')
    } catch (error) {
      logger.error(`Failed to initialize browser: ${error}`)
      this._isReady = false
      throw error
    }
  }

  async createPage(): Promise<ManagedPage> {
    if (!this._browser || !this._isReady) {
      throw new Error('Browser not initialized')
    }

    const page = await this._browser.newPage()
    const managedPage = this._createManagedPage(page)

    this._pages.set(page, managedPage)

    logger.debug(`Created new managed page (total: ${this._pages.size})`)
    return managedPage
  }

  async getActivePages(): Promise<ManagedPage[]> {
    return Array.from(this._pages.values())
  }

  isReady(): boolean {
    return this._isReady && this._browser !== null
  }

  getSnapshot(): BrowserResourceSnapshot {
    const processId = this._browser?.process()?.pid
    const memoryUsage = process.memoryUsage?.()

    return {
      isActive: this._isReady,
      processId,
      pageCount: this._pages.size,
      memoryUsage,
      activeTimeoutHandles: 0,
      createdAt: this._createdAt,
    }
  }

  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down Puppeteer browser manager')

      // Stop health check
      await this.stopHealthCheck()

      // Close all pages
      const pages = Array.from(this._pages.keys())
      for (const page of pages) {
        try {
          await page.close()
          this._pages.delete(page)
        } catch (error) {
          logger.warn(`Error closing page: ${error}`)
        }
      }

      // Close browser
      if (this._browser) {
        await this._browser.close()
        this._browser = null
      }

      // Cleanup temp files
      if (this._config?.tmpDir) {
        await this.cleanupTempFiles(this._config.tmpDir)
      }

      this._isReady = false
      logger.info('Puppeteer browser manager shut down successfully')
    } catch (error) {
      logger.error(`Error during shutdown: ${error}`)
      throw error
    }
  }

  async forceKill(): Promise<void> {
    try {
      logger.warn('Force killing browser process')

      const pid = this._browser?.process()?.pid
      if (pid) {
        process.kill(pid, 'SIGKILL')
        await delay(500)
      }

      this._browser = null
      this._isReady = false
      this._pages.clear()

      logger.info('Browser process force killed')
    } catch (error) {
      logger.error(`Error force killing browser: ${error}`)
    }
  }

  async cleanupTempFiles(tmpDir: string): Promise<void> {
    try {
      const count = await this._tempFileManager.cleanupTempDir(tmpDir)
      logger.info(`Cleaned up ${count} temp files from ${tmpDir}`)
    } catch (error) {
      logger.error(`Error cleaning up temp files: ${error}`)
    }
  }

  async startHealthCheck(intervalMs: number): Promise<void> {
    if (this._healthCheckInterval) {
      return
    }

    logger.debug(`Starting health check with interval ${intervalMs}ms`)

    this._healthCheckInterval = setInterval(() => {
      try {
        const snapshot = this.getSnapshot()

        if (!snapshot.isActive) {
          logger.warn('Browser is no longer active')
          this.forceKill().catch(e => logger.error(`Error in force kill: ${e}`))
          return
        }

        const heapUsed = snapshot.memoryUsage?.heapUsed || 0
        logger.debug(`Health check - Pages: ${snapshot.pageCount}, Memory: ${heapUsed} bytes`)
      } catch (error) {
        logger.error(`Health check error: ${error}`)
      }
    }, intervalMs)
  }

  async stopHealthCheck(): Promise<void> {
    if (this._healthCheckInterval) {
      clearInterval(this._healthCheckInterval)
      this._healthCheckInterval = null
      logger.debug('Health check stopped')
    }
  }

  // Private methods

  private _createManagedPage(page: Page): ManagedPage {
    const manager = this

    const managedPage: ManagedPage = {
      async goto(url: string, options?: PageNavigationOptions): Promise<void> {
        try {
          await page.goto(url, {
            waitUntil: options?.waitUntil || 'networkidle2',
            timeout: options?.timeout || 30000,
          })
        } catch (error) {
          logger.error(`Navigation to ${url} failed: ${error}`)
          throw error
        }
      },

      async content(): Promise<string> {
        return page.content()
      },

      async evaluate<T>(
        pageFunction: string | Function,
        ...args: unknown[]
      ): Promise<T> {
        return page.evaluate(pageFunction as any, ...args)
      },

      async evaluateHandle<T>(
        pageFunction: string | Function,
        ...args: unknown[]
      ): Promise<T> {
        const handle = await page.evaluateHandle(pageFunction as any, ...args)
        return handle as any
      },

      on(event: PageEvent, handler: PageEventHandler): void {
        // Setup actual listener
        switch (event) {
          case 'load':
            page.once('load', () => handler(null))
            break
          case 'framenavigated':
            page.on('framenavigated', () => handler(null))
            break
          case 'console':
            page.on('console', msg => handler(msg))
            break
          case 'response':
            page.on('response', response => handler(response))
            break
        }
      },

      off(event: PageEvent, handler: PageEventHandler): void {
        // Puppeteer doesn't expose removeListener easily, so this is a best-effort stub
        logger.debug(`Attempted to remove listener for event ${event}`)
      },

      async close(): Promise<void> {
        try {
          await page.close()
          manager._pages.delete(page)
          logger.debug(`Closed page (remaining: ${manager._pages.size})`)
        } catch (error) {
          logger.warn(`Error closing page: ${error}`)
        }
      },

      async screenshot(options?: ScreenshotOptions): Promise<Buffer> {
        return (await page.screenshot({
          fullPage: options?.fullPage,
          type: options?.type || 'png',
          quality: options?.quality,
          clip: options?.clip,
        })) as Buffer
      },
    }

    return managedPage
  }
}

/**
 * Native browser manager - for browser environment
 * Provides stub implementations
 */
export class NativeBrowserManager implements BrowserManager {
  async initialize(): Promise<void> {
    logger.warn('NativeBrowserManager not fully implemented for browser environment')
  }

  async createPage(): Promise<ManagedPage> {
    throw new Error('Cannot create pages in browser environment')
  }

  async getActivePages(): Promise<ManagedPage[]> {
    return []
  }

  isReady(): boolean {
    return false
  }

  getSnapshot(): BrowserResourceSnapshot {
    return {
      isActive: false,
      pageCount: 0,
      activeTimeoutHandles: 0,
      createdAt: Date.now(),
    }
  }

  async shutdown(): Promise<void> {
    // No-op
  }

  async forceKill(): Promise<void> {
    // No-op
  }

  async cleanupTempFiles(): Promise<void> {
    // No-op
  }

  async startHealthCheck(): Promise<void> {
    // No-op
  }

  async stopHealthCheck(): Promise<void> {
    // No-op
  }
}
