import React, { useState } from 'react';
import { FeatureDefinition, GeometryType, TagCondition, CompoundCondition } from '../../rules/types';

interface FeatureListProps {
  features: FeatureDefinition[];
  onFeatureAdd: (feature: FeatureDefinition) => void;
  onFeatureUpdate: (index: number, feature: FeatureDefinition) => void;
  onFeatureDelete: (index: number) => void;
}

const FeatureList: React.FC<FeatureListProps> = ({
  features,
  onFeatureAdd,
  onFeatureUpdate,
  onFeatureDelete,
}) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newFeature, setNewFeature] = useState<Partial<FeatureDefinition>>({
    name: '',
    geometryTypes: ['line'],
    conditions: { key: '', operator: 'equals', value: '' },
  });

  const handleToggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const handleAddNew = () => {
    if (newFeature.name && (newFeature.conditions as TagCondition).key) {
      onFeatureAdd({
        name: newFeature.name,
        geometryTypes: newFeature.geometryTypes || ['line'],
        conditions: newFeature.conditions as TagCondition,
      });
      setNewFeature({
        name: '',
        geometryTypes: ['line'],
        conditions: { key: '', operator: 'equals', value: '' },
      });
      setIsAddingNew(false);
    }
  };

  const renderCondition = (condition: TagCondition | CompoundCondition): string => {
    if ('type' in condition && (condition.type === 'and' || condition.type === 'or')) {
      return condition.conditions.map(c => renderCondition(c)).join(` ${condition.type.toUpperCase()} `);
    }
    const tc = condition as TagCondition;
    switch (tc.operator) {
      case 'equals':
        return `${tc.key}=${tc.value}`;
      case 'not_equals':
        return `NOT ${tc.key}=${tc.value}`;
      case 'exists':
        return `${tc.key}=*`;
      case 'one_of':
        return `${tc.key} IN (${tc.values?.join(', ')})`;
      default:
        return tc.key;
    }
  };

  const geometryIcons: Record<GeometryType, string> = {
    point: '●',
    line: '─',
    area: '▢',
  };

  return (
    <div className="feature-list">
      <div className="feature-list-header">
        <h3>Définitions de Features</h3>
        <button onClick={() => setIsAddingNew(true)} disabled={isAddingNew}>
          + Ajouter
        </button>
      </div>

      {isAddingNew && (
        <div className="feature-item new-feature">
          <div className="feature-form">
            <div className="form-row">
              <label>Nom:</label>
              <input
                type="text"
                value={newFeature.name || ''}
                onChange={(e) => setNewFeature({ ...newFeature, name: e.target.value })}
                placeholder="ex: highway_primary"
              />
            </div>
            <div className="form-row">
              <label>Types de géométrie:</label>
              <div className="geometry-checkboxes">
                {(['point', 'line', 'area'] as GeometryType[]).map((type) => (
                  <label key={type}>
                    <input
                      type="checkbox"
                      checked={newFeature.geometryTypes?.includes(type) || false}
                      onChange={(e) => {
                        const types = newFeature.geometryTypes || [];
                        if (e.target.checked) {
                          setNewFeature({ ...newFeature, geometryTypes: [...types, type] });
                        } else {
                          setNewFeature({ ...newFeature, geometryTypes: types.filter(t => t !== type) });
                        }
                      }}
                    />
                    {geometryIcons[type]} {type}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-row">
              <label>Condition - Clé:</label>
              <input
                type="text"
                value={(newFeature.conditions as TagCondition)?.key || ''}
                onChange={(e) => setNewFeature({
                  ...newFeature,
                  conditions: { ...(newFeature.conditions as TagCondition), key: e.target.value }
                })}
                placeholder="ex: highway"
              />
            </div>
            <div className="form-row">
              <label>Condition - Valeur:</label>
              <input
                type="text"
                value={(newFeature.conditions as TagCondition)?.value || ''}
                onChange={(e) => setNewFeature({
                  ...newFeature,
                  conditions: { ...(newFeature.conditions as TagCondition), value: e.target.value }
                })}
                placeholder="ex: primary"
              />
            </div>
            <div className="form-actions">
              <button onClick={handleAddNew}>Ajouter</button>
              <button className="secondary" onClick={() => setIsAddingNew(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      <div className="feature-items">
        {features.map((feature, index) => (
          <div
            key={`${feature.name}-${index}`}
            className={`feature-item ${expandedIndex === index ? 'expanded' : ''}`}
          >
            <div
              className="feature-summary"
              onClick={() => handleToggleExpand(index)}
            >
              <div className="feature-name">
                <span className="geometry-types">
                  {feature.geometryTypes.map(t => geometryIcons[t]).join('')}
                </span>
                {feature.name}
              </div>
              <div className="feature-condition">
                {renderCondition(feature.conditions)}
              </div>
              <button
                className="delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onFeatureDelete(index);
                }}
              >
                ✕
              </button>
            </div>

            {expandedIndex === index && (
              <div className="feature-details">
                <div className="form-row">
                  <label>Nom:</label>
                  <input
                    type="text"
                    value={feature.name}
                    onChange={(e) => onFeatureUpdate(index, { ...feature, name: e.target.value })}
                  />
                </div>
                <div className="form-row">
                  <label>Types:</label>
                  <div className="geometry-checkboxes">
                    {(['point', 'line', 'area'] as GeometryType[]).map((type) => (
                      <label key={type}>
                        <input
                          type="checkbox"
                          checked={feature.geometryTypes.includes(type)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onFeatureUpdate(index, {
                                ...feature,
                                geometryTypes: [...feature.geometryTypes, type],
                              });
                            } else {
                              onFeatureUpdate(index, {
                                ...feature,
                                geometryTypes: feature.geometryTypes.filter(t => t !== type),
                              });
                            }
                          }}
                        />
                        {geometryIcons[type]} {type}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {features.length === 0 && !isAddingNew && (
        <div className="empty-state">
          Aucune feature définie. Cliquez sur "Ajouter" pour en créer une.
        </div>
      )}
    </div>
  );
};

export default FeatureList;
