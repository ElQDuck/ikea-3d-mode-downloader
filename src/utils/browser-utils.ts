import { URL } from 'url'

/**
 * Normalize a candidate URL found on a page to an absolute URL using the page's baseUrl.
 * Handles:
 * - protocol-relative URLs (//example.com/path)
 * - root-relative (/path)
 * - relative (./a/b or ../c)
 * - absolute URLs (http(s)://...)
 */
export function normalizeUrl(candidateUrl: string, baseUrl: string): string {
  if (!candidateUrl) return candidateUrl
  candidateUrl = candidateUrl.trim()
  try {
    // protocol-relative
    if (candidateUrl.startsWith('//')) {
      const base = new URL(baseUrl)
      return `${base.protocol}${candidateUrl}`
    }

    // If it's already absolute, URL constructor will succeed
    try {
      return new URL(candidateUrl).toString()
    } catch (err) {
      // Not absolute; resolve relative to base
    }

    // Resolve relative or root-relative using baseUrl
    return new URL(candidateUrl, baseUrl).toString()
  } catch (err) {
    // If resolution fails, return candidate as-is
    return candidateUrl
  }
}

export function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms))
}

/**
 * Basic heuristic to rank confidence for GLB candidates.
 * Returns 'high' | 'medium' | 'low'
 */
export function rankConfidence(contentLength: number, contentType?: string, preferBinary = false): 'high' | 'medium' | 'low' {
  if (contentLength > 50 * 1024) return 'high'
  if (contentLength > 5 * 1024) return 'medium'
  if (contentType && /model\/(gltf-binary)/i.test(contentType)) return 'high'
  if (preferBinary && contentType && /application\/octet-stream/i.test(contentType)) return 'medium'
  return 'low'
}
