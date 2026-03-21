/**
 * Types for GLB Converter component
 */

export interface GlbConverterConfig {
  preserveTextures: boolean
  'optimizeForSweet Home3D': boolean
}

export interface ConversionInput {
  glbBuffer: ArrayBuffer
  productName: string
}

export interface TextureData {
  name: string
  data: Uint8Array
  mimeType: string
}

export interface ConversionOutput {
  objContent: string
  mtlContent: string
  textures: TextureData[]
}
