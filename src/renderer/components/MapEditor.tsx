import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, FeatureGroup, useMap } from 'react-leaflet';
import L from 'leaflet';
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
}) => {
  const [map, setMap] = useState<L.Map | null>(null);
  const [drawnItems, setDrawnItems] = useState<L.FeatureGroup | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [lastExportedPath, setLastExportedPath] = useState<string | null>(null);
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

  // Export options
  const [forceAllLabels, setForceAllLabels] = useState(false);
  const [exportBorderColor, setExportBorderColor] = useState(renderStyle.borderColor);
  const [exteriorOverlay, setExteriorOverlay] = useState(true);
  const [exteriorOverlayOpacity, setExteriorOverlayOpacity] = useState(0.3);
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

  // Minimum zoom level for loading OSM data (to avoid overloading)
  const MIN_ZOOM_FOR_DATA = 15;

  // Load OSM data for the current view bounds
  const loadViewOsmData = useCallback(async (bounds: L.LatLngBounds, zoom: number) => {
    // Use ref to avoid dependency issues
    if (isLoadingRef.current) return;

    // Don't load data if zoomed out too much
    if (zoom < MIN_ZOOM_FOR_DATA) {
      setOsmData(null);
      setStatusMessage(`Zoomez davantage pour voir le style (niveau ${zoom}/${MIN_ZOOM_FOR_DATA} minimum)`);
      return;
    }

    isLoadingRef.current = true;
    setIsLoadingView(true);
    setStatusMessage('Chargement des données cartographiques...');

    try {
      const data = await fetchOSMData(bounds);
      setOsmData(data);
      setViewBounds(bounds);
      setStatusMessage('');
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
  }, []);

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
    setStatusMessage('Zone sélectionnée. Cliquez sur "Exporter SVG" pour générer le fichier.');
  }, [map, drawnItems, polygonPoints, polygonMarkers, tempPolygon, activeStyle, onZoneSelect]);

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
  }, [osmData, map, handleElementClick]);

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
      if (tempPolygon) map.removeLayer(tempPolygon);
      if (exteriorMask) map.removeLayer(exteriorMask);
    }
    setPolygonPoints([]);
    setPolygonMarkers([]);
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
      if (tempPolygon) map.removeLayer(tempPolygon);
      if (exteriorMask) map.removeLayer(exteriorMask);
      map.dragging.enable();
    }
    setPolygonPoints([]);
    setPolygonMarkers([]);
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
      const dataToExport = osmData || await fetchOSMData(bounds);

      // Generate SVG with current active style and zone object (polygon)
      const svgContent = generateSVG(dataToExport, selectedZone as any, activeStyle, map, {
        forceAllLabels,
        borderColor: exportBorderColor,
        exteriorOverlay,
        exteriorOverlayOpacity,
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
        center={[48.8566, 2.3522]} // Paris
        zoom={17}
        style={{ width: '100%', height: '100%' }}
        ref={setMap}
      >
        {/* Base map without labels - our overlay provides the styled content */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
        />
        {/* Labels layer on top - rendered above our custom overlay */}
        <LabelsLayer />
      </MapContainer>

      <div style={{
        position: 'absolute',
        top: 20,
        right: 20,
        zIndex: 1000,
        background: 'white',
        padding: '15px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        width: '280px',
      }}>
        <AddressSearch onLocationSelect={handleLocationSelect} />
        
        <div className="drawing-tools">
          <button onClick={startDrawing} disabled={isDrawing}>
            {isDrawing ? 'Dessiner...' : 'Nouvelle zone'}
          </button>
          <button onClick={clearDrawing} disabled={!selectedZone && !isDrawing}>
            Effacer
          </button>
        </div>
        
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

        <button
          onClick={exportSVG}
          disabled={!selectedZone || isExporting}
          style={{ marginTop: '10px' }}
        >
          {isExporting ? 'Export en cours...' : 'Exporter SVG'}
        </button>

        {lastExportedPath && (
          <button
            onClick={() => window.electronAPI?.openFile(lastExportedPath)}
            className="secondary"
            style={{ marginTop: '10px' }}
          >
            Ouvrir le SVG
          </button>
        )}

        {statusMessage && (
          <div className={`status-message ${statusMessage.includes('Erreur') ? 'error' : ''}`}>
            {statusMessage}
          </div>
        )}
      </div>
    </>
  );
};

export default MapEditor;

