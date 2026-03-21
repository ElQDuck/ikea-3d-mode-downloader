/**
 * Validation utilities for input sanitization and verification
 */

/**
 * Validates that a URL is a valid IKEA product URL
 */
export function validateIkeaUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.toLowerCase()

    // Allow ikea.com and subdomains
    return hostname === 'ikea.com' || hostname.endsWith('.ikea.com')
  } catch {
    return false
  }
}

/**
 * Validates that a buffer is a valid GLB file
 * GLB files start with magic number 0x46546C67 ('glTF' in ASCII)
 */
export function validateGlbBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) {
    return false
  }

  const view = new Uint32Array(buffer, 0, 1)
  const magic = view[0]

  // GLB magic number in little-endian: 0x46546C67
  return magic === 0x46546c67
}

/**
 * Sanitizes a filename to prevent path traversal and invalid characters
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators and invalid characters
  return filename
    .replace(/\\/g, '_')
    .replace(/\//g, '_')
    .replace(/[:\*\?"<>\|]/g, '_')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\.+$/, '')
    .substring(0, 255)
}
