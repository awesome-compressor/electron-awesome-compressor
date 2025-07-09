import { compress, compressWithStats } from '@awesome-compressor/node-image-compression'

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

type WorkerRequest = CompressionRequest

class CompressionWorker {
  async compressImage(
    imageBytes: Uint8Array,
    filename: string,
    options: {
      quality?: number
      maxWidth?: number
      maxHeight?: number
      preserveExif?: boolean
    } = {}
  ): Promise<{
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
  }> {
    try {
      console.log(`[CompressionWorker] Starting compression for: ${filename}`)

      // Convert Uint8Array to Buffer
      const imageBuffer = Buffer.from(imageBytes)

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
        compress(imageBuffer, { ...compressOptions, returnAllResults: true })
      ])

      console.log(`[CompressionWorker] Compression completed in ${stats.totalDuration}ms`)
      console.log(`[CompressionWorker] Best tool: ${stats.bestTool}`)
      console.log(`[CompressionWorker] Compression ratio: ${stats.compressionRatio.toFixed(1)}%`)

      if (!compressedBuffer || !Buffer.isBuffer(compressedBuffer)) {
        throw new Error('Compression failed: no valid buffer returned')
      }

      // Convert Buffer back to Uint8Array for transfer
      const compressedUint8Array = new Uint8Array(compressedBuffer)

      return {
        compressedBuffer: compressedUint8Array,
        stats: {
          bestTool: stats.bestTool,
          compressionRatio: stats.compressionRatio,
          totalDuration: stats.totalDuration,
          allResults: compressedBuffer.allResults
        }
      }
    } catch (error) {
      console.error('[CompressionWorker] Compression error:', error)
      throw new Error(
        `Compression failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

// Initialize worker instance
const worker = new CompressionWorker()

// Handle incoming messages from main process
process.parentPort.on('message', (e) => {
  const [port] = e.ports

  port.on('message', async (messageEvent) => {
    const request = messageEvent.data as WorkerRequest

    try {
      switch (request.type) {
        case 'compress': {
          try {
            const result = await worker.compressImage(
              request.data.imageBytes,
              request.data.filename,
              request.data.options
            )
            const response: CompressionResponse = {
              type: 'compress-success',
              requestId: request.requestId,
              data: result
            }
            port.postMessage(response)
          } catch (error) {
            const response: CompressionResponse = {
              type: 'compress-error',
              requestId: request.requestId,
              error: error instanceof Error ? error.message : String(error)
            }
            port.postMessage(response)
          }
          break
        }

        default: {
          console.warn('[CompressionWorker] Unknown request type:', (request as any).type)
        }
      }
    } catch (error) {
      console.error('[CompressionWorker] Error handling message:', error)
    }
  })

  port.start()

  // Send ready signal
  port.postMessage({ type: 'ready' })
})

// Handle worker shutdown
process.on('exit', () => {
  console.log('[CompressionWorker] Process exit')
})

process.on('SIGTERM', () => {
  console.log('[CompressionWorker] SIGTERM received')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('[CompressionWorker] SIGINT received')
  process.exit(0)
})
