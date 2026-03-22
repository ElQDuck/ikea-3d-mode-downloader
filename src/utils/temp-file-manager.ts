/**
 * Temporary file manager
 * Handles creation and cleanup of temporary files in ./tmp directory
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { existsSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import { logger } from './logger'

export interface TempFileManager {
  /**
   * Create temp directory
   */
  createTempDir(prefix?: string): Promise<string>

  /**
   * Write temp file
   */
  writeTempFile(content: Buffer, ext?: string): Promise<string>

  /**
   * Read temp file
   */
  readTempFile(path: string): Promise<Buffer>

  /**
   * Delete temp file
   */
  deleteTempFile(path: string): Promise<void>

  /**
   * Clean all temp files in directory
   */
  cleanupTempDir(dirPath: string): Promise<number>

  /**
   * Get all temp files
   */
  listTempFiles(dirPath: string): Promise<string[]>

  /**
   * Get disk usage of temp directory
   */
  getTempDirSize(dirPath: string): Promise<number>
}

export class TempFileManagerImpl implements TempFileManager {
  private _tmpBaseDir: string = './tmp'

  constructor(tmpDir?: string) {
    if (tmpDir) {
      this._tmpBaseDir = tmpDir
    }
  }

  async createTempDir(prefix?: string): Promise<string> {
    await this._ensureBaseTmpDir()

    const dirName = prefix ? `${prefix}-${randomUUID()}` : randomUUID()
    const fullPath = path.join(this._tmpBaseDir, dirName)

    try {
      await fs.mkdir(fullPath, { recursive: true })
      logger.debug(`Created temp directory: ${fullPath}`)
      return fullPath
    } catch (error) {
      logger.error(`Failed to create temp directory: ${error}`)
      throw error
    }
  }

  async writeTempFile(content: Buffer, ext?: string): Promise<string> {
    await this._ensureBaseTmpDir()

    const fileName = `${randomUUID()}${ext ? `.${ext}` : ''}`
    const fullPath = path.join(this._tmpBaseDir, fileName)

    try {
      await fs.writeFile(fullPath, content)
      logger.debug(`Wrote temp file: ${fullPath}`)
      return fullPath
    } catch (error) {
      logger.error(`Failed to write temp file: ${error}`)
      throw error
    }
  }

  async readTempFile(filePath: string): Promise<Buffer> {
    try {
      const content = await fs.readFile(filePath)
      logger.debug(`Read temp file: ${filePath}`)
      return content
    } catch (error) {
      logger.error(`Failed to read temp file: ${error}`)
      throw error
    }
  }

  async deleteTempFile(filePath: string): Promise<void> {
    try {
      await this._safeDelete(filePath)
      logger.debug(`Deleted temp file: ${filePath}`)
    } catch (error) {
      logger.error(`Failed to delete temp file: ${error}`)
      throw error
    }
  }

  async cleanupTempDir(dirPath: string): Promise<number> {
    try {
      if (!existsSync(dirPath)) {
        logger.warn(`Temp directory does not exist: ${dirPath}`)
        return 0
      }

      const files = await fs.readdir(dirPath, { recursive: true })
      let deletedCount = 0

      for (const file of files) {
        const fullPath = path.join(dirPath, file as string)
        const stat = await fs.stat(fullPath)

        if (stat.isFile()) {
          await this._safeDelete(fullPath)
          deletedCount++
        }
      }

      // Try to remove directory if empty
      try {
        await fs.rmdir(dirPath)
      } catch {
        // Directory not empty, that's ok
      }

      logger.info(`Cleaned up ${deletedCount} files from ${dirPath}`)
      return deletedCount
    } catch (error) {
      logger.error(`Failed to cleanup temp directory: ${error}`)
      throw error
    }
  }

  async listTempFiles(dirPath: string): Promise<string[]> {
    try {
      if (!existsSync(dirPath)) {
        return []
      }

      const files = await fs.readdir(dirPath, { recursive: true })
      return files.map(f => path.join(dirPath, f as string))
    } catch (error) {
      logger.error(`Failed to list temp files: ${error}`)
      throw error
    }
  }

  async getTempDirSize(dirPath: string): Promise<number> {
    try {
      if (!existsSync(dirPath)) {
        return 0
      }

      let totalSize = 0
      const files = await fs.readdir(dirPath, { recursive: true })

      for (const file of files) {
        const fullPath = path.join(dirPath, file as string)
        const stat = await fs.stat(fullPath)
        if (stat.isFile()) {
          totalSize += stat.size
        }
      }

      return totalSize
    } catch (error) {
      logger.error(`Failed to get temp directory size: ${error}`)
      return 0
    }
  }

  private async _ensureBaseTmpDir(): Promise<void> {
    if (!existsSync(this._tmpBaseDir)) {
      mkdirSync(this._tmpBaseDir, { recursive: true })
      logger.debug(`Created base temp directory: ${this._tmpBaseDir}`)
    }
  }

  private async _safeDelete(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath)
      if (stat.isFile()) {
        await fs.unlink(filePath)
        return true
      } else if (stat.isDirectory()) {
        await fs.rm(filePath, { recursive: true, force: true })
        return true
      }
    } catch (error) {
      logger.warn(`Could not delete path: ${filePath} - ${error}`)
      return false
    }
    return false
  }
}
