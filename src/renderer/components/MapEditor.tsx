import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, FeatureGroup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { RenderStyle } from '../types';
import { generateSVG } from '../utils/svgGenerator';
import { fetchOSMData } from '../utils/osmData';

interface MapEditorProps {
  renderStyle: RenderStyle;
  onZoneSelect: (zone: any) => void;
  selectedZone: any;
}

type DrawMode = 'rectangle' | 'polygon';

const MapEditor: React.FC<MapEditorProps> = ({ renderStyle, onZoneSelect, selectedZone }) => {
  const [map, setMap] = useState<L.Map | null>(null);
  const [drawnItems, setDrawnItems] = useState<L.FeatureGroup | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>('rectangle');
  const [currentShape, setCurrentShape] = useState<L.Layer | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<L.LatLng[]>([]);
  const [tempMarkers, setTempMarkers] = useState<L.CircleMarker[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!map) return;

    const fg = new L.FeatureGroup();
    fg.addTo(map);
    setDrawnItems(fg);

    // Add drawing handlers
    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
    };
  }, [map]);

  const handleMapClick = (e: L.LeafletMouseEvent) => {
    if (!isDrawing || !map || !drawnItems) return;

    if (drawMode === 'rectangle') {
      handleRectangleClick(e);
    } else if (drawMode === 'polygon') {
      handlePolygonClick(e);
    }
  };

  const handleRectangleClick = (e: L.LeafletMouseEvent) => {
    if (!map || !drawnItems) return;

    if (!currentShape) {
      // Start drawing a rectangle
      const startPoint = e.latlng;
      const rectangle = L.rectangle([[startPoint.lat, startPoint.lng], [startPoint.lat, startPoint.lng]], {
        color: renderStyle.borderColor,
        weight: renderStyle.borderWidth,
        fillColor: renderStyle.interiorColor,
        fillOpacity: renderStyle.fillOpacity,
      });
      
      rectangle.addTo(drawnItems);
      setCurrentShape(rectangle);

      const moveHandler = (moveEvent: L.LeafletMouseEvent) => {
        const bounds = L.latLngBounds(startPoint, moveEvent.latlng);
        rectangle.setBounds(bounds);
      };

      map.on('mousemove', moveHandler);
      
      const clickHandler = () => {
        map.off('mousemove', moveHandler);
        map.off('click', clickHandler);
        setIsDrawing(false);
        setCurrentShape(null);
        onZoneSelect(rectangle.getBounds());
        setStatusMessage('Zone sélectionnée. Cliquez sur "Exporter SVG" pour générer le fichier.');
      };

      map.once('click', clickHandler);
    }
  };

  const handlePolygonClick = (e: L.LeafletMouseEvent) => {
    if (!map || !drawnItems) return;

    const newPoints = [...polygonPoints, e.latlng];
    setPolygonPoints(newPoints);

    // Add draggable marker for vertex
    const marker = L.circleMarker(e.latlng, {
      radius: 5,
      color: renderStyle.borderColor,
      fillColor: '#ffffff',
      fillOpacity: 1,
      weight: 2,
    });
    
    // Make marker interactive for editing
    marker.on('click', (markerEvent: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(markerEvent);
      // Prevent polygon from adding a new point when clicking on marker
    });
    
    marker.addTo(drawnItems);
    const newMarkers = [...tempMarkers, marker];
    setTempMarkers(newMarkers);

    if (newPoints.length >= 1) {
      // Remove old polyline/polygon if exists
      if (currentShape) {
        drawnItems.removeLayer(currentShape);
      }

      // Draw polyline/polygon
      const shape = newPoints.length >= 3
        ? L.polygon(newPoints, {
            color: renderStyle.borderColor,
            weight: renderStyle.borderWidth,
            fillColor: renderStyle.interiorColor,
            fillOpacity: renderStyle.fillOpacity,
          })
        : L.polyline(newPoints, {
            color: renderStyle.borderColor,
            weight: renderStyle.borderWidth,
          });

      shape.addTo(drawnItems);
      setCurrentShape(shape);

      if (newPoints.length === 1) {
        setStatusMessage('Cliquez pour ajouter des sommets. Double-cliquez ou appuyez sur Entrée pour terminer (min 3 sommets).');
      } else if (newPoints.length === 2) {
        setStatusMessage(`${newPoints.length} sommets. Ajoutez au moins 1 sommet de plus pour créer un polygone.`);
      } else {
        setStatusMessage(`${newPoints.length} sommets. Double-cliquez ou appuyez sur Entrée pour terminer.`);
      }
    }
  };

  const finishPolygon = () => {
    if (!map || !drawnItems || polygonPoints.length < 3) {
      setStatusMessage('Un polygone nécessite au moins 3 sommets.');
      return;
    }

    // Create final polygon with editing capabilities
    if (currentShape) {
      drawnItems.removeLayer(currentShape);
    }

    const polygon = L.polygon(polygonPoints, {
      color: renderStyle.borderColor,
      weight: renderStyle.borderWidth,
      fillColor: renderStyle.interiorColor,
      fillOpacity: renderStyle.fillOpacity,
    });
    
    // Enable editing on the polygon (Leaflet provides basic editing support)
    if ((polygon as any).editing) {
      (polygon as any).editing.enable();
    }
    
    polygon.addTo(drawnItems);

    // Clean up markers
    tempMarkers.forEach(marker => drawnItems.removeLayer(marker));
    setTempMarkers([]);

    // Get bounds from polygon
    const bounds = polygon.getBounds();
    
    // Store polygon with its actual coordinates
    onZoneSelect({
      bounds,
      polygon: polygonPoints,
      type: 'polygon'
    });

    setIsDrawing(false);
    setCurrentShape(polygon);
    setPolygonPoints([]);
    
    if (map) {
      map.off('dblclick');
      map.off('keydown');
    }
    
    setStatusMessage('Polygone créé. Cliquez sur "Exporter SVG" pour générer le fichier.');
  };

  const startDrawing = (mode: DrawMode) => {
    if (drawnItems) {
      drawnItems.clearLayers();
    }
    setIsDrawing(true);
    setDrawMode(mode);
    setCurrentShape(null);
    setPolygonPoints([]);
    setTempMarkers([]);
    onZoneSelect(null);
    
    if (mode === 'rectangle') {
      setStatusMessage('Cliquez sur la carte pour commencer à dessiner une zone rectangulaire.');
    } else {
      setStatusMessage('Cliquez sur la carte pour placer les sommets du polygone.');
      
      // Add keyboard and double-click handlers for polygon mode
      if (map) {
        map.on('dblclick', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          finishPolygon();
        });

        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === 'Escape') {
            if (e.key === 'Enter') {
              finishPolygon();
            } else {
              clearDrawing();
            }
          }
        };

        map.getContainer().addEventListener('keydown', handleKeyDown);
        map.getContainer().tabIndex = 0; // Make sure the map can receive keyboard events
        map.getContainer().focus();
      }
    }
  };

  const clearDrawing = () => {
    if (drawnItems) {
      drawnItems.clearLayers();
    }
    if (map) {
      map.off('dblclick');
      map.off('keydown');
    }
    setIsDrawing(false);
    setCurrentShape(null);
    setPolygonPoints([]);
    setTempMarkers([]);
    onZoneSelect(null);
    setStatusMessage('');
  };

  const exportSVG = async () => {
    if (!selectedZone || !map) {
      setStatusMessage('Veuillez d\'abord sélectionner une zone.');
      return;
    }

    setIsExporting(true);
    setStatusMessage('Récupération des données OSM...');

    try {
      // Get bounds for OSM data fetch (works for both rectangle and polygon)
      const bounds = selectedZone.bounds || selectedZone;
      
      // Get OSM data for the selected bounds
      const osmData = await fetchOSMData(bounds);
      
      setStatusMessage('Génération du SVG...');
      
      // Generate SVG (pass the full selectedZone which includes polygon data if available)
      const svgContent = generateSVG(osmData, selectedZone, renderStyle, map);
      
      // Save using Electron API
      if (window.electronAPI) {
        const result = await window.electronAPI.saveSvg(svgContent, 'carte.svg');
        if (result.success) {
          setStatusMessage(`SVG exporté avec succès: ${result.path}`);
        } else {
          setStatusMessage('Export annulé.');
        }
      }
    } catch (error) {
      console.error('Error exporting SVG:', error);
      setStatusMessage(`Erreur: ${error instanceof Error ? error.message : 'Export failed'}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <MapContainer
        center={[48.8566, 2.3522]} // Paris
        zoom={13}
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
        <div className="drawing-tools" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button onClick={() => startDrawing('rectangle')} disabled={isDrawing}>
            {isDrawing && drawMode === 'rectangle' ? 'Dessiner rectangle...' : 'Rectangle'}
          </button>
          <button onClick={() => startDrawing('polygon')} disabled={isDrawing}>
            {isDrawing && drawMode === 'polygon' ? 'Dessiner polygone...' : 'Polygone'}
          </button>
          <button onClick={clearDrawing} disabled={!selectedZone && !isDrawing}>
            Effacer
          </button>
        </div>
        
        <button 
          onClick={exportSVG} 
          disabled={!selectedZone || isExporting}
          style={{ marginTop: '10px', width: '100%' }}
        >
          {isExporting ? 'Export en cours...' : 'Exporter SVG'}
        </button>

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
