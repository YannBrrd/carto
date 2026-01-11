import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, FeatureGroup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { RenderStyle, ColorOverridesState, ColorEditMode, ElementCategory, MultiZoneState, Zone } from '../types';
import { generateZoneId, MAX_ZONES } from '../utils/zoneUtils';
import { clearAllCaches } from '../utils/osmData';
import { isPointInPolygon, objectFingerprint, catmullRomSpline } from '../utils/geometry';

// Import extracted hooks
import { useInitialMapView, MapViewPersistence } from '../hooks/useMapPersistence';
import { useExport, ExportOptions } from '../hooks/useExport';
import { useOSMDataLoader } from '../hooks/useOSMDataLoader';
import { useOSMOverlay } from '../hooks/useOSMOverlay';
import { useContextRectangle } from '../hooks/useContextRectangle';
import { useColorEditing } from '../hooks/useColorEditing';
import { usePolygonDrawing } from '../hooks/usePolygonDrawing';

// Import extracted components
import ToolsPanel from './ToolsPanel';
import ZoneContextMenu, { ContextMenuState } from './ZoneContextMenu';
import AddressSearch from './AddressSearch';

// LocalStorage keys for persistence
const SHOW_POI_STORAGE_KEY = 'carto-show-poi';
const SHOW_COMPASS_STORAGE_KEY = 'carto-show-compass';

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
  // Multi-zone props
  multiZoneState: MultiZoneState;
  onAddZone: (zone: Zone) => void;
  onUpdateZone: (zoneId: string, updates: Partial<Zone>) => void;
  onDeleteZone: (zoneId: string) => void;
  onSetActiveZone: (zoneId: string | null) => void;
  onUpdateContextBounds: (bounds: L.LatLngBounds) => void;
  onClearAllZones: () => void;
  // Other props
  colorOverrides?: ColorOverridesState;
  colorEditMode?: ColorEditMode;
  onApplyColorOverride?: (wayId: number, color: string, category: ElementCategory) => void;
  useOfflineMode?: boolean;
}

