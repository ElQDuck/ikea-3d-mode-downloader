/**
 * Types for ZIP Packer component
 */

export interface ZipPackerConfig {
  filename: string
  compression: 'DEFLATE' | 'STORE'
}

export interface PackingInput {
  objContent: string
  mtlContent: string
  textures: Array<{
    name: string
    data: Uint8Array
  }>
  productName: string
}

export interface PackingOutput {
  zipBlob: Blob
  fileName: string
}
