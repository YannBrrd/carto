import { RenderStyle, StylePreset } from '../types';

export const MAPS_STYLE: RenderStyle = {
  // Zone styling - Maperitive Google Maps style
  backgroundColor: '#EBE6DC',  // Beige background
  interiorColor: '#ffffff',
  exteriorGrayscale: true,
  borderColor: '#dadce0',
  borderWidth: 1,
  strokeOpacity: 0.8,
  fillOpacity: 0.1,

  // Highway styles - Maperitive Google Maps colors
  highway: {
    motorway: { color: '#fd923a', opacity: 1 },      // Orange motorways
    primary: { color: '#fffd8b', opacity: 1 },       // Pale yellow
    secondary: { color: '#fffd8b', opacity: 1 },     // Pale yellow
    tertiary: { color: '#ffffff', opacity: 1 },      // White
    residential: { color: '#ffffff', opacity: 1 },   // White
    path: { color: '#D4CCB8', opacity: 0.7 },        // Tan path
    cycleway: { color: '#0d7d3e', opacity: 0.7 },    // Green cycleway
  },

  // Building styles - Light beige like Google Maps
  building: {
    residential: { color: '#E8E4E0', opacity: 1, strokeColor: '#d8d4d0' },
    commercial: { color: '#E8E4E0', opacity: 1, strokeColor: '#d8d4d0' },
    industrial: { color: '#d1d0cd', opacity: 1, strokeColor: '#c1c0bd' },
    religious: { color: '#E8E4E0', opacity: 1, strokeColor: '#d8d4d0' },
    default: { color: '#E8E4E0', opacity: 1, strokeColor: '#d8d4d0' },
  },
  buildingStrokeEnabled: true,

  // Landuse styles - Maperitive Google Maps colors
  landuse: {
    residential: { color: '#EBE6DC', opacity: 0.5 },
    commercial: { color: '#EBE6DC', opacity: 0.5 },
    industrial: { color: '#d1d0cd', opacity: 0.6 },
    farmland: { color: '#e9f2dc', opacity: 0.6 },
    forest: { color: '#CBD8C3', opacity: 1 },
  },

  // Natural feature styles - Maperitive Google Maps colors
  natural: {
    water: { color: '#A5BFDD', opacity: 1 },         // Steel blue water
    wood: { color: '#CBD8C3', opacity: 1 },          // Sage green forests
    grassland: { color: '#b5d29c', opacity: 1 },     // Light green parks
    beach: { color: '#f5ebb8', opacity: 1 },         // Sandy beach
  },

  // Waterway styles - Steel blue
  waterway: {
    river: { color: '#A5BFDD', opacity: 1 },
    stream: { color: '#A5BFDD', opacity: 0.8 },
    canal: { color: '#A5BFDD', opacity: 1 },
    default: { color: '#A5BFDD', opacity: 1 },
  },

  // Font settings
  fontSize: {
    roads: 1,
    areas: 1,
    fontFamily: 'Roboto',
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
  fillOpacity: 0.1,

  // Highway styles - Maperitive Default colors
  highway: {
    motorway: { color: '#849BBD', opacity: 1 },      // Blue-gray motorway
    primary: { color: '#ECA2A3', opacity: 1 },       // Pink/salmon
    secondary: { color: '#FDD6A4', opacity: 1 },     // Peach/orange
    tertiary: { color: '#FEFEB2', opacity: 1 },      // Pale yellow
    residential: { color: '#ffffff', opacity: 1 },   // White
    path: { color: '#6E7C6D', opacity: 0.7 },        // Gray-green
    cycleway: { color: '#0000FF', opacity: 0.6 },    // Blue
  },

  // Building styles - Maperitive brownish
  building: {
    residential: { color: '#BCA9A9', opacity: 1, strokeColor: '#a89999' },
    commercial: { color: '#BCA9A9', opacity: 1, strokeColor: '#a89999' },
    industrial: { color: '#BCA9A9', opacity: 1, strokeColor: '#a89999' },
    religious: { color: '#BCA9A9', opacity: 1, strokeColor: '#a89999' },
    default: { color: '#BCA9A9', opacity: 1, strokeColor: '#a89999' },
  },
  buildingStrokeEnabled: true,

  // Landuse styles - Maperitive colors
  landuse: {
    residential: { color: '#DCDCDC', opacity: 0.5 },
    commercial: { color: '#EFC8C8', opacity: 0.6 },
    industrial: { color: '#DFD1D6', opacity: 0.6 },
    farmland: { color: '#E9D8BE', opacity: 0.8 },
    forest: { color: '#8DC56C', opacity: 1 },
  },

  // Natural feature styles - Maperitive colors
  natural: {
    water: { color: '#B5D0D0', opacity: 1 },         // Light teal water
    wood: { color: '#8DC56C', opacity: 1 },          // Green forest
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
    fontFamily: 'Roboto',
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
