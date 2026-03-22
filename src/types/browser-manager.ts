/**
 * Browser Manager component types
 * Handles lifecycle, resource management, and cleanup
 */

import type { BrowserResourceSnapshot, BrowserSessionConfig } from './common'

export interface BrowserInstance {
  launch(): Promise<void>
  close(): Promise<void>
  isAlive(): boolean
  getProcessId(): number | undefined
  getMemoryUsage(): NodeJS.MemoryUsage | undefined
  snapshot(): BrowserResourceSnapshot
}

export interface PageNavigationOptions {
  timeout?: number
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'
}

export type PageEvent = 'load' | 'framenavigated' | 'console' | 'response'

export type PageEventHandler = (data: unknown) => void

export interface ScreenshotOptions {
  fullPage?: boolean
  type?: 'png' | 'jpeg'
  quality?: number
  clip?: {
    x: number
    y: number
    width: number
    height: number
  }
}

export interface ManagedPage {
  goto(url: string, options?: PageNavigationOptions): Promise<void>
  content(): Promise<string>
  evaluate<T>(pageFunction: string | Function, ...args: unknown[]): Promise<T>
  evaluateHandle<T>(pageFunction: string | Function, ...args: unknown[]): Promise<T>
  on(event: PageEvent, handler: PageEventHandler): void
  off(event: PageEvent, handler: PageEventHandler): void
  close(): Promise<void>
  screenshot(options?: ScreenshotOptions): Promise<Buffer>
}

export interface BrowserManager {
  /**
   * Initialize and launch browser
   */
  initialize(config: BrowserSessionConfig): Promise<void>

  /**
   * Create a new managed page
   */
  createPage(): Promise<ManagedPage>

  /**
   * Get list of active pages
   */
  getActivePages(): Promise<ManagedPage[]>

  /**
   * Check if browser is ready
   */
  isReady(): boolean

  /**
   * Get current resource snapshot
   */
  getSnapshot(): BrowserResourceSnapshot

  /**
   * Graceful shutdown with cleanup
   */
  shutdown(): Promise<void>

  /**
   * Force kill browser (emergency only)
   */
  forceKill(): Promise<void>

  /**
   * Cleanup temporary files
   */
  cleanupTempFiles(tmpDir: string): Promise<void>

  /**
   * Monitor browser health
   */
  startHealthCheck(intervalMs: number): Promise<void>

  /**
   * Stop health monitoring
   */
  stopHealthCheck(): Promise<void>
}

export interface BrowserManagerFactory {
  create(
    environment: 'node' | 'browser',
    config: BrowserSessionConfig
  ): BrowserManager
}
