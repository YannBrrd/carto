import React from 'react';
import { RenderRule } from '../../rules/types';

interface RuleListProps {
  rules: RenderRule[];
  selectedRule: RenderRule | null;
  onRuleSelect: (rule: RenderRule) => void;
}

const RuleList: React.FC<RuleListProps> = ({ rules, selectedRule, onRuleSelect }) => {
  const getTargetLabel = (rule: RenderRule): string => {
    if (rule.target.geometryType) {
      return `$featuretype(${rule.target.geometryType})`;
    }
    return rule.target.featurePattern || 'Unknown';
  };

  const getDrawCommands = (rule: RenderRule): string => {
    if (rule.draws.length === 0) {
      // Collect draws from conditionals
      const allDraws = new Set<string>();
      rule.conditionals.forEach((cond) => {
        cond.draws.forEach((d) => allDraws.add(d));
        cond.children.forEach((child) => {
          child.draws.forEach((d) => allDraws.add(d));
        });
      });
      return Array.from(allDraws).join(', ') || 'none';
    }
    return rule.draws.join(', ');
  };

  const getPreviewColor = (rule: RenderRule): string | null => {
    // Find line-color or fill-color in properties
    for (const prop of rule.properties) {
      if (prop.property === 'line-color' || prop.property === 'fill-color') {
        if (typeof prop.value === 'string' && prop.value.startsWith('#')) {
          return prop.value;
        }
      }
    }
    return null;
  };

  return (
    <div className="rule-list">
      <h3>Règles de rendu</h3>
      <div className="rule-items">
        {rules.map((rule, index) => {
          const previewColor = getPreviewColor(rule);
          return (
            <div
              key={index}
              className={`rule-item ${rule === selectedRule ? 'selected' : ''}`}
              onClick={() => onRuleSelect(rule)}
            >
              <div className="rule-preview">
                {previewColor && (
                  <div
                    className="color-preview"
                    style={{ backgroundColor: previewColor }}
                  />
                )}
              </div>
              <div className="rule-info">
                <div className="rule-target">{getTargetLabel(rule)}</div>
                <div className="rule-draws">
                  {getDrawCommands(rule)}
                </div>
              </div>
              <div className="rule-props-count">
                {rule.properties.length + rule.conditionals.length} props
              </div>
            </div>
          );
        })}
      </div>

      {rules.length === 0 && (
        <div className="empty-state">
          Aucune règle définie.
        </div>
      )}
    </div>
  );
};

export default RuleList;
