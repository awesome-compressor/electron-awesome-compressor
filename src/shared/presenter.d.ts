import { BrowserWindow } from 'electron'

export interface PreviewData {
  originalImage: {
    url: string
    name: string
    size: number
  }
  compressedImage: {
    url: string
    tool: string
    size: number
    ratio: number
  }
}

export interface NodeCompressionResult {
  tool: string
  fileId: string // Changed from filePath to fileId
  originalSize: number
  compressedSize: number
  compressionRatio: number
  duration: number
}

export interface NodeCompressionStats {
  bestTool: string
  bestFileId: string // Changed from bestFilePath to bestFileId
  compressionRatio: number
  totalDuration: number
  allResults: NodeCompressionResult[]
}

export interface IWindowPresenter {
  mainWindow: BrowserWindow | undefined
  previewWindows: BrowserWindow[]
  previewFile(fileId: string): void
  previewComparison(data: PreviewData): void
  minimize(windowId: number): void
  maximize(windowId: number): void
  close(windowId: number): void
  hide(windowId: number): void
  show(windowId?: number): void
  isMaximized(windowId: number): boolean
  isMainWindowFocused(windowId: number): boolean
  sendToAllWindows(channel: string, ...args: unknown[]): void
  sendToWindow(windowId: number, channel: string, ...args: unknown[]): boolean
  closeWindow(windowId: number, forceClose?: boolean): Promise<void>
}

export interface IProtocolPresenter {
  init(): Promise<void>
  cleanup(): Promise<void>
  registerProtocol(scheme: string, handler: (request: Electron.ProtocolRequest, callback: (response: string | Electron.ProtocolResponse) => void) => void): void
  unregisterProtocol(scheme: string): void
  getRegisteredProtocols(): string[]
  openExternalLink(url: string): Promise<{ success: boolean; error?: string }>
  openPath(path: string): Promise<{ success: boolean; error?: string }>
  showInFolder(path: string): Promise<{ success: boolean; error?: string }>
}

export interface INodeCompressPresenter {
  init(): Promise<void>
  cleanup(): Promise<void>
  compressImage(
    imageBuffer: Buffer,
    filename: string,
    options?: {
      quality?: number
      maxWidth?: number
      maxHeight?: number
      preserveExif?: boolean
    }
  ): Promise<NodeCompressionStats>
  compressImageFromBytes(
    imageBytes: Uint8Array | ArrayLike<number> | ArrayBuffer,
    filename: string,
    options?: {
      quality?: number
      maxWidth?: number
      maxHeight?: number
      preserveExif?: boolean
    }
  ): Promise<NodeCompressionStats>
  compressImageFromPath(
    inputPath: string,
    options?: {
      quality?: number
      maxWidth?: number
      maxHeight?: number
      preserveExif?: boolean
    }
  ): Promise<NodeCompressionStats>
  getTempDir(): string
  cleanupTempFiles(olderThanHours?: number): Promise<void>
  getFilePathById(fileId: string): string | null
  getAllFileIds(): string[]
  clearFileById(fileId: string): Promise<boolean>
}

export interface IPresenter {
  windowPresenter: IWindowPresenter
  protocolPresenter: IProtocolPresenter
  nodeCompressPresenter: INodeCompressPresenter
}
