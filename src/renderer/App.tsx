import React, { useState } from 'react';
import MapEditor from './components/MapEditor';
import StyleModal from './components/StyleModal';
import StyleSelector from './components/StyleSelector';
import { RenderStyle, StylePreset } from './types';
import { DEFAULT_PRESETS, GOOGLE_MAPS_STYLE } from './presets/defaultPresets';

const STORAGE_KEY = 'carto-custom-styles';

// Deep clone a RenderStyle object
function cloneStyle(style: RenderStyle): RenderStyle {
  return JSON.parse(JSON.stringify(style));
}

// Load custom presets from localStorage
function loadCustomPresets(): StylePreset[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading custom presets:', error);
  }
  return [];
}

// Save custom presets to localStorage
function saveCustomPresets(presets: StylePreset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch (error) {
    console.error('Error saving custom presets:', error);
  }
}

const App: React.FC = () => {
  // Initialize presets: built-in + custom from localStorage
  const [presets, setPresets] = useState<StylePreset[]>(() => {
    const customPresets = loadCustomPresets();
    return [...DEFAULT_PRESETS, ...customPresets];
  });

  const [activePresetId, setActivePresetId] = useState<string>('google-maps');
  const [workingStyle, setWorkingStyle] = useState<RenderStyle>(cloneStyle(GOOGLE_MAPS_STYLE));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [pendingStyle, setPendingStyle] = useState<RenderStyle>(workingStyle);
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
  const [selectedZone, setSelectedZone] = useState<any>(null);

  // Get the active preset
  const activePreset = presets.find(p => p.id === activePresetId);

  // Handle preset selection
  const handleSelectPreset = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      setActivePresetId(presetId);
      setWorkingStyle(cloneStyle(preset.style));
      setHasUnsavedChanges(false);
    }
  };

  // Open style editor
  const handleEditStyle = () => {
    setPendingStyle(cloneStyle(workingStyle));
    setIsStyleModalOpen(true);
  };

  // Cancel style editing
  const handleCancelStyle = () => {
    setPendingStyle(cloneStyle(workingStyle));
    setIsStyleModalOpen(false);
  };

  // Apply style changes
  const handleApplyStyle = () => {
    setWorkingStyle(pendingStyle);
    setHasUnsavedChanges(true);
    setIsStyleModalOpen(false);
  };

  // Revert to original preset style
  const handleRevert = () => {
    if (activePreset) {
      setWorkingStyle(cloneStyle(activePreset.style));
      setHasUnsavedChanges(false);
    }
  };

  // Save as new custom preset
  const handleSaveAs = (name: string) => {
    const newPreset: StylePreset = {
      id: `custom-${Date.now()}`,
      name,
      isBuiltIn: false,
      style: cloneStyle(workingStyle),
    };

    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    setActivePresetId(newPreset.id);
    setHasUnsavedChanges(false);

    // Save custom presets to localStorage
    const customPresets = updatedPresets.filter(p => !p.isBuiltIn);
    saveCustomPresets(customPresets);
  };

  // Delete a custom preset
  const handleDeletePreset = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (preset && !preset.isBuiltIn) {
      const updatedPresets = presets.filter(p => p.id !== presetId);
      setPresets(updatedPresets);

      // Switch to Google Maps preset
      setActivePresetId('google-maps');
      const googleMaps = DEFAULT_PRESETS.find(p => p.id === 'google-maps');
      if (googleMaps) {
        setWorkingStyle(cloneStyle(googleMaps.style));
      }
      setHasUnsavedChanges(false);

      // Save updated custom presets to localStorage
      const customPresets = updatedPresets.filter(p => !p.isBuiltIn);
      saveCustomPresets(customPresets);
    }
  };

  return (
    <div className="app">
      <div className="map-container">
        <div className="style-panel">
          <StyleSelector
            presets={presets}
            activePresetId={activePresetId}
            hasUnsavedChanges={hasUnsavedChanges}
            onSelectPreset={handleSelectPreset}
            onEditStyle={handleEditStyle}
            onSaveAs={handleSaveAs}
            onRevert={handleRevert}
            onDeletePreset={handleDeletePreset}
          />
        </div>

        <MapEditor
          renderStyle={workingStyle}
          previewStyle={isStyleModalOpen ? pendingStyle : workingStyle}
          isPreviewMode={isStyleModalOpen}
          onZoneSelect={setSelectedZone}
          selectedZone={selectedZone}
        />
      </div>

      <StyleModal
        isOpen={isStyleModalOpen}
        style={pendingStyle}
        onStyleChange={setPendingStyle}
        onCancel={handleCancelStyle}
        onApply={handleApplyStyle}
      />
    </div>
  );
};

export default App;
