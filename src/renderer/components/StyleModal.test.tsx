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

describe('StyleModal border opacity', () => {
  it('shows the line opacity as border opacity when the road style has none of its own', () => {
    const style = structuredClone(MAPS_STYLE);
    style.highway.primary = { color: '#ffffff', opacity: 0.7 };
    openSection(style, 'Routes');
    expect(within(rowOf('Route principale')).getByTitle('Opacité de la bordure')).toHaveProperty('value', '0.7');
  });

  it('edits the border opacity of a road apart from its line', () => {
    const style = structuredClone(MAPS_STYLE);
    style.highway.primary = { color: '#000000', opacity: 0, casingOpacity: 1, strokeColor: '#c97700' };
    const onStyleChange = openSection(style, 'Routes');
    fireEvent.change(within(rowOf('Route principale')).getByTitle('Opacité de la bordure'), { target: { value: '0.5' } });
    expect(onStyleChange.mock.calls.at(-1)![0].highway.primary)
      .toEqual({ color: '#000000', opacity: 0, casingOpacity: 0.5, strokeColor: '#c97700' });
  });

  it('offers no border opacity for buildings', () => {
    openSection(structuredClone(MAPS_STYLE), 'Bâtiments');
    expect(within(rowOf('Industriel')).queryByTitle('Opacité de la bordure')).toBeNull();
  });
});

describe('StyleModal hidden borders', () => {
  it('shows the border of a building again when a border color is picked', () => {
    const style = structuredClone(MAPS_STYLE);
    style.building.industrial = { color: '#d1d0cd', opacity: 1, casingLineStyle: 'none' };
    const onStyleChange = openSection(style, 'Bâtiments');
    fireEvent.input(within(rowOf('Industriel')).getByTitle('Couleur de bordure'), { target: { value: '#123456' } });
    expect(onStyleChange.mock.calls.at(-1)![0].building.industrial).toEqual({ color: '#d1d0cd', opacity: 1, strokeColor: '#123456' });
  });
});

describe('StyleModal building shadows', () => {
  it('shows building shadows as on unless the style turns them off', () => {
    const style = structuredClone(MAPS_STYLE);
    delete style.buildingShadows;
    openSection(style, 'Bâtiments');
    expect(screen.getByLabelText('Ombres portées (export)')).toHaveProperty('checked', true);
  });

  it('turns building shadows off', () => {
    const style = structuredClone(MAPS_STYLE);
    style.buildingShadows = true;
    const onStyleChange = openSection(style, 'Bâtiments');
    fireEvent.click(screen.getByLabelText('Ombres portées (export)'));
    expect(onStyleChange.mock.calls.at(-1)![0].buildingShadows).toBe(false);
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

describe('StyleModal underground', () => {
  it('shows the tunnel style of roads', () => {
    openSection(structuredClone(MAPS_STYLE), 'Souterrain');
    const row = rowOf('Routes en tunnel');
    expect(within(row).getByTitle('Style propre aux routes en tunnel')).toHaveProperty('checked', true);
    expect(within(row).getByTitle('Couleur de remplissage')).toHaveProperty('value', '#d7e0e5');
    expect(within(row).getByTitle('Couleur de bordure')).toHaveProperty('value', '#bcc7cf');
    expect(within(row).getByTitle('Trait')).toHaveProperty('value', '');
  });

  it('edits only what is changed in the tunnel style of roads', () => {
    const onStyleChange = openSection(structuredClone(MAPS_STYLE), 'Souterrain');
    fireEvent.input(within(rowOf('Routes en tunnel')).getByTitle('Couleur de remplissage'), { target: { value: '#eeeeee' } });
    expect(onStyleChange.mock.calls.at(-1)![0].highwayTunnel).toEqual({ color: '#eeeeee', strokeColor: '#bcc7cf' });

    fireEvent.change(within(rowOf('Routes en tunnel')).getByTitle('Trait'), { target: { value: 'dash' } });
    expect(onStyleChange.mock.calls.at(-1)![0].highwayTunnel).toEqual({ color: '#d7e0e5', strokeColor: '#bcc7cf', lineStyle: 'dash' });
  });

  it('draws roads in tunnels like other roads once their own style is turned off', () => {
    const onStyleChange = openSection(structuredClone(MAPS_STYLE), 'Souterrain');
    fireEvent.click(within(rowOf('Routes en tunnel')).getByTitle('Style propre aux routes en tunnel'));
    const updated: RenderStyle = onStyleChange.mock.calls.at(-1)![0];
    expect(updated).not.toHaveProperty('highwayTunnel');
  });

  it('starts a tunnel style of roads from the residential street colors', () => {
    const style = structuredClone(MAPS_STYLE);
    delete style.highwayTunnel;
    const onStyleChange = openSection(style, 'Souterrain');
    const checkbox = within(rowOf('Routes en tunnel')).getByTitle('Style propre aux routes en tunnel');
    expect(checkbox).toHaveProperty('checked', false);
    expect(within(rowOf('Routes en tunnel')).queryByTitle('Couleur de remplissage')).toBeNull();
    fireEvent.click(checkbox);
    expect(onStyleChange.mock.calls.at(-1)![0].highwayTunnel).toEqual({ color: '#d7e0e5', strokeColor: '#bcc7cf' });
  });

  it('shows and edits how underground waterways are drawn', () => {
    const onStyleChange = openSection(structuredClone(MAPS_STYLE), 'Souterrain');
    const select = within(rowOf("Cours d'eau souterrains")).getByTitle('Trait');
    expect(select).toHaveProperty('value', 'none');
    expect(select.querySelector('option')?.textContent).toBe('Comme en surface');

    fireEvent.change(select, { target: { value: '' } });
    expect(onStyleChange.mock.calls.at(-1)![0]).not.toHaveProperty('waterwayTunnel');

    fireEvent.change(select, { target: { value: 'dash' } });
    expect(onStyleChange.mock.calls.at(-1)![0].waterwayTunnel).toEqual({ lineStyle: 'dash' });
  });
});
