declare module 'three/examples/jsm/loaders/GLTFLoader' {
  import type { Loader, LoadingManager } from 'three'
  export class GLTFLoader extends Loader {
    constructor(manager?: LoadingManager)
    load(
      url: string,
      onLoad: (gltf: any) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: ErrorEvent) => void
    ): void
    loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<any>
    parse(data: ArrayBuffer | string, path: string, onLoad: (gltf: any) => void, onError?: (error: ErrorEvent) => void): void
    parseAsync(data: ArrayBuffer | string, path: string): Promise<any>
  }
}

declare module 'three/examples/jsm/exporters/OBJExporter' {
  import type { Object3D } from 'three'
  export class OBJExporter {
    parse(object: Object3D): string
  }
}
