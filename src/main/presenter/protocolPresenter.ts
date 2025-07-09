import { protocol, shell, app } from 'electron'
import { existsSync } from 'fs'
import { IProtocolPresenter } from '@shared/presenter'

export class ProtocolPresenter implements IProtocolPresenter {
  private registeredProtocols: string[] = []

  constructor() {
    console.log('ProtocolPresenter constructor')
  }

  /**
   * Initialize protocol handlers
   */
  async init(): Promise<void> {
    console.log('ProtocolPresenter init')

    // Register custom protocol handlers
    this.registerCustomProtocols()

    // Setup external link handlers
    this.setupExternalLinkHandlers()

    // Set app as default protocol client for our custom schemes
    this.setAsDefaultProtocolClient()
  }

  /**
   * Register custom protocol schemes
   */
  private registerCustomProtocols(): void {
    // Register eacompressor:// protocol
    protocol.registerStringProtocol('eacompressor', (request, callback) => {
      const url = request.url.replace('eacompressor://', '')
      const decodedUrl = decodeURIComponent(url)

      console.log(`Handling eacompressor protocol: ${decodedUrl}`)

      // Handle the custom protocol
      this.handleCustomProtocol(decodedUrl)

      // Return a response
      callback('Protocol handled successfully')
    })

    // Register eacompressor-file:// protocol for accessing compressed files
    protocol.registerFileProtocol('eacompressor-file', (request, callback) => {
      try {
        console.log(`[Protocol] eacompressor-file request: ${request.url}`)

        // Parse the URL to extract file ID from query parameter
        const url = new URL(request.url)
        const fileId = url.searchParams.get('id')

        if (!fileId) {
          console.warn(`[Protocol] No file ID found in URL: ${request.url}`)
          callback({ statusCode: 400, data: 'Missing file ID parameter' })
          return
        }

        console.log(`[Protocol] Extracted file ID: ${fileId}`)

        // Get file path from nodeCompressPresenter using the file ID
        this.resolveFileById(fileId, callback)
      } catch (error) {
        console.error('[Protocol] Error processing file ID:', error)
        callback({ statusCode: 400, data: 'Invalid file ID format' })
      }
    })

    this.registeredProtocols.push('eacompressor')
    this.registeredProtocols.push('eacompressor-file')
  }

  /**
   * Handle custom protocol actions
   */
  private handleCustomProtocol(url: string): void {
    try {
      // Parse the URL to extract action and parameters
      const parts = url.split('/')
      const action = parts[0]
      const params = parts.slice(1)

      console.log(`Custom protocol action: ${action}`, params)

      switch (action) {
        case 'compress':
          this.handleCompressAction(params)
          break
        case 'open':
          this.handleOpenAction(params)
          break
        case 'settings':
          this.handleSettingsAction(params)
          break
        default:
          console.warn(`Unknown protocol action: ${action}`)
          break
      }
    } catch (error) {
      console.error('Error handling custom protocol:', error)
    }
  }

  /**
   * Handle compress action from protocol
   */
  private handleCompressAction(params: string[]): void {
    if (params.length > 0) {
      const filePath = decodeURIComponent(params[0])
      console.log(`Protocol compress request for: ${filePath}`)

      // Emit event to renderer to handle file compression
      this.notifyRenderer('protocol:compress', { filePath })
    }
  }

  /**
   * Handle open action from protocol
   */
  private handleOpenAction(params: string[]): void {
    if (params.length > 0) {
      const filePath = decodeURIComponent(params[0])
      console.log(`Protocol open request for: ${filePath}`)

      // Emit event to renderer to handle file opening
      this.notifyRenderer('protocol:open', { filePath })
    }
  }

  /**
   * Handle settings action from protocol
   */
  private handleSettingsAction(params: string[]): void {
    const section = params.length > 0 ? params[0] : 'general'
    console.log(`Protocol settings request for section: ${section}`)

    // Emit event to renderer to open settings
    this.notifyRenderer('protocol:settings', { section })
  }

