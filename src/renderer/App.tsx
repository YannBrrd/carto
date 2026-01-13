import React, { useState, useCallback, useEffect, useRef } from 'react';
import MapEditor from './components/MapEditor';
import StyleModal from './components/StyleModal';
import StyleSelector from './components/StyleSelector';
import ColorEditToolbar from './components/ColorEditToolbar';
import OfflineModePanel from './components/OfflineModePanel';
import { RuleEditor } from './components/RuleEditor';
import { RenderStyle, StylePreset, ColorOverridesState, ColorEditMode, ElementCategory, OfflineModeState, UpdateInfo, MultiZoneState, Zone } from './types';
import { calculateContextBounds, MAX_ZONES, generateZoneId } from './utils/zoneUtils';
import { DEFAULT_PRESETS, MAPS_STYLE } from './presets/defaultPresets';
import { Ruleset, getDefaultRuleset, rulesetToRenderStyle } from './rules';
import { parseOSMXml } from './utils/osmXmlParser';
import { setOfflineData, clearOfflineData } from './utils/osmData';

const STORAGE_KEY = 'carto-custom-styles';
const OFFLINE_MODE_KEY = 'carto-offline-mode';
const FONT_SETTINGS_KEY = 'carto-font-settings';

// Preference key for active preset (stored via Electron IPC)
const PREF_ACTIVE_PRESET = 'activePresetId';

// Deep clone a RenderStyle object
function cloneStyle(style: RenderStyle): RenderStyle {
  return structuredClone(style);
}

// Migrate old styles to ensure new properties exist
function migrateStyle(style: RenderStyle): RenderStyle {
  // Add construction building style if missing (added in v1.7.9)
  if (style.building && !style.building.construction) {
    style.building.construction = { color: '#f0f0f0', opacity: 0.6, strokeColor: '#c0c0c0' };
  }
  return style;
}

