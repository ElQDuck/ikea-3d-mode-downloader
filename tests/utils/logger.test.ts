/**
 * Tests for logger utility
 */

import { Logger, logger } from '@/utils/logger'

// Mock console methods to verify calls
const originalLog: typeof console.log = console.log
const originalWarn: typeof console.warn = console.warn
const originalError: typeof console.error = console.error
const originalDebug: typeof console.debug = console.debug

describe('Logger', (): void => {
  beforeEach((): void => {
    jest.clearAllMocks()
    console.log = jest.fn()
    console.warn = jest.fn()
    console.error = jest.fn()
    console.debug = jest.fn()
  })

  afterEach((): void => {
    console.log = originalLog
    console.warn = originalWarn
    console.error = originalError
    console.debug = originalDebug
  })

  describe('instantiation', (): void => {
    it('should create a logger with default prefix', (): void => {
      const loggerInstance: Logger = new Logger()

      expect(loggerInstance).toBeDefined()
      expect(loggerInstance).toBeInstanceOf(Logger)
    })

    it('should create a logger with custom prefix', (): void => {
      const loggerInstance: Logger = new Logger('TEST-PREFIX')

      expect(loggerInstance).toBeDefined()
      loggerInstance.info('test message')

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('TEST-PREFIX'), expect.anything())
    })

    it('should have default prefix IKEA-3D', (): void => {
      const loggerInstance: Logger = new Logger()

      loggerInstance.info('test')

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('IKEA-3D'), expect.anything())
    })
  })

  describe('info method', (): void => {
    it('should log info messages', (): void => {
      const loggerInstance: Logger = new Logger('TEST')

      loggerInstance.info('Test message')

      expect(console.log).toHaveBeenCalledWith('[TEST] INFO: Test message', '')
    })

    it('should log info messages with data', (): void => {
      const loggerInstance: Logger = new Logger('TEST')
      const testData: Record<string, unknown> = { key: 'value' }

      loggerInstance.info('Test message', testData)

      expect(console.log).toHaveBeenCalledWith('[TEST] INFO: Test message', testData)
    })

    it('should log info messages with undefined data', (): void => {
      const loggerInstance: Logger = new Logger('TEST')

      loggerInstance.info('Test message', undefined)

      expect(console.log).toHaveBeenCalledWith('[TEST] INFO: Test message', '')
    })

    it('should log info messages with null data', (): void => {
      const loggerInstance: Logger = new Logger('TEST')

      loggerInstance.info('Test message', null)

      expect(console.log).toHaveBeenCalledWith('[TEST] INFO: Test message', '')
    })
  })

  describe('warn method', (): void => {
    it('should log warn messages', (): void => {
      const loggerInstance: Logger = new Logger('TEST')

      loggerInstance.warn('Warning message')

      expect(console.warn).toHaveBeenCalledWith('[TEST] WARN: Warning message', '')
    })

    it('should log warn messages with data', (): void => {
      const loggerInstance: Logger = new Logger('TEST')
      const testData: Record<string, unknown> = { warning: 'details' }

      loggerInstance.warn('Warning message', testData)

      expect(console.warn).toHaveBeenCalledWith('[TEST] WARN: Warning message', testData)
    })

    it('should not call info or error', (): void => {
      const loggerInstance: Logger = new Logger('TEST')

      loggerInstance.warn('Warning')

      expect(console.warn).toHaveBeenCalled()
      expect(console.log).not.toHaveBeenCalled()
      expect(console.error).not.toHaveBeenCalled()
    })
  })

  describe('error method', (): void => {
    it('should log error messages', (): void => {
      const loggerInstance: Logger = new Logger('TEST')

      loggerInstance.error('Error message')

      expect(console.error).toHaveBeenCalledWith('[TEST] ERROR: Error message', '')
    })

    it('should log error messages with data', (): void => {
      const loggerInstance: Logger = new Logger('TEST')
      const testData: Record<string, unknown> = { code: 'ERROR_CODE', details: 'error details' }

      loggerInstance.error('Error message', testData)

      expect(console.error).toHaveBeenCalledWith('[TEST] ERROR: Error message', testData)
    })

    it('should not call info or warn', (): void => {
      const loggerInstance: Logger = new Logger('TEST')

      loggerInstance.error('Error')

      expect(console.error).toHaveBeenCalled()
      expect(console.log).not.toHaveBeenCalled()
      expect(console.warn).not.toHaveBeenCalled()
    })
  })

  describe('debug method', (): void => {
    it('should log debug messages', (): void => {
      const loggerInstance: Logger = new Logger('TEST')

      loggerInstance.debug('Debug message')

      expect(console.debug).toHaveBeenCalledWith('[TEST] DEBUG: Debug message', '')
    })

    it('should log debug messages with data', (): void => {
      const loggerInstance: Logger = new Logger('TEST')
      const testData: Record<string, unknown> = { debug: 'info' }

      loggerInstance.debug('Debug message', testData)

      expect(console.debug).toHaveBeenCalledWith('[TEST] DEBUG: Debug message', testData)
    })

    it('should not call other methods', (): void => {
      const loggerInstance: Logger = new Logger('TEST')

      loggerInstance.debug('Debug')

      expect(console.debug).toHaveBeenCalled()
      expect(console.log).not.toHaveBeenCalled()
      expect(console.warn).not.toHaveBeenCalled()
      expect(console.error).not.toHaveBeenCalled()
    })
  })

  describe('message formatting', (): void => {
    it('should include prefix in all messages', (): void => {
      const loggerInstance: Logger = new Logger('CUSTOM')

      loggerInstance.info('msg1')
      loggerInstance.warn('msg2')
      loggerInstance.error('msg3')
      loggerInstance.debug('msg4')

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[CUSTOM]'), expect.anything())
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[CUSTOM]'), expect.anything())
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[CUSTOM]'), expect.anything())
      expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('[CUSTOM]'), expect.anything())
    })

    it('should include log level in all messages', (): void => {
      const loggerInstance: Logger = new Logger('TEST')

      loggerInstance.info('msg')
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('INFO'), expect.anything())

      jest.clearAllMocks()
      loggerInstance.warn('msg')
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('WARN'), expect.anything())

      jest.clearAllMocks()
      loggerInstance.error('msg')
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('ERROR'), expect.anything())

      jest.clearAllMocks()
      loggerInstance.debug('msg')
      expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('DEBUG'), expect.anything())
    })
  })

  describe('default logger instance', (): void => {
    it('should export a default logger instance', (): void => {
      expect(logger).toBeDefined()
      expect(logger).toBeInstanceOf(Logger)
    })

    it('should have IKEA-3D prefix', (): void => {
      logger.info('test')

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('IKEA-3D'), expect.anything())
    })

    it('should work with info method', (): void => {
      logger.info('test message', { key: 'value' })

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('IKEA-3D'),
        expect.objectContaining({ key: 'value' }),
      )
    })

    it('should work with warn method', (): void => {
      logger.warn('warning message')

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('IKEA-3D'), expect.anything())
    })

    it('should work with error method', (): void => {
      logger.error('error message')

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('IKEA-3D'), expect.anything())
    })

    it('should work with debug method', (): void => {
      logger.debug('debug message')

      expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('IKEA-3D'), expect.anything())
    })
  })

  describe('data parameter handling', (): void => {
    it('should handle string data', (): void => {
      const loggerInstance: Logger = new Logger('TEST')

      loggerInstance.info('message', 'string data')

      expect(console.log).toHaveBeenCalledWith('[TEST] INFO: message', 'string data')
    })

    it('should handle number data', (): void => {
      const loggerInstance: Logger = new Logger('TEST')

      loggerInstance.info('message', 42)

      expect(console.log).toHaveBeenCalledWith('[TEST] INFO: message', 42)
    })

    it('should handle boolean data', (): void => {
      const loggerInstance: Logger = new Logger('TEST')

      loggerInstance.info('message', true)

      expect(console.log).toHaveBeenCalledWith('[TEST] INFO: message', true)
    })

    it('should handle array data', (): void => {
      const loggerInstance: Logger = new Logger('TEST')
      const arrayData: unknown[] = [1, 2, 3]

      loggerInstance.info('message', arrayData)

      expect(console.log).toHaveBeenCalledWith('[TEST] INFO: message', arrayData)
    })

    it('should handle Error objects', (): void => {
      const loggerInstance: Logger = new Logger('TEST')
      const error: Error = new Error('test error')

      loggerInstance.error('message', error)

      expect(console.error).toHaveBeenCalledWith('[TEST] ERROR: message', error)
    })
  })
})
