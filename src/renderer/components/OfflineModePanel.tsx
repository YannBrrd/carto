import React from 'react';
import { OfflineModeState } from '../types';

interface OfflineModePanelProps {
  offlineMode: OfflineModeState;
  onToggleOfflineMode: (enabled: boolean) => void;
  onSelectFile: () => void;
  onClearFile: () => void;
  isLoading: boolean;
}

const OfflineModePanel: React.FC<OfflineModePanelProps> = ({
  offlineMode,
  onToggleOfflineMode,
  onSelectFile,
  onClearFile,
  isLoading,
}) => {
  return (
    <div className="offline-mode-panel">
      <div className="panel-header">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={offlineMode.enabled}
            onChange={(e) => onToggleOfflineMode(e.target.checked)}
            disabled={isLoading}
          />
          <span>Mode hors-ligne</span>
        </label>
      </div>

      {offlineMode.enabled && (
        <div className="panel-content">
          {offlineMode.fileName ? (
            <div className="file-info">
              <div className="file-name" title={offlineMode.filePath || ''}>
                {offlineMode.fileName}
              </div>
              {offlineMode.dataBounds && (
                <div className="bounds-info">
                  Zone: {offlineMode.dataBounds.minlat.toFixed(4)}°N à {offlineMode.dataBounds.maxlat.toFixed(4)}°N
                </div>
              )}
              <div className="file-actions">
                <button
                  type="button"
                  className="file-btn"
                  onClick={onSelectFile}
                  disabled={isLoading}
                >
                  Changer
                </button>
                <button
                  type="button"
                  className="file-btn secondary"
                  onClick={onClearFile}
                  disabled={isLoading}
                >
                  Retirer
                </button>
              </div>
            </div>
          ) : (
            <div className="no-file">
              <p className="hint">Aucun fichier chargé</p>
              <button
                type="button"
                className="select-file-btn"
                onClick={onSelectFile}
                disabled={isLoading}
              >
                {isLoading ? 'Chargement...' : 'Sélectionner un fichier .osm'}
              </button>
            </div>
          )}
        </div>
      )}

      {!offlineMode.enabled && (
        <div className="panel-hint">
          Utiliser des données OSM locales
        </div>
      )}
    </div>
  );
};

export default OfflineModePanel;
