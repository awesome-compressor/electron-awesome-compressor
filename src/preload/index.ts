import { clipboard, contextBridge, nativeImage, webUtils } from 'electron'
import { exposeElectronAPI } from '@electron-toolkit/preload'


// Custom APIs for renderer
const api = {
  copyText: (text: string) => {
    clipboard.writeText(text)
  },
  copyImage: (image: string) => {
    const img = nativeImage.createFromDataURL(image)
    clipboard.writeImage(img)
  },
  getPathForFile: (file: File) => {
    return webUtils.getPathForFile(file)
  },

}
exposeElectronAPI()

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
