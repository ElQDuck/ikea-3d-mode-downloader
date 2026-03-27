/**
 * Common types used across the application
 */

export type ErrorCode =
  | 'INVALID_URL'
  | 'NETWORK_ERROR'
  | 'GLB_PARSE_ERROR'
  | 'CONVERSION_ERROR'
  | 'ZIP_CREATION_ERROR'
  | 'UNKNOWN_ERROR'

export type ExecutionEnvironment = 'browser' | 'node'

export type BrowserStrategy = 'puppeteer' | 'native'

export type BrowserErrorCode =
  | 'BROWSER_LAUNCH_FAILED'
  | 'PAGE_LOAD_FAILED'
  | 'JAVASCRIPT_EXECUTION_ERROR'
  | 'TIMEOUT_EXCEEDED'
  | 'NETWORK_INTERCEPTION_FAILED'
  | 'GLB_NOT_FOUND'
  | 'ENVIRONMENT_MISMATCH'
  | 'TEMP_FILE_ERROR'
  | 'PROCESS_ZOMBIE'
  | ErrorCode

export interface ProcessingError {
  code: ErrorCode | BrowserErrorCode
  message: string
  details?: Record<string, unknown>
}

export interface BrowserProcessingError extends ProcessingError {
  code: BrowserErrorCode
  browserContext?: {
    pageUrl?: string
    processId?: number
    elapsedTime: number
  }
}

export interface ProcessingResult<T> {
  success: boolean
  data?: T
  error?: ProcessingError
  timestamp: number
}

export interface UIState {
  isProcessing: boolean
  currentStep: string
  progress: number
  error: ProcessingError | null
}

export interface BrowserSessionConfig {
  headless: boolean
  timeout: number
  userAgent?: string
  viewport?: {
    width: number
    height: number
  }
  args?: string[]
  tmpDir: string
  /** Optional WebSocket endpoint to connect to an existing Chromium instance */
  wsEndpoint?: string
}

export interface BrowserResourceSnapshot {
  isActive: boolean
  processId?: number
  pageCount: number
  memoryUsage?: NodeJS.MemoryUsage
  activeTimeoutHandles: number
  createdAt: number
}

export interface InterceptedNetworkRequest {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'
  headers: Record<string, string | string[]>
  resourceType: 'fetch' | 'xhr' | 'image' | 'stylesheet' | 'document' | 'other'
  timestamp: number
}

export interface InterceptedNetworkResponse {
  statusCode: number
  contentType: string
  contentLength: number
  body: Buffer
  headers: Record<string, string | string[]>
}

export interface GlbNetworkCandidate {
  url: string
  source: 'network' | 'dom' | 'script' | 'data-attribute'
  confidence: 'high' | 'medium' | 'low'
  detectedAt: number
  contentType?: string
  size?: number
}

export interface IkeaRegionInfo {
  countryCode: string
  languageCode: string
  domain: string
  locale: string
  isSupportedRegion: boolean
}


export interface BrowserProcessingError extends ProcessingError {
  code: BrowserErrorCode
  browserContext?: {
    pageUrl?: string
    processId?: number
    elapsedTime: number
  }
}

export interface ProcessingResult<T> {
  success: boolean
  data?: T
  error?: ProcessingError
  timestamp: number
}

export interface UIState {
  isProcessing: boolean
  currentStep: string
  progress: number
  error: ProcessingError | null
}

export interface BrowserSessionConfig {
  headless: boolean
  timeout: number
  userAgent?: string
  viewport?: {
    width: number
    height: number
  }
  args?: string[]
  tmpDir: string
}

export interface BrowserResourceSnapshot {
  isActive: boolean
  processId?: number
  pageCount: number
  memoryUsage?: NodeJS.MemoryUsage
  activeTimeoutHandles: number
  createdAt: number
}

export interface InterceptedNetworkRequest {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'
  headers: Record<string, string | string[]>
  resourceType: 'fetch' | 'xhr' | 'image' | 'stylesheet' | 'document' | 'other'
  timestamp: number
}

export interface InterceptedNetworkResponse {
  statusCode: number
  contentType: string
  contentLength: number
  body: Buffer
  headers: Record<string, string | string[]>
}

export interface GlbNetworkCandidate {
  url: string
  source: 'network' | 'dom' | 'script' | 'data-attribute'
  confidence: 'high' | 'medium' | 'low'
  detectedAt: number
  contentType?: string
  size?: number
}

export interface IkeaRegionInfo {
  countryCode: string
  languageCode: string
  domain: string
  locale: string
  isSupportedRegion: boolean
}
