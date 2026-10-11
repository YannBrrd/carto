import { describe, it, expect } from 'vitest';
import L from 'leaflet';
import { generateSVG } from './svgGenerator';
import { MAPS_STYLE } from '../presets/defaultPresets';
import { RenderStyle, Zone } from '../types';

// Small square around Paris city hall: one primary road, one park, one named street
const NORTH = 48.858;
const SOUTH = 48.854;
const WEST = 2.350;
const EAST = 2.356;

const osmData = {
  elements: [
    { type: 'node', id: 1, lat: 48.856, lon: 2.351 },
    { type: 'node', id: 2, lat: 48.856, lon: 2.355 },
    { type: 'node', id: 3, lat: 48.857, lon: 2.351 },
    { type: 'node', id: 4, lat: 48.857, lon: 2.352 },
    { type: 'node', id: 5, lat: 48.8575, lon: 2.352 },
    { type: 'node', id: 6, lat: 48.8575, lon: 2.351 },
    {
      type: 'way', id: 100, nodes: [1, 2],
      tags: { highway: 'primary', name: 'Rue de Rivoli' },
    },
    {
      type: 'way', id: 200, nodes: [3, 4, 5, 6, 3],
      tags: { leisure: 'park', name: 'Square Saint-Jacques' },
    },
  ],
};

const zone: Zone = {
  id: 'zone-1',
  type: 'Rectangle',
  coordinates: [[NORTH, WEST], [NORTH, EAST], [SOUTH, EAST], [SOUTH, WEST]],
  bounds: L.latLngBounds([SOUTH, WEST], [NORTH, EAST]),
};

// Linear projection is enough: generateSVG only needs container pixel distances
const map = {
  latLngToContainerPoint: (latLng: L.LatLng) =>
    L.point((latLng.lng - WEST) * 100000, (NORTH - latLng.lat) * 100000),
} as unknown as L.Map;

function render(style: RenderStyle): string {
  return generateSVG(osmData, [zone], null, style, map);
}

// Extract the declarations of a CSS rule from the embedded <style> block
function cssRule(svg: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = svg.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`CSS rule not found: ${selector}`);
  return match[1];
}

function baseStyle(): RenderStyle {
  const style = structuredClone(MAPS_STYLE);
  delete style.labels;
  for (const featureStyle of Object.values(style.highway)) {
    delete featureStyle.strokeColor;
    delete featureStyle.widthScale;
  }
  return style;
}

describe('generateSVG road casings', () => {
  it('derives the casing color from the fill color when no stroke color is set', () => {
    const style = baseStyle();
    style.highway.primary.color = '#fffd8b';
    expect(cssRule(render(style), '.highway-primary-casing')).toMatch(/stroke:\s*#d7d563;/);
  });

  it('uses the explicit stroke color of a highway style for its casing', () => {
    const style = baseStyle();
    style.highway.primary.strokeColor = '#c4c7c5';
    expect(cssRule(render(style), '.highway-primary-casing')).toMatch(/stroke:\s*#c4c7c5;/);
  });
});

describe('generateSVG labels', () => {
  it('keeps the historical label colors when the style has no label settings', () => {
    const svg = render(baseStyle());
    expect(cssRule(svg, '.road-label')).toMatch(/fill:\s*#333333;[\s\S]*stroke:\s*#ffffff;/);
    expect(cssRule(svg, '.area-label')).toMatch(/fill:\s*#2d5a27;/);
    expect(cssRule(svg, '.area-label-water')).toMatch(/fill:\s*#1a5276;/);
    expect(cssRule(svg, '.area-label-forest')).toMatch(/fill:\s*#1e5631;/);
    expect(cssRule(svg, '.housenumber')).toMatch(/fill:\s*#000000;/);
  });

  it('applies the label colors defined by the style', () => {
    const style = baseStyle();
    style.labels = {
      roadColor: '#5f6368',
      areaColor: '#3a7d44',
      waterColor: '#4a6fa5',
      forestColor: '#2e6b3a',
      houseNumberColor: '#80868b',
      haloColor: '#fefefe',
    };
    const svg = render(style);
    expect(cssRule(svg, '.road-label')).toMatch(/fill:\s*#5f6368;[\s\S]*stroke:\s*#fefefe;/);
    expect(cssRule(svg, '.area-label')).toMatch(/fill:\s*#3a7d44;[\s\S]*stroke:\s*#fefefe;/);
    expect(cssRule(svg, '.area-label-water')).toMatch(/fill:\s*#4a6fa5;/);
    expect(cssRule(svg, '.area-label-forest')).toMatch(/fill:\s*#2e6b3a;/);
    expect(cssRule(svg, '.housenumber')).toMatch(/fill:\s*#80868b;[\s\S]*stroke:\s*#fefefe;/);
  });
});

describe('generateSVG road widths', () => {
  function primaryWidths(style: RenderStyle): { fill: number; casing: number } {
    const svg = render(style);
    const width = (part: string) => Number(svg.match(new RegExp(`class="highway-primary-${part}"[^>]*stroke-width:([\\d.]+)`))![1]);
    return { fill: width('fill'), casing: width('casing') };
  }

  it('scales the road fill by the width scale of its highway style, keeping the casing border', () => {
    const base = primaryWidths(baseStyle());
    const style = baseStyle();
    style.highway.primary.widthScale = 2;
    const widened = primaryWidths(style);
    expect(widened.fill).toBeCloseTo(base.fill * 2);
    expect(widened.casing - widened.fill).toBeCloseTo(base.casing - base.fill);
  });

  it('does not change the road label size', () => {
    const style = baseStyle();
    style.highway.primary.widthScale = 2;
    const fontSize = (svg: string) => svg.match(/class="road-label"[^>]*font-size="([\d.]+)"/)?.[1];
    expect(fontSize(render(style))).toBe(fontSize(render(baseStyle())));
  });
});
