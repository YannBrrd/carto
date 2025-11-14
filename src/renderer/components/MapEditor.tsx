import React, { useState, useRef, useEffect } from 'react';
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
  const [currentShape, setCurrentShape] = useState<L.Layer | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [osmOverlay, setOsmOverlay] = useState<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!map) return;

    const fg = new L.FeatureGroup();
    fg.addTo(map);
    setDrawnItems(fg);

    return () => {
      // Cleanup will be handled by the drawing effect
    };
  }, [map]);

  // Update existing shapes when preview style changes
  useEffect(() => {
    if (!drawnItems || !isPreviewMode) return;
    
    drawnItems.eachLayer((layer: L.Layer) => {
      if (layer instanceof L.Rectangle) {
        layer.setStyle({
          color: previewStyle.borderColor,
          weight: previewStyle.borderWidth,
          fillColor: previewStyle.interiorColor,
          fillOpacity: previewStyle.fillOpacity,
        });
      }
    });
  }, [drawnItems, isPreviewMode, previewStyle]);

  useEffect(() => {
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!isDrawing || !drawnItems) return;

      if (!currentShape) {
        // Start drawing a rectangle
        const startPoint = e.latlng;
        const rectangle = L.rectangle(L.latLngBounds(startPoint, startPoint), {
          color: previewStyle.borderColor,
          weight: previewStyle.borderWidth,
          fillColor: previewStyle.interiorColor,
          fillOpacity: previewStyle.fillOpacity,
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

    // Add or remove click handler based on drawing state
    if (isDrawing) {
      map.dragging.disable();
      map.on('click', handleMapClick);
    } else {
      map.dragging.enable();
      map.off('click', handleMapClick);
    }

    return () => {
      map.off('click', handleMapClick);
      map.dragging.enable();
    };
  }, [map, isDrawing, drawnItems, currentShape, renderStyle, onZoneSelect]);
  // Effect to fetch OSM data and render overlay when zone or style changes
  useEffect(() => {
    if (!selectedZone || !map) {
      // Remove overlay if no zone selected
      if (osmOverlay) {
        map?.removeLayer(osmOverlay);
        setOsmOverlay(null);
      }
      return;
    }

    const updateOverlay = async () => {
      try {
        setStatusMessage('Chargement des données OSM...');
        
        // Fetch OSM data for the selected bounds
        const osmData = await fetchOSMData(selectedZone);
        
        // Remove previous overlay
        if (osmOverlay) {
          map.removeLayer(osmOverlay);
        }
        
        // Create new overlay with current render style
        const newOverlay = createOSMOverlay(map, osmData, renderStyle);
        newOverlay.addTo(map);
        setOsmOverlay(newOverlay);
        
        setStatusMessage('Données OSM chargées avec succès.');
      } catch (error) {
        console.error('Error loading OSM overlay:', error);
        setStatusMessage(`Erreur: ${error instanceof Error ? error.message : 'Impossible de charger les données OSM'}`);
      }
    };

    updateOverlay();
  }, [selectedZone, renderStyle, map, osmOverlay]);


  const startDrawing = () => {
    if (drawnItems) {
      drawnItems.clearLayers();
    }
    setIsDrawing(true);
    setCurrentShape(null);
    onZoneSelect(null);
    setStatusMessage('Cliquez sur la carte pour commencer à dessiner une zone rectangulaire.');
  };

  const clearDrawing = () => {
    if (drawnItems) {
      drawnItems.clearLayers();
    }
    setIsDrawing(false);
    setCurrentShape(null);
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
      // Get OSM data for the selected bounds
      const osmData = await fetchOSMData(selectedZone);
      
      setStatusMessage('Génération du SVG...');
      
      // Generate SVG
      const svgContent = generateSVG(osmData, selectedZone, renderStyle, map);
      
      // Save using Electron API
      if (window.electronAPI) {
        const result = await window.electronAPI.saveSvg(svgContent, 'carte.svg');
        if (result.success) {
          setStatusMessage(`SVG exporté avec succès: ${result.path}`);
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

