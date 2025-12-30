import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, FeatureGroup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { jsPDF } from 'jspdf';
import { RenderStyle, ColorOverridesState, ColorEditMode, ElementCategory } from '../types';
import { generateSVG } from '../utils/svgGenerator';
import { fetchOSMData } from '../utils/osmData';
import { createOSMOverlay } from '../utils/osmOverlay';
import { isPointInPolygon, getWayCentroid, buildNodeMap, matchesCategory } from '../utils/geometry';
import AddressSearch from './AddressSearch';

// Fast object fingerprint (faster than JSON.stringify for shallow objects)
function objectFingerprint(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const val = obj[key];
    parts.push(key + ':' + (typeof val === 'object' && val !== null ? objectFingerprint(val as Record<string, unknown>) : String(val)));
  }
  return parts.join('|');
}

// Darken a hex color for building stroke
function deriveCasingColor(fillColor: string): string {
  const hex = fillColor.replace('#', '');
  const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - 40);
  const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - 40);
  const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - 40);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Catmull-Rom spline interpolation (passes through all control points)
function catmullRomSpline(points: L.LatLng[], numPointsPerSegment: number = 10): L.LatLng[] {
  if (points.length < 2) return points;
  if (points.length === 2) {
    // Just interpolate linearly between 2 points
    const result: L.LatLng[] = [];
    for (let i = 0; i <= numPointsPerSegment; i++) {
      const t = i / numPointsPerSegment;
      const lat = points[0].lat + t * (points[1].lat - points[0].lat);
      const lng = points[0].lng + t * (points[1].lng - points[0].lng);
      result.push(L.latLng(lat, lng));
    }
    return result;
  }

  const result: L.LatLng[] = [];

  // For each segment between points
  for (let i = 0; i < points.length - 1; i++) {
    // Get 4 control points (p0, p1, p2, p3)
    // For endpoints, we mirror the points
    const p0 = i === 0 ? points[0] : points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < points.length ? points[i + 2] : points[points.length - 1];

    // Generate points along this segment
    for (let j = 0; j < numPointsPerSegment; j++) {
      const t = j / numPointsPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;

      // Catmull-Rom basis functions
      const lat = 0.5 * (
        (2 * p1.lat) +
        (-p0.lat + p2.lat) * t +
        (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * t2 +
        (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * t3
      );
      const lng = 0.5 * (
        (2 * p1.lng) +
        (-p0.lng + p2.lng) * t +
        (2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng) * t2 +
        (-p0.lng + 3 * p1.lng - 3 * p2.lng + p3.lng) * t3
      );

      result.push(L.latLng(lat, lng));
    }
  }

  // Add the last point
  result.push(points[points.length - 1]);

  return result;
}

// LocalStorage keys for persistence
const MAP_VIEW_STORAGE_KEY = 'carto-map-view';
const SHOW_POI_STORAGE_KEY = 'carto-show-poi';
const SHOW_COMPASS_STORAGE_KEY = 'carto-show-compass';

// Default map view (Paris)
const DEFAULT_CENTER: [number, number] = [48.8566, 2.3522];
const DEFAULT_ZOOM = 17;

// Load saved map view from localStorage
function loadSavedMapView(): { center: [number, number]; zoom: number } {
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

// Component to persist map view in localStorage
const MapViewPersistence: React.FC = () => {
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

// Component to add labels layer with custom pane (must be inside MapContainer)
const LabelsLayer: React.FC = () => {
  const map = useMap();
  const [paneReady, setPaneReady] = useState(false);

  useEffect(() => {
    if (!map.getPane('labelsPane')) {
      const pane = map.createPane('labelsPane');
      pane.style.zIndex = '650';
    }
    setPaneReady(true);
  }, [map]);

  if (!paneReady) return null;

  return (
    <TileLayer
      url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
      subdomains="abcd"
      pane="labelsPane"
    />
  );
};

interface MapEditorProps {
  renderStyle: RenderStyle;
  previewStyle: RenderStyle;
  isPreviewMode: boolean;
  onZoneSelect: (zone: any) => void;
  selectedZone: any;
  colorOverrides?: ColorOverridesState;
  colorEditMode?: ColorEditMode;
  onApplyColorOverride?: (wayId: number, color: string, category: ElementCategory) => void;
  useOfflineMode?: boolean;
}

const MapEditor: React.FC<MapEditorProps> = ({
  renderStyle,
  previewStyle,
  isPreviewMode,
  onZoneSelect,
  selectedZone,
  colorOverrides,
  colorEditMode,
  onApplyColorOverride,
  useOfflineMode = false,
}) => {
  // Load saved map view (center + zoom) from localStorage
  const [initialView] = useState(() => loadSavedMapView());

  const [map, setMap] = useState<L.Map | null>(null);
  const [drawnItems, setDrawnItems] = useState<L.FeatureGroup | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [lastExportedPath, setLastExportedPath] = useState<string | null>(null);
  const [lastExportedPngPath, setLastExportedPngPath] = useState<string | null>(null);
  const [lastExportedPdfPath, setLastExportedPdfPath] = useState<string | null>(null);
  const [isToolsPanelMinimized, setIsToolsPanelMinimized] = useState(false);
  const [osmOverlay, setOsmOverlay] = useState<L.LayerGroup | null>(null);
  const [osmData, setOsmData] = useState<any>(null);
  const [viewBounds, setViewBounds] = useState<L.LatLngBounds | null>(null);
  const [isLoadingView, setIsLoadingView] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const overlayDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadingRef = useRef(false);
  const layerMapRef = useRef<Map<number, L.Path>>(new Map());
  const prevOsmDataRef = useRef<any>(null);
  const styleUpdateDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const colorEditModeRef = useRef(colorEditMode);

  // Polygon drawing state
  const [polygonPoints, setPolygonPoints] = useState<L.LatLng[]>([]);
  const [editableMarkers, setEditableMarkers] = useState<L.Marker[]>([]);
  const [finalPolygonRef, setFinalPolygonRef] = useState<L.Polygon | null>(null);
  const [selectedMarkerIndices, setSelectedMarkerIndices] = useState<Set<number>>(new Set());
  const editablePointsRef = useRef<L.LatLng[]>([]);
  const editableMarkersRef = useRef<L.Marker[]>([]);

  // Export options
  const [forceAllLabels, setForceAllLabels] = useState(false);
  const [exportBorderColor, setExportBorderColor] = useState(renderStyle.borderColor);
  const [exteriorOverlay, setExteriorOverlay] = useState(true);
  const [exteriorOverlayOpacity, setExteriorOverlayOpacity] = useState(0.3);
  const [showPOI, setShowPOI] = useState(() => {
    try {
      const saved = localStorage.getItem(SHOW_POI_STORAGE_KEY);
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [showCompass, setShowCompass] = useState(() => {
    try {
      const saved = localStorage.getItem(SHOW_COMPASS_STORAGE_KEY);
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [polygonMarkers, setPolygonMarkers] = useState<L.CircleMarker[]>([]);
  const [tempPolygon, setTempPolygon] = useState<L.Polygon | null>(null);
  const [exteriorMask, setExteriorMask] = useState<L.Polygon | null>(null);

  // Polygon selection state for color editing
  const [colorPolygonPoints, setColorPolygonPoints] = useState<L.LatLng[]>([]);
  const [colorPolygonMarkers, setColorPolygonMarkers] = useState<L.CircleMarker[]>([]);
  const [colorTempPolygon, setColorTempPolygon] = useState<L.Polygon | null>(null);
  const [isColorPolygonDrawing, setIsColorPolygonDrawing] = useState(false);

  // Determine which style to use for display
  const activeStyle = isPreviewMode ? previewStyle : renderStyle;

  // Create a stable key that changes when style content changes (for effect dependency)
  const styleKey = useMemo(() => objectFingerprint(activeStyle as unknown as Record<string, unknown>), [activeStyle]);

  // Sync export border color with theme's border color when theme changes
  useEffect(() => {
    setExportBorderColor(activeStyle.borderColor);
  }, [activeStyle.borderColor]);

  // Keep colorEditModeRef in sync (for stable click handler)
  useEffect(() => {
    colorEditModeRef.current = colorEditMode;
  }, [colorEditMode]);

  // Persist showPOI option to localStorage
  useEffect(() => {
    localStorage.setItem(SHOW_POI_STORAGE_KEY, JSON.stringify(showPOI));
  }, [showPOI]);

  // Persist showCompass option to localStorage
  useEffect(() => {
    localStorage.setItem(SHOW_COMPASS_STORAGE_KEY, JSON.stringify(showCompass));
  }, [showCompass]);

  // Minimum zoom level for loading OSM data (to avoid overloading)
  const MIN_ZOOM_FOR_DATA = 15;

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
  }, [useOfflineMode]);

  useEffect(() => {
    if (!map) return;

    // Create custom panes for zone elements to ensure consistent z-ordering
    if (!map.getPane('zonePane')) {
      const zonePane = map.createPane('zonePane');
      zonePane.style.zIndex = '450';  // Above overlay (400) but below markers (600)
    }
    if (!map.getPane('maskPane')) {
      const maskPane = map.createPane('maskPane');
      maskPane.style.zIndex = '445';  // Just below zone pane
    }

    const fg = new L.FeatureGroup();
    fg.addTo(map);
    setDrawnItems(fg);

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
    };
  }, [map, loadViewOsmData]);

  // Update existing shapes when preview style changes
  useEffect(() => {
    if (!drawnItems || !isPreviewMode) return;

    drawnItems.eachLayer((layer: L.Layer) => {
      if (layer instanceof L.Polygon) {
        layer.setStyle({
          color: previewStyle.borderColor,
          weight: previewStyle.borderWidth,
          fillColor: previewStyle.interiorColor,
          fillOpacity: previewStyle.fillOpacity,
        });
      }
    });
  }, [drawnItems, isPreviewMode, previewStyle]);

  // Helper to check if click is near the first point (to close polygon)
  const isNearFirstPoint = useCallback((latlng: L.LatLng, firstPoint: L.LatLng): boolean => {
    if (!map) return false;
    const p1 = map.latLngToContainerPoint(latlng);
    const p2 = map.latLngToContainerPoint(firstPoint);
    const distance = p1.distanceTo(p2);
    return distance < 15; // 15 pixels threshold
  }, [map]);

  // Update zone when polygon points change
  const updateZoneFromPoints = useCallback((points: L.LatLng[], polygon: L.Polygon) => {
    const bounds = polygon.getBounds();
    const zone = {
      type: 'Polygon' as const,
      coordinates: points.map(p => [p.lat, p.lng]),
      bounds: bounds,
    };
    onZoneSelect(zone);
  }, [onZoneSelect]);

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

    // Convert to container points for pixel-based distance calculation
    const clickPoint = map.latLngToContainerPoint(clickLatLng);

    let minDist = Infinity;
    let insertAfterIndex = 0;

    for (let i = 0; i < points.length; i++) {
      const p1 = map.latLngToContainerPoint(points[i]);
      const p2 = map.latLngToContainerPoint(points[(i + 1) % points.length]);

      // Calculate distance from click to line segment p1-p2
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const lengthSq = dx * dx + dy * dy;

      let dist: number;
      if (lengthSq === 0) {
        // p1 and p2 are the same point
        dist = clickPoint.distanceTo(p1);
      } else {
        // Project click onto line segment
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

  // Ref for addPointOnSegment to avoid circular dependencies
  const addPointOnSegmentRef = useRef<(clickLatLng: L.LatLng) => void>(() => {});

  // Ref for deletePointAtIndex to avoid circular dependencies
  const deletePointAtIndexRef = useRef<(index: number) => void>(() => {});

  // Internal marker creation (without dependency on deletePointAtIndex)
  const createEditableMarkerInternal = useCallback((point: L.LatLng, index: number, points: L.LatLng[], polygon: L.Polygon, isSelected: boolean = false) => {
    const icon = createMarkerIcon(isSelected);

    const marker = L.marker(point, {
      icon,
      draggable: true,
      pane: 'markerPane',
    });

    // Store index on marker for reference
    (marker as any).markerIndex = index;

    marker.on('drag', (e: L.LeafletEvent) => {
      const target = e.target as L.Marker;
      const newLatLng = target.getLatLng();

      // Update points array
      points[index] = newLatLng;

      // Update polygon shape
      polygon.setLatLngs(points);
    });

    marker.on('dragend', () => {
      // Update zone with new coordinates
      updateZoneFromPoints(points, polygon);
    });

    // Ctrl+click to select/deselect
    marker.on('click', (e: L.LeafletMouseEvent) => {
      if (e.originalEvent.ctrlKey) {
        toggleMarkerSelection(index, marker);
        e.originalEvent.stopPropagation();
      }
    });

    return marker;
  }, [createMarkerIcon, updateZoneFromPoints, toggleMarkerSelection]);

  // Create draggable marker for polygon editing
  const createEditableMarker = useCallback((point: L.LatLng, index: number, points: L.LatLng[], polygon: L.Polygon, isSelected: boolean = false) => {
    const marker = createEditableMarkerInternal(point, index, points, polygon, isSelected);

    // Double-click to delete point (use ref to avoid stale closure)
    marker.on('dblclick', (e: L.LeafletMouseEvent) => {
      e.originalEvent.stopPropagation();
      e.originalEvent.preventDefault();
      deletePointAtIndexRef.current(index);
    });

    return marker;
  }, [createEditableMarkerInternal]);

  // Add a point on the polygon edge (called on double-click near polygon line)
  const addPointOnSegment = useCallback((clickLatLng: L.LatLng) => {
    if (!map || !finalPolygonRef) return;

    const points = editablePointsRef.current;
    const insertAfterIndex = findClosestSegment(clickLatLng, points);

    // Insert the new point after the found index
    const newPoints = [
      ...points.slice(0, insertAfterIndex + 1),
      clickLatLng,
      ...points.slice(insertAfterIndex + 1),
    ];
    editablePointsRef.current = newPoints;

    // Update polygon
    finalPolygonRef.setLatLngs(newPoints);

    // Remove old markers (use ref for current value)
    editableMarkersRef.current.forEach(m => map.removeLayer(m));

    // Create new markers
    const newMarkers: L.Marker[] = [];
    newPoints.forEach((point, index) => {
      const marker = createEditableMarker(point, index, newPoints, finalPolygonRef, false);
      marker.addTo(map);
      newMarkers.push(marker);
    });
    editableMarkersRef.current = newMarkers;
    setEditableMarkers(newMarkers);
    setSelectedMarkerIndices(new Set());

    // Update zone
    updateZoneFromPoints(newPoints, finalPolygonRef);
    setStatusMessage(`Point ajouté (${newPoints.length} points).`);
  }, [map, finalPolygonRef, findClosestSegment, createEditableMarker, updateZoneFromPoints]);

  // Delete a point from the polygon (called on double-click on marker)
  const deletePointAtIndex = useCallback((indexToDelete: number) => {
    if (!map || !finalPolygonRef) return;

    const points = editablePointsRef.current;

    // Don't delete if we'd have less than 3 points
    if (points.length <= 3) {
      setStatusMessage('Impossible de supprimer: minimum 3 points requis.');
      return;
    }

    // Remove the point
    const newPoints = points.filter((_, i) => i !== indexToDelete);
    editablePointsRef.current = newPoints;

    // Update polygon
    finalPolygonRef.setLatLngs(newPoints);

    // Remove old markers (use ref for current value)
    editableMarkersRef.current.forEach(m => map.removeLayer(m));

    // Create new markers
    const newMarkers: L.Marker[] = [];
    newPoints.forEach((point, index) => {
      const marker = createEditableMarker(point, index, newPoints, finalPolygonRef, false);
      marker.addTo(map);
      newMarkers.push(marker);
    });
    editableMarkersRef.current = newMarkers;
    setEditableMarkers(newMarkers);
    setSelectedMarkerIndices(new Set());

    // Update zone
    updateZoneFromPoints(newPoints, finalPolygonRef);
    setStatusMessage(`Point supprimé (${newPoints.length} points restants).`);
  }, [map, finalPolygonRef, createEditableMarker, updateZoneFromPoints]);

  // Keep refs in sync
  useEffect(() => {
    addPointOnSegmentRef.current = addPointOnSegment;
    deletePointAtIndexRef.current = deletePointAtIndex;
  }, [addPointOnSegment, deletePointAtIndex]);

  // Effect to handle double-click on map for adding points to polygon
  useEffect(() => {
    if (!map || !finalPolygonRef || isDrawing) return;

    const handleMapDblClick = (e: L.LeafletMouseEvent) => {
      const clickLatLng = e.latlng;
      const points = editablePointsRef.current;
      if (points.length < 3) return;

      // Check if click is near any marker (if so, let the marker's dblclick handle it)
      const clickPoint = map.latLngToContainerPoint(clickLatLng);
      for (const marker of editableMarkers) {
        const markerPoint = map.latLngToContainerPoint(marker.getLatLng());
        if (clickPoint.distanceTo(markerPoint) < 20) {
          return; // Near a marker, don't add point
        }
      }

      // Check if click is near a polygon edge
      const insertAfterIndex = findClosestSegment(clickLatLng, points);
      const p1 = map.latLngToContainerPoint(points[insertAfterIndex]);
      const p2 = map.latLngToContainerPoint(points[(insertAfterIndex + 1) % points.length]);

      // Calculate distance to segment
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

      // Only add point if click is within 15 pixels of a polygon edge
      if (dist <= 15) {
        addPointOnSegmentRef.current(clickLatLng);
      }
    };

    map.on('dblclick', handleMapDblClick);

    return () => {
      map.off('dblclick', handleMapDblClick);
    };
  }, [map, finalPolygonRef, isDrawing, editableMarkers, findClosestSegment]);

  // Finalize polygon
  const finalizePolygon = useCallback(() => {
    if (!map || !drawnItems || polygonPoints.length < 3) return;

    // Remove temp polygon and markers
    if (tempPolygon) {
      map.removeLayer(tempPolygon);
    }
    polygonMarkers.forEach(m => map.removeLayer(m));

    // Create final polygon with visible colors for UI
    const finalPolygon = L.polygon(polygonPoints, {
      color: '#3b82f6',  // Blue border
      weight: 2,
      fillColor: '#3b82f6',
      fillOpacity: 0.1,
      pane: 'zonePane',
      interactive: false,  // Don't intercept clicks - let them pass through to buildings
    });
    finalPolygon.addTo(drawnItems);
    setFinalPolygonRef(finalPolygon);

    // Create a mutable copy of points for editing
    const editablePoints = [...polygonPoints];
    editablePointsRef.current = editablePoints;

    // Create draggable markers for each point
    const markers: L.Marker[] = [];
    editablePoints.forEach((point, index) => {
      const marker = createEditableMarker(point, index, editablePoints, finalPolygon);
      marker.addTo(map);
      markers.push(marker);
    });
    editableMarkersRef.current = markers;
    setEditableMarkers(markers);
    setSelectedMarkerIndices(new Set());

    // Calculate bounds for OSM data fetching
    const bounds = finalPolygon.getBounds();

    // Create zone object with polygon coordinates
    const zone = {
      type: 'Polygon' as const,
      coordinates: polygonPoints.map(p => [p.lat, p.lng]),
      bounds: bounds,
    };

    // Reset drawing state
    setPolygonPoints([]);
    setPolygonMarkers([]);
    setTempPolygon(null);
    setIsDrawing(false);
    map.dragging.enable();

    onZoneSelect(zone);
    setStatusMessage('Zone sélectionnée. Double-clic: ligne=ajouter, point=supprimer. Ctrl+clic: sélection.');
  }, [map, drawnItems, polygonPoints, polygonMarkers, tempPolygon, createEditableMarker, onZoneSelect]);

  // Apply curve to selected points
  const applyRoundingToSelected = useCallback(() => {
    if (!map || !finalPolygonRef || selectedMarkerIndices.size < 2) {
      setStatusMessage('Sélectionnez au moins 2 points (Ctrl+clic) pour arrondir.');
      return;
    }

    const points = editablePointsRef.current;
    const n = points.length;
    const sortedIndices = Array.from(selectedMarkerIndices).sort((a, b) => a - b);

    // Check if selected points are consecutive (including wrap-around for closed polygons)
    // Find gaps in the sorted indices
    const gaps: number[] = [];
    for (let i = 1; i < sortedIndices.length; i++) {
      if (sortedIndices[i] !== sortedIndices[i - 1] + 1) {
        gaps.push(i);
      }
    }

    // Check wrap-around: if first index is 0 and last is n-1, they might be connected
    const hasWrapAround = sortedIndices[0] === 0 && sortedIndices[sortedIndices.length - 1] === n - 1;

    let orderedIndices: number[];
    let isWrapping = false;

    if (gaps.length === 0) {
      // All consecutive, no wrap
      orderedIndices = sortedIndices;
    } else if (gaps.length === 1 && hasWrapAround) {
      // One gap + wrap-around = valid circular selection
      // Reorder: start from after the gap, wrap to beginning
      const gapPos = gaps[0];
      orderedIndices = [...sortedIndices.slice(gapPos), ...sortedIndices.slice(0, gapPos)];
      isWrapping = true;
    } else {
      setStatusMessage('Les points sélectionnés doivent être consécutifs.');
      return;
    }

    // Get the points to curve in the correct order
    const pointsToCurve = orderedIndices.map(i => points[i]);

    // Generate curved points using Catmull-Rom spline
    const curvedPoints = catmullRomSpline(pointsToCurve, 8);

    // Build new points array
    const newPoints: L.LatLng[] = [];

    if (isWrapping) {
      // Wrapping case: the selection spans from end to beginning
      // Keep points that are NOT selected (the gap in the middle)
      const selectedSet = new Set(orderedIndices);

      // Find the first non-selected index after the wrap
      let firstNonSelected = -1;
      for (let i = 0; i < n; i++) {
        if (!selectedSet.has(i)) {
          firstNonSelected = i;
          break;
        }
      }

      if (firstNonSelected === -1) {
        // All points selected - just use curved points
        for (const p of curvedPoints) {
          newPoints.push(p);
        }
      } else {
        // Add curved points first (they replace the wrapped selection)
        for (const p of curvedPoints) {
          newPoints.push(p);
        }
        // Add non-selected points
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
      // Non-wrapping case: simple replacement
      const startIdx = orderedIndices[0];
      const endIdx = orderedIndices[orderedIndices.length - 1];

      // Add points before the selection
      for (let i = 0; i < startIdx; i++) {
        newPoints.push(points[i]);
      }

      // Add curved points
      for (const p of curvedPoints) {
        newPoints.push(p);
      }

      // Add points after the selection
      for (let i = endIdx + 1; i < n; i++) {
        newPoints.push(points[i]);
      }
    }

    // Update the polygon
    finalPolygonRef.setLatLngs(newPoints);
    editablePointsRef.current = newPoints;

    // Remove old markers (use ref for current value)
    editableMarkersRef.current.forEach(m => map.removeLayer(m));

    // Create new markers
    const newMarkers: L.Marker[] = [];
    newPoints.forEach((point, index) => {
      const marker = createEditableMarker(point, index, newPoints, finalPolygonRef);
      marker.addTo(map);
      newMarkers.push(marker);
    });
    editableMarkersRef.current = newMarkers;
    setEditableMarkers(newMarkers);
    setSelectedMarkerIndices(new Set());

    // Update zone
    updateZoneFromPoints(newPoints, finalPolygonRef);
    setStatusMessage(`Arrondi appliqué (${curvedPoints.length} points générés).`);
  }, [map, finalPolygonRef, selectedMarkerIndices, createEditableMarker, updateZoneFromPoints]);

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
          color: '#3b82f6',  // Blue border for visibility
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
  }, [map, isDrawing, drawnItems, polygonPoints, polygonMarkers, tempPolygon, activeStyle, isNearFirstPoint, finalizePolygon]);

  // Handle element click for color editing (uses ref for stable callback)
  const handleElementClick = useCallback((wayId: number, category: ElementCategory) => {
    const mode = colorEditModeRef.current;
    if (!mode?.active || !mode.selectedCategory || !onApplyColorOverride) return;
    if (category !== mode.selectedCategory) return;
    if (!selectedZone || !osmData) return;

    // Build node map to get way centroid
    const nodes = buildNodeMap(osmData);
    const way = osmData.elements.find((el: any) => el.type === 'way' && el.id === wayId);
    if (!way) return;

    // Get centroid of the way
    const centroid = getWayCentroid(way, nodes);
    if (!centroid) return;

    // Check if centroid is inside the selected zone
    if (!isPointInPolygon(centroid, selectedZone.coordinates)) return;

    // Apply the color override
    onApplyColorOverride(wayId, mode.selectedColor, category);
  }, [selectedZone, osmData, onApplyColorOverride]);

  // Helper to check if click is near the first point (for color polygon)
  const isNearFirstPointColor = useCallback((latlng: L.LatLng, firstPoint: L.LatLng): boolean => {
    if (!map) return false;
    const p1 = map.latLngToContainerPoint(latlng);
    const p2 = map.latLngToContainerPoint(firstPoint);
    const distance = p1.distanceTo(p2);
    return distance < 15; // 15 pixels threshold
  }, [map]);

  // Finalize color polygon and apply colors to elements inside
  const finalizeColorPolygon = useCallback(() => {
    if (!map || colorPolygonPoints.length < 3 || !colorEditMode?.selectedCategory || !onApplyColorOverride || !osmData || !selectedZone) return;

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

      // Check if centroid is in the zone
      if (!isPointInPolygon(centroid, selectedZone.coordinates)) continue;

      // Apply color override
      onApplyColorOverride(el.id, colorEditMode.selectedColor, category);
    }

    // Reset drawing state
    setColorPolygonPoints([]);
    setColorPolygonMarkers([]);
    setColorTempPolygon(null);
    setIsColorPolygonDrawing(false);
    map.dragging.enable();
  }, [map, colorPolygonPoints, colorPolygonMarkers, colorTempPolygon, colorEditMode, osmData, selectedZone, onApplyColorOverride]);

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
    if (!selectedZone || !osmData || !onApplyColorOverride) {
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
        color: isFirstPoint ? '#22c55e' : '#7c3aed',  // Green for first, purple for others
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
          color: '#7c3aed',  // Purple border
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

    // Disable dragging only when actively drawing
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
  }, [map, colorEditMode, selectedZone, osmData, onApplyColorOverride, colorPolygonPoints, colorPolygonMarkers, colorTempPolygon, isColorPolygonDrawing, isNearFirstPointColor, finalizeColorPolygon]);

  // Effect to create overlay when OSM data changes (full rebuild)
  useEffect(() => {
    if (!map || !osmData) return;

    // Clear previous debounce timer
    if (overlayDebounceRef.current) {
      clearTimeout(overlayDebounceRef.current);
    }

    // Store current overlay reference for cleanup
    let currentOverlay: L.LayerGroup | null = null;

    overlayDebounceRef.current = setTimeout(() => {
      // Prepare options for overlay (no clickableCategory - handled separately)
      const overlayOptions = {
        colorOverrides,
        onElementClick: handleElementClick,
        showLabels: useOfflineMode,  // Only show house numbers in offline mode (Carto tiles have labels)
        showPOI,  // Show/hide POI icons
      };

      // Create new overlay first (before removing old one to avoid flicker)
      const newOverlay = createOSMOverlay(map, osmData, activeStyle, overlayOptions);
      newOverlay.addTo(map);
      currentOverlay = newOverlay;

      // Build layer map for fast style/color updates
      layerMapRef.current.clear();
      newOverlay.eachLayer((layer: L.Layer) => {
        const wayId = (layer as any).wayId;
        if ((layer as any).setStyle) {
          if (wayId) {
            layerMapRef.current.set(wayId, layer as L.Path);
          }
        }
      });

      // Remove old overlay after new one is added
      if (osmOverlay) {
        map.removeLayer(osmOverlay);
      }

      prevOsmDataRef.current = osmData;
      setOsmOverlay(newOverlay);
    }, 200); // 200ms debounce

    // Cleanup: remove overlay when dependencies change or component unmounts
    return () => {
      if (overlayDebounceRef.current) {
        clearTimeout(overlayDebounceRef.current);
      }
      if (currentOverlay) {
        map.removeLayer(currentOverlay);
      }
    };
  }, [osmData, map, handleElementClick, useOfflineMode, showPOI]);

  // Separate effect for cursor style when color edit mode changes (no rebuild)
  useEffect(() => {
    if (!osmOverlay) return;

    const clickableCategory = colorEditMode?.active ? colorEditMode.selectedCategory : undefined;

    osmOverlay.eachLayer((layer: L.Layer) => {
      const layerAny = layer as any;
      if (!layerAny.setStyle || !layerAny.wayCategory) return;

      // Set cursor to pointer if this layer's category matches the clickable category
      const isClickable = clickableCategory && layerAny.wayCategory === clickableCategory;
      layerAny.setStyle({ cursor: isClickable ? 'pointer' : '' });
    });
  }, [colorEditMode?.active, colorEditMode?.selectedCategory, osmOverlay]);

  // Separate effect for style updates (in-place, no full rebuild)
  useEffect(() => {
    if (!osmOverlay || !osmData) return;
    // Skip if osmData just changed (full rebuild handles it)
    if (prevOsmDataRef.current !== osmData) return;

    // Clear previous debounce timer
    if (styleUpdateDebounceRef.current) {
      clearTimeout(styleUpdateDebounceRef.current);
    }

    styleUpdateDebounceRef.current = setTimeout(() => {
      // Update all layers with their new styles
      osmOverlay.eachLayer((layer: L.Layer) => {
        const layerAny = layer as any;
        if (!layerAny.setStyle) return;

        const category = layerAny.wayCategory;
        const styleType = layerAny.styleType;
        const isCasing = layerAny.isCasing;
        const wayId = layerAny.wayId;

        // Check for color override
        const override = colorOverrides?.overrides[wayId];

        if (category === 'building' && styleType) {
          const buildingStyle = activeStyle.building[styleType as keyof typeof activeStyle.building];
          if (buildingStyle) {
            const strokeEnabled = activeStyle.buildingStrokeEnabled !== false;
            // Derive stroke color from fill color (override or original)
            const fillColor = override?.color || buildingStyle.color;
            const strokeColor = deriveCasingColor(fillColor);
            layerAny.setStyle({
              fillColor: fillColor,
              color: strokeColor,
              fillOpacity: buildingStyle.opacity,
              opacity: strokeEnabled ? buildingStyle.opacity : 0,
            });
          }
        } else if (category === 'highway' && styleType) {
          const highwayStyle = activeStyle.highway[styleType as keyof typeof activeStyle.highway];
          if (highwayStyle) {
            if (isCasing) {
              // Casing layer - just update opacity
              layerAny.setStyle({ opacity: highwayStyle.opacity });
            } else {
              layerAny.setStyle({
                color: override?.color || highwayStyle.color,
                opacity: highwayStyle.opacity,
              });
            }
          }
        } else if (category === 'waterway' && styleType) {
          const waterwayStyle = activeStyle.waterway[styleType as keyof typeof activeStyle.waterway];
          if (waterwayStyle) {
            layerAny.setStyle({
              color: override?.color || waterwayStyle.color,
              opacity: waterwayStyle.opacity,
            });
          }
        } else if (category === 'natural' && styleType) {
          const naturalStyle = activeStyle.natural[styleType as keyof typeof activeStyle.natural];
          if (naturalStyle) {
            layerAny.setStyle({
              fillColor: override?.color || naturalStyle.color,
              fillOpacity: naturalStyle.opacity,
            });
          }
        } else if (category === 'landuse' && styleType) {
          const landuseStyle = activeStyle.landuse[styleType as keyof typeof activeStyle.landuse];
          if (landuseStyle) {
            layerAny.setStyle({
              color: landuseStyle.color,
              fillColor: landuseStyle.color,
              fillOpacity: landuseStyle.opacity,
            });
          }
        }
      });
    }, 50); // Faster debounce for style updates

    return () => {
      if (styleUpdateDebounceRef.current) {
        clearTimeout(styleUpdateDebounceRef.current);
      }
    };
  }, [styleKey, activeStyle, osmOverlay, osmData, colorOverrides]);

  // Effect to show gray mask outside the selected zone
  useEffect(() => {
    if (!map) return;

    let mask: L.Polygon | null = null;

    // Create new mask if zone is selected
    if (selectedZone && selectedZone.coordinates && selectedZone.coordinates.length >= 3) {
      // Create a large outer polygon (covers the world)
      const outerBounds: L.LatLngTuple[] = [
        [-90, -180],
        [-90, 180],
        [90, 180],
        [90, -180],
      ];

      // Inner hole is the selected zone (reversed to create a hole)
      const innerHole: L.LatLngTuple[] = selectedZone.coordinates.map(
        (coord: number[]) => [coord[0], coord[1]] as L.LatLngTuple
      );

      // Create polygon with hole
      mask = L.polygon([outerBounds, innerHole], {
        color: 'transparent',
        fillColor: '#000000',
        fillOpacity: 0.3,
        interactive: false,
        pane: 'maskPane',
      });
      mask.addTo(map);
    }

    setExteriorMask(mask);

    return () => {
      if (mask) {
        map.removeLayer(mask);
      }
    };
  }, [map, selectedZone]);

  const startDrawing = () => {
    if (drawnItems) {
      drawnItems.clearLayers();
    }
    // Clear any existing polygon drawing state
    if (map) {
      polygonMarkers.forEach(m => map.removeLayer(m));
      editableMarkersRef.current.forEach(m => map.removeLayer(m));
      if (tempPolygon) map.removeLayer(tempPolygon);
      if (exteriorMask) map.removeLayer(exteriorMask);
    }
    setPolygonPoints([]);
    setPolygonMarkers([]);
    editableMarkersRef.current = [];
    setEditableMarkers([]);
    setFinalPolygonRef(null);
    setSelectedMarkerIndices(new Set());
    editablePointsRef.current = [];
    setTempPolygon(null);
    setExteriorMask(null);
    setIsDrawing(true);
    onZoneSelect(null);
    setStatusMessage('Cliquez pour ajouter des points. Maintenez Ctrl pour déplacer la carte. Cliquez sur le point vert pour fermer.');
  };

  const clearDrawing = () => {
    if (drawnItems) {
      drawnItems.clearLayers();
    }
    if (map) {
      polygonMarkers.forEach(m => map.removeLayer(m));
      editableMarkersRef.current.forEach(m => map.removeLayer(m));
      if (tempPolygon) map.removeLayer(tempPolygon);
      if (exteriorMask) map.removeLayer(exteriorMask);
      map.dragging.enable();
    }
    setPolygonPoints([]);
    setPolygonMarkers([]);
    editableMarkersRef.current = [];
    setEditableMarkers([]);
    setFinalPolygonRef(null);
    setSelectedMarkerIndices(new Set());
    editablePointsRef.current = [];
    setTempPolygon(null);
    setExteriorMask(null);
    setIsDrawing(false);
    onZoneSelect(null);
    setStatusMessage('');
  };

  const exportSVG = async () => {
    if (!selectedZone || !map) {
      setStatusMessage('Veuillez d\'abord sélectionner une zone.');
      return;
    }

    setIsExporting(true);
    setStatusMessage('Génération du SVG...');

    try {
      // Get bounds for fetching OSM data
      const bounds = selectedZone.bounds || selectedZone;

      // Use cached OSM data if available, otherwise fetch
      const dataToExport = osmData || await fetchOSMData(bounds, useOfflineMode);

      // Generate SVG with current active style and zone object (polygon)
      const svgContent = generateSVG(dataToExport, selectedZone as any, activeStyle, map, {
        forceAllLabels,
        borderColor: exportBorderColor,
        exteriorOverlay,
        exteriorOverlayOpacity,
        showPOI,
        showCompass,
      }, colorOverrides);

      // Save using Electron API
      if (window.electronAPI) {
        const result = await window.electronAPI.saveSvg(svgContent, 'carte.svg');
        if (result.success && result.path) {
          setLastExportedPath(result.path);
          setStatusMessage(`SVG exporté: ${result.path}`);
        } else {
          setStatusMessage('Export annulé.');
        }
      } else {
        throw new Error('API Electron non disponible. Veuillez redémarrer l\'application.');
      }
    } catch (error) {
      console.error('Error exporting SVG:', error);
      setStatusMessage(`Erreur: ${error instanceof Error ? error.message : 'Export failed'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Helper function to convert SVG to canvas
  const svgToCanvas = async (svgContent: string, scale: number = 2): Promise<HTMLCanvasElement> => {
    return new Promise((resolve, reject) => {
      // Parse SVG to get dimensions
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
      const svgElement = svgDoc.documentElement;

      const width = parseFloat(svgElement.getAttribute('width') || '800');
      const height = parseFloat(svgElement.getAttribute('height') || '600');

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Impossible de créer le contexte canvas'));
        return;
      }

      // Create image from SVG
      const img = new Image();
      const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Erreur lors du chargement de l\'image SVG'));
      };

      img.src = url;
    });
  };

  const exportPNG = async () => {
    if (!selectedZone || !map) {
      setStatusMessage('Veuillez d\'abord sélectionner une zone.');
      return;
    }

    setIsExporting(true);
    setStatusMessage('Génération du PNG...');

    try {
      // Get bounds for fetching OSM data
      const bounds = selectedZone.bounds || selectedZone;

      // Use cached OSM data if available, otherwise fetch
      const dataToExport = osmData || await fetchOSMData(bounds, useOfflineMode);

      // Generate SVG content
      const svgContent = generateSVG(dataToExport, selectedZone as any, activeStyle, map, {
        forceAllLabels,
        borderColor: exportBorderColor,
        exteriorOverlay,
        exteriorOverlayOpacity,
        showPOI,
        showCompass,
      }, colorOverrides);

      // Convert SVG to canvas
      const canvas = await svgToCanvas(svgContent, 2); // 2x scale for better quality

      // Get PNG data URL
      const pngDataUrl = canvas.toDataURL('image/png');

      // Save using Electron API
      if (window.electronAPI) {
        const result = await window.electronAPI.savePng(pngDataUrl, 'carte.png');
        if (result.success && result.path) {
          setLastExportedPngPath(result.path);
          setStatusMessage(`PNG exporté: ${result.path}`);
        } else {
          setStatusMessage('Export annulé.');
        }
      } else {
        throw new Error('API Electron non disponible. Veuillez redémarrer l\'application.');
      }
    } catch (error) {
      console.error('Error exporting PNG:', error);
      setStatusMessage(`Erreur: ${error instanceof Error ? error.message : 'Export failed'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const exportPDF = async () => {
    if (!selectedZone || !map) {
      setStatusMessage('Veuillez d\'abord sélectionner une zone.');
      return;
    }

    setIsExporting(true);
    setStatusMessage('Génération du PDF...');

    try {
      // Get bounds for fetching OSM data
      const bounds = selectedZone.bounds || selectedZone;

      // Use cached OSM data if available, otherwise fetch
      const dataToExport = osmData || await fetchOSMData(bounds, useOfflineMode);

      // Generate SVG content
      const svgContent = generateSVG(dataToExport, selectedZone as any, activeStyle, map, {
        forceAllLabels,
        borderColor: exportBorderColor,
        exteriorOverlay,
        exteriorOverlayOpacity,
        showPOI,
        showCompass,
      }, colorOverrides);

      // Parse SVG to get dimensions
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
      const svgElement = svgDoc.documentElement;
      const svgWidth = parseFloat(svgElement.getAttribute('width') || '800');
      const svgHeight = parseFloat(svgElement.getAttribute('height') || '600');

      // Convert SVG to canvas
      const canvas = await svgToCanvas(svgContent, 2);

      // Create PDF with appropriate orientation and size
      const isLandscape = svgWidth > svgHeight;
      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
      });

      // Get PDF page dimensions
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // Calculate scaling to fit the page with margins
      const margin = 10;
      const availableWidth = pageWidth - (margin * 2);
      const availableHeight = pageHeight - (margin * 2);

      const scaleX = availableWidth / svgWidth;
      const scaleY = availableHeight / svgHeight;
      const scale = Math.min(scaleX, scaleY);

      const imgWidth = svgWidth * scale;
      const imgHeight = svgHeight * scale;

      // Center the image on the page
      const x = (pageWidth - imgWidth) / 2;
      const y = (pageHeight - imgHeight) / 2;

      // Add image to PDF
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);

      // Get PDF as data URL
      const pdfDataUrl = pdf.output('dataurlstring');

      // Save using Electron API
      if (window.electronAPI) {
        const result = await window.electronAPI.savePdf(pdfDataUrl, 'carte.pdf');
        if (result.success && result.path) {
          setLastExportedPdfPath(result.path);
          setStatusMessage(`PDF exporté: ${result.path}`);
        } else {
          setStatusMessage('Export annulé.');
        }
      } else {
        throw new Error('API Electron non disponible. Veuillez redémarrer l\'application.');
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      setStatusMessage(`Erreur: ${error instanceof Error ? error.message : 'Export failed'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleLocationSelect = (lat: number, lon: number, displayName: string) => {
    if (map) {
      // Pan to location without changing zoom level
      map.panTo([lat, lon]);
      setStatusMessage(`Navigation vers: ${displayName}`);

      // Add a temporary popup that disappears after 1 second
      const popup = L.popup({ closeButton: false, autoClose: false, closeOnClick: false })
        .setLatLng([lat, lon])
        .setContent(`<div style="font-size: 12px; padding: 4px;">${displayName}</div>`)
        .openOn(map);

      setTimeout(() => {
        map.closePopup(popup);
        setStatusMessage('');
      }, 1000);
    }
  };

  return (
    <>
      <MapContainer
        center={initialView.center}
        zoom={initialView.zoom}
        style={{ width: '100%', height: '100%' }}
        ref={setMap}
      >
        {/* Persist map view in localStorage */}
        <MapViewPersistence />
        {/* Base map without labels - our overlay provides the styled content */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
        />
        {/* Labels layer on top - rendered above our custom overlay */}
        <LabelsLayer />
      </MapContainer>

      {/* Compass overlay on map */}
      {showCompass && (
        <div className="compass-overlay">
          <div className="compass-circle">
            <div className="compass-arrow-north" />
            <div className="compass-arrow-south" />
            <span className="compass-n">N</span>
          </div>
        </div>
      )}

      <div
        className={`floating-panel tools-panel ${isToolsPanelMinimized ? 'minimized' : ''}`}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          zIndex: 1000,
          background: 'white',
          padding: isToolsPanelMinimized ? '10px 12px' : '15px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          width: isToolsPanelMinimized ? 'auto' : '280px',
        }}
      >
        <div className="panel-header">
          <span className="panel-title">Outils</span>
          <button
            className="minimize-btn"
            onClick={() => setIsToolsPanelMinimized(!isToolsPanelMinimized)}
            title={isToolsPanelMinimized ? 'Agrandir' : 'Réduire'}
          >
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {!isToolsPanelMinimized && (
          <div className="panel-body">
            <AddressSearch onLocationSelect={handleLocationSelect} />

            <div className="drawing-tools">
              <button onClick={startDrawing} disabled={isDrawing}>
                {isDrawing ? 'Dessiner...' : 'Nouvelle zone'}
              </button>
              <button onClick={clearDrawing} disabled={!selectedZone && !isDrawing}>
                Effacer
              </button>
            </div>

            {selectedZone && !isDrawing && (
              <div style={{ marginTop: '10px' }}>
                <button
                  onClick={applyRoundingToSelected}
                  disabled={selectedMarkerIndices.size < 2}
                  style={{
                    width: '100%',
                    background: selectedMarkerIndices.size >= 2 ? '#f59e0b' : undefined,
                    borderColor: selectedMarkerIndices.size >= 2 ? '#d97706' : undefined,
                  }}
                >
                  Arrondir ({selectedMarkerIndices.size} pts)
                </button>
                <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                  Ctrl+clic pour sélectionner des points consécutifs
                </div>
              </div>
            )}

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '10px',
              fontSize: '13px',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={showPOI}
                onChange={(e) => setShowPOI(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Afficher les icônes POI
            </label>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '8px',
              fontSize: '13px',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={showCompass}
                onChange={(e) => setShowCompass(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Afficher la boussole
            </label>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '8px',
              fontSize: '13px',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={forceAllLabels}
                onChange={(e) => setForceAllLabels(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Forcer tous les noms de rues
            </label>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '8px',
              fontSize: '13px',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={exteriorOverlay}
                onChange={(e) => setExteriorOverlay(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Voile gris extérieur
            </label>

            {exteriorOverlay && (
              <div style={{ marginTop: '6px', marginLeft: '24px' }}>
                <label style={{ fontSize: '12px', color: '#666' }}>
                  Opacité: {(exteriorOverlayOpacity * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="0.8"
                  step="0.05"
                  value={exteriorOverlayOpacity}
                  onChange={(e) => setExteriorOverlayOpacity(parseFloat(e.target.value))}
                  style={{ width: '100%', marginTop: '4px' }}
                />
              </div>
            )}

            <div style={{ marginTop: '10px', fontSize: '13px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                Couleur bordure:
                <input
                  type="color"
                  value={exportBorderColor}
                  onChange={(e) => setExportBorderColor(e.target.value)}
                  style={{ cursor: 'pointer', width: '40px', height: '24px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
              <button
                onClick={exportSVG}
                disabled={!selectedZone || isExporting}
                style={{ flex: 1 }}
              >
                {isExporting ? '...' : 'SVG'}
              </button>
              <button
                onClick={exportPNG}
                disabled={!selectedZone || isExporting}
                style={{ flex: 1 }}
              >
                {isExporting ? '...' : 'PNG'}
              </button>
              <button
                onClick={exportPDF}
                disabled={!selectedZone || isExporting}
                style={{ flex: 1 }}
              >
                {isExporting ? '...' : 'PDF'}
              </button>
            </div>

            {(lastExportedPath || lastExportedPngPath || lastExportedPdfPath) && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                {lastExportedPath && (
                  <button
                    onClick={() => window.electronAPI?.openFile(lastExportedPath)}
                    className="secondary"
                    style={{ flex: 1, fontSize: '12px' }}
                  >
                    Ouvrir SVG
                  </button>
                )}
                {lastExportedPngPath && (
                  <button
                    onClick={() => window.electronAPI?.openFile(lastExportedPngPath)}
                    className="secondary"
                    style={{ flex: 1, fontSize: '12px' }}
                  >
                    Ouvrir PNG
                  </button>
                )}
                {lastExportedPdfPath && (
                  <button
                    onClick={() => window.electronAPI?.openFile(lastExportedPdfPath)}
                    className="secondary"
                    style={{ flex: 1, fontSize: '12px' }}
                  >
                    Ouvrir PDF
                  </button>
                )}
              </div>
            )}

            {statusMessage && (
              <div className={`status-message ${statusMessage.includes('Erreur') ? 'error' : ''}`}>
                {statusMessage}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default MapEditor;

