/**
 * Hook for zone polygon drawing functionality
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import L from 'leaflet';
import { Zone } from '../types';
import { generateZoneId, MAX_ZONES } from '../utils/zoneUtils';

export interface UsePolygonDrawingReturn {
  isDrawing: boolean;
  polygonPoints: L.LatLng[];
  polygonMarkers: L.CircleMarker[];
  tempPolygon: L.Polygon | null;
  startDrawing: () => void;
  clearDrawing: () => void;
  // Setters for keyboard handlers
  setIsDrawing: React.Dispatch<React.SetStateAction<boolean>>;
  setPolygonPoints: React.Dispatch<React.SetStateAction<L.LatLng[]>>;
  setPolygonMarkers: React.Dispatch<React.SetStateAction<L.CircleMarker[]>>;
  setTempPolygon: React.Dispatch<React.SetStateAction<L.Polygon | null>>;
  // Refs for cleanup and keyboard handlers
  polygonPointsRef: React.MutableRefObject<L.LatLng[]>;
  polygonMarkersRef: React.MutableRefObject<L.CircleMarker[]>;
  tempPolygonRef: React.MutableRefObject<L.Polygon | null>;
}

export function usePolygonDrawing(
  map: L.Map | null,
  drawnItems: L.FeatureGroup | null,
  zonesCount: number,
  onAddZone: (zone: Zone) => void,
  onSetActiveZone: (zoneId: string | null) => void,
  onClearAllZones: () => void,
  setStatusMessage: (msg: string) => void,
  // Callbacks for after polygon is finalized
  onPolygonFinalized: (zoneId: string, points: L.LatLng[], polygon: L.Polygon) => void,
  // Cleanup callbacks
  cleanupEditableMarkers: () => void,
  cleanupExteriorMask: () => void,
): UsePolygonDrawingReturn {
  const [isDrawing, setIsDrawing] = useState(false);
  const [polygonPoints, setPolygonPoints] = useState<L.LatLng[]>([]);
  const [polygonMarkers, setPolygonMarkers] = useState<L.CircleMarker[]>([]);
  const [tempPolygon, setTempPolygon] = useState<L.Polygon | null>(null);

  // Refs for cleanup
  const polygonPointsRef = useRef<L.LatLng[]>([]);
  const polygonMarkersRef = useRef<L.CircleMarker[]>([]);
  const tempPolygonRef = useRef<L.Polygon | null>(null);

  // Sync refs with state
  useEffect(() => {
    polygonPointsRef.current = polygonPoints;
  }, [polygonPoints]);

  useEffect(() => {
    polygonMarkersRef.current = polygonMarkers;
  }, [polygonMarkers]);

  useEffect(() => {
    tempPolygonRef.current = tempPolygon;
  }, [tempPolygon]);

  // Helper to check if click is near the first point (to close polygon)
  const isNearFirstPoint = useCallback((latlng: L.LatLng, firstPoint: L.LatLng): boolean => {
    if (!map) return false;
    const p1 = map.latLngToContainerPoint(latlng);
    const p2 = map.latLngToContainerPoint(firstPoint);
    const distance = p1.distanceTo(p2);
    return distance < 15; // 15 pixels threshold
  }, [map]);

  // Finalize polygon
  const finalizePolygon = useCallback(() => {
    if (!map || !drawnItems || polygonPoints.length < 3) return;

    // Remove temp polygon and markers
    if (tempPolygon) {
      map.removeLayer(tempPolygon);
    }
    polygonMarkers.forEach(m => map.removeLayer(m));

    // Create internal polygon for editing (not displayed - the zone polygons effect handles display)
    const finalPolygon = L.polygon(polygonPoints, {
      color: 'transparent',
      fillColor: 'transparent',
      fillOpacity: 0,
      interactive: false,
    });

    // Calculate bounds for OSM data fetching
    const bounds = finalPolygon.getBounds();

    // Generate zone ID
    const zoneId = generateZoneId();
    const zone: Zone = {
      id: zoneId,
      type: 'Polygon' as const,
      coordinates: polygonPoints.map(p => [p.lat, p.lng]),
      bounds: bounds,
    };

    // Notify parent about the new zone
    onAddZone(zone);

    // Notify for marker creation
    onPolygonFinalized(zoneId, [...polygonPoints], finalPolygon);

    // Reset drawing state
    setPolygonPoints([]);
    setPolygonMarkers([]);
    setTempPolygon(null);
    setIsDrawing(false);
    map.dragging.enable();

    const zoneCount = zonesCount + 1;
    setStatusMessage(`Zone ${zoneCount} ajoutée. Double-clic: ligne=ajouter, point=supprimer. Ctrl+clic: sélection.`);
  }, [map, drawnItems, polygonPoints, polygonMarkers, tempPolygon, zonesCount, onAddZone, onPolygonFinalized, setStatusMessage]);

  // Click handler effect for drawing
  useEffect(() => {
    if (!map || !isDrawing) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!drawnItems) return;

      // Ignore clicks while Ctrl is held (user is panning)
      if (e.originalEvent.ctrlKey) return;

      const clickedPoint = e.latlng;

      // Check if clicking near first point to close polygon
      if (polygonPoints.length >= 3 && isNearFirstPoint(clickedPoint, polygonPoints[0])) {
        finalizePolygon();
        return;
      }

      // Add new point
      const newPoints = [...polygonPoints, clickedPoint];
      setPolygonPoints(newPoints);

      // Add marker for this point
      const isFirstPoint = newPoints.length === 1;
      const marker = L.circleMarker(clickedPoint, {
        radius: isFirstPoint ? 10 : 6,
        color: isFirstPoint ? '#22c55e' : '#3b82f6',
        fillColor: isFirstPoint ? '#22c55e' : '#3b82f6',
        fillOpacity: 0.8,
        weight: 2,
      });
      marker.addTo(map);
      setPolygonMarkers([...polygonMarkers, marker]);

      // Update temp polygon
      if (tempPolygon) {
        map.removeLayer(tempPolygon);
      }
      if (newPoints.length >= 2) {
        const newTempPolygon = L.polygon(newPoints, {
          color: '#3b82f6',
          weight: 2,
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
          dashArray: '5, 5',
          pane: 'zonePane',
        });
        newTempPolygon.addTo(map);
        setTempPolygon(newTempPolygon);
      }
    };

    // Enable panning while Ctrl is held
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        map.dragging.enable();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        map.dragging.disable();
      }
    };

    map.dragging.disable();
    map.on('click', handleMapClick);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      map.off('click', handleMapClick);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [map, isDrawing, drawnItems, polygonPoints, polygonMarkers, tempPolygon, isNearFirstPoint, finalizePolygon]);

  // Start drawing
  const startDrawing = useCallback(() => {
    if (zonesCount >= MAX_ZONES) {
      setStatusMessage(`Maximum ${MAX_ZONES} zones atteint. Effacez une zone pour en ajouter une nouvelle.`);
      return;
    }

    // Clear current drawing state but keep existing zones
    if (map) {
      polygonMarkers.forEach(m => map.removeLayer(m));
      if (tempPolygon) map.removeLayer(tempPolygon);
    }

    // Cleanup editing markers from previous zone
    cleanupEditableMarkers();

    setPolygonPoints([]);
    setPolygonMarkers([]);
    setTempPolygon(null);
    setIsDrawing(true);
    onSetActiveZone(null); // Deselect any zone while drawing
    setStatusMessage('Cliquez pour ajouter des points. Maintenez Ctrl pour déplacer la carte. Cliquez sur le point vert pour fermer.');
  }, [map, zonesCount, polygonMarkers, tempPolygon, cleanupEditableMarkers, onSetActiveZone, setStatusMessage]);

  // Clear drawing
  const clearDrawing = useCallback(() => {
    // Clear all visual layers
    if (drawnItems) {
      drawnItems.clearLayers();
    }
    if (map) {
      polygonMarkers.forEach(m => map.removeLayer(m));
      if (tempPolygon) map.removeLayer(tempPolygon);
      map.dragging.enable();
    }

    // Cleanup editing markers and exterior mask
    cleanupEditableMarkers();
    cleanupExteriorMask();

    // Reset local drawing state
    setPolygonPoints([]);
    setPolygonMarkers([]);
    setTempPolygon(null);
    setIsDrawing(false);

    // Clear all zones in parent state
    onClearAllZones();
    setStatusMessage('');
  }, [map, drawnItems, polygonMarkers, tempPolygon, cleanupEditableMarkers, cleanupExteriorMask, onClearAllZones, setStatusMessage]);

  return {
    isDrawing,
    polygonPoints,
    polygonMarkers,
    tempPolygon,
    startDrawing,
    clearDrawing,
    setIsDrawing,
    setPolygonPoints,
    setPolygonMarkers,
    setTempPolygon,
    polygonPointsRef,
    polygonMarkersRef,
    tempPolygonRef,
  };
}
