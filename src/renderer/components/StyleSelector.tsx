import React, { useState } from 'react';
import { StylePreset } from '../types';

interface StyleSelectorProps {
  presets: StylePreset[];
  activePresetId: string;
  hasUnsavedChanges: boolean;
  onSelectPreset: (presetId: string) => void;
  onEditStyle: () => void;
  onSave: () => void;
  onSaveAs: (name: string) => void;
  onRevert: () => void;
  onDeletePreset: (presetId: string) => void;
}

const StyleSelector: React.FC<StyleSelectorProps> = ({
  presets,
  activePresetId,
  hasUnsavedChanges,
  onSelectPreset,
  onEditStyle,
  onSave,
  onSaveAs,
  onRevert,
  onDeletePreset,
}) => {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newStyleName, setNewStyleName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const activePreset = presets.find(p => p.id === activePresetId);
  const builtInPresets = presets.filter(p => p.isBuiltIn);
  const customPresets = presets.filter(p => !p.isBuiltIn);

  const handleSaveAs = () => {
    if (newStyleName.trim()) {
      onSaveAs(newStyleName.trim());
      setNewStyleName('');
      setShowSaveDialog(false);
    }
  };

  const handleDelete = () => {
    if (activePreset && !activePreset.isBuiltIn) {
      onDeletePreset(activePresetId);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="style-selector">
      <div className="style-selector-header">
        <label htmlFor="preset-select">Style de carte</label>
        {hasUnsavedChanges && (
          <span className="unsaved-indicator">Modifié</span>
        )}
      </div>

      <select
        id="preset-select"
        value={activePresetId}
        onChange={(e) => onSelectPreset(e.target.value)}
        className="preset-dropdown"
      >
        <optgroup label="Styles prédéfinis">
          {builtInPresets.map(preset => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </optgroup>
        {customPresets.length > 0 && (
          <optgroup label="Styles personnalisés">
            {customPresets.map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <div className="style-selector-actions">
        <button
          type="button"
          onClick={onEditStyle}
          className="style-action-btn"
        >
          Modifier
        </button>
        {hasUnsavedChanges && activePreset && !activePreset.isBuiltIn && (
          <button
            type="button"
            onClick={onSave}
            className="style-action-btn primary"
          >
            Enregistrer
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowSaveDialog(true)}
          className="style-action-btn"
        >
          Enregistrer sous...
        </button>
        {hasUnsavedChanges && (
          <button
            type="button"
            onClick={onRevert}
            className="style-action-btn secondary"
          >
            Annuler
          </button>
        )}
        {activePreset && !activePreset.isBuiltIn && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="style-action-btn danger"
          >
            Supprimer
          </button>
        )}
      </div>

      {/* Save As Dialog */}
      {showSaveDialog && (
        <div className="style-dialog-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="style-dialog" onClick={e => e.stopPropagation()}>
            <h3>Enregistrer le style</h3>
            <div className="dialog-content">
              <label htmlFor="style-name">Nom du style:</label>
              <input
                id="style-name"
                type="text"
                value={newStyleName}
                onChange={(e) => setNewStyleName(e.target.value)}
                placeholder="Mon style personnalisé"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveAs();
                  if (e.key === 'Escape') setShowSaveDialog(false);
                }}
              />
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => setShowSaveDialog(false)}
                className="secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveAs}
                disabled={!newStyleName.trim()}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="style-dialog-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="style-dialog" onClick={e => e.stopPropagation()}>
            <h3>Supprimer le style</h3>
            <div className="dialog-content">
              <p>Voulez-vous vraiment supprimer le style "{activePreset?.name}" ?</p>
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="danger"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StyleSelector;
