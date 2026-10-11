import { describe, it, expect } from 'vitest';
import {
  resolveStrokeColor, resolveLabelStyle, resolveRailwayStyle, getRailwayStyleKey, scaleRoadWeight, DEFAULT_LABEL_STYLE,
  applyTunnelStyle, resolveHighwayStyle, resolveWaterwayStyle, getWaterwayStyleKey, areaPaint, resolveFontFamily,
} from './styleResolvers';
import { MAPS_STYLE } from '../presets/defaultPresets';
import { RenderStyle } from '../types';

describe('resolveStrokeColor', () => {
  it('uses the explicit stroke color when the style defines one', () => {
    expect(resolveStrokeColor({ color: '#ffffff', opacity: 1, strokeColor: '#dadce0' })).toBe('#dadce0');
  });

  it('derives a darker outline from the fill when no stroke color is set', () => {
    expect(resolveStrokeColor({ color: '#ffffff', opacity: 1 })).toBe('#d7d7d7');
  });

  it('treats an empty stroke color as unset', () => {
    expect(resolveStrokeColor({ color: '#ffffff', opacity: 1, strokeColor: '' })).toBe('#d7d7d7');
  });

  it('derives the outline from a per-element override color, ignoring the style stroke', () => {
    expect(resolveStrokeColor({ color: '#ffffff', opacity: 1, strokeColor: '#dadce0' }, '#ff0000')).toBe('#d70000');
  });
});

describe('resolveLabelStyle', () => {
  const styleWithoutLabels = (): RenderStyle => {
    const style = structuredClone(MAPS_STYLE);
    delete style.labels;
    return style;
  };

  it('keeps the historical label colors when the style has no label settings', () => {
    expect(resolveLabelStyle(styleWithoutLabels())).toEqual({
      roadColor: '#333333',
      areaColor: '#2d5a27',
      waterColor: '#1a5276',
      forestColor: '#1e5631',
      houseNumberColor: '#000000',
      haloColor: '#ffffff',
    });
  });

  it('overrides only the label colors the style defines', () => {
    const style = { ...styleWithoutLabels(), labels: { roadColor: '#5f6368' } };
    expect(resolveLabelStyle(style)).toEqual({ ...DEFAULT_LABEL_STYLE, roadColor: '#5f6368' });
  });

  it('falls back to the default for label colors that are empty or undefined', () => {
    const style = { ...styleWithoutLabels(), labels: { roadColor: '', haloColor: undefined } };
    expect(resolveLabelStyle(style)).toEqual(DEFAULT_LABEL_STYLE);
  });

  it('accepts hex, named and rgb label colors', () => {
    const style = {
      ...styleWithoutLabels(),
      labels: { roadColor: '#5F6368', haloColor: 'white', areaColor: 'rgba(58, 125, 68, 0.9)', waterColor: '#4a6fa5cc' },
    };
    expect(resolveLabelStyle(style)).toMatchObject(style.labels);
  });

  it('rejects label colors that could inject markup or CSS (e.g. from an imported ruleset)', () => {
    const style = {
      ...styleWithoutLabels(),
      labels: {
        haloColor: '#fff;"><img src=x onerror=alert(1)>',
        roadColor: 'red; } .background { fill: url(http://evil) ',
      },
    };
    expect(resolveLabelStyle(style)).toEqual(DEFAULT_LABEL_STYLE);
  });

  it('does not let the returned object alias the shared defaults', () => {
    const resolved = resolveLabelStyle(styleWithoutLabels());
    resolved.roadColor = '#123456';
    expect(DEFAULT_LABEL_STYLE.roadColor).toBe('#333333');
  });
});

describe('scaleRoadWeight', () => {
  const road = { color: '#d7e0e5', opacity: 1 };

  it('keeps the default road width when the style sets no width scale', () => {
    expect(scaleRoadWeight({ fill: 4, casing: 6 }, road)).toEqual({ fill: 4, casing: 6 });
  });

  it('widens the road fill and keeps the casing border as thick as before', () => {
    expect(scaleRoadWeight({ fill: 4, casing: 6 }, { ...road, widthScale: 2.25 })).toEqual({ fill: 9, casing: 11 });
  });

  it('narrows the road the same way', () => {
    expect(scaleRoadWeight({ fill: 4, casing: 6 }, { ...road, widthScale: 0.5 })).toEqual({ fill: 2, casing: 4 });
  });

  it('leaves the other weight values, such as the label font size, untouched', () => {
    expect(scaleRoadWeight({ fill: 4, casing: 6, fontSize: 8 }, { ...road, widthScale: 2 })).toEqual({ fill: 8, casing: 10, fontSize: 8 });
  });

  it('ignores width scales that are not a positive number (e.g. from an imported preset)', () => {
    for (const widthScale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '2' as unknown as number]) {
      expect(scaleRoadWeight({ fill: 4, casing: 6 }, { ...road, widthScale })).toEqual({ fill: 4, casing: 6 });
    }
  });
});

