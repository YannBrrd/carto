import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RenderStyle, FeatureStyle, LineStyle, RailwayKey, TunnelStyle } from '../types';
import { FONT_INFO, DEFAULT_FONT_FAMILY, isValidFontFamily, type FontFamily } from '../constants/fonts';
import { resolveStrokeColor, resolveRailwayStyle, RAILWAY_TYPES } from '../utils/styleResolvers';

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
    footway: 'Trottoir / voie piétonne',
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

// French names of the railway types
const railwayLabels: Record<RailwayKey, string> = {
  rail: 'Train',
  lightRail: 'Métro léger',
  tram: 'Tramway',
  subway: 'Métro',
  tunnel: 'Voie souterraine',
};

// French names of the line styles, in menu order
const lineStyleLabels: Record<LineStyle, string> = {
  solid: 'Plein',
  dot: 'Pointillés',
  dash: 'Tirets',
  dashlong: 'Tirets longs',
  dashdot: 'Trait-point',
  dashdotdot: 'Trait-point-point',
  none: 'Masqué',
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

interface OutlinedFeatureStyleControlProps extends FeatureStyleControlProps {
  isLine?: boolean;  // Roads and railways: also width and line style
}

// Fill + outline control, for buildings (border), roads and railways (casing, width, line style)
const OutlinedFeatureStyleControl: React.FC<OutlinedFeatureStyleControlProps> = React.memo(({ label, featureStyle, onChange, isLine = false }) => {
  const strokeColor = resolveStrokeColor(featureStyle);
  const widthScale = featureStyle.widthScale ?? 1;

  return (
    <div className={`feature-style-row building-style-row${isLine ? ' road-style-row' : ''}`}>
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
      {isLine && (
        <>
          <span className="road-width-label">Largeur</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.25"
            value={widthScale}
            onChange={(e) => onChange({ ...featureStyle, widthScale: parseFloat(e.target.value) })}
            title="Largeur"
            className="road-width-input"
          />
          <span className="opacity-value">×{widthScale.toFixed(2)}</span>
          <span className="road-width-label">Trait</span>
          <select
            value={featureStyle.lineStyle ?? 'solid'}
            onChange={(e) => onChange({ ...featureStyle, lineStyle: e.target.value as LineStyle })}
            title="Trait"
            className="road-line-style-select"
          >
            {(Object.keys(lineStyleLabels) as LineStyle[]).map(lineStyle => (
              <option key={lineStyle} value={lineStyle}>{lineStyleLabels[lineStyle]}</option>
            ))}
          </select>
        </>
      )}
    </div>
  );
});

// Line style menu where the first choice keeps the line style used above ground
const TunnelLineStyleSelect: React.FC<{ value?: LineStyle; onChange: (lineStyle?: LineStyle) => void }> = ({ value, onChange }) => (
  <select
    value={value ?? ''}
    onChange={(e) => onChange((e.target.value || undefined) as LineStyle | undefined)}
    title="Trait"
    className="road-line-style-select"
  >
    <option value="">Comme en surface</option>
    {(Object.keys(lineStyleLabels) as LineStyle[]).map(lineStyle => (
      <option key={lineStyle} value={lineStyle}>{lineStyleLabels[lineStyle]}</option>
    ))}
  </select>
);

// A tunnel style without any value is no tunnel style at all
function tunnelStyleOrUndefined(tunnelStyle: TunnelStyle): TunnelStyle | undefined {
  const defined = Object.fromEntries(Object.entries(tunnelStyle).filter(([, value]) => value !== undefined));
  return Object.keys(defined).length ? defined : undefined;
}

interface UndergroundControlsProps {
  style: RenderStyle;
  onStyleChange: (style: RenderStyle) => void;
}

// Roads in tunnels (their own colors, opacity and line style, or as above ground) and underground waterways
const UndergroundControls: React.FC<UndergroundControlsProps> = ({ style, onStyleChange }) => {
  const highwayTunnel = style.highwayTunnel;
  const residential = style.highway.residential;

  const setStyle = (key: 'highwayTunnel' | 'waterwayTunnel', tunnelStyle: TunnelStyle | undefined) => {
    const updated: RenderStyle = { ...style };
    if (tunnelStyle) updated[key] = tunnelStyle;
    else delete updated[key];
    onStyleChange(updated);
  };
  const setHighwayTunnel = (changes: TunnelStyle) =>
    setStyle('highwayTunnel', tunnelStyleOrUndefined({ ...highwayTunnel, ...changes }));
  const setWaterwayTunnel = (changes: TunnelStyle) =>
    setStyle('waterwayTunnel', tunnelStyleOrUndefined({ ...style.waterwayTunnel, ...changes }));

  return (
    <>
      <div className="feature-style-row building-style-row road-style-row tunnel-style-row">
        <span className="feature-label">Routes en tunnel</span>
        <input
          type="checkbox"
          checked={!!highwayTunnel}
          onChange={(e) => setStyle('highwayTunnel', e.target.checked
            ? { color: residential.color, strokeColor: resolveStrokeColor(residential) }
            : undefined)}
          title="Style propre aux routes en tunnel"
        />
        {highwayTunnel && (
          <>
            <input
              type="color"
              value={highwayTunnel.color ?? residential.color}
              onChange={(e) => setHighwayTunnel({ color: e.target.value })}
              title="Couleur de remplissage"
            />
            <input
              type="color"
              value={highwayTunnel.strokeColor ?? resolveStrokeColor(residential)}
              onChange={(e) => setHighwayTunnel({ strokeColor: e.target.value })}
              title="Couleur de bordure"
              className="stroke-color-input"
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={highwayTunnel.opacity ?? 1}
              onChange={(e) => setHighwayTunnel({ opacity: parseFloat(e.target.value) })}
              title="Opacité"
            />
            <span className="road-width-label">Trait</span>
            <TunnelLineStyleSelect value={highwayTunnel.lineStyle} onChange={(lineStyle) => setHighwayTunnel({ lineStyle })} />
          </>
        )}
      </div>
      <div className="feature-style-row building-style-row road-style-row">
        <span className="feature-label">Cours d'eau souterrains</span>
        <span className="road-width-label">Trait</span>
        <TunnelLineStyleSelect
          value={style.waterwayTunnel?.lineStyle}
          onChange={(lineStyle) => setWaterwayTunnel({ lineStyle })}
        />
      </div>
    </>
  );
};

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

    // Buildings and roads also get an outline color
    const StyleControl = category === 'building' || category === 'highway'
      ? OutlinedFeatureStyleControl
      : FeatureStyleControl;

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
            isLine={category === 'highway'}
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
          <CollapsibleSection title="Souterrain" defaultOpen={false}>
            <UndergroundControls style={style} onStyleChange={onStyleChange} />
          </CollapsibleSection>
          <CollapsibleSection title="Voies ferrées" defaultOpen={false}>
            {RAILWAY_TYPES.map(type => (
              <OutlinedFeatureStyleControl
                key={type}
                label={railwayLabels[type]}
                featureStyle={resolveRailwayStyle(style, type)}
                onChange={(railwayStyle) => onStyleChange({
                  ...style,
                  railway: {
                    ...(Object.fromEntries(RAILWAY_TYPES.map(t => [t, resolveRailwayStyle(style, t)])) as Record<RailwayKey, FeatureStyle>),
                    [type]: railwayStyle,
                  },
                })}
                isLine
              />
            ))}
          </CollapsibleSection>

          <hr />
          <h3>Tailles de police</h3>

          <CollapsibleSection title="Labels" defaultOpen={true}>
            <div className="control-group">
              <label>Police des labels</label>
              <select
                value={style.fontSize?.fontFamily ?? DEFAULT_FONT_FAMILY}
                onChange={(e) => {
                  // Validate font family before saving (prevents invalid fonts from being stored)
                  const selectedFont = e.target.value;
                  const validFont = isValidFontFamily(selectedFont) ? selectedFont : DEFAULT_FONT_FAMILY;

                  onStyleChange({
                    ...style,
                    fontSize: {
                      ...style.fontSize,
                      roads: style.fontSize?.roads ?? 1,
                      areas: style.fontSize?.areas ?? 1,
                      fontFamily: validFont,
                      fontBold: style.fontSize?.fontBold ?? false,
                    }
                  });
                }}
                style={{ flex: 1, padding: '4px 8px' }}
              >
                {Object.entries(FONT_INFO).map(([fontKey, fontData]) => (
                  <option key={fontKey} value={fontKey}>
                    {fontData.name} - {fontData.description}
                  </option>
                ))}
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
                      fontFamily: style.fontSize?.fontFamily ?? DEFAULT_FONT_FAMILY,
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
                      fontFamily: style.fontSize?.fontFamily ?? DEFAULT_FONT_FAMILY,
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
                      fontFamily: style.fontSize?.fontFamily ?? DEFAULT_FONT_FAMILY,
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
