/**
 * Hook for loading OSM data based on map view bounds
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import L from 'leaflet';
import { fetchOSMData, clearCacheIfDisjoint, clearAllCaches } from '../utils/osmData';

// Minimum zoom level for loading OSM data (to avoid overloading)
const MIN_ZOOM_FOR_DATA = 15;

export interface UseOSMDataLoaderReturn {
  osmData: any;
  viewBounds: L.LatLngBounds | null;
  isLoadingView: boolean;
}

export function useOSMDataLoader(
  map: L.Map | null,
  useOfflineMode: boolean,
  setStatusMessage: (msg: string) => void
): UseOSMDataLoaderReturn {
  const [osmData, setOsmData] = useState<any>(null);
  const [viewBounds, setViewBounds] = useState<L.LatLngBounds | null>(null);
  const [isLoadingView, setIsLoadingView] = useState(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadingRef = useRef(false);

  // Load OSM data for the current view bounds
  const loadViewOsmData = useCallback(async (bounds: L.LatLngBounds, zoom: number) => {
    // Use ref to avoid dependency issues
    if (isLoadingRef.current) return;

    // Don't load data if zoomed out too much (unless in offline mode)
    if (zoom < MIN_ZOOM_FOR_DATA && !useOfflineMode) {
      setOsmData(null);
      setStatusMessage(`Zoomez davantage pour voir le style (niveau ${zoom}/${MIN_ZOOM_FOR_DATA} minimum)`);
      return;
    }

    isLoadingRef.current = true;
    setIsLoadingView(true);
    setStatusMessage(useOfflineMode ? 'Chargement des données hors-ligne...' : 'Chargement des données cartographiques...');

    // Clear cache if user moved far from cached area (free memory early)
    clearCacheIfDisjoint(bounds);

    try {
      const data = await fetchOSMData(bounds, useOfflineMode);
      setOsmData(data);
      setViewBounds(bounds);
      setStatusMessage(useOfflineMode ? 'Mode hors-ligne' : '');
    } catch (error) {
      console.error('Error loading view OSM data:', error);
      const errorMsg = error instanceof Error ? error.message : 'Impossible de charger les données';
      // Don't show timeout errors as critical
      if (errorMsg.includes('timeout') || errorMsg.includes('429')) {
        setStatusMessage('Zone trop grande. Zoomez davantage.');
      } else {
        setStatusMessage(`Erreur: ${errorMsg}`);
      }
    } finally {
      isLoadingRef.current = false;
      setIsLoadingView(false);
    }
  }, [useOfflineMode, setStatusMessage]);

  // Setup map move/zoom handlers and initial data load
  useEffect(() => {
    if (!map) return;

    // Debounced handler for map move events
    const handleMapMoveEnd = () => {
      // Clear previous timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Debounce: wait 800ms after user stops moving
      debounceTimerRef.current = setTimeout(() => {
        const bounds = map.getBounds();
        const zoom = map.getZoom();
        loadViewOsmData(bounds, zoom);
      }, 800);
    };

    // Load initial view data (only if zoomed in enough)
    const bounds = map.getBounds();
    const zoom = map.getZoom();
    loadViewOsmData(bounds, zoom);

    // Listen for map move events
    map.on('moveend', handleMapMoveEnd);
    map.on('zoomend', handleMapMoveEnd);

    return () => {
      map.off('moveend', handleMapMoveEnd);
      map.off('zoomend', handleMapMoveEnd);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      // Clear caches on unmount
      clearAllCaches();
    };
  }, [map, loadViewOsmData]);

  return {
    osmData,
    viewBounds,
    isLoadingView,
  };
}
