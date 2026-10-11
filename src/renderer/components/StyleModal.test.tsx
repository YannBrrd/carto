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

describe('StyleModal footways', () => {
  it('lists footways apart from paths', () => {
    openSection(structuredClone(MAPS_STYLE), 'Routes');
    expect(rowOf('Trottoir / voie piétonne')).toBeTruthy();
    expect(rowOf('Chemin')).toBeTruthy();
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

describe('StyleModal road line style', () => {
  it('shows a solid line for a road style without line style', () => {
    const style = structuredClone(MAPS_STYLE);
    delete style.highway.secondary.lineStyle;
    openSection(style, 'Routes');
    expect(within(rowOf('Route secondaire')).getByTitle('Trait')).toHaveProperty('value', 'solid');
  });

  it('edits the line style of a road', () => {
    const style = structuredClone(MAPS_STYLE);
    style.highway.footway = { color: '#d4dce9', opacity: 1 };
    const onStyleChange = openSection(style, 'Routes');

    fireEvent.change(within(rowOf('Trottoir / voie piétonne')).getByTitle('Trait'), { target: { value: 'dot' } });

    const updated: RenderStyle = onStyleChange.mock.calls.at(-1)![0];
    expect(updated.highway.footway).toEqual({ color: '#d4dce9', opacity: 1, lineStyle: 'dot' });
  });

  it('names the line styles in French', () => {
    openSection(structuredClone(MAPS_STYLE), 'Routes');
    const select = within(rowOf('Chemin')).getByTitle('Trait');
    expect(Array.from(select.querySelectorAll('option'), option => option.textContent)).toEqual([
      'Plein', 'Pointillés', 'Tirets', 'Tirets longs', 'Trait-point', 'Trait-point-point', 'Masqué',
    ]);
  });

  it('offers no line style for buildings', () => {
    openSection(structuredClone(MAPS_STYLE), 'Bâtiments');
    expect(within(rowOf('Industriel')).queryByTitle('Trait')).toBeNull();
  });
});

describe('StyleModal railways', () => {
  it('lists each railway type, with the historical look when the style has no railway', () => {
    const style = structuredClone(MAPS_STYLE);
    delete style.railway;
    openSection(style, 'Voies ferrées');
    for (const label of ['Train', 'Métro léger', 'Tramway', 'Métro', 'Voie souterraine']) {
      const row = rowOf(label);
      expect(within(row).getByTitle('Couleur de remplissage')).toHaveProperty('value', '#ffffff');
      expect(within(row).getByTitle('Couleur de bordure')).toHaveProperty('value', '#8c8c8c');
      expect(within(row).getByTitle('Trait')).toHaveProperty('value', 'dash');
    }
  });

  it('edits the style of one railway type, keeping the others', () => {
    const style = structuredClone(MAPS_STYLE);
    delete style.railway;
    const onStyleChange = openSection(style, 'Voies ferrées');

    fireEvent.change(within(rowOf('Tramway')).getByTitle('Trait'), { target: { value: 'dashlong' } });

    const updated: RenderStyle = onStyleChange.mock.calls.at(-1)![0];
    const historical = { color: '#ffffff', opacity: 1, strokeColor: '#8c8c8c', lineStyle: 'dash', casingLineStyle: 'solid' };
    expect(updated.railway).toEqual({
      rail: historical, lightRail: historical, subway: historical, tunnel: historical, tram: { ...historical, lineStyle: 'dashlong' },
    });
  });
});
