import { describe, it, expect } from 'vitest';
import L from 'leaflet';
import { createOSMOverlay } from './osmOverlay';
import { getOverlayLayerStyle } from './overlayStyle';
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
    delete featureStyle.widthScale;
    delete featureStyle.lineStyle;
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

describe('createOSMOverlay road widths', () => {
  function primaryLayers(style: RenderStyle): { fill: any; casing: any } {
    const all = layers(style);
    return {
      fill: all.find(layer => !layer.isCasing && layer.styleType === 'primary'),
      casing: all.find(layer => layer.isCasing && layer.styleType === 'primary'),
    };
  }

  it('keeps the default primary road width without a width scale', () => {
    const { fill, casing } = primaryLayers(baseStyle());
    expect(fill.options.weight).toBe(5);
    expect(casing.options.weight).toBe(7);
  });

  it('scales the road fill by the width scale of its highway style, keeping the casing border', () => {
    const style = baseStyle();
    style.highway.primary.widthScale = 2;
    const { fill, casing } = primaryLayers(style);
    expect(fill.options.weight).toBe(10);
    expect(casing.options.weight).toBe(12);
  });

  it('lets an in-place restyle apply a new width scale to the layers it created', () => {
    const { fill, casing } = primaryLayers(baseStyle());
    const style = baseStyle();
    style.highway.primary.widthScale = 2;
    expect(getOverlayLayerStyle(fill, style)?.weight).toBe(10);
    expect(getOverlayLayerStyle(casing, style)?.weight).toBe(12);
  });
});

describe('createOSMOverlay road widths by road type', () => {
  const data = {
    elements: [
      { type: 'node', id: 1, lat: 48.856, lon: 2.351 },
      { type: 'node', id: 2, lat: 48.856, lon: 2.355 },
      { type: 'way', id: 101, nodes: [1, 2], tags: { highway: 'motorway_link' } },
      { type: 'way', id: 102, nodes: [1, 2], tags: { highway: 'track' } },
    ],
  };

  function fillWeight(wayId: number): number {
    const all: any[] = createOSMOverlay(map, data, baseStyle(), { showPOI: false }).getLayers();
    return all.find(layer => layer.wayId === wayId).options.weight;
  }

  it('draws a motorway link two thirds as wide as a motorway, like the SVG export', () => {
    expect(fillWeight(101)).toBe(4);
  });

  it('draws tracks as paths, like the SVG export', () => {
    expect(fillWeight(102)).toBe(1.5);
  });
});

describe('createOSMOverlay road line styles', () => {
  function primaryLayers(style: RenderStyle): { fill: any; casing: any } {
    const all = layers(style);
    return {
      fill: all.find(layer => !layer.isCasing && layer.styleType === 'primary'),
      casing: all.find(layer => layer.isCasing && layer.styleType === 'primary'),
    };
  }

  it('dashes the road and its casing alike, in proportion to the road width, like the SVG export', () => {
    const style = baseStyle();
    style.highway.primary.lineStyle = 'dot';
    const { fill, casing } = primaryLayers(style);
    expect(fill.options.dashArray).toBe('5,5');
    expect(casing.options.dashArray).toBe('5,5');
    expect(fill.options.lineCap).toBe('butt');
    expect(casing.options.lineCap).toBe('butt');
  });

  it('lets an in-place restyle switch a road between dashed and solid', () => {
    const { fill, casing } = primaryLayers(baseStyle());
    const dashed = baseStyle();
    dashed.highway.primary.lineStyle = 'dash';
    expect(getOverlayLayerStyle(fill, dashed)).toMatchObject({ dashArray: '15,10', lineCap: 'butt' });
    expect(getOverlayLayerStyle(casing, dashed)).toMatchObject({ dashArray: '15,10', lineCap: 'butt' });
    const solid = getOverlayLayerStyle(fill, baseStyle());
    expect(solid).toHaveProperty('dashArray', undefined);
    expect(solid).toHaveProperty('lineCap', 'round');

    // Leaflet must actually drop the dashes of a layer restyled back to solid
    fill.setStyle(getOverlayLayerStyle(fill, dashed));
    expect(fill.options.dashArray).toBe('15,10');
    fill.setStyle(solid);
    expect(fill.options.dashArray).toBeUndefined();
  });

  it('hides roads whose line style is none', () => {
    const style = baseStyle();
    style.highway.primary.lineStyle = 'none';
    const { fill, casing } = primaryLayers(style);
    expect(fill.options.opacity).toBe(0);
    expect(casing.options.opacity).toBe(0);
  });
});

describe('createOSMOverlay road drawing order', () => {
  const data = {
    elements: [
      { type: 'node', id: 1, lat: 48.856, lon: 2.351 },
      { type: 'node', id: 2, lat: 48.856, lon: 2.355 },
      { type: 'way', id: 100, nodes: [1, 2], tags: { highway: 'primary' } },
      { type: 'way', id: 101, nodes: [1, 2], tags: { highway: 'cycleway' } },
      { type: 'way', id: 102, nodes: [1, 2], tags: { highway: 'residential' } },
    ],
  };

  it('draws every casing before any fill, smaller roads under bigger ones, like the SVG export', () => {
    const all: any[] = createOSMOverlay(map, data, baseStyle(), { showPOI: false }).getLayers();
    const order = all.filter(layer => layer.roadWeight).map(layer => `${layer.isCasing ? 'casing' : 'fill'}:${layer.styleType}`);
    expect(order).toEqual([
      'casing:cycleway', 'casing:residential', 'casing:primary',
      'fill:cycleway', 'fill:residential', 'fill:primary',
    ]);
  });
});
