/**
 * Custom error class for processing errors
 */

import type { ErrorCode, ProcessingError } from '../types'

export class ProcessingException extends Error {
  readonly code: ErrorCode
  readonly details?: Record<string, unknown>

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.code = code
    this.details = details
    this.name = 'ProcessingException'

    // Set the prototype explicitly to support instanceof checks
    Object.setPrototypeOf(this, ProcessingException.prototype)
  }

  toError(): ProcessingError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    }
  }
}
