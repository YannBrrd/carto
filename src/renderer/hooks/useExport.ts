/**
 * Hook for export functionality (SVG, PNG, JPEG, PDF)
 */

import { useState, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import L from 'leaflet';
import { RenderStyle, ColorOverridesState, MultiZoneState } from '../types';
import { generateSVG } from '../utils/svgGenerator';
import { fetchOSMData } from '../utils/osmData';

export type ExportFormat = 'svg' | 'png' | 'jpeg' | 'pdf';

export interface ExportOptions {
  forceAllLabels: boolean;
  borderColor: string;
  exteriorOverlay: boolean;
  exteriorOverlayOpacity: number;
  showPOI: boolean;
  showCompass: boolean;
  maxExportSizeEnabled: boolean;
  maxExportSizeKB: number;
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

// Helper to get data URL size in KB (with validation)
function getDataUrlSizeKB(dataUrl: string): number {
  const parts = dataUrl.split(',');
  if (parts.length < 2) {
    console.warn('Invalid data URL format');
    return 0;
  }
  const base64 = parts[1];
  // Base64 encodes 3 bytes as 4 characters, minus padding
  const padding = (base64.match(/=+$/) || [''])[0].length;
  return ((base64.length * 3 / 4) - padding) / 1024;
}

// Helper function to release canvas memory (helps GC with large canvases)
function releaseCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  canvas.width = 0;
  canvas.height = 0;
}

// Parse SVG dimensions without creating a canvas (for reuse optimization)
function parseSvgDimensions(svgContent: string): { width: number; height: number } {
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svgElement = svgDoc.documentElement;
  return {
    width: parseFloat(svgElement.getAttribute('width') || '800'),
    height: parseFloat(svgElement.getAttribute('height') || '600')
  };
}

// Helper function to convert SVG to canvas
// Accepts optional pre-computed dimensions to avoid re-parsing SVG
async function svgToCanvas(
  svgContent: string,
  scale: number = 2,
  dimensions?: { width: number; height: number }
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    // Use pre-computed dimensions or parse them
    const { width, height } = dimensions || parseSvgDimensions(svgContent);

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      releaseCanvas(canvas); // Free memory on error
      reject(new Error('Impossible de créer le contexte canvas'));
      return;
    }

    // Create image from SVG
    const img = new Image();
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      releaseCanvas(canvas); // Free memory on error
      reject(new Error('Erreur lors du chargement de l\'image SVG'));
    };

    img.src = url;
  });
}

