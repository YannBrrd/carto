import { describe, it, expect } from 'vitest';
import L from 'leaflet';
import { createOSMOverlay } from './osmOverlay';
import { MAPS_STYLE } from '../presets/defaultPresets';
import { RenderStyle } from '../types';

const osmData = {
  elements: [
    { type: 'node', id: 1, lat: 48.856, lon: 2.351 },
    { type: 'node', id: 2, lat: 48.856, lon: 2.355, tags: { 'addr:housenumber': '12' } },
    { type: 'way', id: 100, nodes: [1, 2], tags: { highway: 'primary' } },
  ],
};

// createOSMOverlay only builds layers; it never draws them on the map
const map = {} as L.Map;

function baseStyle(): RenderStyle {
  const style = structuredClone(MAPS_STYLE);
  delete style.labels;
  for (const featureStyle of Object.values(style.highway)) {
    delete featureStyle.strokeColor;
  }
  return style;
}

function layers(style: RenderStyle, showLabels = false): any[] {
  return createOSMOverlay(map, osmData, style, { showLabels, showPOI: false }).getLayers();
}

function primaryCasing(style: RenderStyle, overrideColor?: string): L.Polyline {
  const colorOverrides = overrideColor
    ? { overrides: { 100: { wayId: 100, color: overrideColor, category: 'highway' as const } } }
    : undefined;
  const all: any[] = createOSMOverlay(map, osmData, style, { colorOverrides, showPOI: false }).getLayers();
  return all.find(layer => layer.isCasing && layer.styleType === 'primary');
}

describe('createOSMOverlay road casings', () => {
  it('derives the casing color from the fill color when no stroke color is set', () => {
    const style = baseStyle();
    style.highway.primary.color = '#fffd8b';
    expect(primaryCasing(style).options.color).toBe('#d7d563');
  });

  it('uses the explicit stroke color of a highway style for its casing', () => {
    const style = baseStyle();
    style.highway.primary.strokeColor = '#c4c7c5';
    expect(primaryCasing(style).options.color).toBe('#c4c7c5');
  });

  it('keeps highlighting overridden roads with a black casing', () => {
    const style = baseStyle();
    style.highway.primary.strokeColor = '#c4c7c5';
    expect(primaryCasing(style, '#ff0000').options.color).toBe('#000000');
  });
});

describe('createOSMOverlay house numbers', () => {
  function houseNumberHtml(style: RenderStyle): string {
    const marker = layers(style, true).find(layer => layer instanceof L.Marker) as L.Marker;
    return (marker.options.icon as L.DivIcon).options.html as string;
  }

  it('keeps black house numbers on a white halo by default', () => {
    const html = houseNumberHtml(baseStyle());
    expect(html).toContain('color: #000000;');
    expect(html).toContain('0 #ffffff');
  });

  it('applies the house number and halo colors defined by the style', () => {
    const style = baseStyle();
    style.labels = { houseNumberColor: '#80868b', haloColor: '#fefefe' };
    const html = houseNumberHtml(style);
    expect(html).toContain('color: #80868b;');
    expect(html).toContain('0 #fefefe');
    expect(html).not.toContain('#fff,');
  });
});
