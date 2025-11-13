import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  saveSvg: (svgContent: string, filename: string) => 
    ipcRenderer.invoke('save-svg', svgContent, filename),
});
