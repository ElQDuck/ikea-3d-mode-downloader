/**
 * Tests for URL and data validation utilities
 */

import { validateIkeaUrl, validateGlbBuffer, sanitizeFilename } from '@/utils/validators'

describe('validateIkeaUrl', (): void => {
  describe('valid IKEA URLs', (): void => {
    it('should validate standard IKEA product URLs', (): void => {
      expect(validateIkeaUrl('https://www.ikea.com/us/en/p/billy-bookcase-00263850')).toBe(true)
    })

    it('should validate IKEA URLs with .com domain', (): void => {
      expect(validateIkeaUrl('https://www.ikea.com/gb/en/p/test-00263850')).toBe(true)
      expect(validateIkeaUrl('https://www.ikea.com/fr/fr/p/test-00263850')).toBe(true)
    })

    it('should be case-insensitive for domain', (): void => {
      expect(validateIkeaUrl('https://www.IKEA.com/us/en/p/billy-bookcase-00263850')).toBe(true)
      expect(validateIkeaUrl('https://WWW.Ikea.COM/us/en/p/billy-bookcase-00263850')).toBe(true)
    })
  })

  describe('invalid URLs', (): void => {
    it('should reject non-IKEA domains', (): void => {
      expect(validateIkeaUrl('https://www.google.com')).toBe(false)
      expect(validateIkeaUrl('https://www.amazon.com')).toBe(false)
      expect(validateIkeaUrl('https://evil.ikea.com.fake.com')).toBe(false)
    })

    it('should reject malformed URLs', (): void => {
      expect(validateIkeaUrl('not-a-url')).toBe(false)
      expect(validateIkeaUrl('')).toBe(false)
    })

    it('should reject URLs with missing protocol', (): void => {
      expect(validateIkeaUrl('www.ikea.com/us/en/p/billy-bookcase-00263850')).toBe(false)
    })

    it('should reject suspicious domains', (): void => {
      expect(validateIkeaUrl('https://www.ikea.co.uk.evil.com')).toBe(false)
      expect(validateIkeaUrl('https://fake-ikea.com')).toBe(false)
    })

    it('should reject IKEA regional TLDs that are not .com', (): void => {
      // Implementation only allows .com or subdomains of .com
      expect(validateIkeaUrl('https://www.ikea.de/de/de/p/billy-regal-80263850')).toBe(false)
      expect(validateIkeaUrl('https://www.ikea.fr/fr/fr/p/billy-bibliotheque-00263850')).toBe(false)
      expect(validateIkeaUrl('https://www.ikea.se/sv/sv/p/test-00263850')).toBe(false)
    })
  })
})

describe('validateGlbBuffer', (): void => {
  describe('valid GLB buffers', (): void => {
    it('should validate a valid GLB buffer with correct magic number', (): void => {
      // GLB magic number: 0x46546C67 (glTF in ASCII)
      const buffer: ArrayBuffer = new ArrayBuffer(12)
      const view: Uint32Array = new Uint32Array(buffer)
      view[0] = 0x46546c67 // Correct magic number

      expect(validateGlbBuffer(buffer)).toBe(true)
    })

    it('should validate a GLB buffer with additional data', (): void => {
      const buffer: ArrayBuffer = new ArrayBuffer(1000)
      const view: Uint32Array = new Uint32Array(buffer)
      view[0] = 0x46546c67

      expect(validateGlbBuffer(buffer)).toBe(true)
    })
  })

  describe('invalid GLB buffers', (): void => {
    it('should reject buffers with incorrect magic number', (): void => {
      const buffer: ArrayBuffer = new ArrayBuffer(12)
      const view: Uint32Array = new Uint32Array(buffer)
      view[0] = 0x00000000 // Wrong magic number

      expect(validateGlbBuffer(buffer)).toBe(false)
    })

    it('should reject buffers that are too small', (): void => {
      const buffer: ArrayBuffer = new ArrayBuffer(2)
      expect(validateGlbBuffer(buffer)).toBe(false)
    })

    it('should reject empty buffer', (): void => {
      const buffer: ArrayBuffer = new ArrayBuffer(0)
      expect(validateGlbBuffer(buffer)).toBe(false)
    })

    it('should reject 3-byte buffer', (): void => {
      const buffer: ArrayBuffer = new ArrayBuffer(3)
      expect(validateGlbBuffer(buffer)).toBe(false)
    })
  })
})

