import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PropertyEditor from './PropertyEditor';
import { RenderRule, Ruleset } from '../../rules/types';
import { rulesetToRenderStyle } from '../../rules/converter';
import { MAPS_RULESET } from '../../rules/defaultRules';

afterEach(cleanup);

const rule = (properties: RenderRule['properties'] = []): RenderRule => ({
  target: { featurePattern: 'highway_primary' },
  properties,
  draws: ['line'],
  conditionals: [],
});

function addProperty(name: string, value: string, initial: RenderRule = rule()) {
  const onRuleChange = vi.fn();
  render(<PropertyEditor rule={initial} onRuleChange={onRuleChange} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: name } });
  fireEvent.change(screen.getByPlaceholderText('Valeur'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: '+' }));
  return onRuleChange;
}

describe('PropertyEditor line width and font size', () => {
  it('adds a line width as a number, which the converter reads', () => {
    const onRuleChange = addProperty('line-width', '3');
    const updated: RenderRule = onRuleChange.mock.calls[0][0];
    expect(updated.properties).toEqual([{ property: 'line-width', value: 3 }]);

    // A width the editor adds scales the road, a text would be ignored
    const withWidth: Ruleset = { ...MAPS_RULESET, rules: [...MAPS_RULESET.rules, updated] };
    const scale = rulesetToRenderStyle(withWidth).highway.primary.widthScale;
    expect(scale).not.toBe(rulesetToRenderStyle(MAPS_RULESET).highway.primary.widthScale);
  });

  it('adds a width given per zoom as a zoom-dependent value', () => {
    const onRuleChange = addProperty('line-width', '13:1;16:4');
    expect(onRuleChange.mock.calls[0][0].properties[0].value).toEqual({
      type: 'zoom-dependent', stops: [{ zoom: 13, value: 1 }, { zoom: 16, value: 4 }],
    });
  });

  it('adds nothing when the width is not a number', () => {
    const onRuleChange = addProperty('line-width', 'large');
    expect(onRuleChange).not.toHaveBeenCalled();
  });

  it('keeps an edited width a number', () => {
    const onRuleChange = vi.fn();
    render(<PropertyEditor rule={rule([{ property: 'line-width', value: 2 }])} onRuleChange={onRuleChange} />);
    const input = screen.getByDisplayValue('2') as HTMLInputElement;
    expect(input.type).toBe('number');
    fireEvent.change(input, { target: { value: '5' } });
    expect(onRuleChange.mock.calls[0][0].properties[0]).toEqual({ property: 'line-width', value: 5 });
    fireEvent.change(input, { target: { value: '' } });
    expect(onRuleChange).toHaveBeenCalledTimes(1);  // An emptied field writes nothing
  });

  it('shows a width saved as text as its number', () => {
    render(<PropertyEditor rule={rule([{ property: 'font-size', value: '12' }])} onRuleChange={vi.fn()} />);
    expect((screen.getByDisplayValue('12') as HTMLInputElement).type).toBe('number');
  });
});
