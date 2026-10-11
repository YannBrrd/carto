import { describe, it, expect } from 'vitest';
import { getOverlayLayerStyle } from './overlayStyle';
import { MAPS_STYLE } from '../presets/defaultPresets';
import { RenderStyle } from '../types';

function baseStyle(): RenderStyle {
  const style = structuredClone(MAPS_STYLE);
  style.highway.primary = { color: '#fffd8b', opacity: 0.9 };
  style.building.residential = { color: '#e8e4e0', opacity: 0.8, strokeColor: '#c0c0c0' };
  style.buildingStrokeEnabled = true;
  return style;
}

describe('getOverlayLayerStyle road casings', () => {
  const casing = { isCasing: true, styleType: 'primary' };

  it('recolors the casing from the fill color when no stroke color is set', () => {
    expect(getOverlayLayerStyle(casing, baseStyle())).toEqual({ color: '#d7d563', opacity: 0.9 });
  });

  it('recolors the casing with the explicit stroke color of the highway style', () => {
    const style = baseStyle();
    style.highway.primary.strokeColor = '#c4c7c5';
    expect(getOverlayLayerStyle(casing, style)).toEqual({ color: '#c4c7c5', opacity: 0.9 });
  });
});

describe('getOverlayLayerStyle road fills', () => {
  const road = { wayCategory: 'highway', styleType: 'primary' };

  it('uses the highway style color', () => {
    expect(getOverlayLayerStyle(road, baseStyle())).toEqual({ color: '#fffd8b', opacity: 0.9 });
  });

  it('uses the element override color when there is one', () => {
    expect(getOverlayLayerStyle(road, baseStyle(), '#ff0000')).toEqual({ color: '#ff0000', opacity: 0.9 });
  });
});

describe('getOverlayLayerStyle road widths', () => {
  const roadWeight = { fill: 5, casing: 7 };

  it('scales the road fill width from the default width of the road', () => {
    const style = baseStyle();
    style.highway.primary.widthScale = 2;
    expect(getOverlayLayerStyle({ wayCategory: 'highway', styleType: 'primary', roadWeight }, style))
      .toEqual({ color: '#fffd8b', opacity: 0.9, weight: 10, dashArray: undefined, lineCap: 'round' });
  });

  it('scales the casing width and keeps its border', () => {
    const style = baseStyle();
    style.highway.primary.widthScale = 2;
    expect(getOverlayLayerStyle({ isCasing: true, styleType: 'primary', roadWeight }, style))
      .toEqual({ color: '#d7d563', opacity: 0.9, weight: 12, dashArray: undefined, lineCap: 'round' });
  });
});

describe('getOverlayLayerStyle buildings', () => {
  const building = { wayCategory: 'building', styleType: 'residential' };

  it('keeps the explicit stroke color of the building style', () => {
    expect(getOverlayLayerStyle(building, baseStyle())).toEqual({
      fillColor: '#e8e4e0', color: '#c0c0c0', fillOpacity: 0.8, opacity: 0.8,
    });
  });

  it('derives the stroke from the override color of an overridden building', () => {
    expect(getOverlayLayerStyle(building, baseStyle(), '#ff0000')).toEqual({
      fillColor: '#ff0000', color: '#d70000', fillOpacity: 0.8, opacity: 0.8,
    });
  });

  it('hides the stroke when building borders are disabled', () => {
    const style = baseStyle();
    style.buildingStrokeEnabled = false;
    expect(getOverlayLayerStyle(building, style)?.opacity).toBe(0);
  });
});

describe('getOverlayLayerStyle other layers', () => {
  it('styles waterways as lines', () => {
    const style = baseStyle();
    style.waterway.river = { color: '#9cc0f9', opacity: 0.7 };
    expect(getOverlayLayerStyle({ wayCategory: 'waterway', styleType: 'river' }, style))
      .toEqual({ color: '#9cc0f9', opacity: 0.7 });
  });

  it('fills natural areas, honoring overrides', () => {
    const style = baseStyle();
    style.natural.water = { color: '#9cc0f9', opacity: 1 };
    expect(getOverlayLayerStyle({ wayCategory: 'natural', styleType: 'water' }, style, '#123456'))
      .toEqual({ fillColor: '#123456', fillOpacity: 1 });
  });

  it('fills and outlines landuse areas with the landuse color', () => {
    const style = baseStyle();
    style.landuse.industrial = { color: '#e8eaed', opacity: 0.6 };
    expect(getOverlayLayerStyle({ wayCategory: 'landuse', styleType: 'industrial' }, style))
      .toEqual({ color: '#e8eaed', fillColor: '#e8eaed', fillOpacity: 0.6 });
  });

  it('ignores layers that carry no style metadata', () => {
    expect(getOverlayLayerStyle({}, baseStyle())).toBeNull();
    expect(getOverlayLayerStyle({ wayCategory: 'highway', styleType: 'unknown' }, baseStyle())).toBeNull();
  });
});
