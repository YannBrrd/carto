/**
 * Classification of OSM ways into the features the map draws, shared by the SVG
 * export and the map overlay so both draw the same ways, with the same style,
 * stacked in the same order.
 */

import { ElementCategory, RailwayKey, RenderStyle } from '../types';
import { getHighwayStyleKey } from './roadWeights';
import { getWaterwayStyleKey, getRailwayStyleKey, RAILWAY_TYPES, WATERWAY_TYPES } from './styleResolvers';
import { buildNodeMap, resolveMultipolygons, findContainedInnerRings } from './geometry';

type Tags = Record<string, string | undefined>;

export type BuildingKey = keyof RenderStyle['building'];
export type HighwayKey = keyof RenderStyle['highway'];
export type WaterwayKey = keyof RenderStyle['waterway'];
export type NaturalKey = keyof RenderStyle['natural'];
export type LanduseKey = keyof RenderStyle['landuse'];

export type WayClass =
  | { kind: 'building'; key: BuildingKey }
  | { kind: 'highway'; key: HighwayKey }
  | { kind: 'railway' }
  | { kind: 'waterway'; key: WaterwayKey }
  | { kind: 'natural'; key: NaturalKey }
  | { kind: 'landuse'; key: LanduseKey };

// Areas from bottom to top
export const LANDUSE_DRAW_ORDER = [
  'residential', 'commercial', 'industrial', 'farmland', 'forest',
] as const satisfies readonly LanduseKey[];
export const NATURAL_DRAW_ORDER = ['wood', 'grassland', 'beach', 'water'] as const satisfies readonly NaturalKey[];
export const BUILDING_DRAW_ORDER = [
  'residential', 'commercial', 'industrial', 'religious', 'construction', 'default',
] as const satisfies readonly BuildingKey[];

// Highway values drawn as roads; planned, closed, indoor and platform ways are not
const DRAWN_HIGHWAYS = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
  'residential', 'unclassified', 'living_street', 'service', 'road', 'busway',
  'pedestrian', 'footway', 'steps', 'path', 'track', 'bridleway', 'cycleway',
]);

// Railway lines in use; platforms, stations and disused or planned lines are not drawn
const DRAWN_RAILWAYS = new Set([
  'rail', 'light_rail', 'tram', 'subway', 'narrow_gauge', 'monorail', 'funicular', 'preserved', 'miniature',
]);

// Waterway lines; dams, weirs, riverbanks (areas) and pipes are not drawn as lines
const WATERWAY_LINES = new Set([
  'river', 'stream', 'brook', 'canal', 'ditch', 'drain', 'tidal_channel', 'canoe_pass', 'fish_pass',
]);

const FARMLAND = new Set(['farmland', 'farm', 'farmyard', 'orchard', 'vineyard']);
const GREEN_LANDUSE = new Set(['grass', 'park', 'meadow']);
const GREEN_LEISURE = new Set(['park', 'garden', 'playground', 'pitch']);

// Tag values drawn as natural or landuse areas, e.g. to fetch the multipolygons that draw them
export const AREA_TAGS: Readonly<Record<'natural' | 'landuse' | 'leisure' | 'waterway', readonly string[]>> = {
  natural: ['water', 'wood', 'grassland', 'grass', 'beach'],
  landuse: [
    'forest', ...FARMLAND, 'residential', 'commercial', 'retail', 'industrial', ...GREEN_LANDUSE, 'reservoir', 'basin',
  ],
  leisure: [...GREEN_LEISURE],
  waterway: ['riverbank', 'dock'],
};

function isWaterArea(tags: Tags): boolean {
  return tags.natural === 'water' || tags.waterway === 'riverbank' || tags.waterway === 'dock'
    || tags.landuse === 'reservoir' || tags.landuse === 'basin';
}

function naturalKey(tags: Tags): NaturalKey | null {
  switch (tags.natural) {
    case 'wood': return 'wood';
    case 'grassland':
    case 'grass': return 'grassland';
    case 'beach': return 'beach';
    default: return null;
  }
}

