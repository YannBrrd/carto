/**
 * Hook for export functionality (SVG, PNG, JPEG, georeferenced PDF, KML of the zones)
 */

import { useState, useCallback } from 'react';
import L from 'leaflet';
import { RenderStyle, ColorOverridesState, MultiZoneState } from '../types';
import { generateSVG, exportFrame, ExportFrame } from '../utils/svgGenerator';
import { fetchOSMData } from '../utils/osmData';
import { zonesToKml } from '../utils/kml';
import { usePreference, PREF_KEYS } from './usePreferences';
import {
  svgToCanvas, encodeCanvas, releaseCanvas, dataUrlSizeKB, encodePngUnderLimit, encodeJpegUnderLimit, buildGeoPdf, bestUnderLimit, Encoded,
} from '../utils/rasterExport';

export type ExportFormat = 'svg' | 'png' | 'jpeg' | 'pdf' | 'kml';

export interface ExportOptions {
  forceAllLabels: boolean;
  borderColor: string;
  exteriorOverlay: boolean;
  exteriorOverlayOpacity: number;
  showPOI: boolean;
  showCompass: boolean;
  maxExportSizeEnabled: boolean;
  maxExportSizeKB: number;
  minQualityPercent: number; // 10-100: minimum quality/scale when size limiting is enabled
  kmlAlongside: boolean; // Also write the zones as KML beside the exported map
}

export interface ExportState {
  isExporting: boolean;
  exportFormat: ExportFormat;
  lastExportedFile: { path: string; name: string } | null;
}

export interface UseExportReturn {
  // State
  isExporting: boolean;
  exportFormat: ExportFormat;
  lastExportedFile: { path: string; name: string } | null;
  // Setters
  setExportFormat: (format: ExportFormat) => void;
  // Actions
  handleExport: () => Promise<void>;
}

