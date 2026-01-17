import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, FeatureGroup, useMap } from 'react-leaflet';
import L from 'leaflet';
import * as turf from '@turf/turf';
import { RenderStyle, ColorOverridesState, ColorEditMode, ElementCategory, MultiZoneState, Zone } from '../types';
import { MAX_ZONES } from '../utils/zoneUtils';
import { clearAllCaches } from '../utils/osmData';
import { objectFingerprint } from '../utils/geometry';

// Import extracted hooks
import { useInitialMapView, MapViewPersistence } from '../hooks/useMapPersistence';
import { useExport, ExportOptions } from '../hooks/useExport';
import { useOSMDataLoader } from '../hooks/useOSMDataLoader';
import { useOSMOverlay } from '../hooks/useOSMOverlay';
import { useContextRectangle } from '../hooks/useContextRectangle';
import { useColorEditing } from '../hooks/useColorEditing';
import { usePolygonDrawing } from '../hooks/usePolygonDrawing';
import { usePolygonEditing } from '../hooks/usePolygonEditing';

// Import extracted components
import ToolsPanel from './ToolsPanel';
import ZoneContextMenu, { ContextMenuState } from './ZoneContextMenu';
import AddressSearch from './AddressSearch';

// Import preferences hook
import { usePreference, PREF_KEYS, DEFAULT_EXPORT_OPTIONS, PersistedExportOptions } from '../hooks/usePreferences';

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

  // Ref for search marker to ensure cleanup
  const searchMarkerRef = useRef<L.Marker | null>(null);

  // Context menu state for zone deletion
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Export options - load persisted values via Electron IPC
  const [persistedOptions, setPersistedOptions] = usePreference<PersistedExportOptions>(
    PREF_KEYS.EXPORT_OPTIONS,
    DEFAULT_EXPORT_OPTIONS
  );
  const [showPOI, setShowPOI] = usePreference<boolean>(PREF_KEYS.SHOW_POI, true);
  const [showCompass, setShowCompass] = usePreference<boolean>(PREF_KEYS.SHOW_COMPASS, true);

  // Destructure export options for convenience
  const { forceAllLabels, exteriorOverlay, exteriorOverlayOpacity, maxExportSizeEnabled, maxExportSizeKB, minQualityPercent } = persistedOptions;

  // Update individual export option
  const updateExportOption = useCallback(<K extends keyof PersistedExportOptions>(
    key: K,
    value: PersistedExportOptions[K]
  ) => {
    setPersistedOptions({ ...persistedOptions, [key]: value });
  }, [persistedOptions, setPersistedOptions]);

  // Border color follows the style but can be customized
  const [exportBorderColor, setExportBorderColor] = useState(renderStyle.borderColor);
  const [exteriorMask, setExteriorMask] = useState<L.Polygon | null>(null);

  // Track zone polygons for visual feedback and interactions
  const zonePolygonsRef = useRef<Map<string, L.Polygon>>(new Map());
  const exteriorMaskRef = useRef<L.Polygon | null>(null);
  // Ref for zones.length to avoid recreating keydown listener on every zone change
  const zonesLengthRef = useRef(multiZoneState.zones.length);
  zonesLengthRef.current = multiZoneState.zones.length;

  // Determine which style to use for display
  const activeStyle = isPreviewMode ? previewStyle : renderStyle;

  // Create a stable key that changes when style content changes (for effect dependency)
  const styleKey = useMemo(() => objectFingerprint(activeStyle as unknown as Record<string, unknown>), [activeStyle]);

  // Create a fingerprint for zones to avoid effect re-runs on reference changes
  const zonesFingerprint = useMemo(() =>
    multiZoneState.zones.map(z => `${z.id}:${z.coordinates?.length || 0}:${z.coordinates?.map(c => `${c[0].toFixed(6)},${c[1].toFixed(6)}`).join(';') || ''}`).join('|'),
    [multiZoneState.zones]
  );

  // --- EXTRACTED HOOKS ---

  // OSM data loading hook (nodeMap pre-computed for downstream consumers)
  const { osmData, nodeMap, isLoadingView } = useOSMDataLoader(map, useOfflineMode, setStatusMessage);

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
    nodeMap,  // Pass pre-computed nodeMap to avoid redundant computation
    multiZoneState.zones,
    colorEditMode,
    onApplyColorOverride
  );

  // Refs for callbacks that need values from hooks (breaks circular dependency)
  const cleanupEditableMarkersRef = useRef<() => void>(() => {});
  const onPolygonFinalizedRef = useRef<(zoneId: string, points: L.LatLng[], polygon: L.Polygon) => void>(() => {});

  // Wrapper callbacks that use refs (defined before hooks, updated after)
  const cleanupEditableMarkers = useCallback(() => {
    cleanupEditableMarkersRef.current();
  }, []);

  const cleanupExteriorMask = useCallback(() => {
    if (map && exteriorMaskRef.current) {
      try { map.removeLayer(exteriorMaskRef.current); } catch (e) { /* ignore */ }
    }
    setExteriorMask(null);
  }, [map]);

  const onPolygonFinalized = useCallback((zoneId: string, points: L.LatLng[], polygon: L.Polygon) => {
    onPolygonFinalizedRef.current(zoneId, points, polygon);
  }, []);

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

  // Polygon editing hook
  const {
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
  } = usePolygonEditing(
    map,
    multiZoneState.activeZoneId,
    multiZoneState.zones,
    isDrawing,
    onUpdateZone,
    setStatusMessage
  );

  // Update callback refs with actual implementations (breaks circular dependency)
  useEffect(() => {
    cleanupEditableMarkersRef.current = () => {
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
    };

    onPolygonFinalizedRef.current = (zoneId: string, points: L.LatLng[], polygon: L.Polygon) => {
      if (!map) return;
      activeZoneIdRef.current = zoneId;
      const editablePoints = [...points];
      editablePointsRef.current = editablePoints;
      setFinalPolygonRef(polygon);

      const markers: L.Marker[] = [];
      editablePoints.forEach((point, index) => {
        const marker = createEditableMarker(point, index, editablePoints, polygon, false, zoneId);
        marker.addTo(map);
        markers.push(marker);
      });
      editableMarkersRef.current = markers;
      setEditableMarkers(markers);
      setSelectedMarkerIndices(new Set());
    };
  }, [map, editableMarkersRef, editablePointsRef, activeZoneIdRef, setEditableMarkers, setFinalPolygonRef, setSelectedMarkerIndices, createEditableMarker]);

  // OSM overlay hook - pass styleKey to avoid duplicate fingerprint calculation
  const { osmOverlay, layerMapRef } = useOSMOverlay(
    map,
    osmData,
    activeStyle,
    styleKey,
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
    minQualityPercent,
  }), [forceAllLabels, exportBorderColor, exteriorOverlay, exteriorOverlayOpacity, showPOI, showCompass, maxExportSizeEnabled, maxExportSizeKB, minQualityPercent]);

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
      // Cleanup zone polygons (remove event listeners first)
      zonePolygonsRef.current.forEach(polygon => {
        polygon.off();
        try { map.removeLayer(polygon); } catch (e) { /* ignore */ }
      });
      zonePolygonsRef.current.clear();
      // Cleanup search marker
      if (searchMarkerRef.current) {
        searchMarkerRef.current.remove();
        searchMarkerRef.current = null;
      }
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
          // Use ref to avoid effect re-runs when zones change
          const zoneCount = zonesLengthRef.current;
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
  }, [isDrawing, multiZoneState.activeZoneId, onDeleteZone, contextMenu, map]);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    if (!contextMenu) return;

    let mounted = true;
    const handleClick = () => setContextMenu(null);
    // Use setTimeout to avoid closing immediately on the same click that opened it
    const timeoutId = setTimeout(() => {
      // Only add listener if component is still mounted (prevents race condition)
      if (mounted) {
        document.addEventListener('click', handleClick);
      }
    }, 0);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClick);
    };
  }, [contextMenu]);

  // Preferences are now automatically persisted by the usePreference hook

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

  // Polygon editing functions are now handled by usePolygonEditing hook

  // Effect to show gray mask outside all zones (multi-zone support)
  // Uses turf.union to merge overlapping zones so shared areas remain visible
  // Uses zonesFingerprint instead of zones array to prevent unnecessary re-runs
  // when zone references change but coordinates remain the same (performance optimization)
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

      // Convert zones to turf polygons and merge them
      // This ensures overlapping areas are treated as a single hole, not double-counted
      let mergedPolygon: turf.Feature<turf.Polygon | turf.MultiPolygon> | null = null;

      for (const zone of zonesWithCoords) {
        // Turf uses [lng, lat] format, and polygons must be closed (first point = last point)
        const coords = zone.coordinates.map((coord: number[]) => [coord[1], coord[0]]);
        // Close the polygon if not already closed
        if (coords.length > 0 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
          coords.push([...coords[0]]);
        }

        const zonePolygon = turf.polygon([coords]);

        if (mergedPolygon === null) {
          mergedPolygon = zonePolygon;
        } else {
          try {
            const union = turf.union(mergedPolygon, zonePolygon);
            if (union) {
              mergedPolygon = union as turf.Feature<turf.Polygon | turf.MultiPolygon>;
            }
          } catch (e) {
            // If union fails (e.g., invalid geometry), fall back to adding as separate hole
            console.warn('Failed to union polygons:', e);
          }
        }
      }

      // Extract holes from the merged polygon (convert back to [lat, lng] for Leaflet)
      const innerHoles: L.LatLngTuple[][] = [];

      if (mergedPolygon) {
        const geom = mergedPolygon.geometry;
        if (geom.type === 'Polygon') {
          // Single polygon - outer ring is the first array
          const ring = geom.coordinates[0].map(
            (coord: number[]) => [coord[1], coord[0]] as L.LatLngTuple
          );
          innerHoles.push(ring);
        } else if (geom.type === 'MultiPolygon') {
          // Multiple disjoint polygons
          for (const poly of geom.coordinates) {
            const ring = poly[0].map(
              (coord: number[]) => [coord[1], coord[0]] as L.LatLngTuple
            );
            innerHoles.push(ring);
          }
        }
      }

      // Create polygon with merged holes
      if (innerHoles.length > 0) {
        mask = L.polygon([outerBounds, ...innerHoles], {
          color: 'transparent',
          fillColor: '#000000',
          fillOpacity: 0.3,
          interactive: false,
          pane: 'maskPane',
        });
        mask.addTo(map);
      }
    }

    setExteriorMask(mask);

    return () => {
      if (mask) {
        map.removeLayer(mask);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, zonesFingerprint]);

  // Effect to render zone polygons with visual feedback and interactions
  // Uses zonesFingerprint instead of zones array directly to prevent unnecessary re-runs
  useEffect(() => {
    if (!map || !drawnItems) return;

    const existingPolygons = zonePolygonsRef.current;
    const currentZoneIds = new Set(multiZoneState.zones.map(z => z.id));

    // Remove polygons for zones that no longer exist
    existingPolygons.forEach((polygon, zoneId) => {
      if (!currentZoneIds.has(zoneId)) {
        // Clean up event listeners before removing to prevent memory leaks
        polygon.off();
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
        // Create new polygon - disable interactivity while drawing
        polygon = L.polygon(points, {
          color: isActive ? '#3b82f6' : '#6b7280',
          weight: isActive ? 2 : 1,
          fillColor: isActive ? '#3b82f6' : '#6b7280',
          fillOpacity: isActive ? 0.1 : 0.05,
          pane: 'zonePane',
          interactive: !isDrawing,
        });
        polygon.addTo(drawnItems);
        existingPolygons.set(zone.id, polygon);
      } else {
        // Update existing polygon style based on active state
        polygon.setStyle({
          color: isActive ? '#3b82f6' : '#6b7280',
          weight: isActive ? 2 : 1,
          fillColor: isActive ? '#3b82f6' : '#6b7280',
          fillOpacity: isActive ? 0.1 : 0.05,
        });
        // Update interactivity based on drawing state
        if (polygon.options) {
          (polygon.options as any).interactive = !isDrawing;
        }
        // Also update pointer events via DOM
        const element = (polygon as any)._path;
        if (element) {
          element.style.pointerEvents = isDrawing ? 'none' : 'auto';
        }
        // Update coordinates if they changed
        polygon.setLatLngs(points);
      }

      // Always refresh event handlers to avoid stale closures
      // (isDrawing state may have changed)
      polygon.off('click');
      polygon.off('contextmenu');

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
    });

    return () => {
      // Cleanup is handled incrementally above
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, drawnItems, zonesFingerprint, multiZoneState.activeZoneId, isDrawing, onSetActiveZone]);

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

  // Effect to disable OSM overlay interactivity when drawing
  // This allows clicks to pass through to the map for placing polygon points
  useEffect(() => {
    if (!osmOverlay) return;

    osmOverlay.eachLayer((layer: L.Layer) => {
      const layerAny = layer as any;
      // Disable interactivity when drawing
      if (layerAny.options) {
        layerAny.options.interactive = !isDrawing;
      }
      // Also update pointer events via DOM element (for canvas renderer)
      const element = layerAny._path;
      if (element) {
        element.style.pointerEvents = isDrawing ? 'none' : 'auto';
      }
    });
  }, [isDrawing, osmOverlay]);

  // Context rectangle is handled by useContextRectangle hook
  // startDrawing and clearDrawing are provided by usePolygonDrawing hook

  // Export functions are handled by useExport hook

  const handleLocationSelect = (lat: number, lon: number, displayName: string, boundingbox?: [number, number, number, number]) => {
    if (map) {
      if (boundingbox) {
        // Use bounding box to zoom to the appropriate area
        const [south, north, west, east] = boundingbox;
        map.fitBounds([[south, west], [north, east]], { maxZoom: 18, padding: [20, 20] });
      } else {
        // Fallback: center on coordinates with a reasonable zoom level
        map.setView([lat, lon], 16);
      }
      setStatusMessage(`Navigation vers: ${displayName}`);

      // Remove any existing search marker
      if (searchMarkerRef.current) {
        searchMarkerRef.current.remove();
        searchMarkerRef.current = null;
      }

      // Add a red pin marker at the location (Google Maps style)
      const pinIcon = L.divIcon({
        className: 'search-pin-marker',
        html: `<svg width="24" height="36" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z" fill="#e74c3c" stroke="#c0392b" stroke-width="1"/>
          <circle cx="12" cy="12" r="5" fill="white"/>
        </svg>`,
        iconSize: [24, 36],
        iconAnchor: [12, 36]
      });

      const marker = L.marker([lat, lon], { icon: pinIcon }).addTo(map);

      searchMarkerRef.current = marker;

      // Remove marker on next map click
      const removeMarker = () => {
        if (searchMarkerRef.current) {
          searchMarkerRef.current.remove();
          searchMarkerRef.current = null;
        }
        setStatusMessage('');
        map.off('click', removeMarker);
      };

      map.once('click', removeMarker);
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
                onChange={(e) => updateExportOption('forceAllLabels', e.target.checked)}
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
                onChange={(e) => updateExportOption('exteriorOverlay', e.target.checked)}
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
                  onChange={(e) => updateExportOption('exteriorOverlayOpacity', parseFloat(e.target.value))}
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
                onChange={(e) => updateExportOption('maxExportSizeEnabled', e.target.checked)}
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
                    onChange={(e) => updateExportOption('maxExportSizeKB', Math.max(50, parseInt(e.target.value) || 200))}
                    style={{ width: '70px', padding: '4px', borderRadius: '4px', border: '1px solid #ccc' }}
                  />
                  Ko
                </label>
                <div style={{ marginTop: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#666' }}>
                    Qualité min: {minQualityPercent || 25}%
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={minQualityPercent || 25}
                    onChange={(e) => updateExportOption('minQualityPercent', parseInt(e.target.value))}
                    style={{ width: '100%', marginTop: '4px' }}
                  />
                </div>
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

