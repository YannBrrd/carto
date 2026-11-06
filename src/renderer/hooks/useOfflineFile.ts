/**
 * Offline mode: the toggle, the loaded .osm file and its persistence. The parsed file lives in
 * memory (osmData.ts) and survives the toggle; at startup the file saved last time is read
 * again from its path, and the map leaves Overpass only once a file is loaded.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { OfflineModeState } from '../types';
import { parseOSMXml } from '../utils/osmXmlParser';
import { setOfflineData, clearOfflineData } from '../utils/osmData';
import { loadOfflineModeState, saveOfflineModeState } from '../utils/offlineModeState';

export interface UseOfflineFileReturn {
  offlineMode: OfflineModeState;
  isLoadingOfflineFile: boolean;
  // Why the saved file could not be reloaded at startup
  loadError: string | null;
  // Whether the map draws the file rather than Overpass data
  useOfflineMode: boolean;
  toggleOfflineMode: (enabled: boolean) => void;
  selectOfflineFile: () => Promise<void>;
  clearOfflineFile: () => void;
}

interface OsmFileAnswer {
  success: boolean;
  content?: string;
  filePath?: string;
  fileName?: string;
  error?: string;
}

const NO_FILE = { filePath: null, fileName: null, dataBounds: null };

export function useOfflineFile(): UseOfflineFileReturn {
  const [offlineMode, setOfflineMode] = useState<OfflineModeState>(() => loadOfflineModeState());
  const [hasOfflineFile, setHasOfflineFile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Loading until the saved file, if any, has been read
  const [isLoadingOfflineFile, setIsLoadingOfflineFile] = useState(() => offlineMode.filePath !== null);
  const restoredRef = useRef(false);

  useEffect(() => {
    saveOfflineModeState(offlineMode);
  }, [offlineMode]);

  // Parses and keeps a file as the offline data set
  const loadFile = useCallback((answer: OsmFileAnswer) => {
    const parsed = parseOSMXml(answer.content!);
    setOfflineData(parsed.data, parsed.bounds);
    setHasOfflineFile(true);
    setLoadError(null);
    setOfflineMode(prev => ({
      ...prev,
      enabled: true,
      filePath: answer.filePath || null,
      fileName: answer.fileName || null,
      dataBounds: parsed.bounds,
    }));
  }, []);

  // The file saved last time is read again from its path; when it cannot be, it is forgotten
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const filePath = offlineMode.filePath;
    const readOsmFile = window.electronAPI?.readOsmFile;
    if (!filePath || !readOsmFile) {
      setIsLoadingOfflineFile(false);
      return;
    }
    let cancelled = false;
    (async () => {
      let failure: string;
      try {
        const answer = await readOsmFile(filePath);
        if (cancelled) return;
        if (answer.success && answer.content) {
          loadFile(answer);
          setIsLoadingOfflineFile(false);
          return;
        }
        failure = answer.error || 'Erreur de lecture';
      } catch (error) {
        if (cancelled) return;
        failure = error instanceof Error ? error.message : 'Erreur inconnue';
      }
      setOfflineMode(prev => ({ ...prev, ...NO_FILE }));
      setLoadError(`Le fichier ${offlineMode.fileName || filePath} n'a pas pu être rechargé : ${failure}`);
      setIsLoadingOfflineFile(false);
    })();
    return () => { cancelled = true; };
    // Runs once, with the state restored at startup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The loaded file is kept while the mode is off, so switching back on needs no new load
  const toggleOfflineMode = useCallback((enabled: boolean) => {
    setOfflineMode(prev => ({ ...prev, enabled }));
  }, []);

  const selectOfflineFile = useCallback(async () => {
    if (!window.electronAPI?.openOsmFile) return;
    setIsLoadingOfflineFile(true);
    try {
      const answer = await window.electronAPI.openOsmFile();
      if (answer.success && answer.content) loadFile(answer);
    } catch (error) {
      console.error('Error loading OSM file:', error);
      alert(`Erreur lors du chargement du fichier: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    } finally {
      setIsLoadingOfflineFile(false);
    }
  }, [loadFile]);

  const clearOfflineFile = useCallback(() => {
    clearOfflineData();
    setHasOfflineFile(false);
    setLoadError(null);
    setOfflineMode({ enabled: true, ...NO_FILE });
  }, []);

  return {
    offlineMode,
    isLoadingOfflineFile,
    loadError,
    useOfflineMode: offlineMode.enabled && hasOfflineFile,
    toggleOfflineMode,
    selectOfflineFile,
    clearOfflineFile,
  };
}
