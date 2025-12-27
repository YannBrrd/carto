import React, { useState, useCallback, useEffect } from 'react';
import MapEditor from './components/MapEditor';
import StyleModal from './components/StyleModal';
import StyleSelector from './components/StyleSelector';
import ColorEditToolbar from './components/ColorEditToolbar';
import OfflineModePanel from './components/OfflineModePanel';
import { RuleEditor } from './components/RuleEditor';
import { RenderStyle, StylePreset, ColorOverridesState, ColorEditMode, ElementCategory, OfflineModeState } from './types';
import { DEFAULT_PRESETS, MAPS_STYLE } from './presets/defaultPresets';
import { Ruleset, getDefaultRuleset, rulesetToRenderStyle } from './rules';
import { parseOSMXml } from './utils/osmXmlParser';
import { setOfflineData, clearOfflineData } from './utils/osmData';

const STORAGE_KEY = 'carto-custom-styles';
const OFFLINE_MODE_KEY = 'carto-offline-mode';

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

// Load offline mode state from localStorage
function loadOfflineModeState(): OfflineModeState {
  try {
    const stored = localStorage.getItem(OFFLINE_MODE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading offline mode state:', error);
  }
  return { enabled: false, filePath: null, fileName: null, dataBounds: null };
}

// Save offline mode state to localStorage
function saveOfflineModeState(state: OfflineModeState) {
  try {
    localStorage.setItem(OFFLINE_MODE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Error saving offline mode state:', error);
  }
}

const App: React.FC = () => {
  // Initialize presets: built-in + custom from localStorage
  const [presets, setPresets] = useState<StylePreset[]>(() => {
    const customPresets = loadCustomPresets();
    return [...DEFAULT_PRESETS, ...customPresets];
  });

  const [activePresetId, setActivePresetId] = useState<string>('maps');
  const [workingStyle, setWorkingStyle] = useState<RenderStyle>(cloneStyle(MAPS_STYLE));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [pendingStyle, setPendingStyle] = useState<RenderStyle>(workingStyle);
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
  const [selectedZone, setSelectedZone] = useState<any>(null);

  // Color override state (individual element coloring) - NOT persisted
  const [colorOverrides, setColorOverrides] = useState<ColorOverridesState>({ overrides: {} });
  const [colorEditMode, setColorEditMode] = useState<ColorEditMode>({
    active: false,
    selectedColor: '#ffffff',
    selectedCategory: null,
    selectionMode: 'click',
  });

  // Reset color overrides when edit mode is deactivated
  const handleColorEditModeChange = useCallback((newMode: ColorEditMode) => {
    // If mode is being deactivated, reset overrides
    if (colorEditMode.active && !newMode.active) {
      setColorOverrides({ overrides: {} });
    }
    setColorEditMode(newMode);
  }, [colorEditMode.active]);

  // Deactivate color edit mode when zone changes (and reset overrides)
  useEffect(() => {
    setColorEditMode(prev => ({ ...prev, active: false }));
    setColorOverrides({ overrides: {} });
  }, [selectedZone]);

  // Handle applying color override to an element
  const handleApplyColorOverride = useCallback((wayId: number, color: string, category: ElementCategory) => {
    setColorOverrides(prev => ({
      overrides: {
        ...prev.overrides,
        [wayId]: { wayId, color, category }
      }
    }));
  }, []);

  // Reset all color overrides
  const handleResetColorOverrides = useCallback(() => {
    setColorOverrides({ overrides: {} });
  }, []);

  // Rule engine state
  const [ruleset, setRuleset] = useState<Ruleset>(() => getDefaultRuleset());
  const [isRuleEditorOpen, setIsRuleEditorOpen] = useState(false);

  // Offline mode state
  const [offlineMode, setOfflineMode] = useState<OfflineModeState>(() => loadOfflineModeState());
  const [isLoadingOfflineFile, setIsLoadingOfflineFile] = useState(false);

  // Save offline mode state when it changes
  useEffect(() => {
    saveOfflineModeState(offlineMode);
  }, [offlineMode]);

  // Handler for toggling offline mode
  const handleToggleOfflineMode = useCallback((enabled: boolean) => {
    setOfflineMode(prev => ({ ...prev, enabled }));
    if (!enabled) {
      clearOfflineData();
    }
  }, []);

  // Handler for selecting an offline OSM file
  const handleSelectOfflineFile = useCallback(async () => {
    if (!window.electronAPI?.openOsmFile) return;

    setIsLoadingOfflineFile(true);
    try {
      const result = await window.electronAPI.openOsmFile();
      if (result.success && result.content) {
        const parsed = parseOSMXml(result.content);
        setOfflineData(parsed.data, parsed.bounds);
        setOfflineMode({
          enabled: true,
          filePath: result.filePath || null,
          fileName: result.fileName || null,
          dataBounds: parsed.bounds,
        });
      }
    } catch (error) {
      console.error('Error loading OSM file:', error);
      alert(`Erreur lors du chargement du fichier: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    } finally {
      setIsLoadingOfflineFile(false);
    }
  }, []);

  // Handler for clearing the offline file
  const handleClearOfflineFile = useCallback(() => {
    clearOfflineData();
    setOfflineMode({
      enabled: true,
      filePath: null,
      fileName: null,
      dataBounds: null,
    });
  }, []);

  // Handle ruleset changes from RuleEditor
  const handleRulesetChange = useCallback((newRuleset: Ruleset) => {
    setRuleset(newRuleset);
    // Update the working style from the ruleset for backwards compatibility
    const derivedStyle = rulesetToRenderStyle(newRuleset, 16);
    setWorkingStyle(derivedStyle);
    setHasUnsavedChanges(true);
  }, []);

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

  // Save changes to current custom preset
  const handleSave = () => {
    if (activePreset && !activePreset.isBuiltIn) {
      const updatedPresets = presets.map(p =>
        p.id === activePresetId
          ? { ...p, style: cloneStyle(workingStyle) }
          : p
      );
      setPresets(updatedPresets);
      setHasUnsavedChanges(false);

      // Save custom presets to localStorage
      const customPresets = updatedPresets.filter(p => !p.isBuiltIn);
      saveCustomPresets(customPresets);
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

      // Switch to Maps preset
      setActivePresetId('maps');
      const mapsPreset = DEFAULT_PRESETS.find(p => p.id === 'maps');
      if (mapsPreset) {
        setWorkingStyle(cloneStyle(mapsPreset.style));
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
            onSave={handleSave}
            onSaveAs={handleSaveAs}
            onRevert={handleRevert}
            onDeletePreset={handleDeletePreset}
          />
          <button
            className="rule-editor-btn"
            onClick={() => setIsRuleEditorOpen(true)}
            style={{
              marginTop: '10px',
              width: '100%',
              padding: '8px 12px',
              background: '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Éditeur de Règles Avancé
          </button>

          <ColorEditToolbar
            disabled={!selectedZone}
            colorEditMode={colorEditMode}
            onColorEditModeChange={handleColorEditModeChange}
            onResetOverrides={handleResetColorOverrides}
            overrideCount={Object.keys(colorOverrides.overrides).length}
          />

          <OfflineModePanel
            offlineMode={offlineMode}
            onToggleOfflineMode={handleToggleOfflineMode}
            onSelectFile={handleSelectOfflineFile}
            onClearFile={handleClearOfflineFile}
            isLoading={isLoadingOfflineFile}
          />
        </div>

        <MapEditor
          renderStyle={workingStyle}
          previewStyle={isStyleModalOpen ? pendingStyle : workingStyle}
          isPreviewMode={isStyleModalOpen}
          onZoneSelect={setSelectedZone}
          selectedZone={selectedZone}
          colorOverrides={colorOverrides}
          colorEditMode={colorEditMode}
          onApplyColorOverride={handleApplyColorOverride}
          useOfflineMode={offlineMode.enabled && !!offlineMode.dataBounds}
        />
      </div>

      <StyleModal
        isOpen={isStyleModalOpen}
        style={pendingStyle}
        onStyleChange={setPendingStyle}
        onCancel={handleCancelStyle}
        onApply={handleApplyStyle}
      />

      {isRuleEditorOpen && (
        <div className="rule-editor-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
        }}>
          <div style={{
            width: '90%',
            maxWidth: '1200px',
            height: '80%',
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden',
          }}>
            <RuleEditor
              ruleset={ruleset}
              onRulesetChange={handleRulesetChange}
              onClose={() => setIsRuleEditorOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
