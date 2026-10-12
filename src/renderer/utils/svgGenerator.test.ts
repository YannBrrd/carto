import { describe, it, expect } from 'vitest';
import L from 'leaflet';
import { generateSVG, exportFrame, projectInFrame } from './svgGenerator';
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
    const data = { elements: [...waterData.elements.slice(0, 2), { type: 'way', id: 100, nodes: [1, 2], tags: { waterway: 'tidal_channel' } }] };
    const style = baseStyle();
    style.waterway.default = { color: '#123456', opacity: 1 };
    const svg = generateSVG(data, [zone], null, style, map);
    expect(svg).toMatch(/class="waterway-default"/);
    expect(cssRule(svg, '.waterway-default')).toMatch(/stroke:\s*#123456;/);
  });
});

// Nodes of a 0.001° square inside the zone: 11-12-13-14, and of a smaller one inside it: 21-22-23
const SQUARE_NODES = [
  { type: 'node', id: 11, lat: 48.855, lon: 2.351 },
  { type: 'node', id: 12, lat: 48.855, lon: 2.353 },
  { type: 'node', id: 13, lat: 48.857, lon: 2.353 },
  { type: 'node', id: 14, lat: 48.857, lon: 2.351 },
  { type: 'node', id: 21, lat: 48.8555, lon: 2.3515 },
  { type: 'node', id: 22, lat: 48.8555, lon: 2.3525 },
  { type: 'node', id: 23, lat: 48.8565, lon: 2.3525 },
];
const SQUARE = [11, 12, 13, 14, 11];

function renderElements(elements: any[], style: RenderStyle, colorOverrides?: any, options?: any): string {
  return generateSVG({ elements: [...osmData.elements, ...SQUARE_NODES, ...elements] }, [zone], null, style, map,
    options, colorOverrides);
}

// Paths of a class, in the colored interior copy of the content (every feature is drawn twice:
// grayscale outside the zones, in color inside)
function pathsOf(svg: string, className: string): string[] {
  const interior = svg.slice(svg.indexOf('id="layer-interior"'));
  return interior.match(new RegExp(`<path class="${className}"[^>]*>`, 'g')) ?? [];
}

describe('generateSVG feature classification', () => {
  it('draws only the features the map preview draws', () => {
    const svg = renderElements([
      { type: 'way', id: 300, nodes: SQUARE, tags: { amenity: 'parking' } },
      { type: 'way', id: 301, nodes: [1, 2], tags: { railway: 'platform' } },
      { type: 'way', id: 302, nodes: [1, 2], tags: { highway: 'proposed' } },
      { type: 'way', id: 303, nodes: SQUARE, tags: { building: 'yes', landuse: 'industrial' } },
      { type: 'way', id: 304, nodes: SQUARE, tags: { natural: 'wood', landuse: 'forest' } },
    ], baseStyle());
    expect(pathsOf(svg, 'building-commercial')).toHaveLength(0);
    expect(pathsOf(svg, 'railway-rail-ties')).toHaveLength(0);
    expect(pathsOf(svg, 'highway-residential-fill')).toHaveLength(0);
    expect(pathsOf(svg, 'building-residential')).toHaveLength(1);
    expect(pathsOf(svg, 'landuse-industrial')).toHaveLength(0);
    expect(pathsOf(svg, 'natural-wood')).toHaveLength(1);
    expect(pathsOf(svg, 'landuse-forest')).toHaveLength(0);
  });
});

describe('generateSVG color overrides', () => {
  it('recolors overridden roads and derives their casing from the override color, like the map preview', () => {
    const overrides = { overrides: { 100: { wayId: 100, color: '#ff0000', category: 'highway' as const } } };
    const svg = render(baseStyle());
    const overridden = generateSVG(osmData, [zone], null, baseStyle(), map, undefined, overrides);
    expect(pathsOf(svg, 'highway-primary-fill')[0]).not.toContain('stroke:#');
    expect(pathsOf(overridden, 'highway-primary-fill')[0]).toContain('stroke:#ff0000');
    expect(pathsOf(overridden, 'highway-primary-casing')[0]).toContain('stroke:#d70000');
  });
});

describe('generateSVG multipolygons', () => {
  const lake = [
    { type: 'way', id: 401, nodes: [11, 12, 13] },
    { type: 'way', id: 402, nodes: [13, 14, 11] },
    { type: 'way', id: 403, nodes: [21, 22, 23, 21] },
    {
      type: 'relation', id: 400, tags: { type: 'multipolygon', natural: 'water', name: 'Lac' },
      members: [{ type: 'way', ref: 401, role: 'outer' }, { type: 'way', ref: 402, role: 'outer' },
        { type: 'way', ref: 403, role: 'inner' }],
    },
  ];

  it('draws multipolygon areas with their holes', () => {
    const [path] = pathsOf(renderElements(lake, baseStyle()), 'natural-water');
    expect(path).toContain('fill-rule="evenodd"');
    expect(path.match(/M /g)).toHaveLength(2);
  });

  it('recolors a multipolygon from the override keyed by minus its relation id', () => {
    const overrides = { overrides: { [-400]: { wayId: -400, color: '#ff0000', category: 'natural' } } };
    expect(pathsOf(renderElements(lake, baseStyle(), overrides), 'natural-water')[0]).toContain('fill:#ff0000');
  });

  it('labels named multipolygon areas', () => {
    expect(renderElements(lake, baseStyle())).toMatch(/<text class="area-label area-label-water"[^>]*>Lac<\/text>/);
  });
});

