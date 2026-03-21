/**
 * Logger utility for consistent logging throughout the application
 */

export class Logger {
  private readonly prefix: string

  constructor(prefix: string = 'IKEA-3D') {
    this.prefix = prefix
  }

  info(message: string, data?: unknown): void {
    console.log(`[${this.prefix}] INFO: ${message}`, data ?? '')
  }

  warn(message: string, data?: unknown): void {
    console.warn(`[${this.prefix}] WARN: ${message}`, data ?? '')
  }

  error(message: string, data?: unknown): void {
    console.error(`[${this.prefix}] ERROR: ${message}`, data ?? '')
  }

  debug(message: string, data?: unknown): void {
    console.debug(`[${this.prefix}] DEBUG: ${message}`, data ?? '')
  }
}

export const logger = new Logger('IKEA-3D')
