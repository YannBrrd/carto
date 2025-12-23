import { RenderStyle, StylePreset } from '../types';

export const GOOGLE_MAPS_STYLE: RenderStyle = {
  // Zone styling
  interiorColor: '#ffffff',
  exteriorGrayscale: true,
  borderColor: '#dadce0',
  borderWidth: 1,
  strokeOpacity: 0.8,
  fillOpacity: 0.1,

  // Highway styles - Google Maps 2024 (gray roads)
  highway: {
    motorway: { color: '#9ca3af', opacity: 1 },      // Dark gray for highways
    primary: { color: '#d1d5db', opacity: 1 },       // Medium gray
    secondary: { color: '#e5e7eb', opacity: 1 },     // Light gray
    tertiary: { color: '#f3f4f6', opacity: 1 },      // Very light gray
    residential: { color: '#ffffff', opacity: 1 },   // White
    path: { color: '#d5d8db', opacity: 0.7 },        // Light silver
    cycleway: { color: '#4a80f5', opacity: 0.8 },    // Google blue
  },

  // Building styles - Google's light gray palette (2024)
  building: {
    residential: { color: '#e8e8e8', opacity: 1 },   // Platinum
    commercial: { color: '#e0e0e0', opacity: 1 },
    industrial: { color: '#d8d8d8', opacity: 1 },
    religious: { color: '#d4c4a8', opacity: 1 },     // Slightly warmer
    default: { color: '#e8e8e8', opacity: 1 },
  },

  // Landuse styles
  landuse: {
    residential: { color: '#f5f5f5', opacity: 0.5 },
    commercial: { color: '#f0f0f0', opacity: 0.5 },
    industrial: { color: '#e8e8e8', opacity: 0.5 },
    farmland: { color: '#e8f5e9', opacity: 0.7 },
    forest: { color: '#c3ecb2', opacity: 1 },        // Tea Green
  },

  // Natural feature styles - Google Maps 2024 (turquoise water, mint green)
  natural: {
    water: { color: '#aadaff', opacity: 1 },         // Fresh Air (turquoise)
    wood: { color: '#c3ecb2', opacity: 1 },          // Tea Green
    grassland: { color: '#bbdaa4', opacity: 0.8 },   // Sage green (parks)
    beach: { color: '#fff2af', opacity: 1 },         // Banana Mania
  },

  // Waterway styles - turquoise/teal
  waterway: {
    river: { color: '#aadaff', opacity: 1 },
    stream: { color: '#aadaff', opacity: 0.8 },
    canal: { color: '#9bbff4', opacity: 1 },         // Light blue
    default: { color: '#aadaff', opacity: 1 },
  },
};

export const OSM_CARTO_STYLE: RenderStyle = {
  // Zone styling
  interiorColor: '#ffffff',
  exteriorGrayscale: true,
  borderColor: '#b3b3b3',
  borderWidth: 1,
  strokeOpacity: 0.8,
  fillOpacity: 0.1,

  // Highway styles - OSM Carto inspired
  highway: {
    motorway: { color: '#e892a2', opacity: 1 },      // Pink motorway
    primary: { color: '#fcd6a4', opacity: 1 },       // Light orange
    secondary: { color: '#f7fabf', opacity: 1 },     // Light yellow
    tertiary: { color: '#ffffff', opacity: 1 },
    residential: { color: '#ffffff', opacity: 1 },
    path: { color: '#d4a373', opacity: 0.6 },
    cycleway: { color: '#0000ff', opacity: 0.6 },    // Blue cycleway
  },

  // Building styles - OSM salmon/brown
  building: {
    residential: { color: '#d9b99b', opacity: 1 },
    commercial: { color: '#c9a686', opacity: 1 },
    industrial: { color: '#b8a08c', opacity: 1 },
    religious: { color: '#a0a0a0', opacity: 1 },
    default: { color: '#d9b99b', opacity: 1 },
  },

  // Landuse styles - OSM Carto colors
  landuse: {
    residential: { color: '#dcdcdc', opacity: 0.5 },
    commercial: { color: '#f2dad9', opacity: 0.5 },
    industrial: { color: '#ebdbe8', opacity: 0.5 },
    farmland: { color: '#eef0d5', opacity: 0.7 },
    forest: { color: '#add19e', opacity: 1 },
  },

  // Natural feature styles - OSM Carto
  natural: {
    water: { color: '#aad3df', opacity: 1 },
    wood: { color: '#add19e', opacity: 1 },
    grassland: { color: '#c8facc', opacity: 0.8 },
    beach: { color: '#fff1ba', opacity: 1 },
  },

  // Waterway styles
  waterway: {
    river: { color: '#aad3df', opacity: 1 },
    stream: { color: '#aad3df', opacity: 0.8 },
    canal: { color: '#aad3df', opacity: 1 },
    default: { color: '#aad3df', opacity: 1 },
  },
};

export const DEFAULT_PRESETS: StylePreset[] = [
  {
    id: 'google-maps',
    name: 'Google Maps',
    isBuiltIn: true,
    style: GOOGLE_MAPS_STYLE,
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
