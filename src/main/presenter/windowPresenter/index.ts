import { BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IWindowPresenter, PreviewData } from '@shared/presenter'
import icon from '../../../../resources/icon.png?asset'

export class WindowPresenter implements IWindowPresenter {
  mainWindow: BrowserWindow | undefined = undefined
  previewWindows: BrowserWindow[] = []

  constructor() {
    console.log('WindowPresenter constructor')
  }

  /**
   * Initialize main window and setup event handlers
   */
  async init(): Promise<void> {
    console.log('WindowPresenter init')
    await this.createMainWindow()
    this.setupEventHandlers()
  }

  /**
   * Create and configure main window
   */
  private async createMainWindow(): Promise<void> {

    // Create the browser window
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      autoHideMenuBar: true,
      hasShadow: true, // macOS 阴影
      trafficLightPosition: process.platform === 'darwin' ? { x: 12, y: 12 } : undefined, // macOS 红绿灯按钮位置
      frame: process.platform === 'darwin', // macOS 无边框
      vibrancy: process.platform === 'darwin' ? 'under-window' : undefined, // macOS 磨砂效果
      backgroundColor: '#00000000', // 透明背景色
      maximizable: true, // 允许最大化
      transparent: process.platform === 'darwin', // macOS 标题栏透明
      titleBarStyle: 'hiddenInset', // macOS 风格标题栏
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'), // Preload 脚本路径
        sandbox: false,
        devTools: is.dev // 开发模式下启用 DevTools
      },
      roundedCorners: true // Windows 11 圆角
    })

    // Handle window ready to show
    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show()
      if (is.dev) {
        this.mainWindow?.webContents.openDevTools()
      }
    })

    // Handle external links
    this.mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // Handle window close
    this.mainWindow.on('closed', () => {
      this.mainWindow = undefined
    })

    // Load renderer content
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      this.mainWindow.loadFile(join(__dirname, '../../renderer/index.html'))
    }
    // 处理外部链接
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      // 使用系统默认浏览器打开链接
      shell.openExternal(url)
      return { action: 'deny' }
    })
  }

  /**
   * Setup IPC and other event handlers
   */
  private setupEventHandlers(): void {
    // IPC handlers
    ipcMain.on('ping', () => console.log('pong'))

    // Window control handlers
    ipcMain.handle('window-minimize', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window) {
        this.minimize(window.id)
      }
    })

    ipcMain.handle('window-maximize', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window) {
        this.maximize(window.id)
      }
    })

    ipcMain.handle('window-close', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window) {
        this.close(window.id)
      }
    })

    ipcMain.handle('window-hide', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window) {
        this.hide(window.id)
      }
    })

    ipcMain.handle('window-show', (_event, windowId?: number) => {
      this.show(windowId)
    })

    ipcMain.handle('window-is-maximized', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      return window ? this.isMaximized(window.id) : false
    })

    ipcMain.handle('window-is-main-focused', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      return window ? this.isMainWindowFocused(window.id) : false
    })
  }

  /**
   * Create preview window for specific file
   */
  previewFile(fileId: string): void {
    console.log(`Creating preview window for file: ${fileId}`)

    const previewWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      autoHideMenuBar: true,
      parent: this.mainWindow,
      modal: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'), // Preload 脚本路径
        sandbox: false
      }
    })

    // Store reference to preview window
    this.previewWindows.push(previewWindow)

    // Handle preview window close
    previewWindow.on('closed', () => {
      const index = this.previewWindows.indexOf(previewWindow)
      if (index > -1) {
        this.previewWindows.splice(index, 1)
      }
    })

    previewWindow.on('ready-to-show', () => {
      previewWindow.show()
    })

    // Load preview content (for now, same as main window)
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      previewWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/preview/index.html?fileId=${fileId}`)
    } else {
      previewWindow.loadFile(join(__dirname, '../../renderer/preview/index.html'), {
        hash: `/?fileId=${fileId}`
      })
    }
  }

  /**
   * Create comparison preview window with original and compressed image data
   */
  previewComparison(data: PreviewData): void {
    console.log('Creating comparison preview window with data:', data)

    const previewWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      show: false,
      autoHideMenuBar: true,
      parent: this.mainWindow,
      modal: false,
      resizable: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'), // Preload 脚本路径
        sandbox: false,
        devTools: is.dev
      }
    })

    // Store reference to preview window
    this.previewWindows.push(previewWindow)

    // Handle preview window close
    previewWindow.on('closed', () => {
      const index = this.previewWindows.indexOf(previewWindow)
      if (index > -1) {
        this.previewWindows.splice(index, 1)
      }
    })

    previewWindow.on('ready-to-show', () => {
      previewWindow.show()
      if (is.dev) {
        previewWindow.webContents.openDevTools()
      }
      // Send data to preview window after it's ready
      setTimeout(() => {
        previewWindow.webContents.send('preview-data', data)
      }, 100)
    })

    // Load preview content
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      previewWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/preview/index.html`)
    } else {
      previewWindow.loadFile(join(__dirname, '../../renderer/preview/index.html'))
    }
  }

  /**
   * Minimize window by ID
   */
  minimize(windowId: number): void {
    const window = BrowserWindow.fromId(windowId)
    if (window && !window.isDestroyed()) {
      window.minimize()
    }
  }

  /**
   * Maximize or restore window by ID
   */
  maximize(windowId: number): void {
    const window = BrowserWindow.fromId(windowId)
    if (window && !window.isDestroyed()) {
      if (window.isMaximized()) {
        window.restore()
      } else {
        window.maximize()
      }
    }
  }

  /**
   * Close window by ID
   */
  close(windowId: number): void {
    const window = BrowserWindow.fromId(windowId)
    if (window && !window.isDestroyed()) {
      window.close()
    }
  }

  /**
   * Hide window by ID
   */
  hide(windowId: number): void {
    const window = BrowserWindow.fromId(windowId)
    if (window && !window.isDestroyed()) {
      window.hide()
    }
  }

  /**
   * Show window by ID or show main window if no ID provided
   */
  show(windowId?: number): void {
    if (windowId) {
      const window = BrowserWindow.fromId(windowId)
      if (window && !window.isDestroyed()) {
        window.show()
        window.focus()
      }
    } else if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.show()
      this.mainWindow.focus()
    }
  }

  /**
   * Check if window is maximized
   */
  isMaximized(windowId: number): boolean {
    const window = BrowserWindow.fromId(windowId)
    return window && !window.isDestroyed() ? window.isMaximized() : false
  }

  /**
   * Check if main window is focused
   */
  isMainWindowFocused(windowId: number): boolean {
    const window = BrowserWindow.fromId(windowId)
    return window && !window.isDestroyed() && window === this.mainWindow
      ? window.isFocused()
      : false
  }

  /**
   * Send message to all windows
   */
  sendToAllWindows(channel: string, ...args: unknown[]): void {
    const allWindows = [this.mainWindow, ...this.previewWindows].filter(Boolean)
    allWindows.forEach((window) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send(channel, ...args)
      }
    })
  }

  /**
   * Send message to specific window
   */
  sendToWindow(windowId: number, channel: string, ...args: unknown[]): boolean {
    const window = BrowserWindow.fromId(windowId)
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, ...args)
      return true
    }
    return false
  }

  /**
   * Close window with optional force close
   */
  async closeWindow(windowId: number, forceClose?: boolean): Promise<void> {
    const window = BrowserWindow.fromId(windowId)
    if (window && !window.isDestroyed()) {
      return new Promise((resolve) => {
        window.once('closed', () => {
          resolve()
        })

        if (forceClose) {
          window.destroy()
        } else {
          window.close()
        }
      })
    }
  }

  /**
   * Get main window instance
   */
  getMainWindow(): BrowserWindow | undefined {
    return this.mainWindow
  }

  /**
   * Get all preview windows
   */
  getPreviewWindows(): BrowserWindow[] {
    return this.previewWindows.filter((window) => !window.isDestroyed())
  }

  /**
   * Cleanup all windows
   */
  async cleanup(): Promise<void> {
    // Close all preview windows
    const closePromises = this.previewWindows.map((window) => {
      if (!window.isDestroyed()) {
        return this.closeWindow(window.id, true)
      }
      return Promise.resolve()
    })

    await Promise.all(closePromises)
    this.previewWindows = []

    // Close main window
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      await this.closeWindow(this.mainWindow.id, true)
      this.mainWindow = undefined
    }
  }
}
