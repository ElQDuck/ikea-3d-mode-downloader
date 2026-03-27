export function validateGlbPeek(peekBuffer?: Buffer, contentLength?: number): boolean {
  if (contentLength !== undefined && contentLength < 12) return false
  if (!peekBuffer || peekBuffer.length < 4) return false
  try {
    return peekBuffer.slice(0, 4).toString('ascii') === 'glTF'
  } catch (_) {
    return false
  }
}

export function validateFullGlb(buf: Buffer): { ok: boolean; reason?: string } {
  if (!buf || buf.length < 12) return { ok: false, reason: 'too-small' }
  const magic = buf.slice(0, 4).toString('ascii')
  if (magic !== 'glTF') return { ok: false, reason: 'bad-magic' }
  const version = buf.readUInt32LE(4)
  if (typeof version !== 'number' || version < 1) return { ok: false, reason: 'bad-version' }
  const totalLength = buf.readUInt32LE(8)
  if (totalLength > buf.length) return { ok: false, reason: 'declared-length-exceeds-buffer' }
  return { ok: true }
}

export default { validateGlbPeek, validateFullGlb }
