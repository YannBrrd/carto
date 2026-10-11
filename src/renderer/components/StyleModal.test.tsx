import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import StyleModal from './StyleModal';
import { MAPS_STYLE } from '../presets/defaultPresets';
import { RenderStyle } from '../types';

afterEach(cleanup);

function openSection(style: RenderStyle, title: string, onStyleChange = vi.fn()) {
  render(
    <StyleModal isOpen style={style} onStyleChange={onStyleChange} onCancel={vi.fn()} onApply={vi.fn()} />
  );
  fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }));
  return onStyleChange;
}

function rowOf(label: string): HTMLElement {
  return screen.getByText(label).closest('.feature-style-row') as HTMLElement;
}

describe('StyleModal road casing color', () => {
  it('shows the derived casing color when the road style has none', () => {
    const style = structuredClone(MAPS_STYLE);
    style.highway.primary = { color: '#fffd8b', opacity: 1 };
    openSection(style, 'Routes');
    expect(within(rowOf('Route principale')).getByTitle('Couleur de bordure')).toHaveProperty('value', '#d7d563');
  });

  it('edits the casing color of a road', () => {
    const style = structuredClone(MAPS_STYLE);
    style.highway.primary = { color: '#ffffff', opacity: 1, strokeColor: '#dadce0' };
    const onStyleChange = openSection(style, 'Routes');

    fireEvent.input(within(rowOf('Route principale')).getByTitle('Couleur de bordure'), {
      target: { value: '#c4c7c5' },
    });

    const updated: RenderStyle = onStyleChange.mock.calls.at(-1)![0];
    expect(updated.highway.primary).toEqual({ color: '#ffffff', opacity: 1, strokeColor: '#c4c7c5' });
  });
});

describe('StyleModal building border color', () => {
  it('shows the same derived border color as the one rendered', () => {
    const style = structuredClone(MAPS_STYLE);
    style.building.industrial = { color: '#d1d0cd', opacity: 1 };
    openSection(style, 'Bâtiments');
    expect(within(rowOf('Industriel')).getByTitle('Couleur de bordure')).toHaveProperty('value', '#a9a8a5');
  });
});

describe('StyleModal road width', () => {
  it('shows the default width for a road style without width scale', () => {
    const style = structuredClone(MAPS_STYLE);
    delete style.highway.secondary.widthScale;
    openSection(style, 'Routes');
    expect(within(rowOf('Route secondaire')).getByTitle('Largeur')).toHaveProperty('value', '1');
    expect(within(rowOf('Route secondaire')).getByText('×1.00')).toBeTruthy();
  });

  it('edits the width scale of a road', () => {
    const style = structuredClone(MAPS_STYLE);
    style.highway.secondary = { color: '#8aa4be', opacity: 1, strokeColor: '#6f90b1' };
    const onStyleChange = openSection(style, 'Routes');

    fireEvent.change(within(rowOf('Route secondaire')).getByTitle('Largeur'), { target: { value: '2.25' } });

    const updated: RenderStyle = onStyleChange.mock.calls.at(-1)![0];
    expect(updated.highway.secondary).toEqual({ color: '#8aa4be', opacity: 1, strokeColor: '#6f90b1', widthScale: 2.25 });
  });

  it('offers no width control for buildings', () => {
    openSection(structuredClone(MAPS_STYLE), 'Bâtiments');
    expect(within(rowOf('Industriel')).queryByTitle('Largeur')).toBeNull();
  });
});
