/**
 * Browser utility functions and helpers
 */

import { logger } from './logger'

/**
 * Wait for a specified duration
 */
export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Calculate exponential backoff delay
 */
export function calculateExponentialBackoff(
  attempt: number,
  baseDelay: number = 100,
  multiplier: number = 2,
  maxDelay: number = 5000
): number {
  const delay = baseDelay * Math.pow(multiplier, attempt)
  return Math.min(delay, maxDelay)
}

/**
 * Calculate linear backoff delay
 */
export function calculateLinearBackoff(
  attempt: number,
  baseDelay: number = 100,
  increment: number = 100
): number {
  return baseDelay + increment * attempt
}

/**
 * Validate if a URL is a valid IKEA product URL
 */
export function isValidIkeaUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname.includes('ikea.com') && parsed.pathname.includes('/p/')
  } catch {
    return false
  }
}

/**
 * Extract product ID from IKEA URL
 */
export function extractProductId(url: string): string | null {
  try {
    const parsed = new URL(url)
    const match = parsed.pathname.match(/\/p\/([^/#]+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/**
 * Detect IKEA region from URL
 */
export function detectRegionFromUrl(
  url: string
): { countryCode: string; languageCode: string } | null {
  try {
    const parsed = new URL(url)
    const pathParts = parsed.pathname.split('/').filter(p => p)

    if (pathParts.length >= 2) {
      const languageCode = pathParts[0]
      const countryCode = pathParts[1]
      return { languageCode, countryCode }
    }
  } catch {
    // Fall through
  }
  return null
}

/**
 * Check if a buffer is a valid GLB file
 */
export function isValidGlbBuffer(buffer: Buffer): boolean {
  if (buffer.length < 20) {
    return false
  }

  // GLB magic number is 0x46546C67 (glTF in ASCII)
  const magic = buffer.readUInt32LE(0)
  const expectedMagic = 0x46546c67

  if (magic !== expectedMagic) {
    return false
  }

  // Check version (should be 2)
  const version = buffer.readUInt32LE(4)
  return version === 2
}

/**
 * Get file extension from URL
 */
export function getFileExtensionFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname
    const ext = pathname.split('.').pop()?.toLowerCase()
    return ext || ''
  } catch {
    return ''
  }
}

/**
 * Get content type from URL extension
 */
export function getContentTypeFromExtension(ext: string): string {
  const contentTypes: Record<string, string> = {
    glb: 'application/octet-stream',
    gltf: 'application/json',
    bin: 'application/octet-stream',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  }
  return contentTypes[ext.toLowerCase()] || 'application/octet-stream'
}

/**
 * Rank confidence level based on multiple factors
 */
export function rankConfidence(
  size: number,
  contentType: string,
  isFromNetwork: boolean
): 'high' | 'medium' | 'low' {
  let score = 0

  // Size check (typical GLB files are at least 10KB)
  if (size >= 10 * 1024) {
    score += 40
  } else if (size >= 1024) {
    score += 20
  }

  // Content type check
  if (
    contentType.includes('octet-stream') ||
    contentType.includes('gltf') ||
    contentType.includes('glb')
  ) {
    score += 40
  } else if (contentType.includes('binary')) {
    score += 20
  }

  // Source check
  if (isFromNetwork) {
    score += 20
  }

  if (score >= 80) {
    return 'high'
  } else if (score >= 40) {
    return 'medium'
  }
  return 'low'
}

/**
 * Sanitize filename for safe disk storage
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-z0-9_-]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 255)
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`
}

/**
 * Parse JSON safely
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T
  } catch (error) {
    logger.warn(`Failed to parse JSON: ${error}`)
    return defaultValue
  }
}

/**
 * Create a timeout promise that rejects after specified duration
 */
export function createTimeoutPromise<T>(
  duration: number,
  operationName: string = 'Operation'
): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${duration}ms`))
    }, duration)
  })
}

/**
 * Race a promise against a timeout
 */
export async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string = 'Operation'
): Promise<T> {
  return Promise.race<T>([promise, createTimeoutPromise(timeoutMs, operationName)])
}
