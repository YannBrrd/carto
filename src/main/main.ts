import { app, BrowserWindow, ipcMain, session, nativeImage, Menu, dialog, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

let mainWindow: BrowserWindow | null = null;

// Auto-updater configuration
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater() {
  // Check for updates (only in production)
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch(() => {
      // Silently ignore update check errors
    });
  }

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    });
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', {
      version: info.version
    });
  });

  autoUpdater.on('error', (error) => {
    mainWindow?.webContents.send('update-error', error.message);
  });
}

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

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Fichier',
      submenu: [
        { role: 'quit', label: 'Quitter' }
      ]
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger' },
        { role: 'forceReload', label: 'Forcer le rechargement' },
        { role: 'toggleDevTools', label: 'Outils de développement' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom par défaut' },
        { role: 'zoomIn', label: 'Zoom avant' },
        { role: 'zoomOut', label: 'Zoom arrière' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' }
      ]
    },
    {
      label: 'Aide',
      submenu: [
        {
          label: 'Vérifier les mises à jour...',
          click: async () => {
            if (!app.isPackaged) {
              dialog.showMessageBox(mainWindow!, {
                type: 'info',
                title: 'Mises à jour',
                message: 'Mode développement',
                detail: 'La vérification des mises à jour est désactivée en mode développement.',
                buttons: ['OK']
              });
              return;
            }
            try {
              const result = await autoUpdater.checkForUpdates();
              if (result?.updateInfo?.version && result.updateInfo.version !== app.getVersion()) {
                const response = await dialog.showMessageBox(mainWindow!, {
                  type: 'info',
                  title: 'Mise à jour disponible',
                  message: `Version ${result.updateInfo.version} disponible`,
                  detail: `Une nouvelle version de Carto est disponible.\n\nVersion actuelle: ${app.getVersion()}\nNouvelle version: ${result.updateInfo.version}\n\nVoulez-vous télécharger la mise à jour ?`,
                  buttons: ['Télécharger', 'Plus tard'],
                  defaultId: 0
                });
                if (response.response === 0) {
                  autoUpdater.downloadUpdate();
                }
              } else {
                dialog.showMessageBox(mainWindow!, {
                  type: 'info',
                  title: 'Mises à jour',
                  message: 'Aucune mise à jour disponible',
                  detail: `Vous utilisez la dernière version de Carto (${app.getVersion()}).`,
                  buttons: ['OK']
                });
              }
            } catch (error) {
              dialog.showMessageBox(mainWindow!, {
                type: 'error',
                title: 'Erreur',
                message: 'Impossible de vérifier les mises à jour',
                detail: `Une erreur s'est produite lors de la vérification.\n\n${String(error)}`,
                buttons: ['OK']
              });
            }
          }
        },
        { type: 'separator' },
        {
          label: 'À propos',
          click: () => {
            const iconPath = getIconPath();
            const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'À propos de Carto',
              message: 'Carto',
              detail: `Version: ${app.getVersion()}\n\nÉditeur de cartes interactif avec données OpenStreetMap et export SVG/PNG/PDF.\n\nLicence: GPL-3.0\n\n© 2024-2025 Yann Barraud`,
              icon: icon,
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.on('ready', () => {
  createWindow();
  createMenu();
  setupAutoUpdater();
});

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

// Helper function for saving files with dialog
interface SaveFileOptions {
  filename: string;
  filterName: string;
  extensions: string[];
  dataUrlPrefix: RegExp;
  isText?: boolean;
}

async function saveFileWithDialog(
  data: string,
  options: SaveFileOptions
): Promise<{ success: boolean; path?: string }> {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: options.filename,
    filters: [
      { name: options.filterName, extensions: options.extensions },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    if (options.isText) {
      await fsPromises.writeFile(result.filePath, data, 'utf-8');
    } else {
      const base64Data = data.replace(options.dataUrlPrefix, '');
      const buffer = Buffer.from(base64Data, 'base64');
      await fsPromises.writeFile(result.filePath, buffer);
    }
    return { success: true, path: result.filePath };
  }

  return { success: false };
}

// IPC handlers for file operations
ipcMain.handle('save-svg', async (_event, svgContent: string, filename: string) => {
  return saveFileWithDialog(svgContent, {
    filename,
    filterName: 'SVG Files',
    extensions: ['svg'],
    dataUrlPrefix: /^$/,
    isText: true
  });
});

ipcMain.handle('save-png', async (_event, pngDataUrl: string, filename: string) => {
  return saveFileWithDialog(pngDataUrl, {
    filename,
    filterName: 'PNG Files',
    extensions: ['png'],
    dataUrlPrefix: /^data:image\/png;base64,/
  });
});

ipcMain.handle('save-jpeg', async (_event, jpegDataUrl: string, filename: string) => {
  return saveFileWithDialog(jpegDataUrl, {
    filename,
    filterName: 'JPEG Files',
    extensions: ['jpg', 'jpeg'],
    dataUrlPrefix: /^data:image\/jpeg;base64,/
  });
});

ipcMain.handle('save-pdf', async (_event, pdfDataUrl: string, filename: string) => {
  return saveFileWithDialog(pdfDataUrl, {
    filename,
    filterName: 'PDF Files',
    extensions: ['pdf'],
    dataUrlPrefix: /^data:application\/pdf[^,]*,/
  });
});

// Open file with system default application
ipcMain.handle('open-file', async (_event, filePath: string) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Open and read OSM XML file for offline mode
ipcMain.handle('open-osm-file', async () => {
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
      const content = await fsPromises.readFile(filePath, 'utf-8');
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

// Auto-update IPC handlers
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    return { available: false, message: 'Updates disabled in development' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { available: !!result?.updateInfo, version: result?.updateInfo?.version };
  } catch (error) {
    return { available: false, error: String(error) };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    const downloadPromise = autoUpdater.downloadUpdate();
    // Ensure the promise resolves
    if (downloadPromise) {
      await downloadPromise;
    }
    return { success: true };
  } catch (error) {
    console.error('Download update error:', error);
    mainWindow?.webContents.send('update-error', String(error));
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});
