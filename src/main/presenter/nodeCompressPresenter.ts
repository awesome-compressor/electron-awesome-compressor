import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { compress, compressWithStats } from '@awesome-compressor/node-image-compression'

// Compression result interface
export interface NodeCompressionResult {
  tool: string
  filePath: string
  originalSize: number
  compressedSize: number
  compressionRatio: number
  duration: number
}

// Compression stats interface
export interface NodeCompressionStats {
  bestTool: string
  bestFilePath: string
  compressionRatio: number
  totalDuration: number
  allResults: NodeCompressionResult[]
}

export class NodeCompressPresenter {
  private tempDir: string

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

      if (compressedBuffer && Buffer.isBuffer(compressedBuffer)) {
        const outputFilename = this.generateOutputFilename(filename, stats.bestTool)
        const outputPath = join(this.tempDir, outputFilename)

        await fs.writeFile(outputPath, compressedBuffer)

        allResults.push({
          tool: stats.bestTool,
          filePath: outputPath,
          originalSize: imageBuffer.length,
          compressedSize: compressedBuffer.length,
          compressionRatio: stats.compressionRatio,
          duration: stats.totalDuration
        })
      }

      // Best result file path
      const bestFilePath = allResults.length > 0 ? allResults[0].filePath : ''

      return {
        bestTool: stats.bestTool,
        bestFilePath,
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
   * Clean up old temp files (optional maintenance)
   */
  async cleanupTempFiles(olderThanHours: number = 24): Promise<void> {
    try {
      const files = await fs.readdir(this.tempDir)
      const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000)

      for (const file of files) {
        const filePath = join(this.tempDir, file)
        const stats = await fs.stat(filePath)

        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath)
          console.log(`Cleaned up old temp file: ${file}`)
        }
      }
    } catch (error) {
      console.warn('Error during temp file cleanup:', error)
    }
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
  }
}
