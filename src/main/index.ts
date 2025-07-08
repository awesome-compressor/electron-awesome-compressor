import { app, BrowserWindow, protocol } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { presenter } from './presenter'

// Register protocol schemes before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'eacompressor',
    privileges: {
      standard: true,
      secure: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
    },
  },
])

// Configure app command line switches for performance optimization
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required') // Allow video autoplay
app.commandLine.appendSwitch('webrtc-max-cpu-consumption-percentage', '100') // Set WebRTC max CPU usage
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096') // Set V8 heap memory size
app.commandLine.appendSwitch('ignore-certificate-errors') // Ignore certificate errors (for development)

// Platform-specific command line switches
if (process.platform == 'win32') {
  // Windows platform specific parameters (currently commented out)
  // app.commandLine.appendSwitch('in-process-gpu')
  // app.commandLine.appendSwitch('wm-window-animations-disabled')
}
if (process.platform === 'darwin') {
  // macOS platform specific parameters
  app.commandLine.appendSwitch('disable-features', 'DesktopCaptureMacV2,IOSurfaceCapturer')
}

/**
 * Handle app activation (macOS specific)
 */
function handleAppActivation(): void {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    presenter.windowPresenter.show()
  }
}

/**
 * Handle window all closed event
 */
function handleWindowAllClosed(): void {
  // Quit when all windows are closed, except on macOS. There, it's common
  // for applications and their menu bar to stay active until the user quits
  // explicitly with Cmd + Q.
  if (process.platform !== 'darwin') {
    app.quit()
  }
}

/**
 * Handle app before quit event
 */
async function handleBeforeQuit(): Promise<void> {
  console.log('App before quit - cleaning up...')
  await presenter.cleanup()
}

/**
 * Initialize the application
 */
async function initializeApp(): Promise<void> {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.anya2a.compressor')

  // Initialize presenter (this will create windows and setup handlers)
  await presenter.init()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Setup app-level event handlers
  app.on('activate', handleAppActivation)
  app.on('window-all-closed', handleWindowAllClosed)
  app.on('before-quit', handleBeforeQuit)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(initializeApp).catch(console.error)

// Handle app quit gracefully
process.on('SIGINT', () => {
  console.log('Received SIGINT, quitting...')
  app.quit()
})

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, quitting...')
  app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
