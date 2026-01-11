import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  saveSvg: (svgContent: string, filename: string) =>
    ipcRenderer.invoke('save-svg', svgContent, filename),
  savePng: (pngDataUrl: string, filename: string) =>
    ipcRenderer.invoke('save-png', pngDataUrl, filename),
  savePdf: (pdfDataUrl: string, filename: string) =>
    ipcRenderer.invoke('save-pdf', pdfDataUrl, filename),
  savePdfBuffer: (buffer: ArrayBuffer, filename: string) =>
    ipcRenderer.invoke('save-pdf-buffer', buffer, filename),
  saveJpeg: (jpegDataUrl: string, filename: string) =>
    ipcRenderer.invoke('save-jpeg', jpegDataUrl, filename),
  openFile: (filePath: string) =>
    ipcRenderer.invoke('open-file', filePath),
  openOsmFile: () =>
    ipcRenderer.invoke('open-osm-file'),
  // Auto-update API
  checkForUpdates: () =>
    ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () =>
    ipcRenderer.invoke('download-update'),
  installUpdate: () =>
    ipcRenderer.invoke('install-update'),
  getAppVersion: () =>
    ipcRenderer.invoke('get-app-version'),
  onUpdateAvailable: (callback: (info: { version: string; releaseDate: string; releaseNotes: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string; releaseDate: string; releaseNotes: string }) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onUpdateNotAvailable: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('update-not-available', handler);
    return () => ipcRenderer.removeListener('update-not-available', handler);
  },
  onUpdateDownloadProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: { percent: number; transferred: number; total: number }) => callback(progress);
    ipcRenderer.on('update-download-progress', handler);
    return () => ipcRenderer.removeListener('update-download-progress', handler);
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },
  onUpdateError: (callback: (error: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string) => callback(error);
    ipcRenderer.on('update-error', handler);
    return () => ipcRenderer.removeListener('update-error', handler);
  },
});
