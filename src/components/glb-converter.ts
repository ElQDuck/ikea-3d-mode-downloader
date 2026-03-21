/**
 * GLB Converter component
 * Converts GLB format to OBJ format with material and texture preservation
 */

import type { GlbConverterConfig, ConversionInput, ConversionOutput, TextureData } from '../types'
import type { ProcessingResult } from '../types'
import { validateGlbBuffer } from '../utils/validators'
import { logger } from '../utils/logger'

// Lazy-load Three.js to avoid module loading issues in tests
let THREE: typeof import('three') | null = null
let GLTFLoader: any = null
let OBJExporter: any = null

async function ensureThreeLoaded(): Promise<void> {
  if (THREE === null) {
    THREE = await import('three')
    const loader = await import('three/examples/jsm/loaders/GLTFLoader')
    const exporter = await import('three/examples/jsm/exporters/OBJExporter')
    GLTFLoader = loader.GLTFLoader
    OBJExporter = exporter.OBJExporter
  }
}

export interface GlbConverter {
  convert(input: ConversionInput): Promise<ProcessingResult<ConversionOutput>>
  validateGlbFormat(buffer: ArrayBuffer): { valid: boolean; message?: string; dracoCompressed?: boolean }
}

export class GlbConverterImpl implements GlbConverter {
  private _config: GlbConverterConfig
  private _loader: any = null
  private _exporter: any = null
  private _scene: any = null

  constructor(config: GlbConverterConfig) {
    this._config = config
  }

  /**
   * Validates GLB file format and returns validation result
   * @param buffer - The GLB file buffer
   * @returns Validation result with status and details
   */
  validateGlbFormat(buffer: ArrayBuffer): { valid: boolean; message?: string; dracoCompressed?: boolean } {
    try {
      if (!validateGlbBuffer(buffer)) {
        return {
          valid: false,
          message: 'Invalid GLB magic number. This is not a valid GLB file.',
        }
      }

      const view = new DataView(buffer)

      // Check version (should be 2)
      const version = view.getUint32(4, true)
      if (version !== 2) {
        return {
          valid: false,
          message: `Invalid GLB version: ${version}. Expected version 2.`,
        }
      }

      // Check for Draco compression by looking in the buffer
      const text = new TextDecoder().decode(new Uint8Array(buffer))
      const dracoCompressed = text.includes('draco')

      return {
        valid: true,
        dracoCompressed,
      }
    } catch (error) {
      return {
        valid: false,
        message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  /**
   * Converts GLB buffer to OBJ format
   * @param input - Conversion input with GLB buffer and metadata
   * @returns ProcessingResult with ConversionOutput or error
   */
  async convert(input: ConversionInput): Promise<ProcessingResult<ConversionOutput>> {
    const timestamp = Date.now()

    try {
      logger.info('Starting GLB conversion for product:', input.productName)

      // Ensure Three.js is loaded
      await ensureThreeLoaded()

      if (!THREE) {
        throw new Error('Failed to load Three.js')
      }

      // Initialize loader and exporter if not already done
      if (!this._loader) {
        this._loader = new GLTFLoader()
      }
      if (!this._exporter) {
        this._exporter = new OBJExporter()
      }

      // Validate GLB format
      const validation = this.validateGlbFormat(input.glbBuffer)
      if (!validation.valid) {
        return {
          success: false,
          error: {
            code: 'GLB_PARSE_ERROR',
            message: validation.message || 'Invalid GLB format',
          },
          timestamp,
        }
      }

      // Parse GLB using GLTFLoader
      const gltf = await new Promise<any>((resolve, reject) => {
        this._loader.parse(input.glbBuffer, '', (gltf: any) => {
          resolve(gltf.scene)
        }, (error: Error) => {
          reject(error)
        })
      })

      this._scene = gltf

      // Extract geometry and materials
      const objContent = this._exporter.parse(gltf)
      const mtlContent = this._generateMtl(gltf)
      const textures = this._extractTextures(gltf)

      logger.info('GLB conversion completed successfully')

      return {
        success: true,
        data: {
          objContent,
          mtlContent,
          textures,
        },
        timestamp,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error during conversion'
      logger.error('GLB conversion failed:', message)

      return {
        success: false,
        error: {
          code: 'CONVERSION_ERROR',
          message,
        },
        timestamp,
      }
    }
  }

  /**
   * Estimates processing time based on file size
   * @param fileSize - Size of the GLB file in bytes
   * @returns Estimated processing time in milliseconds
   */
  estimateProcessingTime(fileSize: number): number {
    // Heuristic: ~5ms per MB
    const sizeInMb = fileSize / (1024 * 1024)
    return Math.ceil(sizeInMb * 5)
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    logger.info('Cleaning up converter resources')
    if (this._scene && THREE) {
      const Mesh = THREE.Mesh
      const traverseFn = this._scene.traverse
      if (traverseFn) {
        traverseFn.call(this._scene, (child: any) => {
          if (child instanceof Mesh) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m: any) => m.dispose?.())
            } else {
              child.material?.dispose?.()
            }
            child.geometry?.dispose?.()
          }
        })
      }
    }
    this._scene = null
  }

