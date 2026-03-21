/**
 * Tests for custom error classes and error handling
 */

import { ProcessingException } from '@/utils/errors'
import type { ErrorCode, ProcessingError } from '@/types'

describe('ProcessingException', (): void => {
  describe('instantiation', (): void => {
    it('should create an exception with code and message', (): void => {
      const exception: ProcessingException = new ProcessingException('INVALID_URL', 'Invalid IKEA URL provided')

      expect(exception).toBeInstanceOf(ProcessingException)
      expect(exception).toBeInstanceOf(Error)
      expect(exception.code).toBe('INVALID_URL')
      expect(exception.message).toBe('Invalid IKEA URL provided')
    })

    it('should set proper error name', (): void => {
      const exception: ProcessingException = new ProcessingException('NETWORK_ERROR', 'Network request failed')

      expect(exception.name).toBe('ProcessingException')
    })

    it('should support instanceof checks', (): void => {
      const exception: ProcessingException = new ProcessingException('GLB_PARSE_ERROR', 'Failed to parse GLB')

      expect(exception instanceof ProcessingException).toBe(true)
      expect(exception instanceof Error).toBe(true)
    })
  })

  describe('error codes', (): void => {
    it('should accept INVALID_URL error code', (): void => {
      const exception: ProcessingException = new ProcessingException('INVALID_URL', 'URL is invalid')
      expect(exception.code).toBe('INVALID_URL')
    })

    it('should accept NETWORK_ERROR error code', (): void => {
      const exception: ProcessingException = new ProcessingException('NETWORK_ERROR', 'Network failed')
      expect(exception.code).toBe('NETWORK_ERROR')
    })

    it('should accept GLB_PARSE_ERROR error code', (): void => {
      const exception: ProcessingException = new ProcessingException('GLB_PARSE_ERROR', 'GLB parsing failed')
      expect(exception.code).toBe('GLB_PARSE_ERROR')
    })

    it('should accept CONVERSION_ERROR error code', (): void => {
      const exception: ProcessingException = new ProcessingException('CONVERSION_ERROR', 'Conversion failed')
      expect(exception.code).toBe('CONVERSION_ERROR')
    })

    it('should accept ZIP_CREATION_ERROR error code', (): void => {
      const exception: ProcessingException = new ProcessingException('ZIP_CREATION_ERROR', 'ZIP creation failed')
      expect(exception.code).toBe('ZIP_CREATION_ERROR')
    })

    it('should accept UNKNOWN_ERROR error code', (): void => {
      const exception: ProcessingException = new ProcessingException('UNKNOWN_ERROR', 'Unknown error occurred')
      expect(exception.code).toBe('UNKNOWN_ERROR')
    })
  })

  describe('details property', (): void => {
    it('should optionally store error details', (): void => {
      const details: Record<string, unknown> = { attemptedUrl: 'https://example.com' }
      const exception: ProcessingException = new ProcessingException('INVALID_URL', 'Invalid URL', details)

      expect(exception.details).toEqual(details)
      expect(exception.details?.attemptedUrl).toBe('https://example.com')
    })

    it('should work without details', (): void => {
      const exception: ProcessingException = new ProcessingException('UNKNOWN_ERROR', 'Unknown error')

      expect(exception.details).toBeUndefined()
    })

    it('should store complex details objects', (): void => {
      const details: Record<string, unknown> = {
        statusCode: 404,
        url: 'https://www.ikea.com/product',
        retryCount: 3,
        lastError: 'Connection timeout',
      }
      const exception: ProcessingException = new ProcessingException('NETWORK_ERROR', 'Network error', details)

      expect(exception.details).toEqual(details)
      expect(exception.details?.statusCode).toBe(404)
      expect(exception.details?.retryCount).toBe(3)
    })
  })

  describe('toError method', (): void => {
    it('should convert to ProcessingError object', (): void => {
      const exception: ProcessingException = new ProcessingException('INVALID_URL', 'Invalid URL provided')
      const error: ProcessingError = exception.toError()

      expect(error.code).toBe('INVALID_URL')
      expect(error.message).toBe('Invalid URL provided')
      expect(error.details).toBeUndefined()
    })

    it('should include details in ProcessingError', (): void => {
      const details: Record<string, unknown> = { url: 'https://example.com' }
      const exception: ProcessingException = new ProcessingException('INVALID_URL', 'Invalid URL', details)
      const error: ProcessingError = exception.toError()

      expect(error.code).toBe('INVALID_URL')
      expect(error.message).toBe('Invalid URL')
      expect(error.details).toEqual(details)
    })

    it('should maintain error information through conversion', (): void => {
      const originalDetails: Record<string, unknown> = {
        statusCode: 500,
        timestamp: Date.now(),
      }
      const exception: ProcessingException = new ProcessingException(
        'NETWORK_ERROR',
        'Server error occurred',
        originalDetails,
      )
      const error: ProcessingError = exception.toError()

      expect(error.code).toBe('NETWORK_ERROR')
      expect(error.message).toBe('Server error occurred')
      expect(error.details?.statusCode).toBe(500)
    })
  })

  describe('error stack traces', (): void => {
    it('should have a stack trace', (): void => {
      const exception: ProcessingException = new ProcessingException('UNKNOWN_ERROR', 'Test error')

      expect(exception.stack).toBeDefined()
      expect(typeof exception.stack).toBe('string')
    })

    it('should include ProcessingException in stack trace', (): void => {
      const exception: ProcessingException = new ProcessingException('UNKNOWN_ERROR', 'Test error')

      expect(exception.stack).toContain('ProcessingException')
    })
  })

  describe('error message accessibility', (): void => {
    it('should be catchable as Error type', (): void => {
      const exception: ProcessingException = new ProcessingException('INVALID_URL', 'Invalid URL')
      let caught: Error | null = null

      try {
        throw exception
      } catch (error: unknown) {
        if (error instanceof Error) {
          caught = error
        }
      }

      expect(caught).toBe(exception)
      expect(caught?.message).toBe('Invalid URL')
    })

    it('should be catchable as ProcessingException type', (): void => {
      const exception: ProcessingException = new ProcessingException('NETWORK_ERROR', 'Network failed')
      let caught: ProcessingException | null = null

      try {
        throw exception
      } catch (error: unknown) {
        if (error instanceof ProcessingException) {
          caught = error
        }
      }

      expect(caught).toBe(exception)
      expect(caught?.code).toBe('NETWORK_ERROR')
    })
  })
})
