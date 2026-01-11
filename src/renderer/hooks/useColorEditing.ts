/**
 * Hook for color editing mode (click and polygon selection)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import L from 'leaflet';
import { ColorEditMode, ElementCategory, Zone } from '../types';
import { isPointInPolygon, getWayCentroid, buildNodeMap, matchesCategory } from '../utils/geometry';

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

  // Refs for cleanup
  const colorPolygonMarkersRef = useRef<L.CircleMarker[]>([]);
  const colorTempPolygonRef = useRef<L.Polygon | null>(null);
  const colorEditModeRef = useRef(colorEditMode);
  const osmDataRef = useRef<any>(null);

  // Sync refs
  useEffect(() => {
    colorPolygonMarkersRef.current = colorPolygonMarkers;
  }, [colorPolygonMarkers]);

  useEffect(() => {
    colorTempPolygonRef.current = colorTempPolygon;
  }, [colorTempPolygon]);

  useEffect(() => {
    colorEditModeRef.current = colorEditMode;
  }, [colorEditMode]);

  useEffect(() => {
    osmDataRef.current = osmData;
  }, [osmData]);

  // Helper to check if a point is inside any of the zones
  const isInAnyZone = useCallback((point: { lat: number; lon?: number; lng?: number }): boolean => {
    const normalizedPoint = { lat: point.lat, lon: point.lon ?? point.lng ?? 0 };
    return zones.some(zone =>
      zone.coordinates && zone.coordinates.length >= 3 &&
      isPointInPolygon(normalizedPoint, zone.coordinates)
    );
  }, [zones]);

  // Handle element click for color editing (uses refs for stable callback)
  const handleElementClick = useCallback((wayId: number, category: ElementCategory) => {
    const mode = colorEditModeRef.current;
    if (!mode?.active || !mode.selectedCategory || !onApplyColorOverride) return;
    if (category !== mode.selectedCategory) return;

    const currentOsmData = osmDataRef.current;
    if (zones.length === 0 || !currentOsmData) return;

    const nodes = buildNodeMap(currentOsmData);
    const way = currentOsmData.elements.find((el: any) => el.type === 'way' && el.id === wayId);
    if (!way) return;

    const centroid = getWayCentroid(way, nodes);
    if (!centroid) return;

    // Check if centroid is inside any zone
    const inZone = zones.some(zone => {
      const polygon = zone.coordinates.map(coord => [coord[0], coord[1]]);
      return isPointInPolygon(centroid, polygon);
    });
    if (!inZone) return;

    onApplyColorOverride(wayId, mode.selectedColor, category);
  }, [zones, onApplyColorOverride]);

  // Helper to check if click is near the first point (for color polygon)
  const isNearFirstPointColor = useCallback((latlng: L.LatLng, firstPoint: L.LatLng): boolean => {
    if (!map) return false;
    const p1 = map.latLngToContainerPoint(latlng);
    const p2 = map.latLngToContainerPoint(firstPoint);
    const distance = p1.distanceTo(p2);
    return distance < 15;
  }, [map]);

  // Finalize color polygon and apply colors to elements inside
  const finalizeColorPolygon = useCallback(() => {
    if (!map || colorPolygonPoints.length < 3 || !colorEditMode?.selectedCategory || !onApplyColorOverride || !osmData || zones.length === 0) return;

    // Remove temp polygon and markers
    if (colorTempPolygon) {
      map.removeLayer(colorTempPolygon);
    }
    colorPolygonMarkers.forEach(m => map.removeLayer(m));

    // Create the polygon coordinates for point-in-polygon testing
    const polygonCoords = colorPolygonPoints.map(p => [p.lat, p.lng]);

    // Find all elements in the polygon
    const nodes = buildNodeMap(osmData);
    const category = colorEditMode.selectedCategory;

    for (const el of osmData.elements) {
      if (el.type !== 'way') continue;
      if (!matchesCategory(el, category)) continue;

      const centroid = getWayCentroid(el, nodes);
      if (!centroid) continue;

      // Check if centroid is in the drawn color polygon
      if (!isPointInPolygon(centroid, polygonCoords)) continue;

      // Check if centroid is in any zone
      if (!isInAnyZone(centroid)) continue;

      // Apply color override
      onApplyColorOverride(el.id, colorEditMode.selectedColor, category);
    }

    // Reset drawing state
    setColorPolygonPoints([]);
    setColorPolygonMarkers([]);
    setColorTempPolygon(null);
    setIsColorPolygonDrawing(false);
    map.dragging.enable();
  }, [map, colorPolygonPoints, colorPolygonMarkers, colorTempPolygon, colorEditMode, osmData, zones, onApplyColorOverride, isInAnyZone]);

  // Polygon selection for color editing
  useEffect(() => {
    if (!map || !colorEditMode?.active || colorEditMode.selectionMode !== 'polygon' || !colorEditMode.selectedCategory) {
      // Cleanup if mode changes
      if (map && colorPolygonPoints.length > 0) {
        colorPolygonMarkers.forEach(m => map.removeLayer(m));
        if (colorTempPolygon) map.removeLayer(colorTempPolygon);
        setColorPolygonPoints([]);
        setColorPolygonMarkers([]);
        setColorTempPolygon(null);
        setIsColorPolygonDrawing(false);
        map.dragging.enable();
      }
      return;
    }
    if (zones.length === 0 || !osmData || !onApplyColorOverride) {
      return;
    }

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      // Ignore clicks while Ctrl is held (user is panning)
      if (e.originalEvent.ctrlKey) return;

      const clickedPoint = e.latlng;

      // Check if clicking near first point to close polygon
      if (colorPolygonPoints.length >= 3 && isNearFirstPointColor(clickedPoint, colorPolygonPoints[0])) {
        finalizeColorPolygon();
        return;
      }

      // Add new point
      const newPoints = [...colorPolygonPoints, clickedPoint];
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
      setColorPolygonMarkers([...colorPolygonMarkers, marker]);

      // Update temp polygon
      if (colorTempPolygon) {
        map.removeLayer(colorTempPolygon);
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
      if (e.key === 'Control' && isColorPolygonDrawing) {
        map.dragging.enable();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' && isColorPolygonDrawing) {
        map.dragging.disable();
      }
    };

    if (isColorPolygonDrawing) {
      map.dragging.disable();
    }

    map.on('click', handleMapClick);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      map.off('click', handleMapClick);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [map, colorEditMode, zones, osmData, onApplyColorOverride, colorPolygonPoints, colorPolygonMarkers, colorTempPolygon, isColorPolygonDrawing, isNearFirstPointColor, finalizeColorPolygon]);

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
