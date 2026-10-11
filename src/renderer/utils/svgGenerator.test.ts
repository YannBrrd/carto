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
    delete featureStyle.lineStyle;
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

describe('generateSVG road widths by road type', () => {
  const linkData = {
    elements: [
      { type: 'node', id: 1, lat: 48.856, lon: 2.351 },
      { type: 'node', id: 2, lat: 48.856, lon: 2.355 },
      { type: 'node', id: 3, lat: 48.857, lon: 2.351 },
      { type: 'node', id: 4, lat: 48.857, lon: 2.355 },
      { type: 'way', id: 100, nodes: [1, 2], tags: { highway: 'motorway' } },
      { type: 'way', id: 101, nodes: [3, 4], tags: { highway: 'motorway_link' } },
    ],
  };

  it('draws a motorway link two thirds as wide as the motorway, like the map preview', () => {
    const svg = generateSVG(linkData, [zone], null, baseStyle(), map);
    // Roads may be drawn more than once (inside and outside the zone): compare distinct widths
    const fills = [...new Set([...svg.matchAll(/class="highway-motorway-fill"[^>]*stroke-width:([\d.]+)/g)].map(m => Number(m[1])))];
    expect(fills).toHaveLength(2);
    expect(Math.min(...fills) / Math.max(...fills)).toBeCloseTo(2 / 3);
  });
});

describe('generateSVG road line styles', () => {
  function primaryStyles(style: RenderStyle): { fill?: string; casing?: string } {
    const svg = render(style);
    const attr = (part: string) => svg.match(new RegExp(`class="highway-primary-${part}"[^>]*style="([^"]*)"`))?.[1];
    return { fill: attr('fill'), casing: attr('casing') };
  }

  it('draws solid roads without a dash pattern', () => {
    const { fill, casing } = primaryStyles(baseStyle());
    expect(fill).not.toContain('dasharray');
    expect(casing).not.toContain('dasharray');
  });

  it('dashes the road and its casing alike, in proportion to the road width, with flat ends', () => {
    const style = baseStyle();
    style.highway.primary.lineStyle = 'dash';
    const { fill, casing } = primaryStyles(style);
    const width = Number(fill!.match(/stroke-width:([\d.]+)/)![1]);
    const dashes = `stroke-dasharray:${width * 3},${width * 2}`;
    expect(fill).toContain(dashes);
    expect(casing).toContain(dashes);
    expect(fill).toContain('stroke-linecap:butt');
    expect(casing).toContain('stroke-linecap:butt');
  });

  it('does not draw roads whose line style is none', () => {
    const style = baseStyle();
    style.highway.primary.lineStyle = 'none';
    expect(primaryStyles(style)).toEqual({ fill: undefined, casing: undefined });
  });
});

