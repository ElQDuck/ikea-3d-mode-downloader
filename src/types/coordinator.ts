/**
 * Types for Coordinator component
 */

export interface CoordinatorConfig {
  scraperConfig: {
    timeout: number
    maxRetries: number
    retryDelay: number
  }
  converterConfig: {
    preserveTextures: boolean
    'optimizeForSweet Home3D': boolean
  }
  packerConfig: {
    filename: string
    compression: 'DEFLATE' | 'STORE'
  }
}

export interface ProcessingPipeline {
  url: string
  productName?: string
  glbBuffer?: ArrayBuffer
  objContent?: string
  mtlContent?: string
  textures?: Array<{
    name: string
    data: Uint8Array
  }>
  zipBlob?: Blob
}

export interface UIUpdateEvent {
  type: 'status' | 'progress' | 'error' | 'success'
  message: string
  progress?: number
  data?: unknown
}
