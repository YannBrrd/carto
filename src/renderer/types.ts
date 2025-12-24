export interface FeatureStyle {
  color: string;
  opacity: number;
}

export interface RenderStyle {
  // Zone styling
  interiorColor: string;
  exteriorGrayscale: boolean;
  borderColor: string;
  borderWidth: number;
  strokeOpacity: number;
  fillOpacity: number;

  // Highway styles by type
  highway: {
    motorway: FeatureStyle;
    primary: FeatureStyle;
    secondary: FeatureStyle;
    tertiary: FeatureStyle;
    residential: FeatureStyle;
    path: FeatureStyle;
    cycleway: FeatureStyle;
  };

  // Building styles by type
  building: {
    residential: FeatureStyle;
    commercial: FeatureStyle;
    industrial: FeatureStyle;
    religious: FeatureStyle;
    default: FeatureStyle;
  };

  // Landuse styles by type
  landuse: {
    residential: FeatureStyle;
    commercial: FeatureStyle;
    industrial: FeatureStyle;
    farmland: FeatureStyle;
    forest: FeatureStyle;
  };

  // Natural feature styles by type
  natural: {
    water: FeatureStyle;
    wood: FeatureStyle;
    grassland: FeatureStyle;
    beach: FeatureStyle;
  };

  // Waterway styles by type
  waterway: {
    river: FeatureStyle;
    stream: FeatureStyle;
    canal: FeatureStyle;
    default: FeatureStyle;
  };

  // Font sizes (multiplier, 1 = default)
  fontSize: {
    roads: number;      // Road names
    areas: number;      // Park, forest, water names
  };
}

export interface Zone {
  type: 'Polygon' | 'Circle' | 'Rectangle';
  coordinates: number[][];
  bounds?: any;
}

export interface ExportOptions {
  forceAllLabels: boolean;  // Show all street names even if they don't fit
  borderColor: string;      // Border color for export (default: black)
  exteriorOverlay: boolean; // Show gray overlay outside selected zone
  exteriorOverlayOpacity: number; // Opacity of exterior overlay (0-1)
}

export interface StylePreset {
  id: string;
  name: string;
  isBuiltIn: boolean;
  style: RenderStyle;
}

declare global {
  interface Window {
    electronAPI: {
      saveSvg: (svgContent: string, filename: string) => Promise<{
        success: boolean;
        path?: string;
      }>;
      openFile: (filePath: string) => Promise<{
        success: boolean;
        error?: string;
      }>;
    };
  }
}