function landuseKey(landuse: string | undefined): LanduseKey | null {
  if (!landuse) return null;
  if (landuse === 'forest') return 'forest';
  if (FARMLAND.has(landuse)) return 'farmland';
  if (landuse === 'residential') return 'residential';
  if (landuse === 'commercial' || landuse === 'retail') return 'commercial';
  if (landuse === 'industrial') return 'industrial';
  return null;
}

/**
 * Feature drawn for an OSM way, or null when the map does not draw it. A way with
 * several feature tags is drawn once, as the first of: building, road, railway,
 * waterway line, water area, natural area, landuse, park.
 */
export function classifyWay(tags: Tags): WayClass | null {
  if (tags.building && tags.building !== 'no') {
    return { kind: 'building', key: getBuildingStyleKey(tags.building) };
  }
  if (tags.highway && DRAWN_HIGHWAYS.has(tags.highway) && tags.area !== 'yes') {
    return { kind: 'highway', key: getHighwayStyleKey(tags.highway) };
  }
  if (tags.railway && DRAWN_RAILWAYS.has(tags.railway)) {
    return { kind: 'railway' };
  }
  if (tags.waterway && WATERWAY_LINES.has(tags.waterway)) {
    return { kind: 'waterway', key: getWaterwayStyleKey(tags.waterway) };
  }
  if (isWaterArea(tags)) return { kind: 'natural', key: 'water' };
  const natural = naturalKey(tags);
  if (natural) return { kind: 'natural', key: natural };
  const landuse = landuseKey(tags.landuse);
  if (landuse) return { kind: 'landuse', key: landuse };
  if ((tags.landuse && GREEN_LANDUSE.has(tags.landuse)) || (tags.leisure && GREEN_LEISURE.has(tags.leisure))) {
    return { kind: 'natural', key: 'grassland' };
  }
  return null;
}

/**
 * Category in which a way can be recolored; forests count as natural areas.
 * Other landuse areas and railways cannot be recolored.
 */
export function editCategoryOf(tags: Tags): ElementCategory | null {
  const feature = classifyWay(tags);
  switch (feature?.kind) {
    case 'building':
    case 'highway':
    case 'waterway':
    case 'natural':
      return feature.kind;
    case 'landuse':
      return feature.key === 'forest' ? 'natural' : null;
    default:
      return null;
  }
}

export type AreaLabelType = 'park' | 'forest' | 'water' | 'beach';

// Label type of a named area: only areas the map draws are labelled
export function areaLabelTypeOf(tags: Tags): AreaLabelType | null {
  const feature = classifyWay(tags);
  if (feature?.kind === 'landuse') return feature.key === 'forest' ? 'forest' : null;
  if (feature?.kind !== 'natural') return null;
  switch (feature.key) {
    case 'water': return 'water';
    case 'wood': return 'forest';
    case 'beach': return 'beach';
    default: return 'park';
  }
}

// Building style of an OSM building tag. 'yes' (the most common, unspecified type)
// is drawn as residential, by far the most common actual type
export function getBuildingStyleKey(building: string): BuildingKey {
  switch (building) {
    case 'yes':
    case 'residential':
    case 'apartments':
    case 'house':
    case 'detached':
    case 'semidetached_house':
    case 'terrace':
    case 'dormitory':
    case 'bungalow':
    case 'cabin':
    case 'farm':
    case 'hut':
    case 'static_caravan':
      return 'residential';
    case 'commercial':
    case 'retail':
    case 'office':
    case 'supermarket':
    case 'kiosk':
    case 'shop':
      return 'commercial';
    case 'industrial':
    case 'warehouse':
    case 'factory':
    case 'manufacture':
    case 'storage_tank':
    case 'silo':
      return 'industrial';
    case 'church':
    case 'chapel':
    case 'cathedral':
    case 'mosque':
    case 'synagogue':
    case 'temple':
    case 'shrine':
    case 'religious':
      return 'religious';
    case 'construction':
      return 'construction';
    default:
      return 'default';
  }
}

