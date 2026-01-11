/**
 * Floating tools panel component for map controls and export
 */

import React from 'react';
import { MAX_ZONES } from '../utils/zoneUtils';
import { ExportFormat } from '../hooks/useExport';
import AddressSearch from './AddressSearch';

interface ToolsPanelProps {
  // Panel state
  isMinimized: boolean;
  onToggleMinimize: () => void;

  // Drawing state
  isDrawing: boolean;
  zonesCount: number;
  activeZoneId: string | null;
  selectedMarkerCount: number;
  onStartDrawing: () => void;
  onClearDrawing: () => void;
  onApplyRounding: () => void;

  // Display options
  showPOI: boolean;
  onShowPOIChange: (value: boolean) => void;
  showCompass: boolean;
  onShowCompassChange: (value: boolean) => void;
  forceAllLabels: boolean;
  onForceAllLabelsChange: (value: boolean) => void;
  exteriorOverlay: boolean;
  onExteriorOverlayChange: (value: boolean) => void;
  exteriorOverlayOpacity: number;
  onExteriorOverlayOpacityChange: (value: number) => void;

  // Export options
  maxExportSizeEnabled: boolean;
  onMaxExportSizeEnabledChange: (value: boolean) => void;
  maxExportSizeKB: number;
  onMaxExportSizeKBChange: (value: number) => void;
  exportBorderColor: string;
  onExportBorderColorChange: (value: string) => void;

  // Export state
  exportFormat: ExportFormat;
  onExportFormatChange: (format: ExportFormat) => void;
  isExporting: boolean;
  onExport: () => void;
  lastExportedFile: { path: string; name: string } | null;

  // Status
  statusMessage: string;

  // Address search
  onLocationSelect: (lat: number, lon: number, displayName: string) => void;
}

const ToolsPanel: React.FC<ToolsPanelProps> = ({
  isMinimized,
  onToggleMinimize,
  isDrawing,
  zonesCount,
  activeZoneId,
  selectedMarkerCount,
  onStartDrawing,
  onClearDrawing,
  onApplyRounding,
  showPOI,
  onShowPOIChange,
  showCompass,
  onShowCompassChange,
  forceAllLabels,
  onForceAllLabelsChange,
  exteriorOverlay,
  onExteriorOverlayChange,
  exteriorOverlayOpacity,
  onExteriorOverlayOpacityChange,
  maxExportSizeEnabled,
  onMaxExportSizeEnabledChange,
  maxExportSizeKB,
  onMaxExportSizeKBChange,
  exportBorderColor,
  onExportBorderColorChange,
  exportFormat,
  onExportFormatChange,
  isExporting,
  onExport,
  lastExportedFile,
  statusMessage,
  onLocationSelect,
}) => {
  return (
    <div
      className={`floating-panel tools-panel ${isMinimized ? 'minimized' : ''}`}
      style={{
        position: 'absolute',
        top: 20,
        right: 20,
        zIndex: 1000,
        background: 'white',
        padding: isMinimized ? '10px 12px' : '15px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        width: isMinimized ? 'auto' : '280px',
      }}
    >
      <div className="panel-header">
        <span className="panel-title">Outils</span>
        <button
          className="minimize-btn"
          onClick={onToggleMinimize}
          title={isMinimized ? 'Agrandir' : 'Réduire'}
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {!isMinimized && (
        <div className="panel-body">
          <AddressSearch onLocationSelect={onLocationSelect} />

          <div className="drawing-tools">
            <button onClick={onStartDrawing} disabled={isDrawing || zonesCount >= MAX_ZONES}>
              {isDrawing ? 'Dessiner...' : `Nouvelle zone (${zonesCount}/${MAX_ZONES})`}
            </button>
            <button onClick={onClearDrawing} disabled={zonesCount === 0 && !isDrawing}>
              Effacer tout
            </button>
          </div>

          {activeZoneId && !isDrawing && (
            <div style={{ marginTop: '10px' }}>
              <button
                onClick={onApplyRounding}
                disabled={selectedMarkerCount < 2}
                style={{
                  width: '100%',
                  background: selectedMarkerCount >= 2 ? '#f59e0b' : undefined,
                  borderColor: selectedMarkerCount >= 2 ? '#d97706' : undefined,
                }}
              >
                Arrondir ({selectedMarkerCount} pts)
              </button>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                Ctrl+clic pour sélectionner des points consécutifs
              </div>
            </div>
          )}

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '10px',
            fontSize: '13px',
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={showPOI}
              onChange={(e) => onShowPOIChange(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Afficher les icônes POI
          </label>

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '8px',
            fontSize: '13px',
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={showCompass}
              onChange={(e) => onShowCompassChange(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Afficher la boussole
          </label>

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '8px',
            fontSize: '13px',
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={forceAllLabels}
              onChange={(e) => onForceAllLabelsChange(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Forcer tous les noms de rues
          </label>

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '8px',
            fontSize: '13px',
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={exteriorOverlay}
              onChange={(e) => onExteriorOverlayChange(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Voile gris extérieur
          </label>

          {exteriorOverlay && (
            <div style={{ marginTop: '6px', marginLeft: '24px' }}>
              <label style={{ fontSize: '12px', color: '#666' }}>
                Opacité: {(exteriorOverlayOpacity * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0.1"
                max="0.8"
                step="0.05"
                value={exteriorOverlayOpacity}
                onChange={(e) => onExteriorOverlayOpacityChange(parseFloat(e.target.value))}
                style={{ width: '100%', marginTop: '4px' }}
              />
            </div>
          )}

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '8px',
            fontSize: '13px',
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={maxExportSizeEnabled}
              onChange={(e) => onMaxExportSizeEnabledChange(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Taille max export
          </label>

          {maxExportSizeEnabled && (
            <div style={{ marginTop: '6px', marginLeft: '24px' }}>
              <label style={{ fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="number"
                  min="50"
                  max="5000"
                  step="50"
                  value={maxExportSizeKB}
                  onChange={(e) => onMaxExportSizeKBChange(Math.max(50, parseInt(e.target.value) || 200))}
                  style={{ width: '70px', padding: '4px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
                Ko
              </label>
            </div>
          )}

          <div style={{ marginTop: '10px', fontSize: '13px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              Couleur bordure:
              <input
                type="color"
                value={exportBorderColor}
                onChange={(e) => onExportBorderColorChange(e.target.value)}
                style={{ cursor: 'pointer', width: '40px', height: '24px', border: '1px solid #ccc', borderRadius: '4px' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: '6px', marginTop: '10px', alignItems: 'center' }}>
            <select
              value={exportFormat}
              onChange={(e) => onExportFormatChange(e.target.value as ExportFormat)}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <option value="svg">SVG</option>
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="pdf">PDF</option>
            </select>
            <button
              onClick={onExport}
              disabled={zonesCount === 0 || isExporting}
              style={{ flex: 1 }}
            >
              {isExporting ? 'Export...' : 'Exporter'}
            </button>
          </div>

          {lastExportedFile && (
            <button
              onClick={() => window.electronAPI?.openFile(lastExportedFile.path)}
              className="secondary"
              style={{ width: '100%', marginTop: '10px', fontSize: '12px' }}
            >
              Ouvrir {lastExportedFile.name}
            </button>
          )}

          {statusMessage && (
            <div className={`status-message ${statusMessage.includes('Erreur') ? 'error' : ''}`}>
              {statusMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolsPanel;
