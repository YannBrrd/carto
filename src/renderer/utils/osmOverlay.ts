import L from 'leaflet';
import { RenderStyle, ColorOverridesState, ElementCategory } from '../types';
import { getIconSvg } from '../assets/icons';
import { resolveLabelStyle, resolveFontFamily, RAILWAY_DRAW_ORDER, isUnderground, getWaterwayWidth, WATERWAY_TYPES } from './styleResolvers';
import { getOverlayLayerStyle, OverlayLayerMeta } from './overlayStyle';
import { getRoadWeight, getRailwayWeight, ROAD_DRAW_ORDER } from './roadWeights';
import { getFontFamilyCSS } from '../constants/fonts';
import {
  collectFeatures, editCategoryOf, getPOIIcon, AreaFeature, LANDUSE_DRAW_ORDER, NATURAL_DRAW_ORDER, BUILDING_DRAW_ORDER,
} from './features';

// Map pane of POI icons, created by the caller
export const POI_PANE = 'poiPane';

// Options for createOSMOverlay
export interface OSMOverlayOptions {
  colorOverrides?: ColorOverridesState;
  // Click on a feature that can be recolored; returns whether the click was used,
  // otherwise it goes on to the map (e.g. to place a point of a polygon)
  onElementClick?: (wayId: number, category: ElementCategory) => boolean;
  showLabels?: boolean;  // Show house numbers (use in offline mode only to avoid duplicates with Carto tiles)
  showPOI?: boolean;     // Show POI icons (default: true)
  renderer?: L.Canvas;   // Canvas to draw on (default: a new one)
  poiPane?: string;      // Map pane of POI icons (default: the marker pane)
}

// Metadata of a layer: its style, plus the way it draws for color editing
export interface OverlayLayer extends OverlayLayerMeta {
  wayId?: number;                   // Color override key: way id, or minus the relation id
  editCategory?: ElementCategory;   // Category in which the feature can be recolored
}

// Size of POI icons and house numbers, as in the SVG export
const POI_ICON_SIZE = 16;
const HOUSE_NUMBER_FONT_SIZE = 5;
// Halo around house numbers: half the stroke width the SVG export draws under the text
const HOUSE_NUMBER_HALO = 0.15;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Icon of a house number, with the label colors and font of the style
export function houseNumberIcon(houseNumber: string, style: RenderStyle): L.DivIcon {
  const labels = resolveLabelStyle(style);
  const halo = labels.haloColor;
  const offset = `${HOUSE_NUMBER_HALO}px`;
  const shadow = [`-${offset} -${offset}`, `${offset} -${offset}`, `-${offset} ${offset}`, `${offset} ${offset}`]
    .map(position => `${position} 0 ${halo}`).join(', ');
  return L.divIcon({
    className: 'housenumber-label',
    html: `<span style="font-family: ${getFontFamilyCSS(resolveFontFamily(style))}; font-size: ${HOUSE_NUMBER_FONT_SIZE}px; `
      + `font-weight: ${style.fontSize?.fontBold ? 700 : 400}; color: ${labels.houseNumberColor}; text-shadow: ${shadow};">`
      + `${escapeHtml(houseNumber)}</span>`,
    iconSize: [20, 8],
    iconAnchor: [10, 4],
  });
}

