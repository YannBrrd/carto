/**
 * Files of the batch through the main process (window.electronAPI.batch)
 */

import { BatchData, BatchIO } from './batchRunner';

export interface BatchApi {
  listKml(root: string): Promise<string[]>;
  readKml(root: string, path: string): Promise<string>;
  outputExists(root: string, path: string): Promise<boolean>;
  writeOutput(root: string, path: string, data: BatchData): Promise<void>;
}

/** Message of an error thrown in the main process, without the wrapping of the IPC */
export function ipcErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, '');
}

const unwrapped = async <T>(call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (error) {
    throw new Error(ipcErrorMessage(error));
  }
};

/** Batch files read from the input folder and written into the output folder */
export function ipcBatchIO(api: BatchApi, input: string, output: string): BatchIO {
  return {
    listKml: () => unwrapped(() => api.listKml(input)),
    readText: path => unwrapped(() => api.readKml(input, path)),
    exists: path => unwrapped(() => api.outputExists(output, path)),
    write: (path, data) => unwrapped(() => api.writeOutput(output, path, data)),
  };
}