describe('sanitizeFilename', (): void => {
  describe('path traversal prevention', (): void => {
    it('should remove forward slashes', (): void => {
      expect(sanitizeFilename('billy/bookcase')).toBe('billy_bookcase')
    })

    it('should remove backslashes', (): void => {
      expect(sanitizeFilename('billy\\bookcase')).toBe('billy_bookcase')
    })

    it('should prevent directory traversal', (): void => {
      // Implementation replaces each character individually
      const result: string = sanitizeFilename('../../../etc/passwd')
      expect(result).not.toContain('/')
      // Dots are preserved, only slashes are replaced
    })

    it('should prevent current directory access', (): void => {
      const result: string = sanitizeFilename('./././file')
      expect(result).not.toContain('/')
    })
  })

  describe('invalid character removal', (): void => {
    it('should remove special characters', (): void => {
      expect(sanitizeFilename('file:name?test')).toContain('name')
      expect(sanitizeFilename('file:name?test')).not.toContain(':')
      expect(sanitizeFilename('file:name?test')).not.toContain('?')
    })

    it('should remove quotes and pipes', (): void => {
      const result: string = sanitizeFilename('file"name|test')
      expect(result).not.toContain('"')
      expect(result).not.toContain('|')
    })

    it('should handle multiple special characters', (): void => {
      const result: string = sanitizeFilename('file:*?"<>|name')
      expect(result).not.toContain(':')
      expect(result).not.toContain('*')
      expect(result).not.toContain('?')
      expect(result).not.toContain('"')
      expect(result).not.toContain('<')
      expect(result).not.toContain('>')
      expect(result).not.toContain('|')
    })
  })

  describe('whitespace handling', (): void => {
    it('should trim leading and trailing whitespace', (): void => {
      expect(sanitizeFilename('  filename  ')).toBe('filename')
      expect(sanitizeFilename('\t\tfilename\n')).toBe('filename')
    })

    it('should preserve internal whitespace', (): void => {
      expect(sanitizeFilename('file name')).toBe('file name')
    })
  })

  describe('dot handling', (): void => {
    it('should remove trailing dots', (): void => {
      expect(sanitizeFilename('filename.')).toBe('filename')
      expect(sanitizeFilename('filename...')).toBe('filename')
    })

    it('should preserve dots in middle of filename', (): void => {
      expect(sanitizeFilename('file.name.txt')).toBe('file.name.txt')
    })
  })

  describe('length limiting', (): void => {
    it('should limit filename to 255 characters', (): void => {
      const longFilename: string = 'a'.repeat(300)
      expect(sanitizeFilename(longFilename).length).toBe(255)
    })

    it('should preserve short filenames', (): void => {
      expect(sanitizeFilename('short.txt').length).toBe(9)
    })

    it('should limit exactly at 255 characters', (): void => {
      const filename255: string = 'a'.repeat(255)
      const result: string = sanitizeFilename(filename255)
      expect(result.length).toBe(255)
    })
  })

  describe('real-world examples', (): void => {
    it('should sanitize IKEA product names', (): void => {
      const result: string = sanitizeFilename('BILLY Bookcase (White)')
      // Implementation does not remove parentheses - they are allowed
      expect(result).toContain('BILLY')
      expect(result).toContain('Bookcase')
      expect(result).toContain('(')
      expect(result).toContain(')')
    })

    it('should sanitize filenames with extension', (): void => {
      expect(sanitizeFilename('model-01.glb')).toBe('model-01.glb')
    })

    it('should handle empty input', (): void => {
      expect(sanitizeFilename('')).toBe('')
    })

    it('should handle whitespace-only input', (): void => {
      expect(sanitizeFilename('   ')).toBe('')
    })
  })
})