export function createOSMOverlay(
  map: L.Map,
  osmData: any,
  style: RenderStyle,
  options?: OSMOverlayOptions
): L.LayerGroup {
  // Use featureGroup for event delegation
  const layerGroup = L.featureGroup();
  const { colorOverrides, onElementClick, showLabels = false, showPOI = true, poiPane } = options || {};

  // Use Canvas renderer for better performance with many elements
  const renderer = options?.renderer ?? L.canvas({ padding: 0.5 });

  // Single delegated click handler for all elements (filtering done by caller)
  if (onElementClick) {
    layerGroup.on('click', (e: L.LeafletMouseEvent) => {
      const layer = (e.propagatedFrom || e.layer) as OverlayLayer | undefined;
      if (layer?.wayId && layer.editCategory && onElementClick(layer.wayId, layer.editCategory)) {
        L.DomEvent.stopPropagation(e);
      }
    });
  }

  // Layers start with the style an in-place restyle would give them
  const pathOptions = (meta: OverlayLayer): L.PathOptions => {
    const overrideColor = meta.wayId !== undefined ? colorOverrides?.overrides[meta.wayId]?.color : undefined;
    return {
      ...getOverlayLayerStyle(meta, style, overrideColor),
      renderer,
      interactive: !!onElementClick && !!meta.editCategory,
    };
  };
  const add = <T extends L.Path>(layer: T, meta: OverlayLayer): T => {
    Object.assign(layer, meta);
    layer.addTo(layerGroup);
    return layer;
  };

  const features = collectFeatures(osmData);

  const addArea = (wayCategory: 'landuse' | 'natural' | 'building', area: AreaFeature) => {
    const meta: OverlayLayer = {
      wayId: area.id,
      wayCategory,
      styleType: area.key,
      editCategory: editCategoryOf(area.tags) ?? undefined,
    };
    add(L.polygon(area.polygons, pathOptions(meta)), meta);
  };

  // Areas, from bottom to top: landuse, natural areas, then (after waterways) buildings
  for (const key of LANDUSE_DRAW_ORDER) {
    for (const area of features.landuse[key]) addArea('landuse', area);
  }
  for (const key of NATURAL_DRAW_ORDER) {
    for (const area of features.natural[key]) addArea('natural', area);
  }

  // Waterways
  for (const key of WATERWAY_TYPES) {
    for (const waterway of features.waterway[key]) {
      const meta: OverlayLayer = {
        wayId: waterway.id,
        wayCategory: 'waterway',
        styleType: key,
        waterwayWidth: getWaterwayWidth(key),
        underground: isUnderground(waterway.tags),
        editCategory: 'waterway',
      };
      add(L.polyline(waterway.coords, pathOptions(meta)), meta);
    }
  }

  for (const key of BUILDING_DRAW_ORDER) {
    for (const area of features.building[key]) addArea('building', area);
  }

  // Railways, like the SVG export: every rail base (casing), then the ties, by railway type
  const roadWeight = getRailwayWeight();
  const railTies: [L.Polyline, OverlayLayer][] = [];
  for (const railwayType of RAILWAY_DRAW_ORDER) {
    for (const railway of features.railway[railwayType]) {
      const base: OverlayLayer = { railwayType, isCasing: true, roadWeight };
      add(L.polyline(railway.coords, pathOptions(base)), base);
      const ties: OverlayLayer = { railwayType, roadWeight };
      railTies.push([L.polyline(railway.coords, pathOptions(ties)), ties]);
    }
  }
  for (const [layer, meta] of railTies) add(layer, meta);

  // Highways (roads, paths, cycleways), in the order of the SVG export: roads in tunnels
  // first, then every casing, then every fill, smaller roads under bigger ones. Casings
  // carry the way id so overrides recolor them, but only fills can be clicked
  for (const underground of [true, false]) {
    const roads = ROAD_DRAW_ORDER.flatMap(key => features.highway[key])
      .filter(road => isUnderground(road.tags) === underground);
    const fills: [L.Polyline, OverlayLayer][] = [];
    for (const road of roads) {
      // Default width kept on the layers so in-place restyles can apply a new width scale
      const common = { wayId: road.id, styleType: road.key, roadWeight: getRoadWeight(road.tags.highway!), underground };
      const casing: OverlayLayer = { ...common, isCasing: true };
      add(L.polyline(road.coords, pathOptions(casing)), casing);
      const fill: OverlayLayer = { ...common, wayCategory: 'highway', editCategory: 'highway' };
      fills.push([L.polyline(road.coords, pathOptions(fill)), fill]);
    }
    for (const [layer, meta] of fills) add(layer, meta);
  }

  // POI icons (always created, visibility controlled by showPOI)
  // Markers are tagged with isPOI=true for efficient show/hide without rebuild
  for (const node of osmData.elements) {
    if (node.type !== 'node' || !node.tags) continue;
    const iconName = getPOIIcon(node.tags);
    const iconSvg = iconName ? getIconSvg(iconName) : null;
    if (!iconSvg) continue;
    const icon = L.divIcon({
      className: 'poi-icon',
      html: iconSvg,
      iconSize: [POI_ICON_SIZE, POI_ICON_SIZE],
      iconAnchor: [POI_ICON_SIZE / 2, POI_ICON_SIZE / 2],
    });
    // Icons do not catch clicks: they must not block drawing or recoloring what lies under them
    const marker = L.marker([node.lat, node.lon], {
      icon, opacity: showPOI ? 1 : 0, interactive: false, keyboard: false, ...(poiPane ? { pane: poiPane } : {}),
    });
    (marker as any).isPOI = true;
    marker.addTo(layerGroup);
  }

  // House numbers (only in offline mode to avoid duplicates with Carto tile labels),
  // tagged with their number so in-place restyles can redraw them
  if (showLabels) {
    for (const node of osmData.elements) {
      const houseNumber = node.type === 'node' ? node.tags?.['addr:housenumber'] : undefined;
      if (!houseNumber) continue;
      const marker = L.marker([node.lat, node.lon], { icon: houseNumberIcon(houseNumber, style), interactive: false, keyboard: false });
      (marker as any).houseNumber = houseNumber;
      marker.addTo(layerGroup);
    }
  }

  return layerGroup;
}

// Restyle the layers of an overlay in place with a style and color overrides
export function restyleOverlay(
  layers: Iterable<L.Layer>,
  style: RenderStyle,
  colorOverrides?: ColorOverridesState
): void {
  for (const layer of layers) {
    const houseNumber: string | undefined = (layer as any).houseNumber;
    if (houseNumber !== undefined && layer instanceof L.Marker) {
      const icon = houseNumberIcon(houseNumber, style);
      // Redraw the marker only when its label changes
      if ((layer.options.icon as L.DivIcon | undefined)?.options.html !== icon.options.html) layer.setIcon(icon);
      continue;
    }
    if (layer instanceof L.Path) {
      const meta = layer as unknown as OverlayLayer;
      const overrideColor = meta.wayId !== undefined ? colorOverrides?.overrides[meta.wayId]?.color : undefined;
      const pathStyle = getOverlayLayerStyle(meta, style, overrideColor);
      if (pathStyle) layer.setStyle(pathStyle);
    }
  }
}
