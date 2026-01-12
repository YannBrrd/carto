/**
 * Hook for zone polygon editing functionality (markers, add/delete points, rounding)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import L from 'leaflet';
import { Zone } from '../types';
import { catmullRomSpline } from '../utils/geometry';

// Constants for click detection thresholds (in pixels)
const MARKER_CLICK_THRESHOLD_PX = 20;
const SEGMENT_CLICK_THRESHOLD_PX = 15;

export interface UsePolygonEditingReturn {
  editableMarkers: L.Marker[];
  finalPolygonRef: L.Polygon | null;
  selectedMarkerIndices: Set<number>;
  editableMarkersRef: React.MutableRefObject<L.Marker[]>;
  editablePointsRef: React.MutableRefObject<L.LatLng[]>;
  activeZoneIdRef: React.MutableRefObject<string | null>;
  applyRoundingToSelected: () => void;
  setFinalPolygonRef: (polygon: L.Polygon | null) => void;
  setEditableMarkers: (markers: L.Marker[]) => void;
  setSelectedMarkerIndices: (indices: Set<number>) => void;
  createEditableMarker: (point: L.LatLng, index: number, points: L.LatLng[], polygon: L.Polygon, isSelected?: boolean, zoneId?: string) => L.Marker;
}

export function usePolygonEditing(
  map: L.Map | null,
  activeZoneId: string | null,
  zones: Zone[],
  isDrawing: boolean,
  onUpdateZone: (zoneId: string, updates: Partial<Zone>) => void,
  setStatusMessage: (msg: string) => void,
): UsePolygonEditingReturn {
  const [editableMarkers, setEditableMarkers] = useState<L.Marker[]>([]);
  const [finalPolygonRef, setFinalPolygonRef] = useState<L.Polygon | null>(null);
  const [selectedMarkerIndices, setSelectedMarkerIndices] = useState<Set<number>>(new Set());

  const editableMarkersRef = useRef<L.Marker[]>([]);
  const editablePointsRef = useRef<L.LatLng[]>([]);
  const activeZoneIdRef = useRef<string | null>(null);

  // Ref for addPointOnSegment to avoid circular dependencies
  const addPointOnSegmentRef = useRef<(clickLatLng: L.LatLng) => void>(() => {});
  // Ref for deletePointAtIndex to avoid circular dependencies
  const deletePointAtIndexRef = useRef<(index: number) => void>(() => {});

  // Track previous active zone state to avoid unnecessary marker recreation
  const prevActiveZoneRef = useRef<{ id: string | null; pointCount: number }>({ id: null, pointCount: 0 });

  // Keep activeZoneIdRef in sync
  useEffect(() => {
    activeZoneIdRef.current = activeZoneId;
  }, [activeZoneId]);

  // Update zone when polygon points change
  const updateZoneFromPoints = useCallback((points: L.LatLng[], polygon: L.Polygon, zoneId?: string) => {
    const targetZoneId = zoneId || activeZoneIdRef.current;
    if (!targetZoneId) return;
    const bounds = polygon.getBounds();
    onUpdateZone(targetZoneId, {
      coordinates: points.map(p => [p.lat, p.lng]),
      bounds: bounds,
    });
  }, [onUpdateZone]);

  // Create icon for marker (selected or not)
  const createMarkerIcon = useCallback((isSelected: boolean) => {
    return L.divIcon({
      className: 'polygon-edit-marker',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      html: `<div style="
        width: 14px;
        height: 14px;
        background: ${isSelected ? '#f59e0b' : '#3b82f6'};
        border: 2px solid ${isSelected ? '#fbbf24' : 'white'};
        border-radius: 50%;
        cursor: move;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        ${isSelected ? 'transform: scale(1.2);' : ''}
      "></div>`,
    });
  }, []);

  // Toggle marker selection
  const toggleMarkerSelection = useCallback((index: number, marker: L.Marker) => {
    setSelectedMarkerIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
        marker.setIcon(createMarkerIcon(false));
      } else {
        newSet.add(index);
        marker.setIcon(createMarkerIcon(true));
      }
      return newSet;
    });
  }, [createMarkerIcon]);

  // Helper: Find the closest segment to a point and return the index to insert after
  const findClosestSegment = useCallback((clickLatLng: L.LatLng, points: L.LatLng[]): number => {
    if (!map || points.length < 2) return 0;

    const clickPoint = map.latLngToContainerPoint(clickLatLng);

    let minDist = Infinity;
    let insertAfterIndex = 0;

    for (let i = 0; i < points.length; i++) {
      const p1 = map.latLngToContainerPoint(points[i]);
      const p2 = map.latLngToContainerPoint(points[(i + 1) % points.length]);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const lengthSq = dx * dx + dy * dy;

      let dist: number;
      if (lengthSq === 0) {
        dist = clickPoint.distanceTo(p1);
      } else {
        const t = Math.max(0, Math.min(1, ((clickPoint.x - p1.x) * dx + (clickPoint.y - p1.y) * dy) / lengthSq));
        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;
        dist = Math.sqrt((clickPoint.x - projX) ** 2 + (clickPoint.y - projY) ** 2);
      }

      if (dist < minDist) {
        minDist = dist;
        insertAfterIndex = i;
      }
    }

    return insertAfterIndex;
  }, [map]);

  // Ref to hold the current polygon for marker event handlers (avoids closure capture)
  const currentPolygonRef = useRef<L.Polygon | null>(null);

  // Internal marker creation (without dependency on deletePointAtIndex)
  // Uses refs instead of direct closure captures to prevent memory leaks
  const createEditableMarkerInternal = useCallback((point: L.LatLng, index: number, points: L.LatLng[], polygon: L.Polygon, isSelected: boolean = false, zoneId?: string) => {
    const icon = createMarkerIcon(isSelected);

    const marker = L.marker(point, {
      icon,
      draggable: true,
      pane: 'markerPane',
    });

    (marker as any).markerIndex = index;
    (marker as any).zoneId = zoneId;

    // Store polygon ref for use in event handlers (avoids closure memory leak)
    currentPolygonRef.current = polygon;

    marker.on('drag', (e: L.LeafletEvent) => {
      const target = e.target as L.Marker;
      const newLatLng = target.getLatLng();
      const markerIdx = (target as any).markerIndex;
      // Use refs instead of captured variables to prevent memory leaks
      const currentPoints = editablePointsRef.current;
      const currentPolygon = currentPolygonRef.current;
      if (currentPoints && currentPolygon && markerIdx !== undefined) {
        currentPoints[markerIdx] = newLatLng;
        currentPolygon.setLatLngs(currentPoints);
      }
    });

    marker.on('dragend', (e: L.LeafletEvent) => {
      const target = e.target as L.Marker;
      const markerZoneId = (target as any).zoneId;
      // Use refs instead of captured variables to prevent memory leaks
      const currentPoints = editablePointsRef.current;
      const currentPolygon = currentPolygonRef.current;
      if (currentPoints && currentPolygon) {
        updateZoneFromPoints(currentPoints, currentPolygon, markerZoneId);
      }
    });

    marker.on('click', (e: L.LeafletMouseEvent) => {
      if (e.originalEvent.ctrlKey) {
        const markerIdx = (e.target as any).markerIndex;
        toggleMarkerSelection(markerIdx, e.target as L.Marker);
        e.originalEvent.stopPropagation();
      }
    });

    return marker;
  }, [createMarkerIcon, updateZoneFromPoints, toggleMarkerSelection]);

  // Create draggable marker for polygon editing
  const createEditableMarker = useCallback((point: L.LatLng, index: number, points: L.LatLng[], polygon: L.Polygon, isSelected: boolean = false, zoneId?: string) => {
    const marker = createEditableMarkerInternal(point, index, points, polygon, isSelected, zoneId);

    marker.on('dblclick', (e: L.LeafletMouseEvent) => {
      e.originalEvent.stopPropagation();
      e.originalEvent.preventDefault();
      deletePointAtIndexRef.current(index);
    });

    return marker;
  }, [createEditableMarkerInternal]);

  // Add a point on the polygon edge
  const addPointOnSegment = useCallback((clickLatLng: L.LatLng) => {
    if (!map || !finalPolygonRef) return;

    const points = editablePointsRef.current;
    const insertAfterIndex = findClosestSegment(clickLatLng, points);

    const newPoints = [
      ...points.slice(0, insertAfterIndex + 1),
      clickLatLng,
      ...points.slice(insertAfterIndex + 1),
    ];
    editablePointsRef.current = newPoints;

    finalPolygonRef.setLatLngs(newPoints);

    // Clean up event listeners before removing markers
    editableMarkersRef.current.forEach(m => {
      m.off();
      map.removeLayer(m);
    });

    const currentZoneId = activeZoneIdRef.current;
    const newMarkers: L.Marker[] = [];
    newPoints.forEach((point, index) => {
      const marker = createEditableMarker(point, index, newPoints, finalPolygonRef, false, currentZoneId || undefined);
      marker.addTo(map);
      newMarkers.push(marker);
    });
    editableMarkersRef.current = newMarkers;
    setEditableMarkers(newMarkers);
    setSelectedMarkerIndices(new Set());

    updateZoneFromPoints(newPoints, finalPolygonRef, currentZoneId || undefined);
    setStatusMessage(`Point ajouté (${newPoints.length} points).`);
  }, [map, finalPolygonRef, findClosestSegment, createEditableMarker, updateZoneFromPoints, setStatusMessage]);

  // Delete a point from the polygon
  const deletePointAtIndex = useCallback((indexToDelete: number) => {
    if (!map || !finalPolygonRef) return;

    const points = editablePointsRef.current;

    if (points.length <= 3) {
      setStatusMessage('Impossible de supprimer: minimum 3 points requis.');
      return;
    }

    const newPoints = points.filter((_, i) => i !== indexToDelete);
    editablePointsRef.current = newPoints;

    finalPolygonRef.setLatLngs(newPoints);

    // Clean up event listeners before removing markers
    editableMarkersRef.current.forEach(m => {
      m.off();
      map.removeLayer(m);
    });

    const currentZoneId = activeZoneIdRef.current;
    const newMarkers: L.Marker[] = [];
    newPoints.forEach((point, index) => {
      const marker = createEditableMarker(point, index, newPoints, finalPolygonRef, false, currentZoneId || undefined);
      marker.addTo(map);
      newMarkers.push(marker);
    });
    editableMarkersRef.current = newMarkers;
    setEditableMarkers(newMarkers);
    setSelectedMarkerIndices(new Set());

    updateZoneFromPoints(newPoints, finalPolygonRef, currentZoneId || undefined);
    setStatusMessage(`Point supprimé (${newPoints.length} points restants).`);
  }, [map, finalPolygonRef, createEditableMarker, updateZoneFromPoints, setStatusMessage]);

  // Keep refs in sync
  useEffect(() => {
    addPointOnSegmentRef.current = addPointOnSegment;
    deletePointAtIndexRef.current = deletePointAtIndex;
  }, [addPointOnSegment, deletePointAtIndex]);

  // Effect to handle double-click on map for adding points to polygon
  // Uses editableMarkersRef instead of editableMarkers state to avoid re-creating
  // event handlers every time a marker is added/modified (performance optimization)
  useEffect(() => {
    if (!map || !finalPolygonRef || isDrawing) return;

    const handleMapDblClick = (e: L.LeafletMouseEvent) => {
      const clickLatLng = e.latlng;
      const points = editablePointsRef.current;
      if (points.length < 3) return;

      // Use ref instead of state to avoid effect re-runs when markers change
      const markers = editableMarkersRef.current;
      const clickPoint = map.latLngToContainerPoint(clickLatLng);
      for (const marker of markers) {
        const markerPoint = map.latLngToContainerPoint(marker.getLatLng());
        if (clickPoint.distanceTo(markerPoint) < MARKER_CLICK_THRESHOLD_PX) {
          return;
        }
      }

      const insertAfterIndex = findClosestSegment(clickLatLng, points);
      const p1 = map.latLngToContainerPoint(points[insertAfterIndex]);
      const p2 = map.latLngToContainerPoint(points[(insertAfterIndex + 1) % points.length]);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const lengthSq = dx * dx + dy * dy;
      let dist: number;
      if (lengthSq === 0) {
        dist = clickPoint.distanceTo(p1);
      } else {
        const t = Math.max(0, Math.min(1, ((clickPoint.x - p1.x) * dx + (clickPoint.y - p1.y) * dy) / lengthSq));
        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;
        dist = Math.sqrt((clickPoint.x - projX) ** 2 + (clickPoint.y - projY) ** 2);
      }

      if (dist <= SEGMENT_CLICK_THRESHOLD_PX) {
        addPointOnSegmentRef.current(clickLatLng);
      }
    };

    map.on('dblclick', handleMapDblClick);

    return () => {
      map.off('dblclick', handleMapDblClick);
    };
  }, [map, finalPolygonRef, isDrawing, findClosestSegment]);

  // Manage editing markers when active zone changes
  useEffect(() => {
    if (!map || isDrawing) return;

    const activeZone = zones.find(z => z.id === activeZoneId);
    const currentPointCount = activeZone?.coordinates?.length || 0;
    const prevState = prevActiveZoneRef.current;

    const zoneIdChanged = prevState.id !== activeZoneId;
    const pointCountChanged = prevState.pointCount !== currentPointCount;
    const markersNotCreated = activeZone && activeZone.coordinates &&
      activeZone.coordinates.length >= 3 && editableMarkersRef.current.length === 0;

    if (!zoneIdChanged && !pointCountChanged && !markersNotCreated) {
      return;
    }

    prevActiveZoneRef.current = { id: activeZoneId, pointCount: currentPointCount };

    // Clean up existing markers (remove event listeners first to prevent memory leaks)
    editableMarkersRef.current.forEach(m => {
      m.off();
      try { map.removeLayer(m); } catch (e) { /* ignore */ }
    });
    editableMarkersRef.current = [];
    setEditableMarkers([]);
    editablePointsRef.current = [];
    setFinalPolygonRef(null);

    // If there's an active zone, create markers for it
    if (activeZone && activeZone.coordinates && activeZone.coordinates.length >= 3) {
      const points = activeZone.coordinates.map(
        (coord: number[]) => L.latLng(coord[0], coord[1])
      );
      editablePointsRef.current = points;

      const editPolygon = L.polygon(points, {
        color: 'transparent',
        fillColor: 'transparent',
        fillOpacity: 0,
        interactive: false,
      });
      setFinalPolygonRef(editPolygon);

      const markers: L.Marker[] = [];
      points.forEach((point, index) => {
        const marker = createEditableMarker(point, index, points, editPolygon, false, activeZone.id);
        marker.addTo(map);
        markers.push(marker);
      });
      editableMarkersRef.current = markers;
      setEditableMarkers(markers);
    }
  }, [map, activeZoneId, zones, isDrawing, createEditableMarker]);

  // Apply curve to selected points
  const applyRoundingToSelected = useCallback(() => {
    if (!map || !finalPolygonRef || selectedMarkerIndices.size < 2) {
      setStatusMessage('Sélectionnez au moins 2 points (Ctrl+clic) pour arrondir.');
      return;
    }

    const points = editablePointsRef.current;
    const n = points.length;
    const sortedIndices = Array.from(selectedMarkerIndices).sort((a, b) => a - b);

    const gaps: number[] = [];
    for (let i = 1; i < sortedIndices.length; i++) {
      if (sortedIndices[i] !== sortedIndices[i - 1] + 1) {
        gaps.push(i);
      }
    }

    const hasWrapAround = sortedIndices[0] === 0 && sortedIndices[sortedIndices.length - 1] === n - 1;

    let orderedIndices: number[];
    let isWrapping = false;

    if (gaps.length === 0) {
      orderedIndices = sortedIndices;
    } else if (gaps.length === 1 && hasWrapAround) {
      const gapPos = gaps[0];
      orderedIndices = [...sortedIndices.slice(gapPos), ...sortedIndices.slice(0, gapPos)];
      isWrapping = true;
    } else {
      setStatusMessage('Les points sélectionnés doivent être consécutifs.');
      return;
    }

    const pointsToCurve = orderedIndices.map(i => points[i]);
    const curvedPoints = catmullRomSpline(pointsToCurve, 8);

    const newPoints: L.LatLng[] = [];

    if (isWrapping) {
      const selectedSet = new Set(orderedIndices);
      let firstNonSelected = -1;

      for (let i = 0; i < n; i++) {
        if (!selectedSet.has(i)) {
          firstNonSelected = i;
          break;
        }
      }

      if (firstNonSelected === -1) {
        for (const p of curvedPoints) {
          newPoints.push(p);
        }
      } else {
        for (const p of curvedPoints) {
          newPoints.push(p);
        }
        for (let i = firstNonSelected; i < n; i++) {
          if (!selectedSet.has(i)) {
            newPoints.push(points[i]);
          }
        }
        for (let i = 0; i < firstNonSelected; i++) {
          if (!selectedSet.has(i)) {
            newPoints.push(points[i]);
          }
        }
      }
    } else {
      const startIdx = orderedIndices[0];
      const endIdx = orderedIndices[orderedIndices.length - 1];

      for (let i = 0; i < startIdx; i++) {
        newPoints.push(points[i]);
      }
      for (const p of curvedPoints) {
        newPoints.push(p);
      }
      for (let i = endIdx + 1; i < n; i++) {
        newPoints.push(points[i]);
      }
    }

    finalPolygonRef.setLatLngs(newPoints);
    editablePointsRef.current = newPoints;

    // Clean up event listeners before removing markers
    editableMarkersRef.current.forEach(m => {
      m.off();
      map.removeLayer(m);
    });

    const currentZoneId = activeZoneIdRef.current;
    const newMarkers: L.Marker[] = [];
    newPoints.forEach((point, index) => {
      const marker = createEditableMarker(point, index, newPoints, finalPolygonRef, false, currentZoneId || undefined);
      marker.addTo(map);
      newMarkers.push(marker);
    });
    editableMarkersRef.current = newMarkers;
    setEditableMarkers(newMarkers);
    setSelectedMarkerIndices(new Set());

    updateZoneFromPoints(newPoints, finalPolygonRef, currentZoneId || undefined);
    setStatusMessage(`Arrondi appliqué (${curvedPoints.length} points générés).`);
  }, [map, finalPolygonRef, selectedMarkerIndices, createEditableMarker, updateZoneFromPoints, setStatusMessage]);

  return {
    editableMarkers,
    finalPolygonRef,
    selectedMarkerIndices,
    editableMarkersRef,
    editablePointsRef,
    activeZoneIdRef,
    applyRoundingToSelected,
    setFinalPolygonRef,
    setEditableMarkers,
    setSelectedMarkerIndices,
    createEditableMarker,
  };
}
