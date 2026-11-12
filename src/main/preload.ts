import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  saveSvg: (svgContent: string, filename: string) =>
    ipcRenderer.invoke('save-svg', svgContent, filename),
  saveKml: (kmlContent: string, filename: string) =>
    ipcRenderer.invoke('save-kml', kmlContent, filename),
  saveKmlBeside: (kmlContent: string, mapPath: string) =>
    ipcRenderer.invoke('save-kml-beside', kmlContent, mapPath),
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
  readOsmFile: (filePath: string) =>
    ipcRenderer.invoke('read-osm-file', filePath),
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
  // Preferences API
  getPreference: (key: string) =>
    ipcRenderer.invoke('get-preference', key),
  setPreference: (key: string, value: unknown) =>
    ipcRenderer.invoke('set-preference', key, value),
  getAllPreferences: () =>
    ipcRenderer.invoke('get-all-preferences'),
  // Batch export (application and command line)
  batch: {
    listKml: (root: string) => ipcRenderer.invoke('batch-list-kml', root),
    readKml: (root: string, relative: string) => ipcRenderer.invoke('batch-read-kml', root, relative),
    outputExists: (root: string, relative: string) => ipcRenderer.invoke('batch-output-exists', root, relative),
    writeOutput: (root: string, relative: string, data: unknown) => ipcRenderer.invoke('batch-write-output', root, relative, data),
    chooseFolder: (title: string) => ipcRenderer.invoke('batch-choose-folder', title),
    loadProfile: () => ipcRenderer.invoke('batch-load-profile'),
    saveProfile: (json: string) => ipcRenderer.invoke('batch-save-profile', json),
    exportProfile: (json: string) => ipcRenderer.invoke('batch-export-profile', json),
    openPath: (target: string) => ipcRenderer.invoke('batch-open-path', target),
    cacheGet: (query: string) => ipcRenderer.invoke('batch-cache-get', query),
    cachePut: (query: string, answer: string) => ipcRenderer.invoke('batch-cache-put', query, answer),
    cachePurge: () => ipcRenderer.invoke('batch-cache-purge'),
    osmOpen: (file: string, boxes: unknown, filter: unknown) => ipcRenderer.invoke('batch-osm-open', file, boxes, filter),
    osmQuery: (box: unknown) => ipcRenderer.invoke('batch-osm-query', box),
    osmClose: () => ipcRenderer.invoke('batch-osm-close'),
    onOsmProgress: (callback: (progress: { phase: string; fraction: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: { phase: string; fraction: number }) => callback(progress);
      ipcRenderer.on('batch-osm-progress', handler);
      return () => ipcRenderer.removeListener('batch-osm-progress', handler);
    },
    chooseOsmFile: () => ipcRenderer.invoke('batch-choose-osm-file'),
    cliJob: () => ipcRenderer.invoke('batch-cli-job'),
    cliLog: (line: string, isError?: boolean) => ipcRenderer.send('batch-cli-log', line, isError),
    cliDone: (code: number) => ipcRenderer.send('batch-cli-done', code),
  },
});
