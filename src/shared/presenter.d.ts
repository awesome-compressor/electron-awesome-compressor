import { BrowserWindow } from 'electron'

export interface IWindowPresenter {
  mainWindow: BrowserWindow | undefined
  previewWindows: BrowserWindow[]
  previewFile(fileId: string): void
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

export interface IPresenter {
  windowPresenter: IWindowPresenter
}
