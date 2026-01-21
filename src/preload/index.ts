import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  openFile: () => Promise<{ filePath: string; content: string } | null>
}

const api: ElectronAPI = {
  openFile: () => ipcRenderer.invoke('dialog:openFile')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = api
}
