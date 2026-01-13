import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RenderStyle, FeatureStyle } from '../types';

interface StyleModalProps {
  isOpen: boolean;
  style: RenderStyle;
  onStyleChange: (style: RenderStyle) => void;
  onCancel: () => void;
  onApply: () => void;
}

// French labels for feature types
const featureLabels: Record<string, Record<string, string>> = {
  highway: {
    motorway: 'Autoroute',
    primary: 'Route principale',
    secondary: 'Route secondaire',
    tertiary: 'Route tertiaire',
    residential: 'Rue résidentielle',
    path: 'Chemin',
    cycleway: 'Piste cyclable',
  },
  building: {
    residential: 'Résidentiel (par défaut)',
    commercial: 'Commercial',
    industrial: 'Industriel',
    religious: 'Religieux',
    construction: 'En construction',
    default: 'Autres (spécifique)',
  },
  landuse: {
    residential: 'Zone résidentielle',
    commercial: 'Zone commerciale',
    industrial: 'Zone industrielle',
    farmland: 'Terres agricoles',
    forest: 'Forêt',
  },
  natural: {
    water: 'Eau',
    wood: 'Bois',
    grassland: 'Prairie',
    beach: 'Plage',
  },
  waterway: {
    river: 'Rivière',
    stream: 'Ruisseau',
    canal: 'Canal',
    default: 'Autres',
  },
};

const categoryLabels: Record<string, string> = {
  highway: 'Routes',
  building: 'Bâtiments',
  landuse: 'Occupation du sol',
  natural: 'Éléments naturels',
  waterway: 'Cours d\'eau',
};

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = React.memo(({ title, defaultOpen = false, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="collapsible-section">
      <button
        type="button"
        className="collapsible-header"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="collapsible-arrow">{isOpen ? '▼' : '▶'}</span>
        {title}
      </button>
      {isOpen && <div className="collapsible-content">{children}</div>}
    </div>
  );
});

interface FeatureStyleControlProps {
  label: string;
  featureStyle: FeatureStyle;
  onChange: (newStyle: FeatureStyle) => void;
}

const FeatureStyleControl: React.FC<FeatureStyleControlProps> = React.memo(({ label, featureStyle, onChange }) => {
  return (
    <div className="feature-style-row">
      <span className="feature-label">{label}</span>
      <input
        type="color"
        value={featureStyle.color}
        onChange={(e) => onChange({ ...featureStyle, color: e.target.value })}
        title="Couleur"
      />
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={featureStyle.opacity}
        onChange={(e) => onChange({ ...featureStyle, opacity: parseFloat(e.target.value) })}
        title="Opacité"
      />
      <span className="opacity-value">{featureStyle.opacity.toFixed(2)}</span>
    </div>
  );
});

interface BuildingStyleControlProps {
  label: string;
  featureStyle: FeatureStyle;
  onChange: (newStyle: FeatureStyle) => void;
}

// Helper function for deriving stroke color (defined outside component for stability)
const getDefaultStrokeColor = (fillColor: string): string => {
  const hex = fillColor.replace('#', '');
  const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - 32);
  const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - 32);
  const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - 32);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

const BuildingStyleControl: React.FC<BuildingStyleControlProps> = React.memo(({ label, featureStyle, onChange }) => {
  const strokeColor = featureStyle.strokeColor || getDefaultStrokeColor(featureStyle.color);

  return (
    <div className="feature-style-row building-style-row">
      <span className="feature-label">{label}</span>
      <input
        type="color"
        value={featureStyle.color}
        onChange={(e) => onChange({ ...featureStyle, color: e.target.value })}
        title="Couleur de remplissage"
      />
      <input
        type="color"
        value={strokeColor}
        onChange={(e) => onChange({ ...featureStyle, strokeColor: e.target.value })}
        title="Couleur de bordure"
        className="stroke-color-input"
      />
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={featureStyle.opacity}
        onChange={(e) => onChange({ ...featureStyle, opacity: parseFloat(e.target.value) })}
        title="Opacité"
      />
      <span className="opacity-value">{featureStyle.opacity.toFixed(2)}</span>
    </div>
  );
});

