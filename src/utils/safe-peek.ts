// Constants
export const MAX_PEEK_BYTES = 64
export const MAX_CONTENT_LENGTH_FOR_UNCHECKED_BUFFER = 200 * 1024 * 1024 // 200MB
export const BUFFER_TIMEOUT_MS = 10000

async function bufferWithTimeout(response: any, ms: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      resolve(null)
    }, ms)

    try {
      const p = response.buffer()
      Promise.resolve(p)
        .then((buf: Buffer) => {
          if (settled) return
          clearTimeout(timer)
          resolve(buf)
        })
        .catch((err: any) => {
          if (settled) return
          clearTimeout(timer)
          reject(err)
        })
    } catch (err) {
      clearTimeout(timer)
      reject(err)
    }
  })
}

export async function safePeekFromPuppeteerResponse(response: any): Promise<{
  ok: boolean
  peekBuffer?: Buffer
  contentType?: string
  contentLength?: number
  disposition?: string
  reason?: string
}> {
  try {
    const headersGetter = typeof response.headers === 'function' ? response.headers() : response.headers || {}
    const contentType = (headersGetter['content-type'] || headersGetter['Content-Type'] || '') as string
    const contentLengthRaw = headersGetter['content-length'] || headersGetter['Content-Length'] || undefined
    const disposition = (headersGetter['content-disposition'] || headersGetter['Content-Disposition'] || '') as string

    const contentLength = contentLengthRaw !== undefined && contentLengthRaw !== null && contentLengthRaw !== ''
      ? Number.isFinite(Number(contentLengthRaw)) ? Number(contentLengthRaw) : parseInt(String(contentLengthRaw || '0'), 10)
      : undefined

    // Reject obvious textual types
    if (contentType) {
      const lc = contentType.toLowerCase()
      if (lc.startsWith('text/') || lc.includes('javascript') || lc.includes('html')) {
        return { ok: false, reason: 'textual content-type', contentType, contentLength, disposition }
      }
    }

    // If content-length exists and is reasonable, try to buffer but with timeout
    if (typeof contentLength === 'number' && contentLength > MAX_PEEK_BYTES && contentLength <= MAX_CONTENT_LENGTH_FOR_UNCHECKED_BUFFER) {
      const buf = await bufferWithTimeout(response, BUFFER_TIMEOUT_MS)
      if (!buf) return { ok: false, reason: 'timeout', contentType, contentLength, disposition }
      const peek = buf.slice(0, MAX_PEEK_BYTES)
      return { ok: true, peekBuffer: peek, contentType, contentLength, disposition }
    }

    // If content-length is huge, attempt ranged request for first bytes
    if (typeof contentLength === 'number' && contentLength > MAX_CONTENT_LENGTH_FOR_UNCHECKED_BUFFER) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), BUFFER_TIMEOUT_MS)
        const rangeResp = await fetch(response.url?.() || response.url || '', {
          headers: { Range: `bytes=0-${MAX_PEEK_BYTES - 1}` },
          signal: controller.signal,
        })
        clearTimeout(timer)
        if (!rangeResp.ok) return { ok: false, reason: 'range-failed', contentType, contentLength, disposition }
        const ab = await rangeResp.arrayBuffer()
        return { ok: true, peekBuffer: Buffer.from(ab).slice(0, MAX_PEEK_BYTES), contentType, contentLength, disposition }
      } catch (e) {
        return { ok: false, reason: 'range-failed', contentType, contentLength, disposition }
      }
    }

    // If no content-length, try to buffer with timeout but ensure not returning large buffers
    try {
      const buf = await bufferWithTimeout(response, BUFFER_TIMEOUT_MS)
      if (!buf) return { ok: false, reason: 'timeout', contentType, contentLength, disposition }
      const peek = buf.slice(0, Math.min(buf.length, MAX_PEEK_BYTES))
      return { ok: true, peekBuffer: peek, contentType, contentLength, disposition }
    } catch (e) {
      return { ok: false, reason: 'buffer-error', contentType, contentLength, disposition }
    }
  } catch (err) {
    return { ok: false, reason: 'unexpected-error' }
  }
}

export default safePeekFromPuppeteerResponse