  /**
   * Generate MTL file content from scene materials
   */
  private _generateMtl(scene: any): string {
    const materials: Map<string, any> = new Map()

    // Collect unique materials from the scene
    if (scene && scene.traverse) {
      scene.traverse((child: any) => {
        if (child.isMesh || (child.material && child.geometry)) {
          const mats = Array.isArray(child.material) ? child.material : [child.material]
          mats.forEach((mat: any) => {
            const name = mat.name || `Material_${materials.size}`
            materials.set(name, mat)
          })
        }
      })
    }

    // Generate MTL content
    let mtlContent = '# Material file\n\n'

    materials.forEach((material, name) => {
      mtlContent += `newmtl ${sanitizeMaterialName(name)}\n`

      const roughness = material.roughness ?? 0.5
      const opacity = material.opacity ?? 1.0
      const colorR = material.color?.r ?? 0.8
      const colorG = material.color?.g ?? 0.8
      const colorB = material.color?.b ?? 0.8

      // Handle material properties generically
      mtlContent += `Ka ${colorR.toFixed(3)} ${colorG.toFixed(3)} ${colorB.toFixed(3)}\n`
      mtlContent += `Kd ${colorR.toFixed(3)} ${colorG.toFixed(3)} ${colorB.toFixed(3)}\n`
      mtlContent += `Ks 0.5 0.5 0.5\n`
      mtlContent += `Ns ${Math.round(roughness * 256)}\n`

      // Add texture references if present
      if (material.map) {
        mtlContent += `map_Kd textures/diffuse.png\n`
      }
      if (material.normalMap) {
        mtlContent += `map_Bump textures/normal.png\n`
      }

      mtlContent += `d ${opacity.toFixed(3)}\n`
      mtlContent += '\n'
    })

    return mtlContent
  }

  /**
   * Extract textures from scene materials
   */
  private _extractTextures(scene: any): TextureData[] {
    const textures: TextureData[] = []
    const processedTextures: Set<string> = new Set()

    if (!scene || !scene.traverse) {
      return textures
    }

    scene.traverse((child: any) => {
      if (child.isMesh || (child.material && child.geometry)) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]

        mats.forEach((material: any) => {
          // Extract textures generically
          if (material.map && !processedTextures.has('diffuse')) {
            const textureData = this._textureToImageData(material.map, 'diffuse.png')
            if (textureData) {
              textures.push(textureData)
              processedTextures.add('diffuse')
            }
          }

          if (material.normalMap && !processedTextures.has('normal')) {
            const textureData = this._textureToImageData(material.normalMap, 'normal.png')
            if (textureData) {
              textures.push(textureData)
              processedTextures.add('normal')
            }
          }

          if (material.roughnessMap && !processedTextures.has('roughness')) {
            const textureData = this._textureToImageData(material.roughnessMap, 'roughness.png')
            if (textureData) {
              textures.push(textureData)
              processedTextures.add('roughness')
            }
          }

          if (material.metalnessMap && !processedTextures.has('metalness')) {
            const textureData = this._textureToImageData(material.metalnessMap, 'metalness.png')
            if (textureData) {
              textures.push(textureData)
              processedTextures.add('metalness')
            }
          }
        })
      }
    })

    return textures
  }

  /**
   * Convert texture to image data
   */
  private _textureToImageData(texture: any, fileName: string): TextureData | null {
    try {
      if (!texture || !texture.source) {
        return null
      }

      const image = texture.source.data

      if (!(image instanceof HTMLCanvasElement || image instanceof HTMLImageElement)) {
        return null
      }

      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return null
      }

      if (image instanceof HTMLCanvasElement) {
        ctx.drawImage(image, 0, 0)
      } else if (image instanceof HTMLImageElement) {
        ctx.drawImage(image, 0, 0)
      }

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const uint8Array = new Uint8Array(imageData.data)

      return {
        name: fileName,
        data: uint8Array,
        mimeType: 'image/png',
      }
    } catch (error) {
      logger.warn(`Failed to extract texture ${fileName}:`, error)
      return null
    }
  }
}

/**
 * Sanitize material name for MTL file
 */
function sanitizeMaterialName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 255) || 'Material'
}