  /**
   * Resolve file by ID and respond with file content for eacompressor-file protocol
   */
  private async resolveFileById(
    fileId: string,
    callback: (response: string | Electron.ProtocolResponse) => void
  ): Promise<void> {
    try {
      console.log(`[Protocol] Resolving file ID: ${fileId}`)

      // Import presenter to access nodeCompressPresenter
      const { presenter } = await import('./index')
      const filePath = presenter.nodeCompressPresenter.getFilePathById(fileId)

      if (!filePath) {
        console.warn(`[Protocol] File ID not found: ${fileId}`)
        callback({ statusCode: 404, data: 'File not found' })
        return
      }

      // Check if file exists on disk
      if (!existsSync(filePath)) {
        console.warn(`[Protocol] File not found on disk: ${filePath}`)
        callback({ statusCode: 404, data: 'File not found on disk' })
        return
      }

      console.log(`[Protocol] Serving compressed file: ${filePath}`)
      callback({ path: filePath })
    } catch (error) {
      console.error('[Protocol] Error resolving file by ID:', error)
      callback({ statusCode: 500, data: 'Internal error' })
    }
  }


  /**
   * Setup external link handlers
   */
  private setupExternalLinkHandlers(): void {
    // External link handling is now done through presenter methods
    // No direct IPC handlers needed
  }

  /**
   * Open external link in default browser
   */
  async openExternalLink(url: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`Opening external link: ${url}`)

      // Validate URL
      if (!this.isValidUrl(url)) {
        throw new Error('Invalid URL')
      }

      // Open in default browser
      await shell.openExternal(url)
      return { success: true }
    } catch (error) {
      console.error('Error opening external link:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * Open file or folder in default application
   */
  async openPath(path: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`Opening path: ${path}`)

      // Check if path exists
      if (!existsSync(path)) {
        throw new Error('Path does not exist')
      }

      // Open in default application
      await shell.openPath(path)
      return { success: true }
    } catch (error) {
      console.error('Error opening path:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * Show file or folder in file manager
   */
  async showInFolder(path: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`Showing in folder: ${path}`)

      // Check if path exists
      if (!existsSync(path)) {
        throw new Error('Path does not exist')
      }

      // Show in file manager
      shell.showItemInFolder(path)
      return { success: true }
    } catch (error) {
      console.error('Error showing in folder:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * Set app as default protocol client
   */
  private setAsDefaultProtocolClient(): void {
    // Set as default protocol client for our custom schemes
    if (process.platform === 'win32') {
      // Windows
      app.setAsDefaultProtocolClient('eacompressor')
    } else if (process.platform === 'darwin') {
      // macOS
      app.setAsDefaultProtocolClient('eacompressor')
    } else {
      // Linux
      app.setAsDefaultProtocolClient('eacompressor')
    }
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  /**
   * Notify renderer process about protocol events
   */
  private notifyRenderer(channel: string, data: Record<string, unknown>): void {
    // Import presenter to access windows
    import('./index').then(({ presenter }) => {
      presenter.windowPresenter.sendToAllWindows(channel, data)
    })
  }

  /**
   * Register additional protocol scheme
   */
  registerProtocol(
    scheme: string,
    handler: (
      request: Electron.ProtocolRequest,
      callback: (response: string | Electron.ProtocolResponse) => void
    ) => void
  ): void {
    if (!this.registeredProtocols.includes(scheme)) {
      protocol.registerStringProtocol(scheme, handler)
      this.registeredProtocols.push(scheme)
      console.log(`Registered protocol: ${scheme}`)
    }
  }

  /**
   * Unregister protocol scheme
   */
  unregisterProtocol(scheme: string): void {
    if (this.registeredProtocols.includes(scheme)) {
      protocol.unregisterProtocol(scheme)
      this.registeredProtocols = this.registeredProtocols.filter((p) => p !== scheme)
      console.log(`Unregistered protocol: ${scheme}`)
    }
  }

  /**
   * Get list of registered protocols
   */
  getRegisteredProtocols(): string[] {
    return [...this.registeredProtocols]
  }

  /**
   * Cleanup protocol handlers
   */
  async cleanup(): Promise<void> {
    console.log('ProtocolPresenter cleanup')

    // Unregister all protocols
    this.registeredProtocols.forEach((scheme) => {
      protocol.unregisterProtocol(scheme)
    })

    this.registeredProtocols = []
  }
}
