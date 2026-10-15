import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { WorkspaceAPI } from '../shared/data'

// Custom APIs for renderer
const api: WorkspaceAPI = {
  load: (legacy) => ipcRenderer.invoke('workspace:load', legacy),
  saveCompanies: (companies) => ipcRenderer.invoke('workspace:save-companies', companies),
  saveResume: (resume) => ipcRenderer.invoke('workspace:save-resume', resume),
  addIntent: (companyId, jobId) => ipcRenderer.invoke('workspace:add-intent', companyId, jobId),
  backup: () => ipcRenderer.invoke('workspace:backup'),
  restore: () => ipcRenderer.invoke('workspace:restore')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