describe('generateSVG footways', () => {
  const footData = {
    elements: [
      { type: 'node', id: 1, lat: 48.856, lon: 2.351 },
      { type: 'node', id: 2, lat: 48.856, lon: 2.355 },
      { type: 'node', id: 3, lat: 48.857, lon: 2.351 },
      { type: 'node', id: 4, lat: 48.857, lon: 2.355 },
      { type: 'way', id: 100, nodes: [1, 2], tags: { highway: 'footway' } },
      { type: 'way', id: 101, nodes: [3, 4], tags: { highway: 'path' } },
    ],
  };

  it('draws steps as footways', () => {
    const stepsData = {
      elements: [
        { type: 'node', id: 1, lat: 48.856, lon: 2.351 },
        { type: 'node', id: 2, lat: 48.856, lon: 2.355 },
        { type: 'way', id: 100, nodes: [1, 2], tags: { highway: 'steps' } },
      ],
    };
    const svg = generateSVG(stepsData, [zone], null, baseStyle(), map);
    expect(svg).toMatch(/class="highway-footway-fill"/);
    expect(svg).not.toMatch(/class="highway-residential-fill"/);
  });

  it('draws footways with their own style, apart from paths', () => {
    const style = baseStyle();
    style.highway.footway = { color: '#aaaaaa', opacity: 1, lineStyle: 'dot' };
    style.highway.path = { color: '#d4dce9', opacity: 1, lineStyle: 'dash' };
    const svg = generateSVG(footData, [zone], null, style, map);
    expect(cssRule(svg, '.highway-footway-fill')).toMatch(/stroke:\s*#aaaaaa;/);
    expect(svg).toMatch(/class="highway-footway-fill"[^>]*stroke-dasharray:3,3/);
    expect(svg).toMatch(/class="highway-path-fill"[^>]*stroke-dasharray:9,6/);
  });
});

describe('generateSVG railways', () => {
  const railData = {
    elements: [
      { type: 'node', id: 1, lat: 48.856, lon: 2.351 },
      { type: 'node', id: 2, lat: 48.856, lon: 2.355 },
      { type: 'node', id: 3, lat: 48.857, lon: 2.351 },
      { type: 'node', id: 4, lat: 48.857, lon: 2.355 },
      { type: 'way', id: 100, nodes: [1, 2], tags: { railway: 'rail' } },
      { type: 'way', id: 101, nodes: [3, 4], tags: { railway: 'tram' } },
    ],
  };

  function railParts(style: RenderStyle, type = 'rail') {
    const svg = generateSVG(railData, [zone], null, style, map);
    const attr = (cls: string) => svg.match(new RegExp(`class="${cls}"[^>]*style="([^"]*)"`))?.[1];
    return { svg, base: attr(`railway-${type}-base`), ties: attr(`railway-${type}-ties`) };
  }

  function noRailwayStyle(): RenderStyle {
    const style = baseStyle();
    delete style.railway;
    return style;
  }

  function railwayStyles(overrides: Partial<NonNullable<RenderStyle['railway']>>): NonNullable<RenderStyle['railway']> {
    const historical = { color: '#ffffff', opacity: 1, strokeColor: '#8c8c8c', lineStyle: 'dash' as const, casingLineStyle: 'solid' as const };
    return { rail: historical, lightRail: historical, tram: historical, subway: historical, tunnel: historical, ...overrides };
  }

  it('keeps the historical look without a railway style: solid gray rail, dashed white ties', () => {
    for (const type of ['rail', 'tram']) {
      const { svg, base, ties } = railParts(noRailwayStyle(), type);
      expect(cssRule(svg, `.railway-${type}-base`)).toMatch(/stroke:\s*#8c8c8c;/);
      expect(cssRule(svg, `.railway-${type}-ties`)).toMatch(/stroke:\s*#ffffff;/);
      expect(base).not.toContain('dasharray');
      expect(ties).toMatch(/stroke-dasharray:/);
    }
  });

  it('draws railways with the colors, width and line styles of their railway style', () => {
    const style = noRailwayStyle();
    style.railway = railwayStyles({ rail: { color: '#999999', opacity: 1, strokeColor: '#555555', lineStyle: 'dashlong', casingLineStyle: 'solid', widthScale: 2 } });
    const reference = railParts(noRailwayStyle());
    const { svg, base, ties } = railParts(style);
    const width = (part?: string) => Number(part!.match(/stroke-width:([\d.]+)/)![1]);
    expect(cssRule(svg, '.railway-rail-base')).toMatch(/stroke:\s*#555555;/);
    expect(cssRule(svg, '.railway-rail-ties')).toMatch(/stroke:\s*#999999;/);
    expect(width(ties)).toBeCloseTo(width(reference.ties) * 2);
    expect(width(base) - width(ties)).toBeCloseTo(width(reference.base) - width(reference.ties));
    expect(ties).toContain(`stroke-dasharray:${width(ties) * 6},${width(ties) * 2}`);
    expect(base).not.toContain('dasharray');
  });

  it('draws trams with their own style, apart from trains', () => {
    const style = noRailwayStyle();
    style.railway = railwayStyles({ tram: { color: '#f6f4f4', opacity: 1, strokeColor: '#c2c6ca' } });
    const svg = generateSVG(railData, [zone], null, style, map);
    expect(cssRule(svg, '.railway-tram-base')).toMatch(/stroke:\s*#c2c6ca;/);
    expect(cssRule(svg, '.railway-rail-base')).toMatch(/stroke:\s*#8c8c8c;/);
  });

  it('does not draw a railway type whose line style is none', () => {
    const style = noRailwayStyle();
    style.railway = railwayStyles({ tram: { color: '#999999', opacity: 1, lineStyle: 'none' } });
    expect(railParts(style, 'tram')).toMatchObject({ base: undefined, ties: undefined });
    expect(railParts(style, 'rail').ties).toBeDefined();
  });
});

describe('generateSVG road casing line styles', () => {
  it('keeps a solid casing under a dashed road when the casing has its own solid style', () => {
    const style = baseStyle();
    style.highway.primary.lineStyle = 'dash';
    style.highway.primary.casingLineStyle = 'solid';
    const svg = render(style);
    expect(svg).toMatch(/class="highway-primary-fill"[^>]*stroke-dasharray/);
    expect(svg).not.toMatch(/class="highway-primary-casing"[^>]*stroke-dasharray/);
  });
});

describe('generateSVG underground railways', () => {
  const metroData = {
    elements: [
      { type: 'node', id: 1, lat: 48.856, lon: 2.351 },
      { type: 'node', id: 2, lat: 48.856, lon: 2.355 },
      { type: 'node', id: 3, lat: 48.857, lon: 2.351 },
      { type: 'node', id: 4, lat: 48.857, lon: 2.355 },
      { type: 'way', id: 100, nodes: [1, 2], tags: { railway: 'subway', tunnel: 'yes' } },
      { type: 'way', id: 101, nodes: [3, 4], tags: { railway: 'subway', bridge: 'viaduct' } },
    ],
  };

  it('draws underground railways with the tunnel style and elevated ones with their type style', () => {
    const style = baseStyle();
    const rails = { color: '#f6f4f4', opacity: 1, strokeColor: '#c2c6ca' };
    style.railway = { rail: rails, lightRail: rails, tram: rails, subway: rails, tunnel: { ...rails, lineStyle: 'none' } };
    const svg = generateSVG(metroData, [zone], null, style, map);
    // Ways may be drawn more than once (inside and outside the zone): compare distinct paths
    const subwayPaths = new Set([...svg.matchAll(/class="railway-subway-ties" d="([^"]*)"/g)].map(m => m[1]));
    expect(subwayPaths.size).toBe(1);
    expect(svg).not.toMatch(/class="railway-tunnel-ties"/);
  });
});

describe('generateSVG roads in tunnels', () => {
  const tunnelData = {
    elements: [
      { type: 'node', id: 1, lat: 48.856, lon: 2.351 },
      { type: 'node', id: 2, lat: 48.856, lon: 2.355 },
      { type: 'node', id: 3, lat: 48.8565, lon: 2.353 },
      { type: 'node', id: 4, lat: 48.8555, lon: 2.353 },
      { type: 'way', id: 100, nodes: [1, 2], tags: { highway: 'motorway', tunnel: 'yes' } },
      { type: 'way', id: 101, nodes: [3, 4], tags: { highway: 'residential' } },
    ],
  };

  function tunnelStyle(): RenderStyle {
    const style = baseStyle();
    style.highway.motorway = { color: '#8aa4be', opacity: 1, strokeColor: '#6f90b1' };
    style.highwayTunnel = { color: '#d7e0e5', strokeColor: '#bcc7cf' };
    return style;
  }

  it('draws roads in tunnels with the tunnel style', () => {
    const svg = generateSVG(tunnelData, [zone], null, tunnelStyle(), map);
    expect(svg).toMatch(/class="highway-motorway-fill tunnel"/);
    expect(cssRule(svg, '.highway-motorway-fill.tunnel')).toMatch(/stroke:\s*#d7e0e5;/);
    expect(cssRule(svg, '.highway-motorway-casing.tunnel')).toMatch(/stroke:\s*#bcc7cf;/);
    expect(cssRule(svg, '.highway-motorway-fill')).toMatch(/stroke:\s*#8aa4be;/);
  });

  it('draws roads in tunnels under the roads above ground', () => {
    const svg = generateSVG(tunnelData, [zone], null, tunnelStyle(), map);
    expect(svg.indexOf('class="highway-motorway-fill tunnel"')).toBeLessThan(svg.indexOf('class="highway-residential-casing"'));
  });

  it('draws roads in tunnels like other roads without a tunnel style', () => {
    const style = tunnelStyle();
    delete style.highwayTunnel;
    const svg = generateSVG(tunnelData, [zone], null, style, map);
    expect(svg).toMatch(/class="highway-motorway-fill tunnel"/);
    expect(svg).not.toMatch(/\.highway-motorway-fill\.tunnel\s*\{/);
  });

  it('hides roads in tunnels whose tunnel line style is none', () => {
    const style = tunnelStyle();
    style.highwayTunnel = { lineStyle: 'none' };
    const svg = generateSVG(tunnelData, [zone], null, style, map);
    expect(svg).not.toMatch(/class="highway-motorway-(fill|casing) tunnel"/);
    expect(svg).toMatch(/class="highway-residential-fill"/);
  });
});

describe('generateSVG underground waterways', () => {
  const waterData = {
    elements: [
      { type: 'node', id: 1, lat: 48.856, lon: 2.351 },
      { type: 'node', id: 2, lat: 48.856, lon: 2.355 },
      { type: 'node', id: 3, lat: 48.857, lon: 2.351 },
      { type: 'node', id: 4, lat: 48.857, lon: 2.355 },
      { type: 'way', id: 100, nodes: [1, 2], tags: { waterway: 'stream', tunnel: 'culvert' } },
      { type: 'way', id: 101, nodes: [3, 4], tags: { waterway: 'stream' } },
    ],
  };

  it('hides underground waterways whose tunnel line style is none', () => {
    const style = baseStyle();
    style.waterwayTunnel = { lineStyle: 'none' };
    const svg = generateSVG(waterData, [zone], null, style, map);
    const streams = new Set([...svg.matchAll(/class="waterway-stream[^"]*" d="([^"]*)"/g)].map(m => m[1]));
    expect(streams.size).toBe(1);
    expect(svg).not.toMatch(/class="waterway-stream tunnel"/);
  });

  it('dashes underground waterways with the tunnel line style, in proportion to their width', () => {
    const style = baseStyle();
    style.waterwayTunnel = { lineStyle: 'dash', opacity: 0.5 };
    const svg = generateSVG(waterData, [zone], null, style, map);
    expect(svg).toMatch(/class="waterway-stream tunnel"[^>]*stroke-dasharray:12,8/);
    expect(cssRule(svg, '.waterway-stream.tunnel')).toMatch(/stroke-opacity:\s*0.5;/);
  });

  it('draws waterways of other types with the default waterway style, like the map preview', () => {
    const data = { elements: [...waterData.elements.slice(0, 2), { type: 'way', id: 100, nodes: [1, 2], tags: { waterway: 'pressurised' } }] };
    const style = baseStyle();
    style.waterway.default = { color: '#123456', opacity: 1 };
    const svg = generateSVG(data, [zone], null, style, map);
    expect(svg).toMatch(/class="waterway-default"/);
    expect(cssRule(svg, '.waterway-default')).toMatch(/stroke:\s*#123456;/);
  });
});
