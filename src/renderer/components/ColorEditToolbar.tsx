import React from 'react';
import { ColorEditMode, ElementCategory } from '../types';

interface ColorEditToolbarProps {
  disabled: boolean;
  colorEditMode: ColorEditMode;
  onColorEditModeChange: (mode: ColorEditMode) => void;
  onResetOverrides: () => void;
  overrideCount: number;
}

const CATEGORY_LABELS: Record<ElementCategory, string> = {
  building: 'Bâtiments',
  highway: 'Routes',
  natural: 'Naturel',
  waterway: "Cours d'eau",
};

const ColorEditToolbar: React.FC<ColorEditToolbarProps> = ({
  disabled,
  colorEditMode,
  onColorEditModeChange,
  onResetOverrides,
  overrideCount,
}) => {
  const handleToggleActive = () => {
    onColorEditModeChange({
      ...colorEditMode,
      active: !colorEditMode.active,
    });
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as ElementCategory | '';
    onColorEditModeChange({
      ...colorEditMode,
      selectedCategory: value === '' ? null : value,
    });
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onColorEditModeChange({
      ...colorEditMode,
      selectedColor: e.target.value,
    });
  };

  const handleSelectionModeChange = (mode: 'click' | 'polygon') => {
    onColorEditModeChange({
      ...colorEditMode,
      selectionMode: mode,
    });
  };

  return (
    <div className={`color-edit-toolbar ${disabled ? 'disabled' : ''}`}>
      <div className="toolbar-header">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={colorEditMode.active}
            onChange={handleToggleActive}
            disabled={disabled}
          />
          <span>Édition des couleurs</span>
        </label>
      </div>

      {colorEditMode.active && !disabled && (
        <>
          <div className="toolbar-section">
            <label className="section-label">Type d'élément</label>
            <select
              value={colorEditMode.selectedCategory || ''}
              onChange={handleCategoryChange}
              className="category-select"
            >
              <option value="">-- Choisir --</option>
              {(Object.keys(CATEGORY_LABELS) as ElementCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>

          <div className="toolbar-section">
            <label className="section-label">Couleur</label>
            <input
              type="color"
              value={colorEditMode.selectedColor}
              onChange={handleColorChange}
              className="color-picker"
            />
          </div>

          <div className="toolbar-section">
            <label className="section-label">Mode de sélection</label>
            <div className="selection-mode-buttons">
              <button
                type="button"
                className={`mode-btn ${colorEditMode.selectionMode === 'click' ? 'active' : ''}`}
                onClick={() => handleSelectionModeChange('click')}
              >
                Clic
              </button>
              <button
                type="button"
                className={`mode-btn ${colorEditMode.selectionMode === 'polygon' ? 'active' : ''}`}
                onClick={() => handleSelectionModeChange('polygon')}
              >
                Polygone
              </button>
            </div>
          </div>

          {overrideCount > 0 && (
            <div className="toolbar-section">
              <span className="override-count">
                {overrideCount} élément{overrideCount > 1 ? 's' : ''} modifié{overrideCount > 1 ? 's' : ''}
              </span>
              <button
                type="button"
                className="reset-btn"
                onClick={onResetOverrides}
              >
                Réinitialiser
              </button>
            </div>
          )}

          {!colorEditMode.selectedCategory && (
            <div className="toolbar-hint">
              Sélectionnez un type d'élément pour commencer
            </div>
          )}
        </>
      )}

      {disabled && (
        <div className="toolbar-hint disabled-hint">
          Créez une zone pour activer l'édition
        </div>
      )}
    </div>
  );
};

export default ColorEditToolbar;
