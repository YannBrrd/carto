import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  saveSvg: (svgContent: string, filename: string) =>
    ipcRenderer.invoke('save-svg', svgContent, filename),
  savePng: (pngDataUrl: string, filename: string) =>
    ipcRenderer.invoke('save-png', pngDataUrl, filename),
  savePdf: (pdfDataUrl: string, filename: string) =>
    ipcRenderer.invoke('save-pdf', pdfDataUrl, filename),
  openFile: (filePath: string) =>
    ipcRenderer.invoke('open-file', filePath),
  openOsmFile: () =>
    ipcRenderer.invoke('open-osm-file'),
});
