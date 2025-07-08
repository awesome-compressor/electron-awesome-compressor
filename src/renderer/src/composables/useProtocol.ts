import { usePresenter } from './usePresenter'

export interface ProtocolResult {
  success: boolean
  error?: string
}

export function useProtocol(): {
  openExternalLink: (url: string) => Promise<ProtocolResult>
  openPath: (path: string) => Promise<ProtocolResult>
  showInFolder: (path: string) => Promise<ProtocolResult>
  generateProtocolUrl: (action: string, ...params: string[]) => string
  generateCompressUrl: (filePath: string) => string
  generateOpenUrl: (filePath: string) => string
  generateSettingsUrl: (section?: string) => string
  onProtocolEvent: (event: string, callback: (data: Record<string, unknown>) => void) => void
} {
  const protocolPresenter = usePresenter('protocolPresenter')

  /**
   * Open external link in default browser
   */
  const openExternalLink = async (url: string): Promise<ProtocolResult> => {
    try {
      const result = await protocolPresenter.openExternalLink(url)
      return result as ProtocolResult
    } catch (error) {
      console.error('Failed to open external link:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * Open file or folder in default application
   */
  const openPath = async (path: string): Promise<ProtocolResult> => {
    try {
      const result = await protocolPresenter.openPath(path)
      return result as ProtocolResult
    } catch (error) {
      console.error('Failed to open path:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * Show file or folder in file manager
   */
  const showInFolder = async (path: string): Promise<ProtocolResult> => {
    try {
      const result = await protocolPresenter.showInFolder(path)
      return result as ProtocolResult
    } catch (error) {
      console.error('Failed to show in folder:', error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * Generate eacompressor:// protocol URL
   */
  const generateProtocolUrl = (action: string, ...params: string[]): string => {
    const encodedParams = params.map(param => encodeURIComponent(param))
    return `eacompressor://${action}/${encodedParams.join('/')}`
  }

  /**
   * Generate protocol URL for compressing a file
   */
  const generateCompressUrl = (filePath: string): string => {
    return generateProtocolUrl('compress', filePath)
  }

  /**
   * Generate protocol URL for opening a file
   */
  const generateOpenUrl = (filePath: string): string => {
    return generateProtocolUrl('open', filePath)
  }

  /**
   * Generate protocol URL for opening settings
   */
  const generateSettingsUrl = (section: string = 'general'): string => {
    return generateProtocolUrl('settings', section)
  }

  /**
   * Listen for protocol events from main process
   */
  const onProtocolEvent = (event: string, callback: (data: Record<string, unknown>) => void): void => {
    window.electron.ipcRenderer.on(event, (_event, data) => {
      callback(data)
    })
  }

  return {
    openExternalLink,
    openPath,
    showInFolder,
    generateProtocolUrl,
    generateCompressUrl,
    generateOpenUrl,
    generateSettingsUrl,
    onProtocolEvent,
  }
}
