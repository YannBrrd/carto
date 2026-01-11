/**
 * Hook for color editing mode (click and polygon selection)
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import L from 'leaflet';
import { ColorEditMode, ElementCategory, Zone } from '../types';
import { isPointInPolygon, getWayCentroid, buildNodeMap, matchesCategory } from '../utils/geometry';

// Constants for click detection
const FIRST_POINT_CLICK_THRESHOLD_PX = 15;

export interface UseColorEditingReturn {
  colorPolygonPoints: L.LatLng[];
  colorPolygonMarkers: L.CircleMarker[];
  colorTempPolygon: L.Polygon | null;
  isColorPolygonDrawing: boolean;
  // Refs for cleanup
  colorPolygonMarkersRef: React.MutableRefObject<L.CircleMarker[]>;
  colorTempPolygonRef: React.MutableRefObject<L.Polygon | null>;
  // Element click handler for overlay
  handleElementClick: (wayId: number, category: ElementCategory) => void;
}

export function useColorEditing(
  map: L.Map | null,
  osmData: any,
  zones: Zone[],
  colorEditMode: ColorEditMode | undefined,
  onApplyColorOverride: ((wayId: number, color: string, category: ElementCategory) => void) | undefined,
): UseColorEditingReturn {
  const [colorPolygonPoints, setColorPolygonPoints] = useState<L.LatLng[]>([]);
  const [colorPolygonMarkers, setColorPolygonMarkers] = useState<L.CircleMarker[]>([]);
  const [colorTempPolygon, setColorTempPolygon] = useState<L.Polygon | null>(null);
  const [isColorPolygonDrawing, setIsColorPolygonDrawing] = useState(false);

  // Refs for current values (used in event handlers to avoid stale closures)
  const colorPolygonPointsRef = useRef<L.LatLng[]>([]);
  const colorPolygonMarkersRef = useRef<L.CircleMarker[]>([]);
  const colorTempPolygonRef = useRef<L.Polygon | null>(null);
  const colorEditModeRef = useRef(colorEditMode);
  const zonesRef = useRef(zones);
  const onApplyColorOverrideRef = useRef(onApplyColorOverride);
  const osmDataRef = useRef(osmData);

  // Sync refs with values (direct assignment for better perf)
  colorPolygonPointsRef.current = colorPolygonPoints;
  colorPolygonMarkersRef.current = colorPolygonMarkers;
  colorTempPolygonRef.current = colorTempPolygon;
  colorEditModeRef.current = colorEditMode;
  zonesRef.current = zones;
  onApplyColorOverrideRef.current = onApplyColorOverride;
  osmDataRef.current = osmData;

  // Memoize the node map to avoid O(n) reconstruction on each operation
  const nodeMap = useMemo(() => {
    if (!osmData) return new Map<number, { lat: number; lon: number }>();
    return buildNodeMap(osmData);
  }, [osmData]);

  // Helper to check if a point is inside any of the zones
  const isInAnyZone = useCallback((point: { lat: number; lon?: number; lng?: number }): boolean => {
    const normalizedPoint = { lat: point.lat, lon: point.lon ?? point.lng ?? 0 };
    const currentZones = zonesRef.current;
    return currentZones.some(zone =>
      zone.coordinates && zone.coordinates.length >= 3 &&
      isPointInPolygon(normalizedPoint, zone.coordinates)
    );
  }, []);

  // Handle element click for color editing (uses refs for stable callback)
  const handleElementClick = useCallback((wayId: number, category: ElementCategory) => {
    const mode = colorEditModeRef.current;
    const applyOverride = onApplyColorOverrideRef.current;
    const currentZones = zonesRef.current;
    const currentOsmData = osmDataRef.current;

    if (!mode?.active || !mode.selectedCategory || !applyOverride) return;
    if (category !== mode.selectedCategory) return;
    if (currentZones.length === 0 || nodeMap.size === 0) return;

    const way = currentOsmData?.elements?.find((el: any) => el.type === 'way' && el.id === wayId);
    if (!way) return;

    const centroid = getWayCentroid(way, nodeMap);
    if (!centroid) return;

    // Check if centroid is inside any zone
    const inZone = currentZones.some(zone => {
      const polygon = zone.coordinates.map(coord => [coord[0], coord[1]]);
      return isPointInPolygon(centroid, polygon);
    });
    if (!inZone) return;

    applyOverride(wayId, mode.selectedColor, category);
  }, [nodeMap]);

  // Helper to check if click is near the first point (for color polygon)
  const isNearFirstPointColor = useCallback((latlng: L.LatLng, firstPoint: L.LatLng): boolean => {
    if (!map) return false;
    const p1 = map.latLngToContainerPoint(latlng);
    const p2 = map.latLngToContainerPoint(firstPoint);
    const distance = p1.distanceTo(p2);
    return distance < FIRST_POINT_CLICK_THRESHOLD_PX;
  }, [map]);

  // Finalize color polygon and apply colors to elements inside (using refs)
  const finalizeColorPolygon = useCallback(() => {
    const currentOsmData = osmDataRef.current;
    if (!map || !currentOsmData) return;

    const currentPoints = colorPolygonPointsRef.current;
    const currentMarkers = colorPolygonMarkersRef.current;
    const currentTempPolygon = colorTempPolygonRef.current;
    const mode = colorEditModeRef.current;
    const applyOverride = onApplyColorOverrideRef.current;
    const currentZones = zonesRef.current;

    if (currentPoints.length < 3 || !mode?.selectedCategory || !applyOverride || currentZones.length === 0) return;

    // Remove temp polygon and markers
    if (currentTempPolygon) {
      map.removeLayer(currentTempPolygon);
    }
    currentMarkers.forEach(m => map.removeLayer(m));

    // Create the polygon coordinates for point-in-polygon testing
    const polygonCoords = currentPoints.map(p => [p.lat, p.lng]);
    const category = mode.selectedCategory;

    for (const el of currentOsmData.elements) {
      if (el.type !== 'way') continue;
      if (!matchesCategory(el, category)) continue;

      const centroid = getWayCentroid(el, nodeMap);
      if (!centroid) continue;

      // Check if centroid is in the drawn color polygon
      if (!isPointInPolygon(centroid, polygonCoords)) continue;

      // Check if centroid is in any zone
      if (!isInAnyZone(centroid)) continue;

      // Apply color override
      applyOverride(el.id, mode.selectedColor, category);
    }

    // Reset drawing state
    setColorPolygonPoints([]);
    setColorPolygonMarkers([]);
    setColorTempPolygon(null);
    setIsColorPolygonDrawing(false);
    map.dragging.enable();
  }, [map, nodeMap, isInAnyZone]);

  // Track if polygon mode is active for cleanup
  const isPolygonModeActive = colorEditMode?.active && colorEditMode.selectionMode === 'polygon' && colorEditMode.selectedCategory;

  // Polygon selection for color editing (stable dependencies - uses refs)
  useEffect(() => {
    if (!map || !isPolygonModeActive) {
      // Cleanup if mode changes
      if (map && colorPolygonPointsRef.current.length > 0) {
        colorPolygonMarkersRef.current.forEach(m => {
          try { map.removeLayer(m); } catch (e) { /* ignore */ }
        });
        if (colorTempPolygonRef.current) {
          try { map.removeLayer(colorTempPolygonRef.current); } catch (e) { /* ignore */ }
        }
        setColorPolygonPoints([]);
        setColorPolygonMarkers([]);
        setColorTempPolygon(null);
        setIsColorPolygonDrawing(false);
        map.dragging.enable();
      }
      return;
    }
    if (zonesRef.current.length === 0 || !osmDataRef.current || !onApplyColorOverrideRef.current) {
      return;
    }

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      // Ignore clicks while Ctrl is held (user is panning)
      if (e.originalEvent.ctrlKey) return;

      const clickedPoint = e.latlng;
      const currentPoints = colorPolygonPointsRef.current;
      const currentMarkers = colorPolygonMarkersRef.current;
      const currentTempPolygon = colorTempPolygonRef.current;

      // Check if clicking near first point to close polygon
      if (currentPoints.length >= 3 && isNearFirstPointColor(clickedPoint, currentPoints[0])) {
        finalizeColorPolygon();
        return;
      }

      // Add new point
      const newPoints = [...currentPoints, clickedPoint];
      setColorPolygonPoints(newPoints);
      setIsColorPolygonDrawing(true);

      // Add marker for this point
      const isFirstPoint = newPoints.length === 1;
      const marker = L.circleMarker(clickedPoint, {
        radius: isFirstPoint ? 10 : 6,
        color: isFirstPoint ? '#22c55e' : '#7c3aed',
        fillColor: isFirstPoint ? '#22c55e' : '#7c3aed',
        fillOpacity: 0.8,
        weight: 2,
      });
      marker.addTo(map);
      setColorPolygonMarkers([...currentMarkers, marker]);

      // Update temp polygon
      if (currentTempPolygon) {
        map.removeLayer(currentTempPolygon);
      }
      if (newPoints.length >= 2) {
        const newTempPolygon = L.polygon(newPoints, {
          color: '#7c3aed',
          weight: 2,
          fillColor: '#7c3aed',
          fillOpacity: 0.15,
          dashArray: '5, 5',
        });
        newTempPolygon.addTo(map);
        setColorTempPolygon(newTempPolygon);
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
  }, [map, isPolygonModeActive, isNearFirstPointColor, finalizeColorPolygon]);

  return {
    colorPolygonPoints,
    colorPolygonMarkers,
    colorTempPolygon,
    isColorPolygonDrawing,
    colorPolygonMarkersRef,
    colorTempPolygonRef,
    handleElementClick,
  };
}
