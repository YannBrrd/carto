import { RenderStyle, StylePreset } from '../types';

export const MAPS_STYLE: RenderStyle = {
  // Zone styling - Maps 2024 style
  backgroundColor: '#e8e4e0',  // Warm light gray background
  interiorColor: '#ffffff',
  exteriorGrayscale: true,
  borderColor: '#dadce0',
  borderWidth: 1,
  strokeOpacity: 0.8,
  fillOpacity: 0.1,

  // Highway styles - Google Maps 2024 colors
  highway: {
    motorway: { color: '#f7c14d', opacity: 1 },      // Orange-yellow highways
    primary: { color: '#fbedb7', opacity: 1 },       // Pale yellow
    secondary: { color: '#ffffff', opacity: 1 },     // White
    tertiary: { color: '#ffffff', opacity: 1 },      // White
    residential: { color: '#ffffff', opacity: 1 },   // White
    path: { color: '#c8b8a8', opacity: 0.6 },        // Light brown path
    cycleway: { color: '#0d7d3e', opacity: 0.7 },    // Green cycleway
  },

  // Building styles - Very light, subtle like Google Maps
  building: {
    residential: { color: '#f0ece8', opacity: 1, strokeColor: '#ddd8d3' },
    commercial: { color: '#f0ece8', opacity: 1, strokeColor: '#ddd8d3' },
    industrial: { color: '#eae6e2', opacity: 1, strokeColor: '#d8d4d0' },
    religious: { color: '#f0ece8', opacity: 1, strokeColor: '#ddd8d3' },
    default: { color: '#f0ece8', opacity: 1, strokeColor: '#ddd8d3' },
  },
  buildingStrokeEnabled: true,

  // Landuse styles - Subtle distinctions
  landuse: {
    residential: { color: '#f5f5f5', opacity: 0.3 },
    commercial: { color: '#f5f0eb', opacity: 0.3 },
    industrial: { color: '#efebe7', opacity: 0.4 },
    farmland: { color: '#e9f2dc', opacity: 0.6 },
    forest: { color: '#c5e3b8', opacity: 1 },
  },

  // Natural feature styles - Google Maps 2024 (soft green, light blue water)
  natural: {
    water: { color: '#a3cee8', opacity: 1 },         // Soft blue water
    wood: { color: '#c5e3b8', opacity: 1 },          // Soft green forests
    grassland: { color: '#d1eac5', opacity: 1 },     // Light green parks
    beach: { color: '#f5ebb8', opacity: 1 },         // Sandy beach
  },

  // Waterway styles - Consistent soft blue
  waterway: {
    river: { color: '#a3cee8', opacity: 1 },
    stream: { color: '#a3cee8', opacity: 0.8 },
    canal: { color: '#a3cee8', opacity: 1 },
    default: { color: '#a3cee8', opacity: 1 },
  },

  // Font sizes
  fontSize: {
    roads: 1,
    areas: 1,
  },
};

export const OSM_CARTO_STYLE: RenderStyle = {
  // Zone styling - OpenStreetMap Carto standard style
  backgroundColor: '#f2efe9',  // OSM cream/beige land color
  interiorColor: '#ffffff',
  exteriorGrayscale: true,
  borderColor: '#b3b3b3',
  borderWidth: 1,
  strokeOpacity: 0.8,
  fillOpacity: 0.1,

  // Highway styles - Exact OSM Carto colors
  highway: {
    motorway: { color: '#e892a2', opacity: 1 },      // Salmon pink motorway
    primary: { color: '#fcd6a4', opacity: 1 },       // Peach/orange
    secondary: { color: '#f7fabf', opacity: 1 },     // Pale yellow
    tertiary: { color: '#ffffff', opacity: 1 },      // White
    residential: { color: '#ffffff', opacity: 1 },   // White
    path: { color: '#fa8072', opacity: 0.5 },        // Salmon for footways
    cycleway: { color: '#0000ff', opacity: 0.5 },    // Blue dashed cycleway
  },

  // Building styles - OSM brownish-gray
  building: {
    residential: { color: '#d9d0c9', opacity: 1, strokeColor: '#bab0a8' },
    commercial: { color: '#d9d0c9', opacity: 1, strokeColor: '#bab0a8' },
    industrial: { color: '#d9d0c9', opacity: 1, strokeColor: '#bab0a8' },
    religious: { color: '#d9d0c9', opacity: 1, strokeColor: '#bab0a8' },
    default: { color: '#d9d0c9', opacity: 1, strokeColor: '#bab0a8' },
  },
  buildingStrokeEnabled: true,

  // Landuse styles - OSM Carto exact colors
  landuse: {
    residential: { color: '#e0dfdf', opacity: 0.4 },
    commercial: { color: '#f2dad9', opacity: 0.6 },
    industrial: { color: '#ebdbe8', opacity: 0.6 },
    farmland: { color: '#eef0d5', opacity: 0.8 },
    forest: { color: '#add19e', opacity: 1 },
  },

  // Natural feature styles - OSM Carto exact colors
  natural: {
    water: { color: '#aad3df', opacity: 1 },         // OSM water blue
    wood: { color: '#add19e', opacity: 1 },          // OSM forest green
    grassland: { color: '#cdebb0', opacity: 1 },     // OSM park/grass green
    beach: { color: '#fff1ba', opacity: 1 },         // Sandy yellow
  },

  // Waterway styles - OSM water color
  waterway: {
    river: { color: '#aad3df', opacity: 1 },
    stream: { color: '#aad3df', opacity: 0.9 },
    canal: { color: '#aad3df', opacity: 1 },
    default: { color: '#aad3df', opacity: 1 },
  },

  // Font sizes
  fontSize: {
    roads: 1,
    areas: 1,
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