describe('generateSVG areas', () => {
  it('outlines natural and landuse areas only when their style has a stroke color', () => {
    const style = baseStyle();
    style.natural.water = { color: '#90d9ed', opacity: 1 };
    style.landuse.forest = { color: '#c2f0d4', opacity: 1, strokeColor: '#8fbf9f' };
    const svg = render(style);
    expect(cssRule(svg, '.natural-water')).toMatch(/stroke:\s*none;/);
    expect(cssRule(svg, '.landuse-forest')).toMatch(/stroke:\s*#8fbf9f;\s*stroke-width:\s*1;\s*stroke-opacity:\s*0.5;/);
  });

  it('outlines buildings with a 1 px border at the export scale, dashed under construction', () => {
    const style = baseStyle();
    style.buildingStrokeEnabled = true;
    const svg = render(style);
    expect(cssRule(svg, '.building-residential')).toMatch(/stroke-width:\s*2;\s*stroke-opacity:\s*1;/);
    expect(cssRule(svg, '.building-construction')).toMatch(/stroke-dasharray:\s*6,4;/);
  });

  it('draws building shadows unless the style turns them off', () => {
    const building = [{ type: 'way', id: 300, nodes: SQUARE, tags: { building: 'yes' } }];
    const style = baseStyle();
    delete style.buildingShadows;
    expect(pathsOf(renderElements(building, style), 'building-shadow')).toHaveLength(1);
    style.buildingShadows = false;
    expect(pathsOf(renderElements(building, style), 'building-shadow')).toHaveLength(0);
  });
});

describe('generateSVG road and area labels', () => {
  it('does not label roads whose style hides them', () => {
    const style = baseStyle();
    style.highway.primary.lineStyle = 'none';
    expect(render(style)).not.toContain('Rue de Rivoli');
  });

  it('labels pedestrian streets', () => {
    const svg = renderElements([{ type: 'way', id: 300, nodes: [1, 2], tags: { highway: 'pedestrian', name: 'Rue Piétonne' } }],
      baseStyle());
    expect(svg).toContain('Rue Piétonne');
  });

  it('labels the named areas the map draws, and only those', () => {
    const svg = renderElements([
      { type: 'way', id: 300, nodes: SQUARE, tags: { landuse: 'cemetery', name: 'Cimetière' } },
      { type: 'way', id: 301, nodes: SQUARE, tags: { natural: 'grass', name: 'Pelouse' } },
    ], baseStyle());
    expect(svg).not.toContain('Cimetière');
    expect(svg).toContain('Pelouse');
  });
});

describe('generateSVG zones', () => {
  it('draws the zone border with the width and opacity of the style', () => {
    const style = baseStyle();
    style.borderWidth = 1;
    style.strokeOpacity = 0.8;
    expect(cssRule(render(style), '.zone-border')).toMatch(/stroke-width:\s*2;\s*stroke-opacity:\s*0.8;/);
  });

  it('turns the exterior gray only when the style asks for it', () => {
    const style = baseStyle();
    style.exteriorGrayscale = true;
    expect(render(style)).toMatch(/id="layer-exterior"[^>]*filter="url\(#grayscale\)"/);
    style.exteriorGrayscale = false;
    expect(render(style)).not.toMatch(/id="layer-exterior"[^>]*filter=/);
  });

  it('tints the zone interior with the interior color of the style, like the map preview', () => {
    const style = baseStyle();
    style.interiorColor = '#ffeedd';
    style.fillOpacity = 0.2;
    expect(render(style)).toMatch(/<rect class="zone-interior" [^>]*fill="#ffeedd" fill-opacity="0.2"/);
  });
});

describe('generateSVG fonts', () => {
  it('falls back to the default font for unknown font families', () => {
    const style = baseStyle();
    style.fontSize = { roads: 1, areas: 1, fontFamily: "x'; } * { fill: red", fontBold: false };
    const svg = render(style);
    expect(cssRule(svg, '.road-label')).toMatch(/font-family:\s*'Roboto'/);
    expect(svg).not.toContain('fill: red');
  });
});

describe('generateSVG colors', () => {
  it('never writes a style value that is not a color into the SVG', () => {
    const style = baseStyle();
    style.backgroundColor = '#fff;}</style><script>alert(1)</script><style>.x{';
    style.natural.water = { color: 'url(javascript:alert(1))', opacity: 1 };
    style.interiorColor = '"/><script>alert(2)</script>';
    const svg = generateSVG(osmData, [zone], null, style, map, {
      forceAllLabels: false, borderColor: '"><script>', exteriorOverlay: true, exteriorOverlayOpacity: 0.3,
      showPOI: true, showCompass: true,
    });
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('javascript:');
    expect(cssRule(svg, '.zone-border')).toMatch(/stroke:\s*#[0-9a-f]{6};/);
  });

  it('draws the casing of roads with named colors', () => {
    const style = baseStyle();
    style.highway.primary = { color: 'white', opacity: 1 };
    expect(cssRule(render(style), '.highway-primary-casing')).toMatch(/stroke:\s*#d7d7d7;/);
  });
});

describe('generateSVG line ends and joins', () => {
  // Leaflet draws lines with round ends and joins, flat ends when dashed
  it('draws railways, waterways and area outlines with the round joins of the map preview', () => {
    const style = baseStyle();
    style.landuse.forest.strokeColor = '#8fbf9f';
    const svg = render(style);
    expect(cssRule(svg, '.railway-rail-base')).toMatch(/stroke-linecap:\s*round;[\s\S]*stroke-linejoin:\s*round;/);
    expect(cssRule(svg, '.railway-rail-ties')).toMatch(/stroke-linecap:\s*round;[\s\S]*stroke-linejoin:\s*round;/);
    expect(cssRule(svg, '.waterway-river')).toMatch(/stroke-linejoin:\s*round;/);
    expect(cssRule(svg, '.landuse-forest')).toMatch(/stroke-linecap:\s*round;\s*stroke-linejoin:\s*round;/);
    expect(cssRule(svg, '.building-construction')).toMatch(/stroke-linecap:\s*butt;\s*stroke-linejoin:\s*round;/);
  });
});

describe('generateSVG border-only roads', () => {
  it('draws the border of a road whose line is transparent, and still names it, like the map preview', () => {
    const style = baseStyle();
    style.highway.primary = { color: 'transparent', opacity: 1, strokeColor: '#c97700' };
    const svg = render(style);
    expect(cssRule(svg, '.highway-primary-casing')).toMatch(/stroke:\s*#c97700;\s*stroke-opacity:\s*1;/);
    expect(cssRule(svg, '.highway-primary-fill')).toMatch(/stroke-opacity:\s*0;/);
    expect(svg).toContain('Rue de Rivoli');
  });

  it('draws the rail base of a railway with its own opacity', () => {
    const style = baseStyle();
    const rails = { color: '#ffffff', opacity: 0.5, casingOpacity: 1, strokeColor: '#8c8c8c' };
    style.railway = { rail: rails, lightRail: rails, tram: rails, subway: rails, tunnel: rails };
    const svg = render(style);
    expect(cssRule(svg, '.railway-rail-base')).toMatch(/stroke-opacity:\s*1;/);
    expect(cssRule(svg, '.railway-rail-ties')).toMatch(/stroke-opacity:\s*0.5;/);
  });
});

describe('generateSVG invisible roads', () => {
  it('does not name a road whose line is transparent without a border', () => {
    const style = baseStyle();
    style.highway.primary = { color: 'transparent', opacity: 1 };
    expect(render(style)).not.toContain('Rue de Rivoli');
  });
});

describe('exportFrame', () => {
  const bounds = L.latLngBounds([SOUTH, WEST], [NORTH, EAST]);

  it('gives the size of the SVG and the place of the selected bounds in it', () => {
    const frame = exportFrame(bounds, map);
    const svg = render(MAPS_STYLE);
    expect(svg).toContain(`width="${frame.width}"`);
    expect(svg).toContain(`height="${frame.height}"`);
    // 600 x 400 container pixels at scale 2, inside a 100-unit margin
    expect(frame.content.x).toBe(100);
    expect(frame.content.y).toBe(100);
    expect(frame.content.width).toBeCloseTo(1200);
    expect(frame.content.height).toBeCloseTo(800);
    expect(frame.width).toBeCloseTo(1400);
    expect(frame.height).toBeCloseTo(1000);
    expect(frame.bounds).toEqual({ north: NORTH, south: SOUTH, east: EAST, west: WEST });
  });

  it('projects the corners of the bounds onto the corners of the content', () => {
    const frame = exportFrame(bounds, map);
    expect(projectInFrame(frame, NORTH, WEST)).toEqual({ x: 100, y: 100 });
    const southEast = projectInFrame(frame, SOUTH, EAST);
    expect(southEast.x).toBeCloseTo(100 + frame.content.width);
    expect(southEast.y).toBeCloseTo(100 + frame.content.height);
    const middle = projectInFrame(frame, (NORTH + SOUTH) / 2, (WEST + EAST) / 2);
    expect(middle.x).toBeCloseTo(700);
    expect(middle.y).toBeCloseTo(500);
  });

  it('is the projection the SVG draws with', () => {
    const svg = render(MAPS_STYLE);
    const frame = exportFrame(bounds, map);
    // Rue de Rivoli runs from node 1 to node 2
    const start = projectInFrame(frame, 48.856, 2.351);
    const end = projectInFrame(frame, 48.856, 2.355);
    expect(svg).toContain(`M ${start.x.toFixed(2)},${start.y.toFixed(2)} L ${end.x.toFixed(2)},${end.y.toFixed(2)}`);
  });
});
