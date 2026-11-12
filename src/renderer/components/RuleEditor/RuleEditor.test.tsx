import React, { useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import RuleEditor from './RuleEditor';
import { Ruleset } from '../../rules/types';
import { parseRuleset } from '../../rules/parser';

afterEach(cleanup);

const mrules = (target: string, color: string) => [
  'features',
  '\tlines',
  `\t\t${target} : highway=${target}`,
  'rules',
  `\ttarget : ${target}`,
  '\t\tdefine',
  `\t\t\tline-color : ${color}`,
  '\t\tdraw : line',
].join('\n');

function Editor({ initial }: { initial: Ruleset }) {
  const [ruleset, setRuleset] = useState(initial);
  return <RuleEditor ruleset={ruleset} onRulesetChange={setRuleset} onClose={() => {}} />;
}

describe('RuleEditor import', () => {
  it('closes the rule of the previous ruleset: the imported rules are the ones edited', () => {
    render(<Editor initial={parseRuleset(mrules('primary', '#ff0000'), 'Avant')} />);
    fireEvent.click(screen.getByRole('button', { name: /^Règles/ }));
    fireEvent.click(screen.getByText('primary'));
    expect(screen.getByText('Règle: primary')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Importer' }));
    fireEvent.change(screen.getByPlaceholderText(/Collez le contenu/), { target: { value: mrules('secondary', '#00ff00') } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Importer' }).at(-1)!);

    // Back on the rules of the imported ruleset, with no rule of the old one left open
    expect(screen.queryByText('Règle: primary')).toBeNull();
    fireEvent.click(screen.getByText('secondary'));
    const colorText = () => document.querySelector('.color-input input[type="text"]') as HTMLInputElement;
    expect(colorText().value).toBe('#00ff00');
    fireEvent.change(colorText(), { target: { value: '#0000ff' } });
    expect(colorText().value).toBe('#0000ff');  // The edit reaches the imported ruleset
  });
});
