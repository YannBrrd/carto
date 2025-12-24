import React, { useState } from 'react';
import { RenderRule, PropertyAssignment, PropertyValue, ZoomDependentValue, DrawCommand } from '../../rules/types';

interface PropertyEditorProps {
  rule: RenderRule;
  onRuleChange: (rule: RenderRule) => void;
}

const PROPERTY_TYPES: Record<string, 'color' | 'number' | 'string' | 'zoom' | 'style'> = {
  'line-color': 'color',
  'fill-color': 'color',
  'border-color': 'color',
  'text-color': 'color',
  'text-halo-color': 'color',
  'line-width': 'zoom',
  'fill-opacity': 'number',
  'line-opacity': 'number',
  'border-width': 'number',
  'font-size': 'zoom',
  'min-zoom': 'number',
  'max-zoom': 'number',
  'line-style': 'style',
  'border-style': 'style',
  'line-join': 'style',
  'line-start-cap': 'style',
  'line-end-cap': 'style',
};

const STYLE_OPTIONS: Record<string, string[]> = {
  'line-style': ['solid', 'dash', 'dashlong', 'dot', 'dashdot', 'none'],
  'border-style': ['solid', 'dash', 'dot', 'none'],
  'line-join': ['round', 'miter', 'bevel'],
  'line-start-cap': ['round', 'butt', 'square'],
  'line-end-cap': ['round', 'butt', 'square'],
};

const DRAW_COMMANDS: DrawCommand[] = ['line', 'fill', 'text', 'icon', 'shape', 'shield'];

