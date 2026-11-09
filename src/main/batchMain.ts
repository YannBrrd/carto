/**
 * Batch export in the main process: the file handlers of the batch (application and command
 * line), and the command line run, in a hidden window that runs the same batch as the
 * application and reports to the terminal.
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { listKmlFiles, outputExists, resolveInside, writeOutput, BatchOutputData } from './batchFiles';
import { writeErrorMessage } from './fileErrors';
import { CLI_USAGE, CliCommand } from './cliArgs';

/** Last profile of the application, used by the command line without --profile */
export const lastProfilePath = () => path.join(app.getPath('userData'), 'batch-profile.json');

async function readTextOrNull(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

export function registerBatchHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('batch-list-kml', (_event, root: string) => listKmlFiles(root));
  ipcMain.handle('batch-read-kml', (_event, root: string, relative: string) => fs.readFile(resolveInside(root, relative), 'utf8'));
  ipcMain.handle('batch-output-exists', (_event, root: string, relative: string) => outputExists(root, relative));
  ipcMain.handle('batch-write-output', async (_event, root: string, relative: string, data: BatchOutputData) => {
    try {
      await writeOutput(root, relative, data);
    } catch (error) {
      throw new Error(writeErrorMessage(error, relative));
    }
  });

  ipcMain.handle('batch-choose-folder', async (_event, title: string) => {
    const options: Electron.OpenDialogOptions = { title, properties: ['openDirectory', 'createDirectory'] };
    const window = getWindow();
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('batch-load-profile', () => readTextOrNull(lastProfilePath()));
  ipcMain.handle('batch-save-profile', (_event, json: string) => fs.writeFile(lastProfilePath(), json, 'utf8'));
  ipcMain.handle('batch-export-profile', async (_event, json: string) => {
    const options: Electron.SaveDialogOptions = {
      defaultPath: 'profil-lot.json',
      filters: [{ name: 'Profil de lot', extensions: ['json'] }],
    };
    const window = getWindow();
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { success: false };
    try {
      await fs.writeFile(result.filePath, json, 'utf8');
      return { success: true, path: result.filePath };
    } catch (error) {
      return { success: false, error: writeErrorMessage(error, result.filePath) };
    }
  });
  ipcMain.handle('batch-open-path', (_event, target: string) => shell.openPath(target));
}

const print = (line: string, isError = false) => (isError ? process.stderr : process.stdout).write(`${line}\n`);

/**
 * Runs the command of the command line instead of the application. `openWindow` opens the
 * renderer in a hidden window whose page runs the job (mode=batch-cli).
 */
export async function runCliCommand(
  command: Exclude<CliCommand, { mode: 'gui' }>,
  openWindow: () => BrowserWindow
): Promise<void> {
  if (command.mode === 'help') {
    print(CLI_USAGE);
    app.exit(0);
    return;
  }
  if (command.mode === 'error') {
    print(`Erreur : ${command.message}\n\n${CLI_USAGE}`, true);
    app.exit(2);
    return;
  }

  const input = path.resolve(command.input);
  const output = path.resolve(command.output);
  try {
    if (!(await fs.stat(input)).isDirectory()) throw new Error();
  } catch {
    print(`Erreur : dossier des KML introuvable : ${input}`, true);
    app.exit(2);
    return;
  }

  let profileText: string | null;
  if (command.profile) {
    profileText = await readTextOrNull(path.resolve(command.profile));
    if (profileText === null) {
      print(`Erreur : profil illisible : ${path.resolve(command.profile)}`, true);
      app.exit(2);
      return;
    }
  } else {
    profileText = await readTextOrNull(lastProfilePath());
    print(profileText === null ? 'Profil : réglages par défaut' : `Profil : ${lastProfilePath()}`);
  }

  await fs.mkdir(output, { recursive: true });
  const job = { input, output, profileText, formats: command.formats, overwrite: command.overwrite };

  let finished = false;
  ipcMain.handle('batch-cli-job', () => job);
  ipcMain.on('batch-cli-log', (_event, line: string, isError?: boolean) => print(line, isError));
  ipcMain.on('batch-cli-done', (_event, code: number) => {
    finished = true;
    app.exit(code);
  });

  const window = openWindow();
  window.webContents.on('render-process-gone', (_event, details) => {
    print(`Erreur : le rendu s'est arrêté (${details.reason}).`, true);
    app.exit(2);
  });
  window.on('closed', () => {
    if (!finished) app.exit(2);
  });
}
