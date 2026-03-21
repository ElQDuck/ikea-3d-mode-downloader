/**
 * Main entry point for the IKEA 3D Model Downloader application
 */

import { CoordinatorImpl } from './coordinator'
import type { CoordinatorConfig } from './types'
import { logger } from './utils/logger'

function initializeApp(): void {
  logger.info('Initializing IKEA 3D Model Downloader')

  // Create coordinator configuration
  const config: CoordinatorConfig = {
    scraperConfig: {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
    },
    converterConfig: {
      preserveTextures: true,
      'optimizeForSweet Home3D': true,
    },
    packerConfig: {
      filename: 'ikea-model.zip',
      compression: 'DEFLATE',
    },
  }

  // Initialize coordinator
  const coordinator = new CoordinatorImpl(config)

  // Get UI elements
  const urlInput = document.getElementById('url-input') as HTMLInputElement | null
  const processButton = document.getElementById('process-button') as HTMLButtonElement | null
  const resetButton = document.getElementById('reset-button') as HTMLButtonElement | null
  const downloadButton = document.getElementById('download-button') as HTMLButtonElement | null
  const retryButton = document.getElementById('retry-button') as HTMLButtonElement | null
  const statusMessage = document.getElementById('status-message') as HTMLDivElement | null
  const progressBar = document.getElementById('progress-bar') as HTMLDivElement | null
  const downloadSection = document.getElementById('download-section') as HTMLDivElement | null
  const errorSection = document.getElementById('error-section') as HTMLDivElement | null
  const errorMessage = document.getElementById('error-message') as HTMLDivElement | null
  const downloadLink = document.getElementById('download-link') as HTMLAnchorElement | null

  if (!urlInput || !processButton || !resetButton) {
    logger.error('Required DOM elements not found')
    return
  }

  // Subscribe to coordinator events
  coordinator.on('progress', (event) => {
    if (statusMessage) {
      statusMessage.textContent = event.message
      statusMessage.className = 'status-message info'
    }
    if (progressBar && event.progress !== undefined) {
      progressBar.style.width = `${event.progress}%`
    }
  })

  coordinator.on('error', (event) => {
    if (statusMessage) {
      statusMessage.textContent = event.message
      statusMessage.className = 'status-message error'
    }
    if (errorSection) {
      errorSection.style.display = 'block'
    }
    if (errorMessage) {
      const suggestion = (event.data as any)?.suggestion
      errorMessage.textContent = suggestion
        ? `${event.message}\n\nSuggestion: ${suggestion}`
        : event.message
    }
    if (processButton) {
      processButton.disabled = false
      processButton.textContent = 'Process'
    }
  })

  coordinator.on('success', (event) => {
    if (statusMessage) {
      statusMessage.textContent = event.message
      statusMessage.className = 'status-message success'
    }
    if (downloadSection) {
      downloadSection.style.display = 'block'
    }
    if (errorSection) {
      errorSection.style.display = 'none'
    }
    if (processButton) {
      processButton.disabled = false
      processButton.textContent = 'Process'
    }
  })

  // Attach event listeners
  processButton.addEventListener('click', async () => {
    const url = urlInput.value.trim()
    if (!url) {
      if (statusMessage) {
        statusMessage.textContent = 'Please enter a valid IKEA URL'
        statusMessage.className = 'status-message error'
      }
      return
    }

    logger.info('Processing product URL:', url)

    // Disable button and show processing state
    processButton.disabled = true
    processButton.textContent = 'Processing...'

    if (downloadSection) {
      downloadSection.style.display = 'none'
    }
    if (errorSection) {
      errorSection.style.display = 'none'
    }
    if (progressBar) {
      progressBar.style.width = '0%'
    }

    // Process the product
    const blob = await coordinator.processProduct(url)

    if (blob && downloadButton) {
      downloadButton.onclick = () => {
        const downloadData = coordinator.downloadLastFile()
        if (downloadData) {
          const fileUrl = URL.createObjectURL(downloadData.blob)
          const a = document.createElement('a')
          a.href = fileUrl
          a.download = downloadData.fileName
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(fileUrl)
          logger.info('File downloaded:', downloadData.fileName)
        }
      }
    }
  })

  resetButton.addEventListener('click', () => {
    logger.info('Resetting form')
    coordinator.reset()
    urlInput.value = ''

    if (statusMessage) {
      statusMessage.textContent = ''
      statusMessage.className = 'status-message'
    }
    if (progressBar) {
      progressBar.style.width = '0%'
    }
    if (downloadSection) {
      downloadSection.style.display = 'none'
    }
    if (errorSection) {
      errorSection.style.display = 'none'
    }
    if (processButton) {
      processButton.disabled = false
      processButton.textContent = 'Process'
    }
  })

  if (retryButton) {
    retryButton.addEventListener('click', async () => {
      logger.info('Retrying process')
      const url = urlInput.value.trim()
      if (url) {
        if (errorSection) {
          errorSection.style.display = 'none'
        }
        if (processButton) {
          processButton.disabled = true
          processButton.textContent = 'Processing...'
        }
        await coordinator.processProduct(url)
      }
    })
  }

  // Handle form submit
  const form = urlInput.closest('form')
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      processButton?.click()
    })
  }

  logger.info('Application initialized successfully')
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp)
} else {
  initializeApp()
}
