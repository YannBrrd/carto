import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { RenderStyle } from '../types';

interface StyleModalProps {
  isOpen: boolean;
  style: RenderStyle;
  onStyleChange: (style: RenderStyle) => void;
  onCancel: () => void;
  onApply: () => void;
}

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

  const handleChange = (key: keyof RenderStyle, value: any) => {
    onStyleChange({
      ...style,
      [key]: value,
    });
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
          <div className="control-group">
            <label>Couleur intérieure</label>
            <input
              type="color"
              value={style.interiorColor}
              onChange={(e) => handleChange('interiorColor', e.target.value)}
            />
          </div>

          <div className="control-group">
            <label>Couleur de bordure</label>
            <input
              type="color"
              value={style.borderColor}
              onChange={(e) => handleChange('borderColor', e.target.value)}
            />
          </div>

          <div className="control-group">
            <label>Épaisseur de bordure</label>
            <input
              type="number"
              min="1"
              max="10"
              value={style.borderWidth}
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
              value={style.fillOpacity}
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
              value={style.strokeOpacity}
              onChange={(e) => handleChange('strokeOpacity', parseFloat(e.target.value))}
            />
          </div>

          <div className="control-group">
            <label>
              <input
                type="checkbox"
                checked={style.exteriorGrayscale}
                onChange={(e) => handleChange('exteriorGrayscale', e.target.checked)}
              />
              {' '}Extérieur en niveaux de gris
            </label>
          </div>
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