// Quantize canvas colors to reduce PNG size (posterization)
function quantizeCanvas(canvas: HTMLCanvasElement, levels: number = 32): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Reduce color levels (posterization)
  const step = 256 / levels;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(data[i] / step) * step;     // R
    data[i + 1] = Math.round(data[i + 1] / step) * step; // G
    data[i + 2] = Math.round(data[i + 2] / step) * step; // B
    // Alpha (data[i + 3]) remains unchanged
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
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
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png');
  const [lastExportedFile, setLastExportedFile] = useState<{ path: string; name: string } | null>(null);

  // Prepare export data (common logic for all export formats)
  const prepareExportData = useCallback(async (): Promise<string | null> => {
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
    return generateSVG(dataToExport, multiZoneState.zones, multiZoneState.contextBounds, activeStyle, map, {
      forceAllLabels: options.forceAllLabels,
      borderColor: options.borderColor,
      exteriorOverlay: options.exteriorOverlay,
      exteriorOverlayOpacity: options.exteriorOverlayOpacity,
      showPOI: options.showPOI,
      showCompass: options.showCompass,
    }, colorOverrides);
  }, [map, multiZoneState, activeStyle, options, colorOverrides, useOfflineMode, setStatusMessage]);

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
        if (result.success && result.path) {
          const fileName = result.path.split(/[/\\]/).pop() || 'carte.svg';
          setLastExportedFile({ path: result.path, name: fileName });
          setStatusMessage(`SVG exporté: ${result.path}`);
        } else if (result.error) {
          setStatusMessage(`Erreur: ${result.error}`);
        } else {
          setStatusMessage('Export annulé.');
        }
      } else {
        throw new Error('API Electron non disponible. Veuillez redémarrer l\'application.');
      }
    } catch (error) {
      console.error('Error exporting SVG:', error);
      setStatusMessage(`Erreur: ${error instanceof Error ? error.message : 'Export failed'}`);
    } finally {
      setIsExporting(false);
    }
  }, [prepareExportData, setStatusMessage]);

  const exportPNG = useCallback(async () => {
    setIsExporting(true);
    setStatusMessage('Génération du PNG...');

    // Track all canvases for cleanup in case of error
    const canvasesToRelease: HTMLCanvasElement[] = [];

    // Helper to create canvas and track it for cleanup
    const createTrackedCanvas = async (scale: number): Promise<HTMLCanvasElement> => {
      const canvas = await svgToCanvas(svgContent!, scale);
      canvasesToRelease.push(canvas);
      return canvas;
    };

    // Helper to release a canvas and remove from tracking
    const releaseTrackedCanvas = (canvas: HTMLCanvasElement) => {
      releaseCanvas(canvas);
      const idx = canvasesToRelease.indexOf(canvas);
      if (idx !== -1) canvasesToRelease.splice(idx, 1);
    };

    let svgContent: string | null = null;

    try {
      svgContent = await prepareExportData();
      if (!svgContent) {
        setIsExporting(false);
        return;
      }

      let pngDataUrl: string;

      // If max size is enabled, use binary search to find optimal scale
      if (options.maxExportSizeEnabled) {
        let lowScale = 0.1;
        let highScale = 3.0;
        let bestDataUrl = '';

        // First check at high scale to estimate how far we are
        setStatusMessage('Estimation de la taille...');
        const highCanvas = await createTrackedCanvas(highScale);
        const highDataUrl = highCanvas.toDataURL('image/png');
        const highSize = getDataUrlSizeKB(highDataUrl);
        releaseTrackedCanvas(highCanvas);

        if (highSize <= options.maxExportSizeKB) {
          // Already under limit at max quality! Re-render at this scale for final output
          const finalCanvas = await createTrackedCanvas(highScale);
          pngDataUrl = finalCanvas.toDataURL('image/png');
          releaseTrackedCanvas(finalCanvas);
        } else {
          // Estimate optimal scale based on size ratio (size scales ~quadratically with scale)
          const ratio = options.maxExportSizeKB / highSize;
          const estimatedScale = highScale * Math.sqrt(ratio) * 0.9; // 0.9 safety margin
          highScale = Math.min(highScale, Math.max(estimatedScale * 1.5, 0.5));

          // Check minimum scale
          const minCanvas = await createTrackedCanvas(lowScale);
          const minDataUrl = minCanvas.toDataURL('image/png');
          const minSize = getDataUrlSizeKB(minDataUrl);
          releaseTrackedCanvas(minCanvas);

          if (minSize > options.maxExportSizeKB) {
            // Even minimum scale exceeds limit - try quantization
            setStatusMessage('Application de la quantization...');
            let quantizedDataUrl = minDataUrl;
            let quantizedSize = minSize;

            // Try progressively stronger quantization (fewer colors)
            for (const levels of [64, 32, 16, 8]) {
              const freshCanvas = await createTrackedCanvas(lowScale);
              quantizeCanvas(freshCanvas, levels);
              const qDataUrl = freshCanvas.toDataURL('image/png');
              const qSize = getDataUrlSizeKB(qDataUrl);
              releaseTrackedCanvas(freshCanvas);

              if (qSize <= options.maxExportSizeKB) {
                quantizedDataUrl = qDataUrl;
                quantizedSize = qSize;
                break;
              } else if (qSize < quantizedSize) {
                quantizedDataUrl = qDataUrl;
                quantizedSize = qSize;
              }
            }

            pngDataUrl = quantizedDataUrl;
            if (quantizedSize > options.maxExportSizeKB) {
              setStatusMessage(`Attention: taille minimale (${quantizedSize.toFixed(0)} Ko) dépasse la limite`);
            }
          } else {
            bestDataUrl = minDataUrl;

            // Binary search with adjusted bounds and early termination
            const EPSILON = 0.01; // Stop when scale difference is negligible
            for (let i = 0; i < 6 && (highScale - lowScale) > EPSILON; i++) {
              const midScale = (lowScale + highScale) / 2;
              setStatusMessage(`Optimisation... (${i + 1}/6)`);

              const canvas = await createTrackedCanvas(midScale);
              const dataUrl = canvas.toDataURL('image/png');
              const sizeKB = getDataUrlSizeKB(dataUrl);
              releaseTrackedCanvas(canvas);

              if (sizeKB <= options.maxExportSizeKB) {
                bestDataUrl = dataUrl;
                lowScale = midScale;
              } else {
                highScale = midScale;
              }
            }

            pngDataUrl = bestDataUrl;
          }
        }
      } else {
        // No size limit, use full quality
        const canvas = await createTrackedCanvas(2);
        pngDataUrl = canvas.toDataURL('image/png');
        releaseTrackedCanvas(canvas);
      }

      // Save using Electron API
      if (window.electronAPI) {
        const result = await window.electronAPI.savePng(pngDataUrl, 'carte.png');
        if (result.success && result.path) {
          const fileName = result.path.split(/[/\\]/).pop() || 'carte.png';
          setLastExportedFile({ path: result.path, name: fileName });
          const finalSizeKB = getDataUrlSizeKB(pngDataUrl);
          setStatusMessage(`PNG exporté: ${result.path} (${finalSizeKB.toFixed(0)} Ko)`);
        } else if (result.error) {
          setStatusMessage(`Erreur: ${result.error}`);
        } else {
          setStatusMessage('Export annulé.');
        }
      } else {
        throw new Error('API Electron non disponible. Veuillez redémarrer l\'application.');
      }
    } catch (error) {
      console.error('Error exporting PNG:', error);
      setStatusMessage(`Erreur: ${error instanceof Error ? error.message : 'Export failed'}`);
    } finally {
      // Release any remaining canvases that weren't cleaned up due to error
      for (const canvas of canvasesToRelease) {
        releaseCanvas(canvas);
      }
      setIsExporting(false);
    }
  }, [prepareExportData, options.maxExportSizeEnabled, options.maxExportSizeKB, setStatusMessage]);

  const exportJPEG = useCallback(async () => {
    setIsExporting(true);
    setStatusMessage('Génération du JPEG...');

    // Track canvas for cleanup in case of error
    let canvas: HTMLCanvasElement | null = null;

    try {
      const svgContent = await prepareExportData();
      if (!svgContent) {
        setIsExporting(false);
        return;
      }

      let jpegDataUrl: string;

      // If max size is enabled, use binary search to find optimal quality
      if (options.maxExportSizeEnabled) {
        let lowQuality = 0.1;
        let highQuality = 0.95;
        let bestDataUrl = '';

        // First check at high quality
        setStatusMessage('Estimation de la taille...');
        canvas = await svgToCanvas(svgContent, 2);
        const highDataUrl = canvas.toDataURL('image/jpeg', highQuality);
        const highSize = getDataUrlSizeKB(highDataUrl);

        if (highSize <= options.maxExportSizeKB) {
          // Already under limit at max quality!
          jpegDataUrl = highDataUrl;
        } else {
          // Check minimum quality
          const minDataUrl = canvas.toDataURL('image/jpeg', lowQuality);
          const minSize = getDataUrlSizeKB(minDataUrl);

          if (minSize > options.maxExportSizeKB) {
            // Even minimum quality exceeds limit
            jpegDataUrl = minDataUrl;
            setStatusMessage(`Attention: taille minimale (${minSize.toFixed(0)} Ko) dépasse la limite`);
          } else {
            bestDataUrl = minDataUrl;

            // Binary search to find optimal quality with early termination
            const EPSILON = 0.01; // Stop when quality difference is negligible
            for (let i = 0; i < 6 && (highQuality - lowQuality) > EPSILON; i++) {
              const midQuality = (lowQuality + highQuality) / 2;
              setStatusMessage(`Optimisation qualité... (${i + 1}/6)`);

              const dataUrl = canvas.toDataURL('image/jpeg', midQuality);
              const sizeKB = getDataUrlSizeKB(dataUrl);

              if (sizeKB <= options.maxExportSizeKB) {
                bestDataUrl = dataUrl;
                lowQuality = midQuality;
              } else {
                highQuality = midQuality;
              }
            }

            jpegDataUrl = bestDataUrl;
          }
        }
      } else {
        // No size limit, use high quality
        canvas = await svgToCanvas(svgContent, 2);
        jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      }

      // Save using Electron API
      if (window.electronAPI) {
        const result = await window.electronAPI.saveJpeg(jpegDataUrl, 'carte.jpg');
        if (result.success && result.path) {
          const fileName = result.path.split(/[/\\]/).pop() || 'carte.jpg';
          setLastExportedFile({ path: result.path, name: fileName });
          const finalSizeKB = getDataUrlSizeKB(jpegDataUrl);
          setStatusMessage(`JPEG exporté: ${result.path} (${finalSizeKB.toFixed(0)} Ko)`);
        } else if (result.error) {
          setStatusMessage(`Erreur: ${result.error}`);
        } else {
          setStatusMessage('Export annulé.');
        }
      } else {
        throw new Error('API Electron non disponible. Veuillez redémarrer l\'application.');
      }
    } catch (error) {
      console.error('Error exporting JPEG:', error);
      setStatusMessage(`Erreur: ${error instanceof Error ? error.message : 'Export failed'}`);
    } finally {
      // Always release canvas memory, even on error
      if (canvas) {
        releaseCanvas(canvas);
      }
      setIsExporting(false);
    }
  }, [prepareExportData, options.maxExportSizeEnabled, options.maxExportSizeKB, setStatusMessage]);

  const exportPDF = useCallback(async () => {
    setIsExporting(true);
    setStatusMessage('Génération du PDF...');

    // Track canvas for cleanup in case of error
    let canvas: HTMLCanvasElement | null = null;

    try {
      const svgContent = await prepareExportData();
      if (!svgContent) {
        setIsExporting(false);
        return;
      }

      // Parse SVG dimensions once (Fix 4: avoid re-parsing)
      const svgDimensions = parseSvgDimensions(svgContent);
      const { width: svgWidth, height: svgHeight } = svgDimensions;

      // Create canvas once for reuse in binary search (Fix 1: reuse canvas)
      // Use 1.5x scale instead of 2x for PDF - reduces encoding time significantly
      // PDF quality is mainly determined by JPEG quality, not canvas size
      canvas = await svgToCanvas(svgContent, 1.5, svgDimensions);

      // Helper to generate PDF with given JPEG quality (0-1)
      // Reuses the same canvas instead of creating a new one each time
      const generatePDFWithQuality = (jpegQuality: number): ArrayBuffer => {
        const isLandscape = svgWidth > svgHeight;
        const pdf = new jsPDF({
          orientation: isLandscape ? 'landscape' : 'portrait',
          unit: 'mm',
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        const margin = 10;
        const availableWidth = pageWidth - (margin * 2);
        const availableHeight = pageHeight - (margin * 2);

        const scaleX = availableWidth / svgWidth;
        const scaleY = availableHeight / svgHeight;
        const pdfScale = Math.min(scaleX, scaleY);

        const imgWidth = svgWidth * pdfScale;
        const imgHeight = svgHeight * pdfScale;

        const x = (pageWidth - imgWidth) / 2;
        const y = (pageHeight - imgHeight) / 2;

        // Use JPEG with adjustable quality instead of PNG
        const imgData = canvas!.toDataURL('image/jpeg', jpegQuality);
        pdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight);

        return pdf.output('arraybuffer');
      };

      // Helper to get ArrayBuffer size in KB
      const getBufferSizeKB = (buffer: ArrayBuffer): number => buffer.byteLength / 1024;

      let pdfBuffer: ArrayBuffer;

      // If max size is enabled, use binary search to find optimal JPEG quality
      if (options.maxExportSizeEnabled) {
        let lowQuality = 0.1;
        let highQuality = 0.95;
        let bestBuffer: ArrayBuffer | null = null;

        // First check at max quality to see if we're already under limit
        setStatusMessage('Estimation de la taille...');
        const highBuffer = generatePDFWithQuality(highQuality);
        const highSize = getBufferSizeKB(highBuffer);

        if (highSize <= options.maxExportSizeKB) {
          // Already under limit at max quality!
          pdfBuffer = highBuffer;
        } else {
          // Check minimum quality
          const minBuffer = generatePDFWithQuality(lowQuality);
          const minSize = getBufferSizeKB(minBuffer);

          if (minSize > options.maxExportSizeKB) {
            // Even minimum quality exceeds limit
            pdfBuffer = minBuffer;
            setStatusMessage(`Attention: taille minimale (${minSize.toFixed(0)} Ko) dépasse la limite`);
          } else {
            bestBuffer = minBuffer;

            // Binary search to find optimal quality with early termination
            const EPSILON = 0.01; // Stop when quality difference is negligible
            for (let i = 0; i < 6 && (highQuality - lowQuality) > EPSILON; i++) {
              const midQuality = (lowQuality + highQuality) / 2;
              setStatusMessage(`Optimisation qualité... (${i + 1}/6)`);

              const buffer = generatePDFWithQuality(midQuality);
              const sizeKB = getBufferSizeKB(buffer);

              if (sizeKB <= options.maxExportSizeKB) {
                bestBuffer = buffer;
                lowQuality = midQuality;
              } else {
                highQuality = midQuality;
              }
            }

            pdfBuffer = bestBuffer;
          }
        }
      } else {
        // No size limit, use max quality
        pdfBuffer = generatePDFWithQuality(0.92);
      }

      // Save using Electron API with ArrayBuffer (Fix 5: more efficient IPC)
      if (window.electronAPI) {
        const result = await window.electronAPI.savePdfBuffer(pdfBuffer, 'carte.pdf');
        if (result.success && result.path) {
          const fileName = result.path.split(/[/\\]/).pop() || 'carte.pdf';
          setLastExportedFile({ path: result.path, name: fileName });
          const finalSizeKB = getBufferSizeKB(pdfBuffer);
          setStatusMessage(`PDF exporté: ${result.path} (${finalSizeKB.toFixed(0)} Ko)`);
        } else if (result.error) {
          setStatusMessage(`Erreur: ${result.error}`);
        } else {
          setStatusMessage('Export annulé.');
        }
      } else {
        throw new Error('API Electron non disponible. Veuillez redémarrer l\'application.');
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      setStatusMessage(`Erreur: ${error instanceof Error ? error.message : 'Export failed'}`);
    } finally {
      // Always release canvas memory, even on error
      if (canvas) {
        releaseCanvas(canvas);
      }
      setIsExporting(false);
    }
  }, [prepareExportData, options.maxExportSizeEnabled, options.maxExportSizeKB, setStatusMessage]);

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
    }
  }, [exportFormat, exportSVG, exportPNG, exportJPEG, exportPDF]);

  return {
    isExporting,
    exportFormat,
    lastExportedFile,
    setExportFormat,
    handleExport,
  };
}
