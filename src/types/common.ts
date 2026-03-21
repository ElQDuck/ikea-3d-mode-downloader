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

export interface ProcessingError {
  code: ErrorCode
  message: string
  details?: Record<string, unknown>
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