// Load custom presets from localStorage
function loadCustomPresets(): StylePreset[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const presets: StylePreset[] = JSON.parse(stored);
      // Migrate each preset's style to ensure new properties exist
      return presets.map(preset => ({
        ...preset,
        style: migrateStyle(preset.style)
      }));
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

// Font settings type
interface FontSettings {
  fontFamily: string;
  fontBold: boolean;
  roads: number;
  areas: number;
}

// Load font settings from localStorage
function loadFontSettings(): FontSettings | null {
  try {
    const stored = localStorage.getItem(FONT_SETTINGS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading font settings:', error);
  }
  return null;
}

// Save font settings to localStorage
function saveFontSettings(settings: FontSettings) {
  try {
    localStorage.setItem(FONT_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving font settings:', error);
  }
}

// Save active preset ID via Electron IPC
async function saveActivePresetId(presetId: string) {
  if (window.electronAPI?.setPreference) {
    await window.electronAPI.setPreference(PREF_ACTIVE_PRESET, presetId);
  }
}

// Apply saved font settings to a style
function applyFontSettings(style: RenderStyle, settings: FontSettings | null): RenderStyle {
  if (!settings) return style;
  return {
    ...style,
    fontSize: {
      ...style.fontSize,
      fontFamily: settings.fontFamily,
      fontBold: settings.fontBold,
      roads: settings.roads,
      areas: settings.areas,
    }
  };
}

const App: React.FC = () => {
  // Initialize presets: built-in + custom from localStorage
  const [presets, setPresets] = useState<StylePreset[]>(() => {
    const customPresets = loadCustomPresets();
    return [...DEFAULT_PRESETS, ...customPresets];
  });

  // Start with default preset, then load saved preference asynchronously
  const [activePresetId, setActivePresetId] = useState<string>('maps');
  const [isLoadingPreset, setIsLoadingPreset] = useState(true);

  const [workingStyle, setWorkingStyle] = useState<RenderStyle>(() => {
    const baseStyle = cloneStyle(MAPS_STYLE);
    const savedFontSettings = loadFontSettings();
    return applyFontSettings(baseStyle, savedFontSettings);
  });

  // Load saved active preset from Electron IPC on mount
  useEffect(() => {
    async function loadSavedPreset() {
      if (!window.electronAPI?.getPreference) {
        setIsLoadingPreset(false);
        return;
      }

      try {
        const savedPresetId = await window.electronAPI.getPreference<string>(PREF_ACTIVE_PRESET);
        if (savedPresetId) {
          // Verify the saved preset still exists
          const customPresets = loadCustomPresets();
          const allPresets = [...DEFAULT_PRESETS, ...customPresets];
          const savedPreset = allPresets.find(p => p.id === savedPresetId);

          if (savedPreset) {
            setActivePresetId(savedPresetId);
            const savedFontSettings = loadFontSettings();
            const newStyle = applyFontSettings(cloneStyle(savedPreset.style), savedFontSettings);
            setWorkingStyle(newStyle);
          }
        }
      } catch (error) {
        console.error('Error loading saved preset:', error);
      } finally {
        setIsLoadingPreset(false);
      }
    }

    loadSavedPreset();
  }, []);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [pendingStyle, setPendingStyle] = useState<RenderStyle>(workingStyle);
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);

  // Multi-zone state
  const [multiZoneState, setMultiZoneState] = useState<MultiZoneState>({
    zones: [],
    activeZoneId: null,
    contextBounds: null,
    contextBoundsLocked: false,
  });

  // Multi-zone callbacks
  const handleAddZone = useCallback((zone: Zone) => {
    setMultiZoneState(prev => {
      if (prev.zones.length >= MAX_ZONES) {
        return prev;
      }
      const newZones = [...prev.zones, zone];
      const newContextBounds = calculateContextBounds(
        newZones,
        prev.contextBounds,
        prev.contextBoundsLocked
      );
      return {
        ...prev,
        zones: newZones,
        activeZoneId: zone.id,
        contextBounds: newContextBounds,
      };
    });
  }, []);

  const handleUpdateZone = useCallback((zoneId: string, updates: Partial<Zone>) => {
    setMultiZoneState(prev => {
      const newZones = prev.zones.map(z =>
        z.id === zoneId ? { ...z, ...updates } : z
      );
      const newContextBounds = calculateContextBounds(
        newZones,
        prev.contextBounds,
        prev.contextBoundsLocked
      );
      return {
        ...prev,
        zones: newZones,
        contextBounds: newContextBounds,
      };
    });
  }, []);

  const handleDeleteZone = useCallback((zoneId: string) => {
    setMultiZoneState(prev => {
      const newZones = prev.zones.filter(z => z.id !== zoneId);
      const newActiveId = prev.activeZoneId === zoneId
        ? (newZones.length > 0 ? newZones[newZones.length - 1].id : null)
        : prev.activeZoneId;
      const newContextBounds = newZones.length > 0
        ? calculateContextBounds(newZones, null, false)
        : null;
      return {
        ...prev,
        zones: newZones,
        activeZoneId: newActiveId,
        contextBounds: newContextBounds,
        contextBoundsLocked: newZones.length === 0 ? false : prev.contextBoundsLocked,
      };
    });
  }, []);

  const handleSetActiveZone = useCallback((zoneId: string | null) => {
    setMultiZoneState(prev => ({
      ...prev,
      activeZoneId: zoneId,
    }));
  }, []);

  const handleUpdateContextBounds = useCallback((bounds: any) => {
    setMultiZoneState(prev => ({
      ...prev,
      contextBounds: bounds,
      contextBoundsLocked: true,
    }));
  }, []);

  const handleClearAllZones = useCallback(() => {
    setMultiZoneState({
      zones: [],
      activeZoneId: null,
      contextBounds: null,
      contextBoundsLocked: false,
    });
  }, []);

  // Color override state (individual element coloring) - NOT persisted
  const [colorOverrides, setColorOverrides] = useState<ColorOverridesState>({ overrides: {} });
  const [colorEditMode, setColorEditMode] = useState<ColorEditMode>({
    active: false,
    selectedColor: '#ffffff',
    selectedCategory: null,
    selectionMode: 'click',
  });

  // Handle color edit mode change (overrides are preserved when deactivating)
  const handleColorEditModeChange = useCallback((newMode: ColorEditMode) => {
    setColorEditMode(newMode);
  }, []);

  // Remove color overrides only for deleted zones (not when zones are modified or added)
  const prevZoneIdsRef = useRef<Set<string>>(new Set(multiZoneState.zones.map(z => z.id)));
  useEffect(() => {
    const currentZoneIds = new Set(multiZoneState.zones.map(z => z.id));
    const deletedZoneIds = [...prevZoneIdsRef.current].filter(id => !currentZoneIds.has(id));
    const addedZoneIds = [...currentZoneIds].filter(id => !prevZoneIdsRef.current.has(id));

    // Only deactivate color edit mode when zones are added or deleted (not modified)
    if (deletedZoneIds.length > 0 || addedZoneIds.length > 0) {
      setColorEditMode(prev => ({ ...prev, active: false }));
    }

    // Remove overrides for deleted zones
    if (deletedZoneIds.length > 0) {
      setColorOverrides(prev => {
        const newOverrides = { ...prev.overrides };
        for (const wayId of Object.keys(newOverrides)) {
          const override = newOverrides[Number(wayId)];
          if (override.zoneId && deletedZoneIds.includes(override.zoneId)) {
            delete newOverrides[Number(wayId)];
          }
        }
        return { overrides: newOverrides };
      });
    }

    prevZoneIdsRef.current = currentZoneIds;
  }, [multiZoneState.zones]);

  // Handle applying color override to an element (includes active zone ID for cleanup)
  const handleApplyColorOverride = useCallback((wayId: number, color: string, category: ElementCategory) => {
    setColorOverrides(prev => ({
      overrides: {
        ...prev.overrides,
        [wayId]: { wayId, color, category, zoneId: multiZoneState.activeZoneId || undefined }
      }
    }));
  }, [multiZoneState.activeZoneId]);

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

  // Panel minimized states
  const [isStylePanelMinimized, setIsStylePanelMinimized] = useState(false);

  // Update notification state
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Listen for update events
  useEffect(() => {
    if (!window.electronAPI) return;

    const cleanupAvailable = window.electronAPI.onUpdateAvailable((info) => {
      setUpdateAvailable(info);
    });

    const cleanupProgress = window.electronAPI.onUpdateDownloadProgress((progress) => {
      setIsDownloading(true);
      setDownloadProgress(Math.round(progress.percent));
    });

    const cleanupDownloaded = window.electronAPI.onUpdateDownloaded(() => {
      setIsDownloading(false);
      setUpdateDownloaded(true);
      setUpdateError(null);
    });

    const cleanupError = window.electronAPI.onUpdateError((error) => {
      console.error('Update error:', error);
      setIsDownloading(false);
      setUpdateError(error);
    });

    return () => {
      cleanupAvailable?.();
      cleanupProgress?.();
      cleanupDownloaded?.();
      cleanupError?.();
    };
  }, []);

  // Handle download update
  const handleDownloadUpdate = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      setIsDownloading(true);
      await window.electronAPI.downloadUpdate();
      // Wait for download-progress and update-downloaded events
    } catch (error) {
      console.error('Download error:', error);
      setIsDownloading(false);
    }
  }, []);

  // Handle install update
  const handleInstallUpdate = useCallback(() => {
    if (!window.electronAPI) return;
    window.electronAPI.installUpdate();
  }, []);

  // Dismiss update notification
  const handleDismissUpdate = useCallback(() => {
    setUpdateAvailable(null);
  }, []);

  // Save offline mode state when it changes
  useEffect(() => {
    saveOfflineModeState(offlineMode);
  }, [offlineMode]);

  // Save font settings when they change
  useEffect(() => {
    if (workingStyle.fontSize) {
      saveFontSettings({
        fontFamily: workingStyle.fontSize.fontFamily || 'Roboto',
        fontBold: workingStyle.fontSize.fontBold || false,
        roads: workingStyle.fontSize.roads || 1,
        areas: workingStyle.fontSize.areas || 1,
      });
    }
  }, [workingStyle.fontSize]);

  // Save active preset ID when it changes (but not during initial load)
  const isInitialLoadRef = useRef(true);
  useEffect(() => {
    if (isInitialLoadRef.current) {
      // Skip saving during initial load to avoid overwriting with default
      if (!isLoadingPreset) {
        isInitialLoadRef.current = false;
      }
      return;
    }
    saveActivePresetId(activePresetId);
  }, [activePresetId, isLoadingPreset]);

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
      // Apply saved font settings to the new preset
      const savedFontSettings = loadFontSettings();
      const newStyle = applyFontSettings(cloneStyle(preset.style), savedFontSettings);
      setWorkingStyle(newStyle);
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
      {/* Update notification banner */}
      {updateAvailable && (
        <div className="update-banner">
          <div className="update-banner-content">
            {updateError ? (
              <>
                <span style={{ color: '#ff6b6b' }}>Erreur lors du téléchargement : {updateError}</span>
                <button className="update-btn download" onClick={handleDownloadUpdate}>
                  Réessayer
                </button>
              </>
            ) : updateDownloaded ? (
              <>
                <span>Version {updateAvailable.version} prête à installer</span>
                <button className="update-btn install" onClick={handleInstallUpdate}>
                  Redémarrer et installer
                </button>
              </>
            ) : isDownloading ? (
              <>
                <span>Téléchargement en cours... {downloadProgress}%</span>
                <div className="update-progress">
                  <div className="update-progress-bar" style={{ width: `${downloadProgress}%` }} />
                </div>
              </>
            ) : (
              <>
                <span>Nouvelle version disponible : {updateAvailable.version}</span>
                <button className="update-btn download" onClick={handleDownloadUpdate}>
                  Télécharger
                </button>
              </>
            )}
          </div>
          {!isDownloading && !updateDownloaded && (
            <button className="update-btn dismiss" onClick={handleDismissUpdate}>
              ✕
            </button>
          )}
        </div>
      )}

      <div className="map-container">
        <div className={`style-panel floating-panel ${isStylePanelMinimized ? 'minimized' : ''}`}>
          <div className="panel-header" style={{ justifyContent: isStylePanelMinimized ? 'space-between' : 'flex-end', marginBottom: 0, paddingBottom: 0, border: 'none' }}>
            {isStylePanelMinimized && <span className="panel-title">Styles</span>}
            <button
              className="minimize-btn"
              onClick={() => setIsStylePanelMinimized(!isStylePanelMinimized)}
              title={isStylePanelMinimized ? 'Agrandir' : 'Réduire'}
            >
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>

          {!isStylePanelMinimized && (
            <div className="panel-body">
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
                disabled={multiZoneState.zones.length === 0}
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
          )}
        </div>

        <MapEditor
          renderStyle={workingStyle}
          previewStyle={isStyleModalOpen ? pendingStyle : workingStyle}
          isPreviewMode={isStyleModalOpen}
          multiZoneState={multiZoneState}
          onAddZone={handleAddZone}
          onUpdateZone={handleUpdateZone}
          onDeleteZone={handleDeleteZone}
          onSetActiveZone={handleSetActiveZone}
          onUpdateContextBounds={handleUpdateContextBounds}
          onClearAllZones={handleClearAllZones}
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
