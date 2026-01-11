/**
 * Hook for persisting map view (center + zoom) to localStorage
 */

import { useState, useEffect } from 'react';
import { useMap } from 'react-leaflet';

// LocalStorage key for map view persistence
const MAP_VIEW_STORAGE_KEY = 'carto-map-view';

// Default map view (Paris)
const DEFAULT_CENTER: [number, number] = [48.8566, 2.3522];
const DEFAULT_ZOOM = 17;

export interface MapView {
  center: [number, number];
  zoom: number;
}

/**
 * Load saved map view from localStorage
 */
export function loadSavedMapView(): MapView {
  try {
    const saved = localStorage.getItem(MAP_VIEW_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.center && typeof parsed.zoom === 'number') {
        return { center: parsed.center, zoom: parsed.zoom };
      }
    }
  } catch (e) {
    // Ignore parsing errors
  }
  return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
}

/**
 * Hook to get initial map view (use once at component mount)
 */
export function useInitialMapView(): MapView {
  const [initialView] = useState(() => loadSavedMapView());
  return initialView;
}

/**
 * Component to persist map view in localStorage (must be inside MapContainer)
 */
export const MapViewPersistence: React.FC = () => {
  const map = useMap();

  useEffect(() => {
    const saveView = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const view = {
        center: [center.lat, center.lng] as [number, number],
        zoom,
      };
      localStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify(view));
    };

    map.on('moveend', saveView);
    map.on('zoomend', saveView);

    return () => {
      map.off('moveend', saveView);
      map.off('zoomend', saveView);
    };
  }, [map]);

  return null;
};