const PropertyEditor: React.FC<PropertyEditorProps> = ({ rule, onRuleChange }) => {
  const [newPropKey, setNewPropKey] = useState('');
  const [newPropValue, setNewPropValue] = useState('');

  const handlePropertyChange = (index: number, value: PropertyValue) => {
    const newProperties = [...rule.properties];
    newProperties[index] = { ...newProperties[index], value };
    onRuleChange({ ...rule, properties: newProperties });
  };

  const handlePropertyDelete = (index: number) => {
    const newProperties = rule.properties.filter((_, i) => i !== index);
    onRuleChange({ ...rule, properties: newProperties });
  };

  const handleAddProperty = () => {
    if (!newPropKey) return;

    const propType = PROPERTY_TYPES[newPropKey] || 'string';
    let value: PropertyValue = newPropValue;

    if (propType === 'number') {
      value = parseFloat(newPropValue) || 0;
    } else if (propType === 'color' && !newPropValue.startsWith('#')) {
      value = '#' + newPropValue;
    }

    const newProperties = [...rule.properties, { property: newPropKey, value }];
    onRuleChange({ ...rule, properties: newProperties });
    setNewPropKey('');
    setNewPropValue('');
  };

  const handleDrawToggle = (draw: DrawCommand) => {
    const newDraws = rule.draws.includes(draw)
      ? rule.draws.filter(d => d !== draw)
      : [...rule.draws, draw];
    onRuleChange({ ...rule, draws: newDraws });
  };

  const renderPropertyValue = (prop: PropertyAssignment, index: number) => {
    const propType = PROPERTY_TYPES[prop.property] || 'string';
    const value = prop.value;

    if (propType === 'color') {
      const colorValue = typeof value === 'string' ? value : '#888888';
      return (
        <div className="property-value color-input">
          <input
            type="color"
            value={colorValue}
            onChange={(e) => handlePropertyChange(index, e.target.value)}
          />
          <input
            type="text"
            value={colorValue}
            onChange={(e) => handlePropertyChange(index, e.target.value)}
            style={{ width: '80px' }}
          />
        </div>
      );
    }

    if (propType === 'number') {
      const numValue = typeof value === 'number' ? value : 0;
      return (
        <input
          type="number"
          step="0.1"
          value={numValue}
          onChange={(e) => handlePropertyChange(index, parseFloat(e.target.value) || 0)}
          className="property-value"
        />
      );
    }

    if (propType === 'style' && STYLE_OPTIONS[prop.property]) {
      const strValue = typeof value === 'string' ? value : '';
      return (
        <select
          value={strValue}
          onChange={(e) => handlePropertyChange(index, e.target.value)}
          className="property-value"
        >
          {STYLE_OPTIONS[prop.property].map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    if (propType === 'zoom' && typeof value === 'object' && 'type' in value && value.type === 'zoom-dependent') {
      const zoomValue = value as ZoomDependentValue;
      return (
        <div className="property-value zoom-value">
          <span className="zoom-label">Zoom-dépendant:</span>
          {zoomValue.stops.map((stop, i) => (
            <span key={i} className="zoom-stop">
              z{stop.zoom}: {stop.value}
              {i < zoomValue.stops.length - 1 ? ', ' : ''}
            </span>
          ))}
        </div>
      );
    }

    // Default: text input
    const strValue = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
    return (
      <input
        type="text"
        value={strValue}
        onChange={(e) => handlePropertyChange(index, e.target.value)}
        className="property-value"
      />
    );
  };

  const getTargetLabel = (): string => {
    if (rule.target.geometryType) {
      return `$featuretype(${rule.target.geometryType})`;
    }
    return rule.target.featurePattern || 'Unknown';
  };

  return (
    <div className="property-editor">
      <h3>Règle: {getTargetLabel()}</h3>

      <div className="property-section">
        <h4>Commandes de rendu</h4>
        <div className="draw-commands">
          {DRAW_COMMANDS.map((draw) => (
            <label key={draw} className="draw-toggle">
              <input
                type="checkbox"
                checked={rule.draws.includes(draw)}
                onChange={() => handleDrawToggle(draw)}
              />
              {draw}
            </label>
          ))}
        </div>
      </div>

      <div className="property-section">
        <h4>Propriétés ({rule.properties.length})</h4>
        <div className="properties-list">
          {rule.properties.map((prop, index) => (
            <div key={`${prop.property}-${index}`} className="property-row">
              <span className="property-name">{prop.property}</span>
              {renderPropertyValue(prop, index)}
              <button
                className="delete-btn small"
                onClick={() => handlePropertyDelete(index)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="add-property">
          <select
            value={newPropKey}
            onChange={(e) => setNewPropKey(e.target.value)}
          >
            <option value="">Ajouter une propriété...</option>
            <optgroup label="Couleurs">
              <option value="line-color">line-color</option>
              <option value="fill-color">fill-color</option>
              <option value="border-color">border-color</option>
              <option value="text-color">text-color</option>
            </optgroup>
            <optgroup label="Dimensions">
              <option value="line-width">line-width</option>
              <option value="fill-opacity">fill-opacity</option>
              <option value="line-opacity">line-opacity</option>
              <option value="border-width">border-width</option>
              <option value="font-size">font-size</option>
            </optgroup>
            <optgroup label="Zoom">
              <option value="min-zoom">min-zoom</option>
              <option value="max-zoom">max-zoom</option>
            </optgroup>
            <optgroup label="Styles">
              <option value="line-style">line-style</option>
              <option value="border-style">border-style</option>
              <option value="line-join">line-join</option>
            </optgroup>
          </select>
          {newPropKey && (
            <>
              <input
                type={PROPERTY_TYPES[newPropKey] === 'color' ? 'color' : 'text'}
                value={newPropValue}
                onChange={(e) => setNewPropValue(e.target.value)}
                placeholder="Valeur"
              />
              <button onClick={handleAddProperty}>+</button>
            </>
          )}
        </div>
      </div>

      {rule.conditionals.length > 0 && (
        <div className="property-section">
          <h4>Conditions ({rule.conditionals.length})</h4>
          <div className="conditionals-list">
            {rule.conditionals.map((cond, index) => (
              <div key={index} className="conditional-item">
                <span className="cond-type">{cond.type}</span>
                {cond.featurePattern && (
                  <span className="cond-pattern">{cond.featurePattern}</span>
                )}
                <span className="cond-props">{cond.properties.length} propriétés</span>
                {cond.draws.length > 0 && (
                  <span className="cond-draws">{cond.draws.join(', ')}</span>
                )}
              </div>
            ))}
          </div>
          <p className="help-text">
            Éditez les conditions dans un fichier .mrules pour des modifications avancées.
          </p>
        </div>
      )}
    </div>
  );
};

export default PropertyEditor;