const StyleModal: React.FC<StyleModalProps> = ({
  isOpen,
  style,
  onStyleChange,
  onCancel,
  onApply,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Focus trap
    const focusableElements = modalRef.current?.querySelectorAll(
      'button, input, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements && focusableElements.length > 0) {
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      const handleTabKey = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      };

      firstElement.focus();
      document.addEventListener('keydown', handleTabKey);

      return () => {
        document.removeEventListener('keydown', handleTabKey);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleZoneStyleChange = (key: keyof RenderStyle, value: any) => {
    onStyleChange({
      ...style,
      [key]: value,
    });
  };

  const handleFeatureStyleChange = (
    category: 'highway' | 'building' | 'landuse' | 'natural' | 'waterway',
    featureType: string,
    newFeatureStyle: FeatureStyle
  ) => {
    onStyleChange({
      ...style,
      [category]: {
        ...style[category],
        [featureType]: newFeatureStyle,
      },
    });
  };

  const renderFeatureCategory = (
    category: 'highway' | 'building' | 'landuse' | 'natural' | 'waterway'
  ) => {
    const categoryStyle = style[category];
    const labels = featureLabels[category];

    // Use BuildingStyleControl for buildings (includes stroke color)
    const StyleControl = category === 'building' ? BuildingStyleControl : FeatureStyleControl;

    return (
      <CollapsibleSection title={categoryLabels[category]} defaultOpen={false}>
        {category === 'building' && (
          <div className="control-group" style={{ marginBottom: '10px' }}>
            <label>
              <input
                type="checkbox"
                checked={style.buildingStrokeEnabled}
                onChange={(e) => handleZoneStyleChange('buildingStrokeEnabled', e.target.checked)}
              />
              {' '}Afficher les bordures
            </label>
          </div>
        )}
        {Object.keys(categoryStyle).map((featureType) => (
          <StyleControl
            key={featureType}
            label={labels[featureType] || featureType}
            featureStyle={(categoryStyle as Record<string, FeatureStyle>)[featureType]}
            onChange={(newStyle) => handleFeatureStyleChange(category, featureType, newStyle)}
          />
        ))}
      </CollapsibleSection>
    );
  };

  const modalContent = (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <h2 id="modal-title">Personnaliser le style</h2>

        <div className="modal-body">
          <CollapsibleSection title="Zone de sélection" defaultOpen={false}>
            <div className="control-group">
              <label>Couleur de fond</label>
              <input
                type="color"
                value={style.backgroundColor}
                onChange={(e) => handleZoneStyleChange('backgroundColor', e.target.value)}
              />
            </div>

            <div className="control-group">
              <label>Couleur intérieure</label>
              <input
                type="color"
                value={style.interiorColor}
                onChange={(e) => handleZoneStyleChange('interiorColor', e.target.value)}
              />
            </div>

            <div className="control-group">
              <label>Couleur de bordure</label>
              <input
                type="color"
                value={style.borderColor}
                onChange={(e) => handleZoneStyleChange('borderColor', e.target.value)}
              />
            </div>

            <div className="control-group">
              <label>Épaisseur de bordure</label>
              <input
                type="number"
                min="1"
                max="10"
                value={style.borderWidth}
                onChange={(e) => handleZoneStyleChange('borderWidth', parseFloat(e.target.value))}
              />
            </div>

            <div className="control-group">
              <label>Opacité du remplissage ({style.fillOpacity.toFixed(2)})</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={style.fillOpacity}
                onChange={(e) => handleZoneStyleChange('fillOpacity', parseFloat(e.target.value))}
              />
            </div>

            <div className="control-group">
              <label>Opacité du contour ({style.strokeOpacity.toFixed(2)})</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={style.strokeOpacity}
                onChange={(e) => handleZoneStyleChange('strokeOpacity', parseFloat(e.target.value))}
              />
            </div>

            <div className="control-group">
              <label>
                <input
                  type="checkbox"
                  checked={style.exteriorGrayscale}
                  onChange={(e) => handleZoneStyleChange('exteriorGrayscale', e.target.checked)}
                />
                {' '}Extérieur en niveaux de gris
              </label>
            </div>
          </CollapsibleSection>

          <hr />
          <h3>Entités OSM</h3>

          {renderFeatureCategory('highway')}
          {renderFeatureCategory('building')}
          {renderFeatureCategory('landuse')}
          {renderFeatureCategory('natural')}
          {renderFeatureCategory('waterway')}

          <hr />
          <h3>Tailles de police</h3>

          <CollapsibleSection title="Labels" defaultOpen={true}>
            <div className="control-group">
              <label>Police</label>
              <select
                value={style.fontSize?.fontFamily ?? 'Roboto'}
                onChange={(e) => onStyleChange({
                  ...style,
                  fontSize: {
                    ...style.fontSize,
                    roads: style.fontSize?.roads ?? 1,
                    areas: style.fontSize?.areas ?? 1,
                    fontFamily: e.target.value,
                    fontBold: style.fontSize?.fontBold ?? false,
                  }
                })}
                style={{ flex: 1, padding: '4px 8px' }}
              >
                <option value="Roboto">Roboto</option>
                <option value="Arial">Arial</option>
                <option value="Georgia">Georgia</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Verdana">Verdana</option>
                <option value="Courier New">Courier New</option>
              </select>
            </div>

            <div className="control-group">
              <label>
                <input
                  type="checkbox"
                  checked={style.fontSize?.fontBold ?? false}
                  onChange={(e) => onStyleChange({
                    ...style,
                    fontSize: {
                      ...style.fontSize,
                      roads: style.fontSize?.roads ?? 1,
                      areas: style.fontSize?.areas ?? 1,
                      fontFamily: style.fontSize?.fontFamily ?? 'Roboto',
                      fontBold: e.target.checked,
                    }
                  })}
                />
                {' '}Gras
              </label>
            </div>

            <div className="control-group">
              <label>Noms de rues</label>
              <div className="spinner-input">
                <input
                  type="number"
                  min="50"
                  max="200"
                  step="1"
                  value={Math.round((style.fontSize?.roads ?? 1) * 100)}
                  onChange={(e) => onStyleChange({
                    ...style,
                    fontSize: {
                      ...style.fontSize,
                      roads: parseInt(e.target.value, 10) / 100,
                      areas: style.fontSize?.areas ?? 1,
                      fontFamily: style.fontSize?.fontFamily ?? 'Roboto',
                      fontBold: style.fontSize?.fontBold ?? false,
                    }
                  })}
                />
                <span className="spinner-suffix">%</span>
              </div>
            </div>

            <div className="control-group">
              <label>Noms de zones</label>
              <div className="spinner-input">
                <input
                  type="number"
                  min="50"
                  max="200"
                  step="1"
                  value={Math.round((style.fontSize?.areas ?? 1) * 100)}
                  onChange={(e) => onStyleChange({
                    ...style,
                    fontSize: {
                      ...style.fontSize,
                      roads: style.fontSize?.roads ?? 1,
                      areas: parseInt(e.target.value, 10) / 100,
                      fontFamily: style.fontSize?.fontFamily ?? 'Roboto',
                      fontBold: style.fontSize?.fontBold ?? false,
                    }
                  })}
                />
                <span className="spinner-suffix">%</span>
              </div>
            </div>
          </CollapsibleSection>
        </div>

        <div className="modal-footer">
          <button onClick={onCancel} className="secondary">
            Annuler
          </button>
          <button onClick={onApply}>
            Appliquer
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default StyleModal;
