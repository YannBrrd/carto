/**
 * Hook for managing the context rectangle (extraction bounds) with resize handles
 */

import { useState, useRef, useEffect } from 'react';
import L from 'leaflet';

export interface UseContextRectangleReturn {
  contextRectangle: L.Rectangle | null;
  contextHandles: L.Marker[];
}

export function useContextRectangle(
  map: L.Map | null,
  contextBounds: L.LatLngBounds | null,
  onUpdateContextBounds: (bounds: L.LatLngBounds) => void
): UseContextRectangleReturn {
  const [contextRectangle, setContextRectangle] = useState<L.Rectangle | null>(null);
  const [contextHandles, setContextHandles] = useState<L.Marker[]>([]);

  const contextRectangleRef = useRef<L.Rectangle | null>(null);
  const contextHandlesRef = useRef<L.Marker[]>([]);

  // Effect to show context rectangle with resize handles
  useEffect(() => {
    if (!map) return;

    // Cleanup previous rectangle and handles
    if (contextRectangleRef.current) {
      map.removeLayer(contextRectangleRef.current);
    }
    contextHandlesRef.current.forEach(h => {
      h.off(); // Remove event listeners before removing layer
      try { map.removeLayer(h); } catch (e) { /* ignore */ }
    });

    // Only show if we have context bounds
    if (!contextBounds) {
      setContextRectangle(null);
      setContextHandles([]);
      contextRectangleRef.current = null;
      contextHandlesRef.current = [];
      return;
    }

    const bounds = contextBounds;

    // Create dashed rectangle
    const rect = L.rectangle(bounds, {
      color: '#2563eb',
      weight: 2,
      dashArray: '8, 4',
      fill: false,
      interactive: false,
    });
    rect.addTo(map);
    setContextRectangle(rect);
    contextRectangleRef.current = rect;

    // Create resize handles at corners and edges
    const handlePositions = [
      { pos: 'nw', latLng: bounds.getNorthWest() },
      { pos: 'n', latLng: L.latLng(bounds.getNorth(), (bounds.getWest() + bounds.getEast()) / 2) },
      { pos: 'ne', latLng: bounds.getNorthEast() },
      { pos: 'w', latLng: L.latLng((bounds.getNorth() + bounds.getSouth()) / 2, bounds.getWest()) },
      { pos: 'e', latLng: L.latLng((bounds.getNorth() + bounds.getSouth()) / 2, bounds.getEast()) },
      { pos: 'sw', latLng: bounds.getSouthWest() },
      { pos: 's', latLng: L.latLng(bounds.getSouth(), (bounds.getWest() + bounds.getEast()) / 2) },
      { pos: 'se', latLng: bounds.getSouthEast() },
    ];

    const getCursor = (pos: string) => {
      switch (pos) {
        case 'nw': case 'se': return 'nwse-resize';
        case 'ne': case 'sw': return 'nesw-resize';
        case 'n': case 's': return 'ns-resize';
        case 'e': case 'w': return 'ew-resize';
        default: return 'move';
      }
    };

    const handles: L.Marker[] = [];
    for (const { pos, latLng } of handlePositions) {
      const handleIcon = L.divIcon({
        className: 'context-handle',
        html: `<div style="
          width: 10px;
          height: 10px;
          background: #2563eb;
          border: 2px solid white;
          border-radius: 2px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          cursor: ${getCursor(pos)};
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const marker = L.marker(latLng, {
        icon: handleIcon,
        draggable: true,
      });

      // Handle drag to resize bounds - use current rectangle bounds, not closure
      marker.on('drag', (e: L.LeafletEvent) => {
        if (!contextRectangleRef.current) return;
        const currentBounds = contextRectangleRef.current.getBounds();
        const newLatLng = (e.target as L.Marker).getLatLng();
        let n = currentBounds.getNorth();
        let s = currentBounds.getSouth();
        let e2 = currentBounds.getEast();
        let w = currentBounds.getWest();

        switch (pos) {
          case 'nw': n = newLatLng.lat; w = newLatLng.lng; break;
          case 'n': n = newLatLng.lat; break;
          case 'ne': n = newLatLng.lat; e2 = newLatLng.lng; break;
          case 'w': w = newLatLng.lng; break;
          case 'e': e2 = newLatLng.lng; break;
          case 'sw': s = newLatLng.lat; w = newLatLng.lng; break;
          case 's': s = newLatLng.lat; break;
          case 'se': s = newLatLng.lat; e2 = newLatLng.lng; break;
        }

        // Validate bounds (north > south, east > west)
        if (n > s && e2 > w) {
          const newBounds = L.latLngBounds([s, w], [n, e2]);
          contextRectangleRef.current.setBounds(newBounds);
        }
      });

      marker.on('dragend', () => {
        // Use the current rectangle bounds (already updated during drag)
        if (!contextRectangleRef.current) return;
        const finalBounds = contextRectangleRef.current.getBounds();
        onUpdateContextBounds(finalBounds);
      });

      marker.addTo(map);
      handles.push(marker);
    }

    setContextHandles(handles);
    contextHandlesRef.current = handles;

    return () => {
      if (rect) {
        map.removeLayer(rect);
      }
      handles.forEach(h => {
        h.off(); // Remove event listeners before removing layer
        try { map.removeLayer(h); } catch (e) { /* ignore */ }
      });
    };
  }, [map, contextBounds, onUpdateContextBounds]);

  return {
    contextRectangle,
    contextHandles,
  };
}
