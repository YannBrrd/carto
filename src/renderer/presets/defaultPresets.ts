import { FeatureStyle, RenderStyle, StylePreset } from '../types';
import { DEFAULT_FONT_FAMILY } from '../constants/fonts';

const GOOGLE_RAILS: FeatureStyle = {
  color: '#f6f4f4', opacity: 1, strokeColor: '#c2c6ca', widthScale: 1.5, lineStyle: 'solid', casingLineStyle: 'solid',
};

// Colors measured on Google Maps (Plan layer, light mode) in October 2026, at zoom 16
// when they change with zoom
export const MAPS_STYLE: RenderStyle = {
  // Zone styling
  backgroundColor: '#f6f4f4',  // Light gray land
  interiorColor: '#ffffff',
  exteriorGrayscale: true,
  borderColor: '#dadce0',
  borderWidth: 1,
  strokeOpacity: 0.8,
  fillOpacity: 0,  // No interior tint: the export keeps the preset colors

  // Highway styles - blue-gray arterials, light local streets. Width scales give the
  // Google Maps hierarchy: arterials and motorway carriageways about 2.7 times as wide
  // as residential streets, casing included
  highway: {
    motorway: { color: '#8aa4be', opacity: 1, strokeColor: '#6f90b1', widthScale: 1.5 },
    primary: { color: '#8aa4be', opacity: 1, strokeColor: '#6f90b1', widthScale: 1.75 },
    secondary: { color: '#8aa4be', opacity: 1, strokeColor: '#6f90b1', widthScale: 2.25 },
    tertiary: { color: '#d7e0e5', opacity: 1, strokeColor: '#bcc7cf', widthScale: 1.75 },
    residential: { color: '#d7e0e5', opacity: 1, strokeColor: '#bcc7cf' },
    path: { color: '#d4dce9', opacity: 1, lineStyle: 'dash' },
    footway: { color: '#d4dce9', opacity: 1, lineStyle: 'dot' },
    // Dedicated cycleways: thin solid green line without visible casing
    cycleway: { color: '#7fccaf', opacity: 1, strokeColor: '#7fccaf', widthScale: 0.5 },
  },

  // Underground: roads in tunnels take the light local street colors (width kept),
  // culverted and covered waterways are hidden
  highwayTunnel: { color: '#d7e0e5', strokeColor: '#bcc7cf' },
  waterwayTunnel: { lineStyle: 'none' },

  // Railways - two thin gray rails over the ground color, elevated metro included;
  // underground railways (metro, RER tunnels) hidden
  railway: {
    rail: GOOGLE_RAILS,
    lightRail: GOOGLE_RAILS,
    tram: GOOGLE_RAILS,
    subway: GOOGLE_RAILS,
    tunnel: { ...GOOGLE_RAILS, lineStyle: 'none' },
  },

  // Building styles - one blue-gray for every building
  building: {
    residential: { color: '#e7e8eb', opacity: 1, strokeColor: '#d5d8e5' },
    commercial: { color: '#e7e8eb', opacity: 1, strokeColor: '#d5d8e5' },
    industrial: { color: '#e7e8eb', opacity: 1, strokeColor: '#d5d8e5' },
    religious: { color: '#e7e8eb', opacity: 1, strokeColor: '#d5d8e5' },
    construction: { color: '#e7e8eb', opacity: 0.6, strokeColor: '#d5d8e5' },
    default: { color: '#e7e8eb', opacity: 1, strokeColor: '#d5d8e5' },
  },
  buildingStrokeEnabled: true,
  buildingShadows: false,  // Flat buildings

  // Landuse styles
  landuse: {
    residential: { color: '#fcf8ef', opacity: 1 },      // Cream city blocks (zoom 17+)
    commercial: { color: '#f7efdc', opacity: 1 },       // Shopping areas
    industrial: { color: '#f6f4f4', opacity: 1 },       // Not tinted: same as land
    farmland: { color: '#e9f2dc', opacity: 0.6 },       // Not measured
    forest: { color: '#c2f0d4', opacity: 1 },
  },

  // Natural feature styles - parks and woods share the same green
  natural: {
    water: { color: '#90d9ed', opacity: 1 },
    wood: { color: '#c2f0d4', opacity: 1 },
    grassland: { color: '#c2f0d4', opacity: 1 },
    beach: { color: '#f5ebb8', opacity: 1 },            // Not measured
  },

  // Waterway styles
  waterway: {
    river: { color: '#90d9ed', opacity: 1 },
    stream: { color: '#90d9ed', opacity: 1 },
    canal: { color: '#90d9ed', opacity: 1 },
    default: { color: '#90d9ed', opacity: 1 },
  },

  // Label colors (house numbers keep their default: Google shows none)
  labels: {
    roadColor: '#4b5d6f',
    areaColor: '#12875f',
    waterColor: '#218da0',
    forestColor: '#12875f',
    haloColor: '#ffffff',
  },

  // Font settings
  fontSize: {
    roads: 1,
    areas: 1,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontBold: false,
  },
};

