import React from 'react';
import { RenderStyle } from '../types';

interface StylePanelProps {
  renderStyle: RenderStyle;
  onStyleChange: (style: RenderStyle) => void;
}

const StylePanel: React.FC<StylePanelProps> = ({ renderStyle, onStyleChange }) => {
  const handleChange = (key: keyof RenderStyle, value: any) => {
    onStyleChange({
      ...renderStyle,
      [key]: value,
    });
  };

  return (
    <div className="sidebar-section">
      <h2>Style de rendu</h2>
      
      <div className="control-group">
        <label>Couleur intérieure</label>
        <input
          type="color"
          value={renderStyle.interiorColor}
          onChange={(e) => handleChange('interiorColor', e.target.value)}
        />
      </div>

      <div className="control-group">
        <label>Couleur de bordure</label>
        <input
          type="color"
          value={renderStyle.borderColor}
          onChange={(e) => handleChange('borderColor', e.target.value)}
        />
      </div>

      <div className="control-group">
        <label>Épaisseur de bordure</label>
        <input
          type="number"
          min="1"
          max="10"
          value={renderStyle.borderWidth}
          onChange={(e) => handleChange('borderWidth', parseFloat(e.target.value))}
        />
      </div>

      <div className="control-group">
        <label>Opacité du remplissage</label>
        <input
          type="number"
          min="0"
          max="1"
          step="0.1"
          value={renderStyle.fillOpacity}
          onChange={(e) => handleChange('fillOpacity', parseFloat(e.target.value))}
        />
      </div>

      <div className="control-group">
        <label>Opacité du contour</label>
        <input
          type="number"
          min="0"
          max="1"
          step="0.1"
          value={renderStyle.strokeOpacity}
          onChange={(e) => handleChange('strokeOpacity', parseFloat(e.target.value))}
        />
      </div>

      <div className="control-group">
        <label>
          <input
            type="checkbox"
            checked={renderStyle.exteriorGrayscale}
            onChange={(e) => handleChange('exteriorGrayscale', e.target.checked)}
          />
          {' '}Extérieur en niveaux de gris
        </label>
      </div>
    </div>
  );
};

export default StylePanel;