// Icon of an amenity, tourism or shop value
const POI_ICONS = new Map<string, string>([
  // Amenities
  ['parking', 'parking'],
  ['restaurant', 'restaurant'],
  ['cafe', 'cafe'],
  ['fast_food', 'fast_food'],
  ['pub', 'pub'],
  ['bar', 'pub'],
  ['bank', 'bank'],
  ['atm', 'atm'],
  ['pharmacy', 'pharmacy'],
  ['hospital', 'hospital'],
  ['clinic', 'hospital'],
  ['police', 'police'],
  ['fire_station', 'fire_station'],
  ['post_office', 'post_office'],
  ['post_box', 'post_office'],
  ['library', 'library'],
  ['school', 'school'],
  ['university', 'school'],
  ['college', 'school'],
  ['toilets', 'toilets'],
  ['recycling', 'recycling'],
  ['drinking_water', 'drinking_water'],
  ['place_of_worship', 'place_of_worship'],
  // Transport
  ['bus_stop', 'bus_stop'],
  // Tourism
  ['hotel', 'hotel'],
  ['museum', 'museum'],
  ['viewpoint', 'viewpoint'],
  ['information', 'info'],
  // Shops
  ['supermarket', 'supermarket'],
  ['bakery', 'bakery'],
  ['convenience', 'convenience'],
]);

// Icon of a POI node, or null when it has none
export function getPOIIcon(tags: Tags): string | null {
  for (const key of ['amenity', 'tourism', 'shop'] as const) {
    const value = tags[key];
    const icon = value !== undefined ? POI_ICONS.get(value) : undefined;
    if (icon) return icon;
  }
  if (tags.highway === 'bus_stop') return 'bus_stop';
  if (tags.railway === 'station') return 'railway_station';
  return null;
}

export type LatLon = [number, number];

// An area drawn by the map: a closed way, or a multipolygon relation
export interface AreaFeature<K extends string = string> {
  id: number;  // Color override key: the way id, or minus the relation id
  tags: Tags;
  key: K;
  polygons: LatLon[][][];  // Each polygon: its closed outer ring, then its holes
}

// A road, railway or waterway drawn by the map
export interface LineFeature<K extends string = string> {
  id: number;
  tags: Tags;
  key: K;
  coords: LatLon[];
}

type Groups<K extends string, F> = Record<K, F[]>;

// Everything the map draws, by feature and style, each group in data order
export interface MapFeatures {
  landuse: Groups<LanduseKey, AreaFeature<LanduseKey>>;
  natural: Groups<NaturalKey, AreaFeature<NaturalKey>>;
  building: Groups<BuildingKey, AreaFeature<BuildingKey>>;
  waterway: Groups<WaterwayKey, LineFeature<WaterwayKey>>;
  railway: Groups<RailwayKey, LineFeature<RailwayKey>>;
  highway: Groups<HighwayKey, LineFeature<HighwayKey>>;
}

const HIGHWAY_KEYS: readonly HighwayKey[] = [
  'motorway', 'primary', 'secondary', 'tertiary', 'residential', 'path', 'footway', 'cycleway',
];

function groups<K extends string, F>(keys: readonly K[]): Groups<K, F> {
  return Object.fromEntries(keys.map(key => [key, []])) as unknown as Groups<K, F>;
}