describe('getRailwayStyleKey', () => {
  it.each([
    ['rail', 'rail'], ['narrow_gauge', 'rail'], ['preserved', 'rail'], ['funicular', 'rail'], ['monorail', 'rail'],
    ['light_rail', 'lightRail'], ['tram', 'tram'], ['subway', 'subway'],
  ])('styles railway=%s with the %s style', (railway, key) => {
    expect(getRailwayStyleKey({ railway })).toBe(key);
  });

  it.each([
    [{ railway: 'subway', tunnel: 'yes' }],
    [{ railway: 'rail', tunnel: 'yes', layer: '-2' }],
    [{ railway: 'subway', location: 'underground' }],
    [{ railway: 'tram', tunnel: 'culvert' }],
  ])('styles underground railways %o with the tunnel style', (tags) => {
    expect(getRailwayStyleKey(tags)).toBe('tunnel');
  });

  it.each([
    [{ railway: 'subway', bridge: 'viaduct' }, 'subway'],
    [{ railway: 'rail', tunnel: 'no' }, 'rail'],
    [{ railway: 'rail', tunnel: 'building_passage' }, 'rail'],
    [{ railway: 'rail', tunnel: 'avalanche_protector' }, 'rail'],
    [{ railway: 'rail', layer: '-1' }, 'rail'],
  ])('styles railways above ground %o by their type', (tags, key) => {
    expect(getRailwayStyleKey(tags)).toBe(key);
  });
});

describe('resolveRailwayStyle', () => {
  const historical = { color: '#ffffff', opacity: 1, strokeColor: '#8c8c8c', lineStyle: 'dash', casingLineStyle: 'solid' };

  it('keeps the historical railway look (white ties over a gray rail) when the style has no railway', () => {
    const style = structuredClone(MAPS_STYLE);
    delete style.railway;
    for (const type of ['rail', 'lightRail', 'tram', 'subway', 'tunnel'] as const) {
      expect(resolveRailwayStyle(style, type)).toEqual(historical);
    }
  });

  it('uses the style of the railway type', () => {
    const style = structuredClone(MAPS_STYLE);
    const tram = { color: '#999999', opacity: 1, strokeColor: '#555555', lineStyle: 'dashlong' as const };
    style.railway = { ...style.railway!, tram };
    expect(resolveRailwayStyle(style, 'tram')).toEqual(tram);
  });

  it('falls back to the historical look for a type missing from the style (e.g. an imported preset)', () => {
    const style = structuredClone(MAPS_STYLE);
    delete (style.railway as Partial<NonNullable<RenderStyle['railway']>>).subway;
    expect(resolveRailwayStyle(style, 'subway')).toEqual(historical);
  });

  it('draws underground railways like trains when the style has no tunnel style (styles saved before it)', () => {
    const style = structuredClone(MAPS_STYLE);
    const rail = { color: '#999999', opacity: 1, strokeColor: '#555555' };
    style.railway = { ...style.railway!, rail };
    delete (style.railway as Partial<NonNullable<RenderStyle['railway']>>).tunnel;
    expect(resolveRailwayStyle(style, 'tunnel')).toEqual(rail);
  });

  it('does not let the returned object alias the shared default', () => {
    const style = structuredClone(MAPS_STYLE);
    delete style.railway;
    resolveRailwayStyle(style, 'rail').color = '#123456';
    expect(resolveRailwayStyle(style, 'rail').color).toBe('#ffffff');
  });
});

describe('applyTunnelStyle', () => {
  const road = { color: '#8aa4be', opacity: 1, strokeColor: '#6f90b1', widthScale: 1.5, lineStyle: 'solid' as const };

  it('keeps the style when there is no tunnel style', () => {
    expect(applyTunnelStyle(road, undefined)).toEqual(road);
  });

  it('overrides only what the tunnel style sets, keeping the width', () => {
    expect(applyTunnelStyle(road, { color: '#d7e0e5', strokeColor: '#bcc7cf' }))
      .toEqual({ ...road, color: '#d7e0e5', strokeColor: '#bcc7cf' });
    expect(applyTunnelStyle(road, { opacity: 0.4, casingLineStyle: 'dash' }))
      .toEqual({ ...road, opacity: 0.4, casingLineStyle: 'dash' });
  });

  it('ignores invalid tunnel values (e.g. from an imported preset)', () => {
    const invalid = { color: 3, strokeColor: '', opacity: Number.NaN, lineStyle: 'zigzag', casingLineStyle: 'dotted' } as never;
    expect(applyTunnelStyle(road, invalid)).toEqual(road);
  });
});

describe('resolveHighwayStyle', () => {
  const style = (): RenderStyle => ({ ...structuredClone(MAPS_STYLE), highwayTunnel: { color: '#d7e0e5', strokeColor: '#bcc7cf' } });

  it('uses the road level style above ground', () => {
    expect(resolveHighwayStyle(style(), 'motorway', { highway: 'motorway' })).toEqual(MAPS_STYLE.highway.motorway);
  });

  it('applies the tunnel style to roads underground', () => {
    expect(resolveHighwayStyle(style(), 'motorway', { highway: 'motorway', tunnel: 'yes' }))
      .toEqual({ ...MAPS_STYLE.highway.motorway, color: '#d7e0e5', strokeColor: '#bcc7cf' });
  });

  it('draws roads through a building passage like other roads', () => {
    expect(resolveHighwayStyle(style(), 'residential', { highway: 'residential', tunnel: 'building_passage' }))
      .toEqual(MAPS_STYLE.highway.residential);
  });
});