export function useExport(
  map: L.Map | null,
  multiZoneState: MultiZoneState,
  activeStyle: RenderStyle,
  options: ExportOptions,
  colorOverrides: ColorOverridesState | undefined,
  useOfflineMode: boolean,
  setStatusMessage: (msg: string) => void
): UseExportReturn {
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = usePreference<ExportFormat>(PREF_KEYS.EXPORT_FORMAT, 'png');
  const [lastExportedFile, setLastExportedFile] = useState<{ path: string; name: string } | null>(null);

  // Export format is automatically persisted by usePreference hook

  // The map file is saved: remember it, then write the KML of the zones beside it if asked.
  // The map export is done whatever happens to the KML: its outcome only completes the message
  const finishMapExport = useCallback(async (
    label: string,
    result: { success: boolean; path?: string; error?: string },
    sizeKB?: number
  ) => {
    if (!result.success || !result.path) {
      setStatusMessage(result.error ? `Erreur: ${result.error}` : 'Export annulé.');
      return;
    }
    const fileName = result.path.split(/[/\\]/).pop() || result.path;
    setLastExportedFile({ path: result.path, name: fileName });
    let message = `${label} exporté: ${result.path}`;
    if (sizeKB !== undefined) message += ` (${sizeKB.toFixed(0)} Ko)`;
    if (options.kmlAlongside) {
      const kml = zonesToKml(multiZoneState.zones, { borderColor: options.borderColor });
      const kmlResult = await window.electronAPI.saveKmlBeside(kml, result.path);
      if (kmlResult.success && kmlResult.path) {
        message += `, KML: ${kmlResult.path}`;
      } else if (kmlResult.cancelled) {
        message += `, KML existant conservé: ${kmlResult.path}`;
      } else {
        message += `. Erreur KML: ${kmlResult.error ?? 'écriture impossible'}`;
      }
    }
    setStatusMessage(message);
  }, [options.kmlAlongside, options.borderColor, multiZoneState.zones, setStatusMessage]);

  // Prepare export data (common logic for the map formats): the SVG and its frame
  const prepareExport = useCallback(async (): Promise<{ svg: string; frame: ExportFrame } | null> => {
    if (multiZoneState.zones.length === 0 || !map) {
      setStatusMessage('Veuillez d\'abord dessiner au moins une zone.');
      return null;
    }

    // Get bounds for fetching OSM data (use context bounds or calculate from zones)
    const bounds = multiZoneState.contextBounds || multiZoneState.zones[0]?.bounds;
    if (!bounds) {
      setStatusMessage('Erreur: impossible de déterminer les limites.');
      return null;
    }

    // Always fetch OSM data for export bounds (fetchOSMData has its own cache that verifies bounds)
    const dataToExport = await fetchOSMData(bounds, useOfflineMode);

    // Generate SVG with current active style and all zones
    const svg = generateSVG(dataToExport, multiZoneState.zones, multiZoneState.contextBounds, activeStyle, map, {
      forceAllLabels: options.forceAllLabels,
      borderColor: options.borderColor,
      exteriorOverlay: options.exteriorOverlay,
      exteriorOverlayOpacity: options.exteriorOverlayOpacity,
      showPOI: options.showPOI,
      showCompass: options.showCompass,
    }, colorOverrides);
    // Same bounds and map state as the SVG
    return { svg, frame: exportFrame(bounds, map) };
  }, [map, multiZoneState, activeStyle, options, colorOverrides, useOfflineMode, setStatusMessage]);

  const prepareExportData = useCallback(async (): Promise<string | null> => {
    return (await prepareExport())?.svg ?? null;
  }, [prepareExport]);

  const exportSVG = useCallback(async () => {
    setIsExporting(true);
    setStatusMessage('Génération du SVG...');

    try {
      const svgContent = await prepareExportData();
      if (!svgContent) {
        setIsExporting(false);
        return;
      }

      // Save using Electron API
      if (window.electronAPI) {
        const result = await window.electronAPI.saveSvg(svgContent, 'carte.svg');
        await finishMapExport('SVG', result);
      } else {
        throw new Error('API Electron non disponible. Veuillez redémarrer l\'application.');
      }
    } catch (error) {
      console.error('Error exporting SVG:', error);
      setStatusMessage(`Erreur: ${error instanceof Error ? error.message : 'Export failed'}`);
    } finally {
      setIsExporting(false);
    }
  }, [prepareExportData, finishMapExport, setStatusMessage]);

  // Status line of a size search step
  const optimizationStep = useCallback((step: number, steps: number) => {
    setStatusMessage(`Optimisation... (${step}/${steps})`);
  }, [setStatusMessage]);

  // Warns when even the lowest setting is over the size limit
  const warnOverLimit = useCallback((encoded: Encoded<unknown>) => {
    if (encoded.overLimit) {
      setStatusMessage(`Attention: taille minimale (${encoded.sizeKB.toFixed(0)} Ko) dépasse la limite`);
    }
  }, [setStatusMessage]);

  const minQuality = (options.minQualityPercent || 25) / 100;

  const exportPNG = useCallback(async () => {
    setIsExporting(true);
    setStatusMessage('Génération du PNG...');
    try {
      const prepared = await prepareExport();
      if (!prepared) return;
      const { svg, frame } = prepared;
      const dimensions = { width: frame.width, height: frame.height };

      let pngDataUrl: string;
      if (options.maxExportSizeEnabled) {
        setStatusMessage('Estimation de la taille...');
        const encoded = await encodePngUnderLimit(svg, dimensions, {
          minScale: minQuality, maxScale: 3, maxKB: options.maxExportSizeKB,
        }, optimizationStep);
        warnOverLimit(encoded);
        pngDataUrl = encoded.data;
      } else {
        const canvas = await svgToCanvas(svg, 2, dimensions);
        try {
          pngDataUrl = encodeCanvas(canvas, 'png');
        } finally {
          releaseCanvas(canvas);
        }
      }

      if (!window.electronAPI) throw new Error('API Electron non disponible. Veuillez redémarrer l\'application.');
      const result = await window.electronAPI.savePng(pngDataUrl, 'carte.png');
      await finishMapExport('PNG', result, dataUrlSizeKB(pngDataUrl));
    } catch (error) {
      console.error('Error exporting PNG:', error);
      setStatusMessage(`Erreur: ${error instanceof Error ? error.message : 'Export failed'}`);
    } finally {
      setIsExporting(false);
    }
  }, [prepareExport, finishMapExport, options.maxExportSizeEnabled, options.maxExportSizeKB, minQuality, optimizationStep, warnOverLimit, setStatusMessage]);

  const exportJPEG = useCallback(async () => {
    setIsExporting(true);
    setStatusMessage('Génération du JPEG...');
    let canvas: HTMLCanvasElement | null = null;
    try {
      const prepared = await prepareExport();
      if (!prepared) return;
      const { svg, frame } = prepared;
      canvas = await svgToCanvas(svg, 2, { width: frame.width, height: frame.height });

      let jpegDataUrl: string;
      if (options.maxExportSizeEnabled) {
        setStatusMessage('Estimation de la taille...');
        const encoded = await encodeJpegUnderLimit(canvas, { minQuality, maxKB: options.maxExportSizeKB }, optimizationStep);
        warnOverLimit(encoded);
        jpegDataUrl = encoded.data;
      } else {
        jpegDataUrl = encodeCanvas(canvas, 'jpeg', 0.92);
      }

      if (!window.electronAPI) throw new Error('API Electron non disponible. Veuillez redémarrer l\'application.');
      const result = await window.electronAPI.saveJpeg(jpegDataUrl, 'carte.jpg');
      await finishMapExport('JPEG', result, dataUrlSizeKB(jpegDataUrl));
    } catch (error) {
      console.error('Error exporting JPEG:', error);
      setStatusMessage(`Erreur: ${error instanceof Error ? error.message : 'Export failed'}`);
    } finally {
      if (canvas) releaseCanvas(canvas);
      setIsExporting(false);
    }
  }, [prepareExport, finishMapExport, options.maxExportSizeEnabled, options.maxExportSizeKB, minQuality, optimizationStep, warnOverLimit, setStatusMessage]);

  const exportPDF = useCallback(async () => {
    setIsExporting(true);
    setStatusMessage('Génération du PDF...');
    let canvas: HTMLCanvasElement | null = null;
    try {
      const prepared = await prepareExport();
      if (!prepared) return;
      const { svg, frame } = prepared;
      // 1.5x is enough for a page: its quality comes mostly from the JPEG quality
      canvas = await svgToCanvas(svg, 1.5, { width: frame.width, height: frame.height });
      const drawn = canvas;
      const pdfOf = (quality: number) => buildGeoPdf(drawn, frame, quality);
      const sizeKB = (buffer: ArrayBuffer) => buffer.byteLength / 1024;

      let pdfBuffer: ArrayBuffer;
      if (options.maxExportSizeEnabled) {
        setStatusMessage('Estimation de la taille...');
        const encoded = await bestUnderLimit(pdfOf, sizeKB, minQuality, 0.95, options.maxExportSizeKB, optimizationStep);
        warnOverLimit(encoded);
        pdfBuffer = encoded.data;
      } else {
        pdfBuffer = pdfOf(0.92);
      }

      if (!window.electronAPI) throw new Error('API Electron non disponible. Veuillez redémarrer l\'application.');
      const result = await window.electronAPI.savePdfBuffer(pdfBuffer, 'carte.pdf');
      await finishMapExport('PDF', result, sizeKB(pdfBuffer));
    } catch (error) {
      console.error('Error exporting PDF:', error);
      setStatusMessage(`Erreur: ${error instanceof Error ? error.message : 'Export failed'}`);
    } finally {
      if (canvas) releaseCanvas(canvas);
      setIsExporting(false);
    }
  }, [prepareExport, finishMapExport, options.maxExportSizeEnabled, options.maxExportSizeKB, minQuality, optimizationStep, warnOverLimit, setStatusMessage]);

  // The zones as drawn, without map data
  const exportKML = useCallback(async () => {
    if (multiZoneState.zones.length === 0) {
      setStatusMessage('Veuillez d\'abord dessiner au moins une zone.');
      return;
    }
    setIsExporting(true);
    try {
      if (!window.electronAPI) {
        throw new Error('API Electron non disponible. Veuillez redémarrer l\'application.');
      }
      const kml = zonesToKml(multiZoneState.zones, { borderColor: options.borderColor });
      const result = await window.electronAPI.saveKml(kml, 'zones.kml');
      if (result.success && result.path) {
        const fileName = result.path.split(/[/\\]/).pop() || 'zones.kml';
        setLastExportedFile({ path: result.path, name: fileName });
        setStatusMessage(`KML exporté: ${result.path}`);
      } else if (result.error) {
        setStatusMessage(`Erreur: ${result.error}`);
      } else {
        setStatusMessage('Export annulé.');
      }
    } catch (error) {
      console.error('Error exporting KML:', error);
      setStatusMessage(`Erreur: ${error instanceof Error ? error.message : 'Export failed'}`);
    } finally {
      setIsExporting(false);
    }
  }, [multiZoneState.zones, options.borderColor, setStatusMessage]);

  const handleExport = useCallback(async () => {
    switch (exportFormat) {
      case 'svg':
        await exportSVG();
        break;
      case 'png':
        await exportPNG();
        break;
      case 'jpeg':
        await exportJPEG();
        break;
      case 'pdf':
        await exportPDF();
        break;
      case 'kml':
        await exportKML();
        break;
    }
  }, [exportFormat, exportSVG, exportPNG, exportJPEG, exportPDF, exportKML]);

  return {
    isExporting,
    exportFormat,
    lastExportedFile,
    setExportFormat,
    handleExport,
  };
}
