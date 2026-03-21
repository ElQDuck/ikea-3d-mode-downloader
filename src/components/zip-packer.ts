/**
 * ZIP Packer component
 * Creates ZIP archives containing OBJ, MTL, and texture files
 */

import type { ZipPackerConfig, PackingInput, PackingOutput } from '../types'
import type { ProcessingResult } from '../types'
import { sanitizeFilename } from '../utils/validators'
import { logger } from '../utils/logger'
import JSZip from 'jszip'

export interface ZipPacker {
  pack(input: PackingInput): Promise<ProcessingResult<PackingOutput>>
  validatePackageStructure(output: PackingOutput): { valid: boolean; message?: string }
}

export class ZipPackerImpl implements ZipPacker {
  private _config: ZipPackerConfig

  constructor(config: ZipPackerConfig) {
    this._config = config
  }

  /**
   * Creates a ZIP archive containing OBJ, MTL, and texture files
   * @param input - Packing input with OBJ, MTL, and texture data
   * @returns ProcessingResult with PackingOutput or error
   */
  async pack(input: PackingInput): Promise<ProcessingResult<PackingOutput>> {
    const timestamp = Date.now()

    try {
      logger.info('Starting ZIP packing for product:', input.productName)

      const zip = new JSZip()

      // Create model folder
      const modelFolder = zip.folder('model')
      if (!modelFolder) {
        throw new Error('Failed to create model folder in ZIP')
      }

      // Add OBJ file
      modelFolder.file('model.obj', input.objContent)
      logger.debug('Added model.obj to ZIP')

      // Add MTL file
      modelFolder.file('model.mtl', input.mtlContent)
      logger.debug('Added model.mtl to ZIP')

      // Add textures
      const texturesFolder = modelFolder.folder('textures')
      if (!texturesFolder) {
        throw new Error('Failed to create textures folder in ZIP')
      }

      for (const texture of input.textures) {
        texturesFolder.file(texture.name, texture.data)
        logger.debug(`Added texture: ${texture.name}`)
      }

      // Generate filename with timestamp
      const sanitizedName = sanitizeFilename(input.productName)
      const timestamp_str = new Date().toISOString().replace(/[:-]/g, '').slice(0, 15)
      const fileName = `${sanitizedName}_${timestamp_str}.zip`

      // Generate ZIP blob with compression
      const compressionType = this._config.compression === 'DEFLATE' ? 'DEFLATE' : 'STORE'
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: compressionType,
        compressionOptions: {
          level: compressionType === 'DEFLATE' ? 9 : 0,
        },
      })

      logger.info('ZIP packing completed successfully. File size:', zipBlob.size)

      return {
        success: true,
        data: {
          zipBlob,
          fileName,
        },
        timestamp,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error during packing'
      logger.error('ZIP packing failed:', message)

      return {
        success: false,
        error: {
          code: 'ZIP_CREATION_ERROR',
          message,
        },
        timestamp,
      }
    }
  }

  /**
   * Validates the package structure to ensure all required files are present
   * @param output - The packing output to validate
   * @returns Validation result
   */
  validatePackageStructure(output: PackingOutput): { valid: boolean; message?: string } {
    try {
      if (!output || !output.zipBlob) {
        return {
          valid: false,
          message: 'Invalid output: missing ZIP blob',
        }
      }

      if (!output.fileName) {
        return {
          valid: false,
          message: 'Invalid output: missing filename',
        }
      }

      // Check file size constraints
      const maxSize = 500 * 1024 * 1024 // 500MB
      if (output.zipBlob.size > maxSize) {
        return {
          valid: false,
          message: `File size exceeds maximum limit (500MB). Current size: ${(output.zipBlob.size / 1024 / 1024).toFixed(2)}MB`,
        }
      }

      if (output.zipBlob.size === 0) {
        return {
          valid: false,
          message: 'ZIP file is empty',
        }
      }

      return {
        valid: true,
      }
    } catch (error) {
      return {
        valid: false,
        message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  /**
   * Generate README content describing the model
   * @param productName - Name of the product
   * @param textureCount - Number of textures included
   * @returns README content as string
   */
  generateReadmeContent(productName: string, textureCount: number): string {
    const readme = `# IKEA 3D Model: ${productName}

## Package Contents

This ZIP archive contains a 3D model exported from IKEA in OBJ format.

### Files Included

- **model.obj**: The main 3D model file in OBJ format
- **model.mtl**: Material definition file (MTL)
- **textures/**: Directory containing texture files
  - Diffuse textures (color maps)
  - Normal maps (for surface detail)
  - Roughness maps (for material properties)
  - Metalness maps (for reflectivity)

## Texture Files

Total textures: ${textureCount}

## Compatibility

This model is compatible with:
- Blender
- Sweet Home 3D
- 3D modeling software that supports OBJ format
- Game engines that support OBJ import

## Usage Instructions

1. Extract the ZIP archive
2. Import the \`model/model.obj\` file into your 3D application
3. The MTL file will automatically reference the textures
4. Ensure the \`textures/\` directory is in the same location as the OBJ file

## Notes

- The model was extracted from IKEA's online 3D viewer
- All rights to the model design belong to IKEA
- This is for personal, non-commercial use only

## Support

For issues or questions, please refer to the original project:
https://github.com/ElQDuck/ikea-3d-mode-downloader
`
    return readme
  }
}

