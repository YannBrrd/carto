import { app, BrowserWindow, ipcMain, session, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;

// Get the correct icon path for the current platform
function getIconPath(): string {
  const iconDir = path.join(__dirname, '../../src/icon');

  if (process.platform === 'win32') {
    const icoPath = path.join(iconDir, 'icon.ico');
    if (fs.existsSync(icoPath)) {
      return icoPath;
    }
  }

  return path.join(iconDir, 'icon.png');
}

// Mitigate GPU process crashes on some Windows setups
app.disableHardwareAcceleration();

function createWindow() {
  // Set Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline' https://unpkg.com; " +
          "img-src 'self' data: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://*.openstreetmap.org https://unpkg.com blob:; " +
          "connect-src 'self' https://nominatim.openstreetmap.org https://overpass-api.de https://overpass.kumi.systems https://maps.mail.ru https://*.basemaps.cartocdn.com; " +
          "font-src 'self' data:; " +
          "worker-src 'self' blob:;"
        ]
      }
    });
  });

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    title: 'Carto - Interactive Map Editor',
  });

  // Load the index.html
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools in development only
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC handlers for file operations
ipcMain.handle('save-svg', async (event, svgContent: string, filename: string) => {
  const { dialog, shell } = require('electron');
  const fs = require('fs').promises;

  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: filename,
    filters: [
      { name: 'SVG Files', extensions: ['svg'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    await fs.writeFile(result.filePath, svgContent, 'utf-8');
    return { success: true, path: result.filePath };
  }

  return { success: false };
});

// Open file with system default application
ipcMain.handle('open-file', async (event, filePath: string) => {
  const { shell } = require('electron');
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Save PNG file
ipcMain.handle('save-png', async (event, pngDataUrl: string, filename: string) => {
  const { dialog } = require('electron');
  const fs = require('fs').promises;

  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: filename,
    filters: [
      { name: 'PNG Files', extensions: ['png'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    // Convert data URL to buffer
    const base64Data = pngDataUrl.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(result.filePath, buffer);
    return { success: true, path: result.filePath };
  }

  return { success: false };
});

// Save PDF file
ipcMain.handle('save-pdf', async (event, pdfDataUrl: string, filename: string) => {
  const { dialog } = require('electron');
  const fs = require('fs').promises;

  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: filename,
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    // Convert data URL to buffer
    const base64Data = pdfDataUrl.replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(result.filePath, buffer);
    return { success: true, path: result.filePath };
  }

  return { success: false };
});

// Open and read OSM XML file for offline mode
ipcMain.handle('open-osm-file', async () => {
  const { dialog } = require('electron');
  const fs = require('fs').promises;
  const path = require('path');

  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Ouvrir un fichier OSM',
    filters: [
      { name: 'Fichiers OSM', extensions: ['osm', 'xml'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        success: true,
        content,
        filePath,
        fileName: path.basename(filePath)
      };
    } catch (error) {
      return {
        success: false,
        error: `Erreur de lecture: ${String(error)}`
      };
    }
  }

  return { success: false };
});
