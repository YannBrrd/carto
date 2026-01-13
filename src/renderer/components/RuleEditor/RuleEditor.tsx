import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Ruleset, RenderRule, FeatureDefinition } from '../../rules/types';
import { getBuiltInRulesets } from '../../rules/defaultRules';
import { parseRuleset, serializeRuleset } from '../../rules/parser';
import FeatureList from './FeatureList';
import RuleList from './RuleList';
import PropertyEditor from './PropertyEditor';
import './RuleEditor.css';

interface RuleEditorProps {
  ruleset: Ruleset;
  onRulesetChange: (ruleset: Ruleset) => void;
  onClose: () => void;
}

type TabId = 'presets' | 'features' | 'rules' | 'import';

const RuleEditor: React.FC<RuleEditorProps> = ({ ruleset, onRulesetChange, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabId>('presets');
  const [selectedRule, setSelectedRule] = useState<RenderRule | null>(null);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const builtInRulesets = useMemo(() => getBuiltInRulesets(), []);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    if (!file.name.endsWith('.mrules')) {
      setImportError('Le fichier doit avoir l\'extension .mrules');
      setActiveTab('import');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      // Skip if component unmounted during file read
      if (!isMountedRef.current) return;

      const content = event.target?.result as string;
      if (content) {
        try {
          setImportError(null);
          const parsed = parseRuleset(content, file.name.replace('.mrules', ''));
          onRulesetChange(parsed);
          setActiveTab('rules');
        } catch (error) {
          setImportError(error instanceof Error ? error.message : 'Erreur lors de l\'import');
          setActiveTab('import');
        }
      }
    };
    reader.onerror = () => {
      // Skip if component unmounted during file read
      if (!isMountedRef.current) return;

      setImportError('Erreur lors de la lecture du fichier');
      setActiveTab('import');
    };
    reader.readAsText(file);
  }, [onRulesetChange]);

  const handlePresetSelect = useCallback((preset: Ruleset) => {
    onRulesetChange({ ...preset });
    setSelectedRule(null);
  }, [onRulesetChange]);

  const handleRuleSelect = useCallback((rule: RenderRule) => {
    setSelectedRule(rule);
  }, []);

  const handleRuleUpdate = useCallback((updatedRule: RenderRule) => {
    const ruleIndex = ruleset.rules.findIndex(r => r === selectedRule);
    if (ruleIndex >= 0) {
      const newRules = [...ruleset.rules];
      newRules[ruleIndex] = updatedRule;
      onRulesetChange({ ...ruleset, rules: newRules });
      setSelectedRule(updatedRule);
    }
  }, [ruleset, selectedRule, onRulesetChange]);

  const handleFeatureAdd = useCallback((feature: FeatureDefinition) => {
    onRulesetChange({
      ...ruleset,
      features: [...ruleset.features, feature],
    });
  }, [ruleset, onRulesetChange]);

  const handleFeatureUpdate = useCallback((index: number, feature: FeatureDefinition) => {
    const newFeatures = [...ruleset.features];
    newFeatures[index] = feature;
    onRulesetChange({ ...ruleset, features: newFeatures });
  }, [ruleset, onRulesetChange]);

  const handleFeatureDelete = useCallback((index: number) => {
    const newFeatures = ruleset.features.filter((_, i) => i !== index);
    onRulesetChange({ ...ruleset, features: newFeatures });
  }, [ruleset, onRulesetChange]);

  const handleImport = useCallback(() => {
    try {
      setImportError(null);
      const parsed = parseRuleset(importText, 'Imported Ruleset');
      onRulesetChange(parsed);
      setImportText('');
      setActiveTab('rules');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Erreur lors de l\'import');
    }
  }, [importText, onRulesetChange]);

  const handleExport = useCallback(() => {
    const serialized = serializeRuleset(ruleset);
    // Create a download link
    const blob = new Blob([serialized], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ruleset.name.replace(/\s+/g, '_').toLowerCase()}.mrules`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [ruleset]);

  return (
    <div
      className={`rule-editor ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="drop-overlay">
          <div className="drop-message">
            <span className="drop-icon">📁</span>
            <span>Déposez le fichier .mrules ici</span>
          </div>
        </div>
      )}
      <div className="rule-editor-header">
        <h2>Éditeur de Règles</h2>
        <div className="rule-editor-actions">
          <button onClick={handleExport} className="secondary">
            Exporter .mrules
          </button>
          <button onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>

      <div className="rule-editor-tabs">
        <button
          className={`tab ${activeTab === 'presets' ? 'active' : ''}`}
          onClick={() => setActiveTab('presets')}
        >
          Préréglages
        </button>
        <button
          className={`tab ${activeTab === 'features' ? 'active' : ''}`}
          onClick={() => setActiveTab('features')}
        >
          Features ({ruleset.features.length})
        </button>
        <button
          className={`tab ${activeTab === 'rules' ? 'active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          Règles ({ruleset.rules.length})
        </button>
        <button
          className={`tab ${activeTab === 'import' ? 'active' : ''}`}
          onClick={() => setActiveTab('import')}
        >
          Importer
        </button>
      </div>

      <div className="rule-editor-content">
        {activeTab === 'presets' && (
          <div className="presets-panel">
            <h3>Préréglages disponibles</h3>
            <div className="preset-list">
              {builtInRulesets.map((preset) => (
                <div
                  key={preset.name}
                  className={`preset-item ${preset.name === ruleset.name ? 'active' : ''}`}
                  onClick={() => handlePresetSelect(preset)}
                >
                  <div className="preset-name">{preset.name}</div>
                  <div className="preset-info">
                    {preset.rules.length} règles, {preset.features.length} features
                  </div>
                </div>
              ))}
            </div>

            <div className="current-ruleset-info">
              <h4>Style actuel: {ruleset.name}</h4>
              <p>{ruleset.rules.length} règles de rendu</p>
              <p>{ruleset.features.length} définitions de features</p>
            </div>
          </div>
        )}

        {activeTab === 'features' && (
          <FeatureList
            features={ruleset.features}
            onFeatureAdd={handleFeatureAdd}
            onFeatureUpdate={handleFeatureUpdate}
            onFeatureDelete={handleFeatureDelete}
          />
        )}

        {activeTab === 'rules' && (
          <div className="rules-panel">
            <div className="rules-list-panel">
              <RuleList
                rules={ruleset.rules}
                selectedRule={selectedRule}
                onRuleSelect={handleRuleSelect}
              />
            </div>
            {selectedRule && (
              <div className="rule-detail-panel">
                <PropertyEditor
                  rule={selectedRule}
                  onRuleChange={handleRuleUpdate}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'import' && (
          <div className="import-panel">
            <h3>Importer un fichier .mrules</h3>
            <p className="import-help">
              Collez le contenu d'un fichier .mrules Maperitive ci-dessous pour l'importer.
            </p>
            <textarea
              className="import-textarea"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Collez le contenu du fichier .mrules ici..."
            />
            {importError && (
              <div className="import-error">{importError}</div>
            )}
            <button
              onClick={handleImport}
              disabled={!importText.trim()}
            >
              Importer
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RuleEditor;