export const OSM_CARTO_STYLE: RenderStyle = {
  // Zone styling - Maperitive Default style
  backgroundColor: '#f5f5f5',
  interiorColor: '#ffffff',
  exteriorGrayscale: true,
  borderColor: '#b3b3b3',
  borderWidth: 1,
  strokeOpacity: 0.8,
  fillOpacity: 0,  // No interior tint: the export keeps the preset colors

  // Highway styles - Maperitive Default colors
  highway: {
    motorway: { color: '#849BBD', opacity: 1 },      // Blue-gray motorway
    primary: { color: '#ECA2A3', opacity: 1 },       // Pink/salmon
    secondary: { color: '#FDD6A4', opacity: 1 },     // Peach/orange
    tertiary: { color: '#FEFEB2', opacity: 1 },      // Pale yellow
    residential: { color: '#ffffff', opacity: 1 },   // White
    path: { color: '#6E7C6D', opacity: 0.7 },        // Gray-green
    footway: { color: '#6E7C6D', opacity: 0.7 },     // Gray-green, like paths
    cycleway: { color: '#0000FF', opacity: 0.6 },    // Blue
  },

  // Building styles - Maperitive brownish
  building: {
    residential: { color: '#BCA9A9', opacity: 1, strokeColor: '#a89999' },
    commercial: { color: '#BCA9A9', opacity: 1, strokeColor: '#a89999' },
    industrial: { color: '#BCA9A9', opacity: 1, strokeColor: '#a89999' },
    religious: { color: '#BCA9A9', opacity: 1, strokeColor: '#a89999' },
    construction: { color: '#d4c4c4', opacity: 0.6, strokeColor: '#a89999' },
    default: { color: '#BCA9A9', opacity: 1, strokeColor: '#a89999' },
  },
  buildingStrokeEnabled: true,

  // Landuse styles - Maperitive colors
  landuse: {
    residential: { color: '#DCDCDC', opacity: 0.5 },
    commercial: { color: '#EFC8C8', opacity: 0.6 },
    industrial: { color: '#DFD1D6', opacity: 0.6 },
    farmland: { color: '#E9D8BE', opacity: 0.8 },
    forest: { color: '#8DC56C', opacity: 1, strokeColor: '#659d44' },
  },

  // Natural feature styles - Maperitive colors; water and woods outlined a shade darker
  natural: {
    water: { color: '#B5D0D0', opacity: 1, strokeColor: '#8da8a8' },  // Light teal water
    wood: { color: '#8DC56C', opacity: 1, strokeColor: '#659d44' },   // Green forest
    grassland: { color: '#CFECA8', opacity: 1 },     // Light green
    beach: { color: '#FEFEC0', opacity: 1 },         // Sandy yellow
  },

  // Waterway styles - Maperitive water color
  waterway: {
    river: { color: '#B5D0D0', opacity: 1 },
    stream: { color: '#B5D0D0', opacity: 0.9 },
    canal: { color: '#B5D0D0', opacity: 1 },
    default: { color: '#B5D0D0', opacity: 1 },
  },

  // Font settings
  fontSize: {
    roads: 1,
    areas: 1,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontBold: false,
  },
};

export const DEFAULT_PRESETS: StylePreset[] = [
  {
    id: 'maps',
    name: 'Maps',
    isBuiltIn: true,
    style: MAPS_STYLE,
  },
  {
    id: 'osm-carto',
    name: 'OpenStreetMap',
    isBuiltIn: true,
    style: OSM_CARTO_STYLE,
  },
];

export function getDefaultPresets(): StylePreset[] {
  return DEFAULT_PRESETS.map(preset => ({ ...preset, style: { ...preset.style } }));
}
