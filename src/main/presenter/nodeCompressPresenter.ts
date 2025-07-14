import { app, utilityProcess, MessageChannelMain, MessagePortMain, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import compressionWorkerPath from '../utils/compressionWorker?modulePath'

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

// Message types for worker communication
interface CompressionRequest {
  type: 'compress'
  data: {
    imageBytes: Uint8Array
    filename: string
    options: {
      quality?: number
      maxWidth?: number
      maxHeight?: number
      preserveExif?: boolean
    }
  }
  requestId: string
}

interface CompressionResponse {
  type: 'compress-success' | 'compress-error'
  requestId: string
  data?: {
    compressedBuffer: Uint8Array
    stats: {
      bestTool: string
      compressionRatio: number
      totalDuration: number
      allResults: Array<{
        tool: string
        originalSize: number
        compressedSize: number
        compressionRatio: number
        duration: number
      }>
    }
  }
  error?: string
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
  private worker: Electron.UtilityProcess | null = null
  private workerPort: MessagePortMain | null = null
  private pendingRequests: Map<
    string,
    {
      resolve: (value: CompressionResponse) => void
      reject: (error: Error) => void
    }
  > = new Map()
  private requestIdCounter = 0
  private workerInitialized = false

  constructor() {
    console.log('NodeCompressPresenter constructor')
    this.tempDir = app.getPath('temp')
  }

  /**
   * Send compression progress update to all renderer windows
   */
  private notifyCompressionProgress(filename: string, status: 'started' | 'completed' | 'error', data?: unknown): void {
    const allWindows = BrowserWindow.getAllWindows()
    allWindows.forEach(window => {
      window.webContents.send('node-compression-progress', {
        filename,
        status,
        data
      })
    })
  }

  /**
   * Initialize node compression presenter
   */
  async init(): Promise<void> {
    console.log('NodeCompressPresenter init')

    // Ensure temp directory exists
    await this.ensureTempDir()

    // Initialize compression worker
    await this.initCompressionWorker()
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
   * Initialize compression worker process
   */
  private async initCompressionWorker(): Promise<void> {
    if (this.workerInitialized) {
      return
    }

    try {
      // Create message channel
      const { port1, port2 } = new MessageChannelMain()

      // Fork utility process
      this.worker = utilityProcess.fork(compressionWorkerPath)

      // Send port to worker
      this.worker.postMessage({ message: 'init' }, [port1])

      // Setup communication
      this.workerPort = port2
      this.setupWorkerCommunication()

      // Wait for worker to be ready
      await this.waitForWorkerReady()

      this.workerInitialized = true
      console.log('Compression worker initialized')
    } catch (error) {
      console.error('Failed to initialize compression worker:', error)
      throw error
    }
  }

  private setupWorkerCommunication(): void {
    if (!this.workerPort) return

    this.workerPort.on('message', (e: Electron.MessageEvent) => {
      const response = e.data as CompressionResponse | { type: 'ready' }

      if (response.type === 'ready') {
        // Worker is ready
        return
      }

      const workerResponse = response as CompressionResponse
      const pendingRequest = this.pendingRequests.get(workerResponse.requestId)

      if (pendingRequest) {
        this.pendingRequests.delete(workerResponse.requestId)

        if (workerResponse.type === 'compress-error') {
          pendingRequest.reject(new Error(workerResponse.error || 'Unknown error'))
        } else {
          pendingRequest.resolve(workerResponse)
        }
      }
    })

    this.workerPort.start()
  }

  private waitForWorkerReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.workerPort) {
        reject(new Error('Worker port not initialized'))
        return
      }

      const timeout = setTimeout(() => {
        reject(new Error('Worker ready timeout'))
      }, 10000) // 10 second timeout

      const onMessage = (e: Electron.MessageEvent): void => {
        if (e.data?.type === 'ready') {
          clearTimeout(timeout)
          this.workerPort?.removeListener('message', onMessage)
          resolve()
        }
      }

      this.workerPort.on('message', onMessage)
    })
  }

  private generateRequestId(): string {
    return `req_${++this.requestIdCounter}_${Date.now()}`
  }

  private sendToWorker(request: CompressionRequest): Promise<CompressionResponse> {
    return new Promise((resolve, reject) => {
      if (!this.workerPort) {
        reject(new Error('Worker not initialized'))
        return
      }

      this.pendingRequests.set(request.requestId, { resolve, reject })

      // Add timeout for requests
      setTimeout(() => {
        if (this.pendingRequests.has(request.requestId)) {
          this.pendingRequests.delete(request.requestId)
          reject(new Error(`Request timeout: ${request.type}`))
        }
      }, 60000) // 60 second timeout

      this.workerPort.postMessage(request)
    })
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
  private storeFile(
    filePath: string,
    filename: string,
    tool: string,
    originalSize: number,
    compressedSize: number
  ): string {
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
   * Compress image using utility process for compression and main process for file management
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
    if (!this.workerInitialized) {
      throw new Error('Compression worker not initialized')
    }

    try {
      console.log(`Starting node compression for: ${filename}`)

      // Notify compression started
      this.notifyCompressionProgress(filename, 'started')

      // Convert Buffer to Uint8Array for transfer to worker
      const imageBytes = new Uint8Array(imageBuffer)

      // Send compression request to worker
      const response = await this.sendToWorker({
        type: 'compress',
        requestId: this.generateRequestId(),
        data: {
          imageBytes,
          filename,
          options
        }
      })

      if (!response.data) {
        throw new Error('No compression data received from worker')
      }

      const { compressedBuffer, stats } = response.data

      console.log(`Node compression completed in ${stats.totalDuration}ms`)
      console.log(`Best tool: ${stats.bestTool}`)
      console.log(`Compression ratio: ${stats.compressionRatio.toFixed(1)}%`)

      // Save compressed files for all results and build result array
      const allResults: NodeCompressionResult[] = []

      // Save the best result first
      const bestOutputFilename = this.generateOutputFilename(filename, stats.bestTool)
      const bestOutputPath = join(this.tempDir, bestOutputFilename)

      // Convert Uint8Array back to Buffer for file writing
      const compressedBufferNode = Buffer.from(compressedBuffer)
      await fs.writeFile(bestOutputPath, compressedBufferNode)

      // Store best file and get ID
      const bestFileId = this.storeFile(
        bestOutputPath,
        filename,
        stats.bestTool,
        imageBuffer.length,
        compressedBufferNode.length
      )

      // Process all compression results
      for (const result of stats.allResults) {
        if (result.tool === stats.bestTool) {
          // Use the already saved best result
          allResults.push({
            tool: result.tool,
            fileId: bestFileId,
            originalSize: result.originalSize,
            compressedSize: result.compressedSize,
            compressionRatio: result.compressionRatio,
            duration: result.duration
          })
        } else {
          // For other tools, we would need their buffers to save them
          // For now, just add the stats without file storage
          allResults.push({
            tool: result.tool,
            fileId: '', // No file saved for non-best results
            originalSize: result.originalSize,
            compressedSize: result.compressedSize,
            compressionRatio: result.compressionRatio,
            duration: result.duration
          })
        }
      }

      const result = {
        bestTool: stats.bestTool,
        bestFileId,
        compressionRatio: stats.compressionRatio,
        totalDuration: stats.totalDuration,
        allResults
      }

      // Notify compression completed
      this.notifyCompressionProgress(filename, 'completed', result)

      return result
    } catch (error) {
      console.error('Node compression error:', error)

      // Notify compression error
      this.notifyCompressionProgress(filename, 'error', { error: error instanceof Error ? error.message : String(error) })

      throw new Error(
        `Node compression failed: ${error instanceof Error ? error.message : String(error)}`
      )
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
      throw new Error(
        `Failed to read input file: ${error instanceof Error ? error.message : String(error)}`
      )
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
      console.log(
        'Image bytes type:',
        typeof imageBytes,
        'constructor:',
        imageBytes.constructor.name
      )

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
      throw new Error(
        `Failed to process image bytes: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Clean up old temp files and memory storage (optional maintenance)
   */
  async cleanupTempFiles(olderThanHours: number = 24): Promise<void> {
    try {
      const cutoffTime = Date.now() - olderThanHours * 60 * 60 * 1000
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

    try {
      // Clean up all files
      await this.cleanupTempFiles(0)

      // Clear pending requests
      for (const [, request] of this.pendingRequests.entries()) {
        request.reject(new Error('Presenter cleanup'))
      }
      this.pendingRequests.clear()

      // Close worker port
      if (this.workerPort) {
        this.workerPort.close()
        this.workerPort = null
      }

      // Terminate worker process
      if (this.worker) {
        this.worker.kill()
        this.worker = null
      }

      // Clear memory storage
      this.fileStorage.clear()

      this.workerInitialized = false
      console.log('NodeCompressPresenter cleanup completed')
    } catch (error) {
      console.warn('Error during NodeCompressPresenter cleanup:', error)
    }
  }
}
