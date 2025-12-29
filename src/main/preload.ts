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
    ipcRenderer.on('update-available', (_event, info) => callback(info));
  },
  onUpdateNotAvailable: (callback: () => void) => {
    ipcRenderer.on('update-not-available', () => callback());
  },
  onUpdateDownloadProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => {
    ipcRenderer.on('update-download-progress', (_event, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
  },
  onUpdateError: (callback: (error: string) => void) => {
    ipcRenderer.on('update-error', (_event, error) => callback(error));
  },
});
