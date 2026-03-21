/**
 * Types for IKEA Scraper component
 */

export interface IkeaScraperConfig {
  timeout: number
  maxRetries: number
  retryDelay: number
}

export interface GlbExtractionResult {
  glbUrl: string
  productName: string
  fileName: string
}

export interface ScraperResult {
  glbBuffer: ArrayBuffer
  productName: string
  fileName: string
}

// Extend window interface for our custom properties
declare global {
  interface Window {
    window_interceptedGlbUrl?: string
  }
}