function closeRing(ring: LatLon[]): LatLon[] {
  const [first, last] = [ring[0], ring[ring.length - 1]];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

function addArea(features: MapFeatures, feature: WayClass | null, area: Omit<AreaFeature, 'key'>): void {
  switch (feature?.kind) {
    case 'building': features.building[feature.key].push({ ...area, key: feature.key }); break;
    case 'natural': features.natural[feature.key].push({ ...area, key: feature.key }); break;
    case 'landuse': features.landuse[feature.key].push({ ...area, key: feature.key }); break;
  }
}

const featuresCache = new WeakMap<object, MapFeatures>();

/**
 * Sort the ways and multipolygons of OSM data into the features the map draws
 * (cached per data set: the result must not be modified)
 */
export function collectFeatures(osmData: { elements: any[] }): MapFeatures {
  const cached = featuresCache.get(osmData);
  if (cached) return cached;

  const nodes = buildNodeMap(osmData);
  const features: MapFeatures = {
    landuse: groups(LANDUSE_DRAW_ORDER),
    natural: groups(NATURAL_DRAW_ORDER),
    building: groups(BUILDING_DRAW_ORDER),
    waterway: groups(WATERWAY_TYPES),
    railway: groups(RAILWAY_TYPES),
    highway: groups(HIGHWAY_KEYS),
  };

  for (const el of osmData.elements) {
    if (el.type !== 'way' || !el.tags || !el.nodes) continue;
    const feature = classifyWay(el.tags);
    if (!feature) continue;
    const coords: LatLon[] = [];
    for (const nodeId of el.nodes) {
      const node = nodes.get(nodeId);
      if (node) coords.push([node.lat, node.lon]);
    }
    const line = { id: el.id, tags: el.tags, coords };
    switch (feature.kind) {
      case 'highway':
        if (coords.length >= 2) features.highway[feature.key].push({ ...line, key: feature.key });
        break;
      case 'railway': {
        const key = getRailwayStyleKey(el.tags);
        if (coords.length >= 2) features.railway[key].push({ ...line, key });
        break;
      }
      case 'waterway':
        if (coords.length >= 2) features.waterway[feature.key].push({ ...line, key: feature.key });
        break;
      default:
        if (coords.length >= 3) addArea(features, feature, { id: el.id, tags: el.tags, polygons: [[closeRing(coords)]] });
    }
  }

  for (const mp of resolveMultipolygons(osmData, nodes)) {
    const polygons = mp.outer.map(outer => [outer, ...findContainedInnerRings(outer, mp.inner)]);
    addArea(features, classifyWay(mp.tags), { id: -mp.id, tags: mp.tags, polygons });
  }

  featuresCache.set(osmData, features);
  return features;
}

// Average of the points of a line, or of a closed ring without its repeated first point
function center(points: LatLon[]): { lat: number; lon: number } {
  const [first, last] = [points[0], points[points.length - 1]];
  const distinct = points.length > 1 && first[0] === last[0] && first[1] === last[1] ? points.slice(0, -1) : points;
  const sum = distinct.reduce(([lat, lon], point) => [lat + point[0], lon + point[1]], [0, 0]);
  return { lat: sum[0] / distinct.length, lon: sum[1] / distinct.length };
}

// Absolute area of a ring in squared degrees: enough to compare rings
function ringArea(ring: LatLon[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][1] + ring[i][1]) * (ring[j][0] - ring[i][0]);
  }
  return Math.abs(area / 2);
}

// Center of an area: center of its largest outer ring
function areaCenter(area: AreaFeature): { lat: number; lon: number } {
  const outers = area.polygons.map(polygon => polygon[0]);
  const largest = outers.reduce((best, ring) => (ringArea(ring) > ringArea(best) ? ring : best));
  return center(largest);
}

export interface AreaLabel {
  lat: number;
  lon: number;
  name: string;
  type: AreaLabelType;
}

// Names of the parks, woods, water bodies and beaches the map draws
export function areaLabels(features: MapFeatures): AreaLabel[] {
  const areas = [
    ...LANDUSE_DRAW_ORDER.flatMap(key => features.landuse[key]),
    ...NATURAL_DRAW_ORDER.flatMap(key => features.natural[key]),
  ];
  const labels: AreaLabel[] = [];
  for (const area of areas) {
    const type = areaLabelTypeOf(area.tags);
    const name = area.tags.name;
    if (type && name) labels.push({ ...areaCenter(area), name, type });
  }
  return labels;
}

export interface EditableFeature {
  category: ElementCategory;
  center: { lat: number; lon: number };
}

/**
 * Features that can be recolored, by color override key, with their category and
 * the point that decides whether they are inside a zone or a selection
 */
export function editableFeatures(features: MapFeatures): Map<number, EditableFeature> {
  const editable = new Map<number, EditableFeature>();
  const areas = [
    ...Object.values(features.landuse).flat(),
    ...Object.values(features.natural).flat(),
    ...Object.values(features.building).flat(),
  ];
  for (const area of areas) {
    const category = editCategoryOf(area.tags);
    if (category) editable.set(area.id, { category, center: areaCenter(area) });
  }
  const lines = [...Object.values(features.highway).flat(), ...Object.values(features.waterway).flat()];
  for (const line of lines) {
    const category = editCategoryOf(line.tags);
    if (category) editable.set(line.id, { category, center: center(line.coords) });
  }
  return editable;
}
