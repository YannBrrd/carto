export interface FeatureStyle {
  color: string;
  opacity: number;
  strokeColor?: string;  // Optional stroke color for buildings
}

export interface RenderStyle {
  // Zone styling
  backgroundColor: string;  // Background color for SVG export
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
    construction: FeatureStyle;
    default: FeatureStyle;
  };
  buildingStrokeEnabled: boolean;  // Toggle building borders on/off

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

  // Font settings
  fontSize: {
    roads: number;      // Road names size multiplier (1 = default)
    areas: number;      // Park, forest, water names size multiplier
    fontFamily: string; // Font family for labels
    fontBold: boolean;  // Whether labels should be bold
  };
}

export interface Zone {
  id: string;  // Unique identifier for multi-zone support
  type: 'Polygon' | 'Circle' | 'Rectangle';
  coordinates: number[][];
  bounds?: any;
}

// Multi-zone state container
export interface MultiZoneState {
  zones: Zone[];                 // Array of 0-5 zones
  activeZoneId: string | null;   // Currently selected zone for editing
  contextBounds: any | null;     // User-adjustable context rectangle (L.LatLngBounds)
  contextBoundsLocked: boolean;  // If true, context doesn't auto-adjust
}

// Context rectangle handle positions for resize
export type ContextHandlePosition = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';

export interface ExportOptions {
  forceAllLabels: boolean;  // Show all street names even if they don't fit
  borderColor: string;      // Border color for export (default: black)
  exteriorOverlay: boolean; // Show gray overlay outside selected zone
  exteriorOverlayOpacity: number; // Opacity of exterior overlay (0-1)
  showPOI: boolean;         // Show POI icons on map and in export
  showCompass: boolean;     // Show north compass indicator
  maxExportSizeKB?: number; // Maximum export size in KB for PNG/PDF (optional)
}

export interface StylePreset {
  id: string;
  name: string;
  isBuiltIn: boolean;
  style: RenderStyle;
}

// ============================================
// Color Override Types (Individual Element Editing)
// ============================================

// Element type categories for filtering
export type ElementCategory = 'building' | 'highway' | 'natural' | 'waterway';

// Single color override for an OSM way
export interface ColorOverride {
  wayId: number;
  color: string;
  category: ElementCategory;
  zoneId?: string; // Zone where this override was applied (for cleanup on zone deletion)
}

// Map of wayId -> ColorOverride for fast lookup
export interface ColorOverridesState {
  overrides: Record<number, ColorOverride>;
}

// Color edit mode state
export interface ColorEditMode {
  active: boolean;
  selectedColor: string;
  selectedCategory: ElementCategory | null;
  selectionMode: 'click' | 'polygon';
}

// ============================================
// Offline Mode Types
// ============================================

export interface OSMBounds {
  minlat: number;
  minlon: number;
  maxlat: number;
  maxlon: number;
}

export interface OfflineModeState {
  enabled: boolean;
  filePath: string | null;
  fileName: string | null;
  dataBounds: OSMBounds | null;
}

// Update info types
export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
}

declare global {
  interface Window {
    electronAPI: {
      saveSvg: (svgContent: string, filename: string) => Promise<{
        success: boolean;
        path?: string;
        error?: string;
      }>;
      savePng: (pngDataUrl: string, filename: string) => Promise<{
        success: boolean;
        path?: string;
        error?: string;
      }>;
      savePdf: (pdfDataUrl: string, filename: string) => Promise<{
        success: boolean;
        path?: string;
        error?: string;
      }>;
      savePdfBuffer: (buffer: ArrayBuffer, filename: string) => Promise<{
        success: boolean;
        path?: string;
        error?: string;
      }>;
      saveJpeg: (jpegDataUrl: string, filename: string) => Promise<{
        success: boolean;
        path?: string;
        error?: string;
      }>;
      openFile: (filePath: string) => Promise<{
        success: boolean;
        error?: string;
      }>;
      openOsmFile: () => Promise<{
        success: boolean;
        content?: string;
        filePath?: string;
        fileName?: string;
        error?: string;
      }>;
      // Auto-update API
      checkForUpdates: () => Promise<{
        available: boolean;
        version?: string;
        message?: string;
        error?: string;
      }>;
      downloadUpdate: () => Promise<{
        success: boolean;
        error?: string;
      }>;
      installUpdate: () => void;
      getAppVersion: () => Promise<string>;
      onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
      onUpdateNotAvailable: (callback: () => void) => () => void;
      onUpdateDownloadProgress: (callback: (progress: UpdateProgress) => void) => () => void;
      onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;
      onUpdateError: (callback: (error: string) => void) => () => void;
      // Preferences API
      getPreference: <T = unknown>(key: string) => Promise<T | null>;
      setPreference: (key: string, value: unknown) => Promise<{ success: boolean }>;
      getAllPreferences: () => Promise<Record<string, unknown>>;
    };
  }
}
