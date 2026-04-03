import type { AriaAttributes, DOMAttributes } from 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': ModelViewerAttributes
    }
  }
}

interface ModelViewerAttributes
  extends AriaAttributes,
    DOMAttributes<HTMLElement> {
  src?: string
  alt?: string
  loading?: 'auto' | 'lazy' | 'eager'
  'camera-controls'?: boolean | ''
  'auto-rotate'?: boolean | ''
  'shadow-intensity'?: string
  style?: React.CSSProperties
}
