export interface RenderStyle {
  interiorColor: string;
  exteriorGrayscale: boolean;
  borderColor: string;
  borderWidth: number;
  strokeOpacity: number;
  fillOpacity: number;
}

export interface Zone {
  type: 'Polygon' | 'Circle' | 'Rectangle';
  coordinates: number[][];
  bounds?: any;
}

declare global {
  interface Window {
    electronAPI: {
      saveSvg: (svgContent: string, filename: string) => Promise<{
        success: boolean;
        path?: string;
      }>;
    };
  }
}
