import {contextBridge, ipcRenderer} from 'electron';

contextBridge.exposeInMainWorld('sessionManager', {
  selectDirectory: () => ipcRenderer.invoke('app:select-directory') as Promise<string | undefined>,
  minimize: () => ipcRenderer.invoke('app:minimize'),
  maximize: () => ipcRenderer.invoke('app:maximize') as Promise<boolean>,
  close: () => ipcRenderer.invoke('app:close')
});
