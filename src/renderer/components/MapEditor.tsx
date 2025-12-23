import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, FeatureGroup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { RenderStyle } from '../types';
import { generateSVG } from '../utils/svgGenerator';
import { fetchOSMData } from '../utils/osmData';
import { createOSMOverlay } from '../utils/osmOverlay';
import AddressSearch from './AddressSearch';

interface MapEditorProps {
  renderStyle: RenderStyle;
  previewStyle: RenderStyle;
  isPreviewMode: boolean;
  onZoneSelect: (zone: any) => void;
  selectedZone: any;
}

const MapEditor: React.FC<MapEditorProps> = ({ renderStyle, previewStyle, isPreviewMode, onZoneSelect, selectedZone }) => {
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
  const isLoadingRef = useRef(false);

  // Polygon drawing state
  const [polygonPoints, setPolygonPoints] = useState<L.LatLng[]>([]);
  const [polygonMarkers, setPolygonMarkers] = useState<L.CircleMarker[]>([]);
  const [tempPolygon, setTempPolygon] = useState<L.Polygon | null>(null);

  // Determine which style to use for display
  const activeStyle = isPreviewMode ? previewStyle : renderStyle;

  // Create a stable key that changes when style content changes (for effect dependency)
  const styleKey = useMemo(() => JSON.stringify(activeStyle), [activeStyle]);

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
        });
        newTempPolygon.addTo(map);
        setTempPolygon(newTempPolygon);
      }
    };

    map.dragging.disable();
    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
    };
  }, [map, isDrawing, drawnItems, polygonPoints, polygonMarkers, tempPolygon, activeStyle, isNearFirstPoint, finalizePolygon]);

  // Effect to render overlay when OSM data or style changes
  // Uses styleKey to detect style changes by value, not reference
  useEffect(() => {
    if (!map || !osmData) return;

    // Create new overlay with active style for the entire view
    const newOverlay = createOSMOverlay(map, osmData, activeStyle);
    newOverlay.addTo(map);
    setOsmOverlay(newOverlay);

    // Cleanup: remove overlay when dependencies change or component unmounts
    return () => {
      map.removeLayer(newOverlay);
    };
  }, [osmData, styleKey, map, activeStyle]);


  const startDrawing = () => {
    if (drawnItems) {
      drawnItems.clearLayers();
    }
    // Clear any existing polygon drawing state
    if (map) {
      polygonMarkers.forEach(m => map.removeLayer(m));
      if (tempPolygon) map.removeLayer(tempPolygon);
    }
    setPolygonPoints([]);
    setPolygonMarkers([]);
    setTempPolygon(null);
    setIsDrawing(true);
    onZoneSelect(null);
    setStatusMessage('Cliquez pour ajouter des points. Cliquez sur le point vert pour fermer le polygone.');
  };

  const clearDrawing = () => {
    if (drawnItems) {
      drawnItems.clearLayers();
    }
    if (map) {
      polygonMarkers.forEach(m => map.removeLayer(m));
      if (tempPolygon) map.removeLayer(tempPolygon);
      map.dragging.enable();
    }
    setPolygonPoints([]);
    setPolygonMarkers([]);
    setTempPolygon(null);
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
      const svgContent = generateSVG(dataToExport, selectedZone as any, activeStyle, map);

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
      map.setView([lat, lon], 15);
      setStatusMessage(`Navigation vers: ${displayName}`);
      
      // Optional: Add a temporary marker
      const marker = L.marker([lat, lon]).addTo(map);
      setTimeout(() => {
        marker.remove();
      }, 3000);
    }
  };

  return (
    <>
      <MapContainer
        center={[48.8566, 2.3522]} // Paris
        zoom={16}
        style={{ width: '100%', height: '100%' }}
        ref={setMap}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
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
        minWidth: '200px',
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

