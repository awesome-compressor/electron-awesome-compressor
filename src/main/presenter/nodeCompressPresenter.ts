import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { compress, compressWithStats } from '@awesome-compressor/node-image-compression'

// File storage entry interface
interface StoredFileEntry {
  id: string
  filePath: string
  filename: string
  tool: string
  createdAt: number
  originalSize: number
  compressedSize: number
}

// Compression result interface - now returns ID instead of file path
export interface NodeCompressionResult {
  tool: string
  fileId: string // Changed from filePath to fileId
  originalSize: number
  compressedSize: number
  compressionRatio: number
  duration: number
}

// Compression stats interface - now returns ID instead of file path
export interface NodeCompressionStats {
  bestTool: string
  bestFileId: string // Changed from bestFilePath to bestFileId
  compressionRatio: number
  totalDuration: number
  allResults: NodeCompressionResult[]
}

export class NodeCompressPresenter {
  private tempDir: string
  private fileStorage: Map<string, StoredFileEntry> = new Map()

  constructor() {
    console.log('NodeCompressPresenter constructor')
    this.tempDir = app.getPath('temp')
  }

  /**
   * Initialize node compression presenter
   */
  async init(): Promise<void> {
    console.log('NodeCompressPresenter init')
    // Ensure temp directory exists
    await this.ensureTempDir()
  }

  /**
   * Ensure temp directory exists and is accessible
   */
  private async ensureTempDir(): Promise<void> {
    try {
      const compressorTempDir = join(this.tempDir, 'electron-awesome-compressor')
      await fs.mkdir(compressorTempDir, { recursive: true })
      this.tempDir = compressorTempDir
      console.log(`Temp directory ready: ${this.tempDir}`)
    } catch (error) {
      console.error('Error creating temp directory:', error)
      throw new Error('Failed to initialize temp directory')
    }
  }

  /**
   * Generate unique file ID based on image type and timestamp
   */
  private generateFileId(filename: string, tool: string): string {
    const timestamp = Date.now()
    const randomSuffix = Math.random().toString(36).substr(2, 6)
    const extension = filename.split('.').pop()?.toLowerCase() || 'jpg'
    return `${extension}_${tool}_${timestamp}_${randomSuffix}`
  }

  /**
   * Store file and return unique ID
   */
  private storeFile(filePath: string, filename: string, tool: string, originalSize: number, compressedSize: number): string {
    const fileId = this.generateFileId(filename, tool)

    const entry: StoredFileEntry = {
      id: fileId,
      filePath,
      filename,
      tool,
      createdAt: Date.now(),
      originalSize,
      compressedSize
    }

    this.fileStorage.set(fileId, entry)
    console.log(`Stored file with ID: ${fileId}, path: ${filePath}`)

    return fileId
  }

  /**
   * Get file path by ID (for protocol handler)
   */
  getFilePathById(fileId: string): string | null {
    const entry = this.fileStorage.get(fileId)
    if (entry) {
      console.log(`Retrieved file path for ID ${fileId}: ${entry.filePath}`)
      return entry.filePath
    }
    console.warn(`File ID not found: ${fileId}`)
    return null
  }

  /**
   * Get file info by ID
   */
  getFileInfoById(fileId: string): StoredFileEntry | null {
    return this.fileStorage.get(fileId) || null
  }

