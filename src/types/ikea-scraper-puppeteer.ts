/**
 * IKEA Scraper with Puppeteer support types
 */

import type { IkeaScraperConfig, GlbExtractionResult } from './ikea-scraper'
import type {
  GlbNetworkCandidate,
  IkeaRegionInfo,
  BrowserSessionConfig,
} from './common'
import type { ProcessingResult } from './common'

export interface ConsoleMessage {
  type: 'log' | 'warn' | 'error' | 'debug'
  text: string
  location?: {
    url: string
    lineNumber: number
    columnNumber: number
  }
  timestamp: number
}

export interface PageContentAnalysis {
  hasProductData: boolean
  hasThreeJsScripts: boolean
  has3dViewer: boolean
  productName?: string
  detectedGlbUrls: GlbNetworkCandidate[]
  scriptGlobals: Record<string, unknown>
  dataAttributes: Record<string, string>
  consoleMessages: ConsoleMessage[]
}

export interface NetworkInterceptionContext {
  /**
   * Start intercepting network requests
   */
  start(): Promise<void>

  /**
   * Stop intercepting
   */
  stop(): Promise<void>

  /**
   * Get all intercepted GLB candidates
   */
  getGlbCandidates(): GlbNetworkCandidate[]

  /**
   * Get best candidate
   */
  getBestCandidate(): GlbNetworkCandidate | null

  /**
   * Clear history
   */
  reset(): void

  /**
   * Get raw network log
   */
  getRawLog(): Array<{ url: string; timestamp: number }>
}

export interface Model3dLoaderTrigger {
  /**
   * Try to trigger 3D model loading via various methods
   */
  trigger(): Promise<void>

  /**
   * Wait for model to load (checks for network requests)
   */
  waitForModel(timeoutMs: number): Promise<boolean>

  /**
   * Detect if model is loaded
   */
  isModelLoaded(): Promise<boolean>

  /**
   * Get estimated loading progress
   */
  getLoadingProgress(): Promise<number>
}

export type ExtractionStrategy =
  | 'network-interception'
  | 'dom-scanning'
  | 'script-globals'
  | 'data-attributes'
  | 'performance-observer'
  | 'rotera-api'
  | 'manual'

export interface ExtractionAttempt {
  strategy: ExtractionStrategy
  success: boolean
  candidate?: GlbNetworkCandidate
  error?: string
  durationMs: number
  confidence: 'high' | 'medium' | 'low'
}

export interface ExtractionReport {
  url: string
  attempts: ExtractionAttempt[]
  selectedCandidate?: GlbNetworkCandidate
  pageAnalysis?: PageContentAnalysis
  totalDurationMs: number
  environment: 'browser' | 'node'
  strategy: 'puppeteer' | 'native'
}

export interface IkeaScraperPuppeteerConfig extends IkeaScraperConfig {
  /**
   * Enable Puppeteer for JavaScript-heavy pages
   */
  usePuppeteer: boolean

  /**
   * Browser session configuration
   */
  browserConfig: BrowserSessionConfig

  /**
   * Maximum time to wait for 3D model to load (ms)
   */
  modelLoadTimeout: number

  /**
   * JavaScript execution timeout (ms)
   */
  jsExecutionTimeout: number

  /**
   * Enable network interception
   */
  interceptNetwork: boolean

  /**
   * GLB file size validation (bytes)
   * Set to 0 to disable validation
   */
  minGlbSize: number
  maxGlbSize: number

  /**
   * Retry strategy for failed page loads
   */
  retryStrategy: 'exponential' | 'linear' | 'fixed'

  /**
   * Enable JavaScript console logging
   */
  captureConsole: boolean

  /**
   * Regional locale preference
   */
  preferredRegion?: string
}

export interface IkeaScraperPuppeteer {
  /**
   * Extract GLB URL using Puppeteer with multiple strategies
   */
  extractGlbUrlWithPuppeteer(
    productUrl: string
  ): Promise<ProcessingResult<GlbExtractionResult>>

  /**
   * Analyze page content to detect 3D model
   */
  analyzePage(productUrl: string): Promise<ProcessingResult<PageContentAnalysis>>

  /**
   * Start network interception for a URL
   */
  createNetworkInterception(
    productUrl: string
  ): Promise<ProcessingResult<NetworkInterceptionContext>>

  /**
   * Create 3D model loader
   */
  create3dModelLoader(page: any): Model3dLoaderTrigger

  /**
   * Detect IKEA region from URL
   */
  detectIkeaRegion(url: string): IkeaRegionInfo

  /**
   * Validate region is supported
   */
  isSupportedRegion(regionInfo: IkeaRegionInfo): boolean

  /**
   * Get all IKEA domains to test
   */
  getAllSupportedDomains(): string[]

  /**
   * Graceful shutdown
   */
  shutdown(): Promise<void>
}
