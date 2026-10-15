import { ElectronAPI } from '@electron-toolkit/preload'
import type { WorkspaceAPI } from '../shared/data'

declare global {
  interface Window {
    electron: ElectronAPI
    api: WorkspaceAPI
  }
}