const MapEditor: React.FC<MapEditorProps> = ({
  renderStyle,
  previewStyle,
  isPreviewMode,
  multiZoneState,
  onAddZone,
  onUpdateZone,
  onDeleteZone,
  onSetActiveZone,
  onUpdateContextBounds,
  onClearAllZones,
  colorOverrides,
  colorEditMode,
  onApplyColorOverride,
  useOfflineMode = false,
}) => {
  // Load saved map view (center + zoom) from localStorage
  const initialView = useInitialMapView();

  const [map, setMap] = useState<L.Map | null>(null);
  const [drawnItems, setDrawnItems] = useState<L.FeatureGroup | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isToolsPanelMinimized, setIsToolsPanelMinimized] = useState(false);

  const osmDataRef = useRef<any>(null); // Stable ref for osmData (avoids closure memory leaks)
  // Ref for popup timeout to ensure cleanup on unmount
  const popupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Polygon editing state (editable markers for existing zones)
  const [editableMarkers, setEditableMarkers] = useState<L.Marker[]>([]);
  const [finalPolygonRef, setFinalPolygonRef] = useState<L.Polygon | null>(null);
  const [selectedMarkerIndices, setSelectedMarkerIndices] = useState<Set<number>>(new Set());
  const editablePointsRef = useRef<L.LatLng[]>([]);
  const editableMarkersRef = useRef<L.Marker[]>([]);
  // Track active zone ID for marker drag callbacks (avoids stale closure issues)
  const activeZoneIdRef = useRef<string | null>(null);

  // Context menu state for zone deletion
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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
  const [maxExportSizeEnabled, setMaxExportSizeEnabled] = useState(true);
  const [maxExportSizeKB, setMaxExportSizeKB] = useState(300);
  const [exteriorMask, setExteriorMask] = useState<L.Polygon | null>(null);

  // Track zone polygons for visual feedback and interactions
  const zonePolygonsRef = useRef<Map<string, L.Polygon>>(new Map());
  const exteriorMaskRef = useRef<L.Polygon | null>(null);

  // Determine which style to use for display
  const activeStyle = isPreviewMode ? previewStyle : renderStyle;

  // Create a stable key that changes when style content changes (for effect dependency)
  const styleKey = useMemo(() => objectFingerprint(activeStyle as unknown as Record<string, unknown>), [activeStyle]);

  // --- EXTRACTED HOOKS ---

  // OSM data loading hook
  const { osmData, isLoadingView } = useOSMDataLoader(map, useOfflineMode, setStatusMessage);

  // Keep osmDataRef in sync (avoids closure memory leaks in callbacks)
  useEffect(() => {
    osmDataRef.current = osmData;
  }, [osmData]);

  // Color editing hook - handles click and polygon selection for color overrides
  const {
    colorPolygonPoints,
    colorPolygonMarkers,
    colorTempPolygon,
    isColorPolygonDrawing,
    colorPolygonMarkersRef,
    colorTempPolygonRef,
    handleElementClick,
  } = useColorEditing(
    map,
    osmData,
    multiZoneState.zones,
    colorEditMode,
    onApplyColorOverride
  );

  // Ref for createEditableMarker (defined later, used by onPolygonFinalized callback)
  const createEditableMarkerRef = useRef<((point: L.LatLng, index: number, points: L.LatLng[], polygon: L.Polygon, isSelected?: boolean, zoneId?: string) => L.Marker) | null>(null);

  // Cleanup callbacks for usePolygonDrawing hook
  const cleanupEditableMarkers = useCallback(() => {
    if (map) {
      editableMarkersRef.current.forEach(m => {
        try { map.removeLayer(m); } catch (e) { /* ignore */ }
      });
    }
    editableMarkersRef.current = [];
    setEditableMarkers([]);
    editablePointsRef.current = [];
    setFinalPolygonRef(null);
    setSelectedMarkerIndices(new Set());
  }, [map]);

  const cleanupExteriorMask = useCallback(() => {
    if (map && exteriorMaskRef.current) {
      try { map.removeLayer(exteriorMaskRef.current); } catch (e) { /* ignore */ }
    }
    setExteriorMask(null);
  }, [map]);

  // Callback when polygon drawing is finalized - creates editable markers
  const onPolygonFinalized = useCallback((zoneId: string, points: L.LatLng[], polygon: L.Polygon) => {
    if (!map) return;

    // Set active zone for marker callbacks
    activeZoneIdRef.current = zoneId;

    // Store editable points
    const editablePoints = [...points];
    editablePointsRef.current = editablePoints;
    setFinalPolygonRef(polygon);

    // Create editable markers if createEditableMarker is available
    const createMarker = createEditableMarkerRef.current;
    if (createMarker) {
      const markers: L.Marker[] = [];
      editablePoints.forEach((point, index) => {
        const marker = createMarker(point, index, editablePoints, polygon, false, zoneId);
        marker.addTo(map);
        markers.push(marker);
      });
      editableMarkersRef.current = markers;
      setEditableMarkers(markers);
    }
    setSelectedMarkerIndices(new Set());
  }, [map]);

  // Polygon drawing hook
  const {
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
  } = usePolygonDrawing(
    map,
    drawnItems,
    multiZoneState.zones.length,
    onAddZone,
    onSetActiveZone,
    onClearAllZones,
    setStatusMessage,
    onPolygonFinalized,
    cleanupEditableMarkers,
    cleanupExteriorMask
  );

  // OSM overlay hook
  const { osmOverlay, layerMapRef } = useOSMOverlay(
    map,
    osmData,
    activeStyle,
    colorOverrides,
    colorEditMode,
    useOfflineMode,
    showPOI,
    handleElementClick
  );

  // Context rectangle hook
  useContextRectangle(map, multiZoneState.contextBounds, onUpdateContextBounds);

  // Export options object for the export hook
  const exportOptions: ExportOptions = useMemo(() => ({
    forceAllLabels,
    borderColor: exportBorderColor,
    exteriorOverlay,
    exteriorOverlayOpacity,
    showPOI,
    showCompass,
    maxExportSizeEnabled,
    maxExportSizeKB,
  }), [forceAllLabels, exportBorderColor, exteriorOverlay, exteriorOverlayOpacity, showPOI, showCompass, maxExportSizeEnabled, maxExportSizeKB]);

  // Export hook
  const {
    isExporting,
    exportFormat,
    lastExportedFile,
    setExportFormat,
    handleExport,
  } = useExport(map, multiZoneState, activeStyle, exportOptions, colorOverrides, useOfflineMode, setStatusMessage);

  // --- END EXTRACTED HOOKS ---

  // Keep exteriorMask ref in sync (other refs are handled by hooks)
  useEffect(() => {
    exteriorMaskRef.current = exteriorMask;
  }, [exteriorMask]);

  // Comprehensive cleanup effect for all Leaflet layers on unmount (prevents memory leaks)
  useEffect(() => {
    return () => {
      if (!map) return;
      // Cleanup polygon markers (use refs to get current values)
      polygonMarkersRef.current.forEach(m => {
        try { map.removeLayer(m); } catch (e) { /* ignore */ }
      });
      // Cleanup editable markers
      editableMarkersRef.current.forEach(m => {
        try { map.removeLayer(m); } catch (e) { /* ignore */ }
      });
      // Cleanup temp polygon (use ref)
      if (tempPolygonRef.current) {
        try { map.removeLayer(tempPolygonRef.current); } catch (e) { /* ignore */ }
      }
      // Cleanup exterior mask (use ref)
      if (exteriorMaskRef.current) {
        try { map.removeLayer(exteriorMaskRef.current); } catch (e) { /* ignore */ }
      }
      // Cleanup color polygon elements (use refs to get current values)
      if (colorTempPolygonRef.current) {
        try { map.removeLayer(colorTempPolygonRef.current); } catch (e) { /* ignore */ }
      }
      colorPolygonMarkersRef.current.forEach(m => {
        try { map.removeLayer(m); } catch (e) { /* ignore */ }
      });
      // Context rectangle cleanup is handled by useContextRectangle hook
      // Cleanup zone polygons
      zonePolygonsRef.current.forEach(polygon => {
        try { map.removeLayer(polygon); } catch (e) { /* ignore */ }
      });
      zonePolygonsRef.current.clear();
      // Clear module-level caches to prevent memory leaks
      clearAllCaches();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]); // Only depend on map to run cleanup once on unmount

  // Sync export border color with theme's border color when theme changes
  useEffect(() => {
    setExportBorderColor(activeStyle.borderColor);
  }, [activeStyle.borderColor]);

  // Keep activeZoneIdRef in sync with state (for marker drag callbacks)
  useEffect(() => {
    activeZoneIdRef.current = multiZoneState.activeZoneId;
  }, [multiZoneState.activeZoneId]);

  // Keyboard shortcut: Delete/Backspace to delete active zone or remove last point while drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if we're in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Escape closes context menu
      if (e.key === 'Escape' && contextMenu) {
        setContextMenu(null);
        return;
      }

      // Handle Delete/Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();

        // If drawing, remove last point (use refs to avoid effect re-runs)
        if (isDrawing && map) {
          const currentPoints = polygonPointsRef.current;
          const currentMarkers = polygonMarkersRef.current;
          const currentTempPolygon = tempPolygonRef.current;

          if (currentPoints.length > 0) {
            // Remove last marker
            const lastMarker = currentMarkers[currentMarkers.length - 1];
            if (lastMarker) {
              map.removeLayer(lastMarker);
            }

            // Remove last point
            const newPoints = currentPoints.slice(0, -1);
            const newMarkers = currentMarkers.slice(0, -1);
            setPolygonPoints(newPoints);
            setPolygonMarkers(newMarkers);

            // Update temp polygon
            if (currentTempPolygon) {
              map.removeLayer(currentTempPolygon);
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
            } else {
              setTempPolygon(null);
            }

            if (newPoints.length === 0) {
              // No more points, exit drawing mode
              setIsDrawing(false);
              map.dragging.enable();
              setStatusMessage('Dessin annulé.');
            } else {
              setStatusMessage(`Point supprimé. ${newPoints.length} point(s) restant(s).`);
            }
          } else {
            // No points, just exit drawing mode
            setIsDrawing(false);
            map.dragging.enable();
            setStatusMessage('Dessin annulé.');
          }
          return;
        }

        // If not drawing, delete active zone
        if (multiZoneState.activeZoneId) {
          const zoneCount = multiZoneState.zones.length;
          // Clean up editing markers for the active zone
          if (map) {
            editableMarkersRef.current.forEach(m => {
              try { map.removeLayer(m); } catch (err) { /* ignore */ }
            });
            editableMarkersRef.current = [];
            setEditableMarkers([]);
            editablePointsRef.current = [];
            setFinalPolygonRef(null);
          }
          onDeleteZone(multiZoneState.activeZoneId);
          if (zoneCount === 1) {
            setStatusMessage('Toutes les zones ont été supprimées.');
          } else {
            setStatusMessage(`Zone supprimée. ${zoneCount - 1} zone(s) restante(s).`);
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDrawing, multiZoneState.activeZoneId, multiZoneState.zones.length, onDeleteZone, contextMenu, map]);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    if (!contextMenu) return;

    const handleClick = () => setContextMenu(null);
    // Use setTimeout to avoid closing immediately on the same click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClick);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClick);
    };
  }, [contextMenu]);

  // Persist showPOI option to localStorage
  useEffect(() => {
    localStorage.setItem(SHOW_POI_STORAGE_KEY, JSON.stringify(showPOI));
  }, [showPOI]);

  // Persist showCompass option to localStorage
  useEffect(() => {
    localStorage.setItem(SHOW_COMPASS_STORAGE_KEY, JSON.stringify(showCompass));
  }, [showCompass]);

  // Create custom panes and feature group for map
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
  }, [map]);

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

  // Update zone when polygon points change
  // zoneId can be passed explicitly (from marker) or falls back to activeZoneIdRef
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
  // zoneId is stored on marker so it knows which zone to update
  const createEditableMarkerInternal = useCallback((point: L.LatLng, index: number, points: L.LatLng[], polygon: L.Polygon, isSelected: boolean = false, zoneId?: string) => {
    const icon = createMarkerIcon(isSelected);

    const marker = L.marker(point, {
      icon,
      draggable: true,
      pane: 'markerPane',
    });

    // Store index and zone ID on marker for reference
    (marker as any).markerIndex = index;
    (marker as any).zoneId = zoneId;

    marker.on('drag', (e: L.LeafletEvent) => {
      const target = e.target as L.Marker;
      const newLatLng = target.getLatLng();

      // Update points array
      points[index] = newLatLng;

      // Update polygon shape
      polygon.setLatLngs(points);
    });

    marker.on('dragend', () => {
      // Update zone with new coordinates (use marker's zone ID)
      const markerZoneId = (marker as any).zoneId;
      updateZoneFromPoints(points, polygon, markerZoneId);
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
  const createEditableMarker = useCallback((point: L.LatLng, index: number, points: L.LatLng[], polygon: L.Polygon, isSelected: boolean = false, zoneId?: string) => {
    const marker = createEditableMarkerInternal(point, index, points, polygon, isSelected, zoneId);

    // Double-click to delete point (use ref to avoid stale closure)
    marker.on('dblclick', (e: L.LeafletMouseEvent) => {
      e.originalEvent.stopPropagation();
      e.originalEvent.preventDefault();
      deletePointAtIndexRef.current(index);
    });

    return marker;
  }, [createEditableMarkerInternal]);

  // Assign createEditableMarker to ref for use in onPolygonFinalized callback
  useEffect(() => {
    createEditableMarkerRef.current = createEditableMarker;
  }, [createEditableMarker]);

  // Track previous active zone state to avoid unnecessary marker recreation
  const prevActiveZoneRef = useRef<{ id: string | null; pointCount: number }>({ id: null, pointCount: 0 });

  // Manage editing markers when active zone changes (not on coordinate changes during drag)
  useEffect(() => {
    if (!map || isDrawing) return;

    const activeZone = multiZoneState.zones.find(z => z.id === multiZoneState.activeZoneId);
    const currentPointCount = activeZone?.coordinates?.length || 0;
    const prevState = prevActiveZoneRef.current;

    // Only recreate markers if zone ID changed or point count changed (add/remove point)
    // Skip recreation for coordinate-only changes (drag operations)
    const zoneIdChanged = prevState.id !== multiZoneState.activeZoneId;
    const pointCountChanged = prevState.pointCount !== currentPointCount;
    // Also check if markers should exist but don't (race condition recovery)
    const markersNotCreated = activeZone && activeZone.coordinates &&
      activeZone.coordinates.length >= 3 && editableMarkersRef.current.length === 0;

    if (!zoneIdChanged && !pointCountChanged && !markersNotCreated) {
      return; // No need to recreate markers
    }

    // Update tracking ref
    prevActiveZoneRef.current = { id: multiZoneState.activeZoneId, pointCount: currentPointCount };

    // Clean up existing markers
    editableMarkersRef.current.forEach(m => {
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

      // Create an internal polygon for editing operations
      const editPolygon = L.polygon(points, {
        color: 'transparent',
        fillColor: 'transparent',
        fillOpacity: 0,
        interactive: false,
      });
      setFinalPolygonRef(editPolygon);

      // Create markers for each point
      const markers: L.Marker[] = [];
      points.forEach((point, index) => {
        const marker = createEditableMarker(point, index, points, editPolygon, false, activeZone.id);
        marker.addTo(map);
        markers.push(marker);
      });
      editableMarkersRef.current = markers;
      setEditableMarkers(markers);
    }
  }, [map, multiZoneState.activeZoneId, multiZoneState.zones, isDrawing, createEditableMarker]);

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

    // Create new markers (use current zone ID)
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

    // Update zone
    updateZoneFromPoints(newPoints, finalPolygonRef, currentZoneId || undefined);
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

    // Create new markers (use current zone ID)
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

    // Update zone
    updateZoneFromPoints(newPoints, finalPolygonRef, currentZoneId || undefined);
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

    // Create new markers (use current zone ID)
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

    // Update zone
    updateZoneFromPoints(newPoints, finalPolygonRef, currentZoneId || undefined);
    setStatusMessage(`Arrondi appliqué (${curvedPoints.length} points générés).`);
  }, [map, finalPolygonRef, selectedMarkerIndices, createEditableMarker, updateZoneFromPoints]);

  // Effect to show gray mask outside all zones (multi-zone support)
  useEffect(() => {
    if (!map) return;

    let mask: L.Polygon | null = null;

    // Create new mask if we have zones
    const zonesWithCoords = multiZoneState.zones.filter(
      z => z.coordinates && z.coordinates.length >= 3
    );

    if (zonesWithCoords.length > 0) {
      // Create a large outer polygon (covers the world)
      const outerBounds: L.LatLngTuple[] = [
        [-90, -180],
        [-90, 180],
        [90, 180],
        [90, -180],
      ];

      // Inner holes are all the zones (each creates a hole)
      const innerHoles: L.LatLngTuple[][] = zonesWithCoords.map(zone =>
        zone.coordinates.map(
          (coord: number[]) => [coord[0], coord[1]] as L.LatLngTuple
        )
      );

      // Create polygon with multiple holes
      mask = L.polygon([outerBounds, ...innerHoles], {
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
  }, [map, multiZoneState.zones]);

  // Effect to render zone polygons with visual feedback and interactions
  useEffect(() => {
    if (!map || !drawnItems) return;

    const existingPolygons = zonePolygonsRef.current;
    const currentZoneIds = new Set(multiZoneState.zones.map(z => z.id));

    // Remove polygons for zones that no longer exist
    existingPolygons.forEach((polygon, zoneId) => {
      if (!currentZoneIds.has(zoneId)) {
        try { map.removeLayer(polygon); } catch (e) { /* ignore */ }
        existingPolygons.delete(zoneId);
      }
    });

    // Create or update polygons for each zone
    multiZoneState.zones.forEach(zone => {
      if (!zone.coordinates || zone.coordinates.length < 3) return;

      const isActive = zone.id === multiZoneState.activeZoneId;
      const points = zone.coordinates.map(
        (coord: number[]) => L.latLng(coord[0], coord[1])
      );

      let polygon = existingPolygons.get(zone.id);

      if (!polygon) {
        // Create new polygon
        polygon = L.polygon(points, {
          color: isActive ? '#3b82f6' : '#6b7280',
          weight: isActive ? 2 : 1,
          fillColor: isActive ? '#3b82f6' : '#6b7280',
          fillOpacity: isActive ? 0.1 : 0.05,
          pane: 'zonePane',
          interactive: true,
        });
        polygon.addTo(drawnItems);
        existingPolygons.set(zone.id, polygon);

        // Add click handler to select zone
        polygon.on('click', () => {
          if (!isDrawing) {
            onSetActiveZone(zone.id);
            setStatusMessage(`Zone sélectionnée. Suppr: supprimer. Double-clic: ajouter/supprimer points.`);
          }
        });

        // Add right-click handler to show context menu
        polygon.on('contextmenu', (e: L.LeafletMouseEvent) => {
          if (!isDrawing) {
            L.DomEvent.preventDefault(e.originalEvent);
            setContextMenu({
              x: e.originalEvent.clientX,
              y: e.originalEvent.clientY,
              zoneId: zone.id,
            });
          }
        });
      } else {
        // Update existing polygon style based on active state
        polygon.setStyle({
          color: isActive ? '#3b82f6' : '#6b7280',
          weight: isActive ? 2 : 1,
          fillColor: isActive ? '#3b82f6' : '#6b7280',
          fillOpacity: isActive ? 0.1 : 0.05,
        });
        // Update coordinates if they changed
        polygon.setLatLngs(points);
      }
    });

    return () => {
      // Cleanup is handled incrementally above
    };
  }, [map, drawnItems, multiZoneState.zones, multiZoneState.activeZoneId, isDrawing, onSetActiveZone]);

  // Effect to disable zone polygon interactivity when color edit click mode is active
  // This allows clicks to pass through to the underlying elements (buildings, roads, etc.)
  useEffect(() => {
    const isColorClickMode = colorEditMode?.active && colorEditMode.selectionMode === 'click';

    zonePolygonsRef.current.forEach(polygon => {
      // Disable interactivity when color click mode is active
      if (polygon.options) {
        (polygon.options as any).interactive = !isColorClickMode;
      }
      // Also update the element's pointer events via the DOM element
      const element = (polygon as any)._path;
      if (element) {
        element.style.pointerEvents = isColorClickMode ? 'none' : 'auto';
      }
    });
  }, [colorEditMode?.active, colorEditMode?.selectionMode]);

  // Context rectangle is handled by useContextRectangle hook
  // startDrawing and clearDrawing are provided by usePolygonDrawing hook

  // Export functions are handled by useExport hook

  const handleLocationSelect = (lat: number, lon: number, displayName: string) => {
    if (map) {
      // Pan to location without changing zoom level
      map.panTo([lat, lon]);
      setStatusMessage(`Navigation vers: ${displayName}`);

      // Clear any existing popup timeout
      if (popupTimeoutRef.current) {
        clearTimeout(popupTimeoutRef.current);
      }

      // Add a temporary popup that disappears after 1 second
      const popup = L.popup({ closeButton: false, autoClose: false, closeOnClick: false })
        .setLatLng([lat, lon])
        .setContent(`<div style="font-size: 12px; padding: 4px;">${displayName}</div>`)
        .openOn(map);

      popupTimeoutRef.current = setTimeout(() => {
        map.closePopup(popup);
        setStatusMessage('');
        popupTimeoutRef.current = null;
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
              <button onClick={startDrawing} disabled={isDrawing || multiZoneState.zones.length >= MAX_ZONES}>
                {isDrawing ? 'Dessiner...' : `Nouvelle zone (${multiZoneState.zones.length}/${MAX_ZONES})`}
              </button>
              <button onClick={clearDrawing} disabled={multiZoneState.zones.length === 0 && !isDrawing}>
                Effacer tout
              </button>
            </div>

            {multiZoneState.activeZoneId && !isDrawing && (
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
                checked={maxExportSizeEnabled}
                onChange={(e) => setMaxExportSizeEnabled(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Taille max export
            </label>

            {maxExportSizeEnabled && (
              <div style={{ marginTop: '6px', marginLeft: '24px' }}>
                <label style={{ fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="number"
                    min="50"
                    max="5000"
                    step="50"
                    value={maxExportSizeKB}
                    onChange={(e) => setMaxExportSizeKB(Math.max(50, parseInt(e.target.value) || 200))}
                    style={{ width: '70px', padding: '4px', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                  Ko
                </label>
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

            <div style={{ display: 'flex', gap: '6px', marginTop: '10px', alignItems: 'center' }}>
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as 'svg' | 'png' | 'jpeg' | 'pdf')}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                <option value="svg">SVG</option>
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
                <option value="pdf">PDF</option>
              </select>
              <button
                onClick={handleExport}
                disabled={multiZoneState.zones.length === 0 || isExporting}
                style={{ flex: 1 }}
              >
                {isExporting ? 'Export...' : 'Exporter'}
              </button>
            </div>

            {lastExportedFile && (
              <button
                onClick={() => window.electronAPI?.openFile(lastExportedFile.path)}
                className="secondary"
                style={{ width: '100%', marginTop: '10px', fontSize: '12px' }}
              >
                Ouvrir {lastExportedFile.name}
              </button>
            )}

            {statusMessage && (
              <div className={`status-message ${statusMessage.includes('Erreur') ? 'error' : ''}`}>
                {statusMessage}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Context menu for zone deletion */}
      {contextMenu && (
        <div
          className="zone-context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 2000,
            background: 'white',
            borderRadius: '4px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            padding: '4px 0',
            minWidth: '150px',
          }}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              const zoneCount = multiZoneState.zones.length;
              const isActiveZone = contextMenu.zoneId === multiZoneState.activeZoneId;
              // Clean up editing markers if deleting the active zone
              if (isActiveZone && map) {
                editableMarkersRef.current.forEach(m => {
                  try { map.removeLayer(m); } catch (err) { /* ignore */ }
                });
                editableMarkersRef.current = [];
                setEditableMarkers([]);
                editablePointsRef.current = [];
                setFinalPolygonRef(null);
              }
              onDeleteZone(contextMenu.zoneId);
              setContextMenu(null);
              if (zoneCount === 1) {
                setStatusMessage('Toutes les zones ont été supprimées.');
              } else {
                setStatusMessage(`Zone supprimée. ${zoneCount - 1} zone(s) restante(s).`);
              }
            }}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 12px',
              border: 'none',
              background: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '13px',
              color: '#1f2937',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            Supprimer cette zone
          </button>
        </div>
      )}
    </>
  );
};

export default MapEditor;

