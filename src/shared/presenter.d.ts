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

export interface IPresenter {
  windowPresenter: IWindowPresenter
  protocolPresenter: IProtocolPresenter
}