  /**
   * Compress image using node-image-compression with all available tools
   */
  async compressImage(
    imageBuffer: Buffer,
    filename: string,
    options: {
      quality?: number
      maxWidth?: number
      maxHeight?: number
      preserveExif?: boolean
    } = {}
  ): Promise<NodeCompressionStats> {
    try {
      console.log(`Starting node compression for: ${filename}`)

      // Default compression options
      const compressOptions = {
        quality: options.quality || 0.6,
        maxWidth: options.maxWidth,
        maxHeight: options.maxHeight,
        preserveExif: options.preserveExif || false,
        type: 'buffer' as const
      }

      // Get stats and compressed data
      const [stats, compressedBuffer] = await Promise.all([
        compressWithStats(imageBuffer, { ...compressOptions, returnAllResults: true }),
        compress(imageBuffer, compressOptions)
      ])

      console.log(`Node compression completed in ${stats.totalDuration}ms`)
      console.log(`Best tool: ${stats.bestTool}`)
      console.log(`Compression ratio: ${stats.compressionRatio.toFixed(1)}%`)

      // Save the best compression result
      const allResults: NodeCompressionResult[] = []
      let bestFileId = ''

      if (compressedBuffer && Buffer.isBuffer(compressedBuffer)) {
        const outputFilename = this.generateOutputFilename(filename, stats.bestTool)
        const outputPath = join(this.tempDir, outputFilename)

        await fs.writeFile(outputPath, compressedBuffer)

        // Store file and get ID
        const fileId = this.storeFile(outputPath, filename, stats.bestTool, imageBuffer.length, compressedBuffer.length)
        bestFileId = fileId

        allResults.push({
          tool: stats.bestTool,
          fileId, // Use fileId instead of filePath
          originalSize: imageBuffer.length,
          compressedSize: compressedBuffer.length,
          compressionRatio: stats.compressionRatio,
          duration: stats.totalDuration
        })
      }

      return {
        bestTool: stats.bestTool,
        bestFileId, // Use bestFileId instead of bestFilePath
        compressionRatio: stats.compressionRatio,
        totalDuration: stats.totalDuration,
        allResults
      }

    } catch (error) {
      console.error('Node compression error:', error)
      throw new Error(`Node compression failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Compress image from file path
   */
  async compressImageFromPath(
    inputPath: string,
    options: {
      quality?: number
      maxWidth?: number
      maxHeight?: number
      preserveExif?: boolean
    } = {}
  ): Promise<NodeCompressionStats> {
    try {
      const imageBuffer = await fs.readFile(inputPath)
      const filename = inputPath.split(/[/\\]/).pop() || 'unknown.jpg'

      return await this.compressImage(imageBuffer, filename, options)
    } catch (error) {
      console.error('Error reading input file:', error)
      throw new Error(`Failed to read input file: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

    /**
   * Compress image from Uint8Array (for IPC compatibility)
   */
  async compressImageFromBytes(
    imageBytes: Uint8Array | ArrayLike<number> | ArrayBuffer,
    filename: string,
    options: {
      quality?: number
      maxWidth?: number
      maxHeight?: number
      preserveExif?: boolean
    } = {}
  ): Promise<NodeCompressionStats> {
    try {
      console.log(`Converting bytes to Buffer for: ${filename}`)
      console.log('Image bytes type:', typeof imageBytes, 'constructor:', imageBytes.constructor.name)

      let imageBuffer: Buffer

      // Handle different input types that might come from IPC
      if (Buffer.isBuffer(imageBytes)) {
        imageBuffer = imageBytes
      } else if (imageBytes instanceof Uint8Array) {
        imageBuffer = Buffer.from(imageBytes)
      } else if (imageBytes instanceof ArrayBuffer) {
        imageBuffer = Buffer.from(imageBytes)
      } else if (Array.isArray(imageBytes)) {
        // Handle when Uint8Array is serialized as a regular array
        imageBuffer = Buffer.from(imageBytes)
      } else if (typeof imageBytes === 'object' && imageBytes !== null) {
        // Handle when Uint8Array is serialized as an object with numeric keys
        const bytesArray = Object.values(imageBytes as unknown as Record<string, number>)
        imageBuffer = Buffer.from(bytesArray)
      } else {
        throw new Error(`Unsupported image bytes type: ${typeof imageBytes}`)
      }

      console.log(`Successfully converted to Buffer, size: ${imageBuffer.length} bytes`)

      // Use existing compressImage method
      return await this.compressImage(imageBuffer, filename, options)
    } catch (error) {
      console.error('Error converting bytes to buffer:', error)
      throw new Error(`Failed to process image bytes: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Generate output filename with tool suffix
   */
  private generateOutputFilename(originalFilename: string, tool: string): string {
    const timestamp = Date.now()
    const lastDotIndex = originalFilename.lastIndexOf('.')

    if (lastDotIndex > 0) {
      const nameWithoutExt = originalFilename.substring(0, lastDotIndex)
      const extension = originalFilename.substring(lastDotIndex)
      return `${nameWithoutExt}_${tool}_${timestamp}${extension}`
    } else {
      return `${originalFilename}_${tool}_${timestamp}`
    }
  }

  /**
   * Clean up old temp files and memory storage (optional maintenance)
   */
  async cleanupTempFiles(olderThanHours: number = 24): Promise<void> {
    try {
      const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000)
      const expiredIds: string[] = []

      // Clean up memory storage and collect expired file IDs
      for (const [id, entry] of this.fileStorage.entries()) {
        if (entry.createdAt < cutoffTime) {
          expiredIds.push(id)
        }
      }

      // Remove expired files from disk and memory
      for (const id of expiredIds) {
        const entry = this.fileStorage.get(id)
        if (entry) {
          try {
            await fs.unlink(entry.filePath)
            console.log(`Cleaned up old temp file: ${entry.filename} (${id})`)
          } catch (error) {
            console.warn(`Failed to delete file ${entry.filePath}:`, error)
          }
          this.fileStorage.delete(id)
        }
      }

      console.log(`Cleaned up ${expiredIds.length} expired files`)
    } catch (error) {
      console.warn('Error during temp file cleanup:', error)
    }
  }

  /**
   * Get all stored file IDs
   */
  getAllFileIds(): string[] {
    return Array.from(this.fileStorage.keys())
  }

  /**
   * Clear specific file by ID
   */
  async clearFileById(fileId: string): Promise<boolean> {
    const entry = this.fileStorage.get(fileId)
    if (entry) {
      try {
        await fs.unlink(entry.filePath)
        this.fileStorage.delete(fileId)
        console.log(`Cleared file with ID: ${fileId}`)
        return true
      } catch (error) {
        console.warn(`Failed to clear file ${fileId}:`, error)
        return false
      }
    }
    return false
  }

  /**
   * Get temp directory path
   */
  getTempDir(): string {
    return this.tempDir
  }

  /**
   * Cleanup presenter
   */
  async cleanup(): Promise<void> {
    console.log('NodeCompressPresenter cleanup')
    // Optionally clean up temp files on shutdown
    await this.cleanupTempFiles(0) // Clean up all files
    // Clear memory storage
    this.fileStorage.clear()
    console.log('Cleared all file storage')
  }
}