describe('resolveWaterwayStyle', () => {
  it('applies the underground waterway style to culverts', () => {
    const style = { ...structuredClone(MAPS_STYLE), waterwayTunnel: { lineStyle: 'none' as const } };
    expect(resolveWaterwayStyle(style, 'stream', { waterway: 'stream', tunnel: 'culvert' }))
      .toEqual({ ...MAPS_STYLE.waterway.stream, lineStyle: 'none' });
    expect(resolveWaterwayStyle(style, 'stream', { waterway: 'stream' })).toEqual(MAPS_STYLE.waterway.stream);
  });
});

describe('getWaterwayStyleKey', () => {
  it.each([
    ['river', 'river'], ['stream', 'stream'], ['brook', 'stream'],
    ['canal', 'canal'], ['ditch', 'canal'], ['drain', 'canal'], ['pressurised', 'default'], ['weir', 'default'],
  ])('styles waterway=%s with the %s style', (waterway, key) => {
    expect(getWaterwayStyleKey(waterway)).toBe(key);
  });
});

describe('areaPaint', () => {
  function style(): RenderStyle {
    const result = structuredClone(MAPS_STYLE);
    result.building.residential = { color: '#e8e4e0', opacity: 0.8, strokeColor: '#c0c0c0' };
    result.building.construction = { color: '#e8e4e0', opacity: 0.6 };
    result.buildingStrokeEnabled = true;
    result.natural.water = { color: '#90d9ed', opacity: 1 };
    result.landuse.forest = { color: '#c2f0d4', opacity: 0.9, strokeColor: '#8fbf9f' };
    return result;
  }

  it('fills buildings and outlines them with a 1 px opaque border', () => {
    expect(areaPaint(style(), 'building', 'residential')).toEqual({
      fill: '#e8e4e0', fillOpacity: 0.8, stroke: '#c0c0c0', strokeWidth: 1, strokeOpacity: 1, dashArray: null,
    });
  });

  it('dashes the border of buildings under construction', () => {
    expect(areaPaint(style(), 'building', 'construction')).toMatchObject({ stroke: '#c0bcb8', dashArray: [3, 2] });
  });

  it('scales the building border by the width scale of the building style', () => {
    const scaled = style();
    scaled.building.residential.widthScale = 0.5;
    expect(areaPaint(scaled, 'building', 'residential')?.strokeWidth).toBe(0.5);
  });

  it('draws no building border when borders are disabled', () => {
    const disabled = style();
    disabled.buildingStrokeEnabled = false;
    expect(areaPaint(disabled, 'building', 'residential')).toMatchObject({ stroke: null, strokeWidth: 0, strokeOpacity: 0 });
  });

  it('recolors an overridden area and derives its border from the override color', () => {
    expect(areaPaint(style(), 'building', 'residential', '#ff0000')).toMatchObject({ fill: '#ff0000', stroke: '#d70000' });
    expect(areaPaint(style(), 'landuse', 'forest', '#ff0000')).toMatchObject({ fill: '#ff0000', stroke: '#d70000' });
  });

  it('outlines natural and landuse areas only when their style has a stroke color', () => {
    expect(areaPaint(style(), 'natural', 'water')).toEqual({
      fill: '#90d9ed', fillOpacity: 1, stroke: null, strokeWidth: 0, strokeOpacity: 0, dashArray: null,
    });
    expect(areaPaint(style(), 'natural', 'water', '#123456')).toMatchObject({ fill: '#123456', stroke: null });
    expect(areaPaint(style(), 'landuse', 'forest')).toEqual({
      fill: '#c2f0d4', fillOpacity: 0.9, stroke: '#8fbf9f', strokeWidth: 0.5, strokeOpacity: 0.5, dashArray: null,
    });
  });

  it('returns null for unknown styles', () => {
    expect(areaPaint(style(), 'natural', 'constructor')).toBeNull();
    expect(areaPaint(style(), 'landuse', 'unknown')).toBeNull();
  });
});

describe('resolveFontFamily', () => {
  it.each([
    ['Inter', 'Inter'],
    ['Open Sans', 'Open Sans'],
    ["Roboto'; } * { color: red", 'Roboto'],
    ['', 'Roboto'],
  ])('uses %s as %s', (fontFamily, expected) => {
    const style = structuredClone(MAPS_STYLE);
    style.fontSize = { roads: 1, areas: 1, fontFamily, fontBold: false };
    expect(resolveFontFamily(style)).toBe(expected);
  });

  it('uses the default font without font settings', () => {
    // Imported presets may lack font settings
    const style: Partial<RenderStyle> = structuredClone(MAPS_STYLE);
    delete style.fontSize;
    expect(resolveFontFamily(style as RenderStyle)).toBe('Roboto');
  });
});
