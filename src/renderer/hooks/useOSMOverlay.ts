/**
 * Hook for managing OSM overlay on the map
 */

import { useState, useRef, useEffect } from 'react';
import L from 'leaflet';
import { RenderStyle, ColorOverridesState, ColorEditMode, ElementCategory } from '../types';
import { createOSMOverlay, restyleOverlay, OverlayLayer, POI_PANE } from '../utils/osmOverlay';

export interface UseOSMOverlayReturn {
  osmOverlay: L.LayerGroup | null;
  // Layers of each feature that can be recolored (a road has a fill and a casing), by override key
  layerMapRef: React.MutableRefObject<Map<number, L.Path[]>>;
}

// POI icons sit with the map features: under the exterior mask (445) and the zones (450), as in the SVG export
const POI_PANE_Z_INDEX = '440';

export function useOSMOverlay(
  map: L.Map | null,
  osmData: any,
  activeStyle: RenderStyle,
  styleKey: string, // Pre-computed fingerprint from parent to avoid duplicate calculation
  colorOverrides: ColorOverridesState | undefined,
  colorEditMode: ColorEditMode | undefined,
  useOfflineMode: boolean,
  showPOI: boolean,
  handleElementClick: (wayId: number, category: ElementCategory) => boolean
): UseOSMOverlayReturn {
  const [osmOverlay, setOsmOverlay] = useState<L.LayerGroup | null>(null);

  const overlayDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const styleUpdateDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const layerMapRef = useRef<Map<number, L.Path[]>>(new Map());
  const osmOverlayRef = useRef<L.LayerGroup | null>(null);
  // One canvas for every overlay of the map: Leaflet never removes a renderer from its map
  const rendererRef = useRef<{ map: L.Map; renderer: L.Canvas } | null>(null);
  // What the overlay was last restyled with
  const styledOverlayRef = useRef<L.LayerGroup | null>(null);
  const prevColorOverridesRef = useRef<ColorOverridesState | undefined>(undefined);
  const prevStyleKeyRef = useRef<string>('');
  const activeStyleRef = useRef<RenderStyle>(activeStyle);
  const colorOverridesRef = useRef<ColorOverridesState | undefined>(colorOverrides);
  const showPOIRef = useRef(showPOI);

  // Keep refs in sync (allows access without adding to effect dependencies)
  activeStyleRef.current = activeStyle;
  colorOverridesRef.current = colorOverrides;
  showPOIRef.current = showPOI;

  // Effect to create overlay when OSM data changes (full rebuild)
  // Note: style and colorOverrides are NOT in dependencies - they are applied in place by the style update effect
  useEffect(() => {
    if (!map) return;

    // Clear previous debounce timer
    if (overlayDebounceRef.current) {
      clearTimeout(overlayDebounceRef.current);
    }

    const removeOverlay = () => {
      if (osmOverlayRef.current) {
        osmOverlayRef.current.off(); // Remove all event listeners to prevent memory leak
        map.removeLayer(osmOverlayRef.current);
        osmOverlayRef.current = null;
      }
      layerMapRef.current.clear();
    };

    // Nothing to show (zoomed out, or data cleared): the previous overlay must not stay on the map
    if (!osmData) {
      removeOverlay();
      setOsmOverlay(null);
      return;
    }

    overlayDebounceRef.current = setTimeout(() => {
      // Remove old overlay FIRST to reduce memory pressure (cleanup before creating new)
      removeOverlay();

      if (rendererRef.current?.map !== map) {
        rendererRef.current = { map, renderer: L.canvas({ padding: 0.5 }) };
      }
      if (!map.getPane(POI_PANE)) {
        map.createPane(POI_PANE).style.zIndex = POI_PANE_Z_INDEX;
      }

      // Create new overlay with the current style and overrides, and add it to the map
      const newOverlay = createOSMOverlay(map, osmData, activeStyleRef.current, {
        colorOverrides: colorOverridesRef.current,
        onElementClick: handleElementClick,
        showLabels: useOfflineMode,  // Only show house numbers in offline mode (Carto tiles have labels)
        showPOI: showPOIRef.current,
        renderer: rendererRef.current.renderer,
        poiPane: POI_PANE,
      });
      newOverlay.addTo(map);

      // Build layer map for fast color updates
      newOverlay.eachLayer((layer: L.Layer) => {
        const wayId = (layer as OverlayLayer).wayId;
        if (wayId !== undefined && layer instanceof L.Path) {
          const layers = layerMapRef.current.get(wayId);
          if (layers) layers.push(layer);
          else layerMapRef.current.set(wayId, [layer]);
        }
      });

      osmOverlayRef.current = newOverlay;
      setOsmOverlay(newOverlay);
    }, 200); // 200ms debounce

    // Cleanup: clear debounce timer only (layer cleanup handled by separate unmount effect)
    return () => {
      if (overlayDebounceRef.current) {
        clearTimeout(overlayDebounceRef.current);
      }
    };
  }, [osmData, map, handleElementClick, useOfflineMode]);

  // Separate cleanup effect for OSM overlay and its renderer on unmount (fixes memory leak)
  useEffect(() => {
    return () => {
      if (!map) return;
      if (osmOverlayRef.current) {
        osmOverlayRef.current.off(); // Remove all event listeners
        map.removeLayer(osmOverlayRef.current);
        osmOverlayRef.current = null;
      }
      if (rendererRef.current?.map === map) {
        map.removeLayer(rendererRef.current.renderer);
        rendererRef.current = null;
      }
      layerMapRef.current.clear();
    };
  }, [map]);

  // Separate effect for POI visibility (in-place toggle, no rebuild)
  useEffect(() => {
    if (!osmOverlay) return;

    osmOverlay.eachLayer((layer: L.Layer) => {
      const layerAny = layer as any;
      if (layerAny.isPOI && layerAny.setOpacity) {
        layerAny.setOpacity(showPOI ? 1 : 0);
      }
    });
  }, [showPOI, osmOverlay]);

  // Separate effect for cursor style when color edit mode changes (no rebuild)
  useEffect(() => {
    if (!osmOverlay) return;

    const clickableCategory = colorEditMode?.active ? colorEditMode.selectedCategory : undefined;

    osmOverlay.eachLayer((layer: L.Layer) => {
      const editCategory = (layer as OverlayLayer).editCategory;
      if (!(layer instanceof L.Path) || !editCategory) return;

      // Set cursor to pointer if this layer's category matches the clickable category
      const isClickable = clickableCategory && editCategory === clickableCategory;
      layer.setStyle({ cursor: isClickable ? 'pointer' : '' } as L.PathOptions);
    });
  }, [colorEditMode?.active, colorEditMode?.selectedCategory, osmOverlay]);

  // Separate effect for style updates (in-place, no full rebuild)
  // Optimized to only update affected layers when only colorOverrides changed
  useEffect(() => {
    if (!osmOverlay) return;

    // Clear previous debounce timer
    if (styleUpdateDebounceRef.current) {
      clearTimeout(styleUpdateDebounceRef.current);
    }

    styleUpdateDebounceRef.current = setTimeout(() => {
      const prevOverrides = prevColorOverridesRef.current?.overrides || {};
      const currentOverrides = colorOverrides?.overrides || {};
      // A new overlay is restyled entirely: overrides may have changed since it was created
      const partial = styledOverlayRef.current === osmOverlay && prevStyleKeyRef.current === styleKey;

      styledOverlayRef.current = osmOverlay;
      prevColorOverridesRef.current = colorOverrides;
      prevStyleKeyRef.current = styleKey;

      if (partial) {
        // Find which wayIds changed: added, changed or removed overrides
        const changedWayIds = new Set<number>();
        for (const wayId of Object.keys(currentOverrides)) {
          const id = Number(wayId);
          if (prevOverrides[id]?.color !== currentOverrides[id].color) changedWayIds.add(id);
        }
        for (const wayId of Object.keys(prevOverrides)) {
          const id = Number(wayId);
          if (!currentOverrides[id]) changedWayIds.add(id);
        }
        changedWayIds.forEach(wayId => {
          restyleOverlay(layerMapRef.current.get(wayId) ?? [], activeStyle, colorOverrides);
        });
        return;
      }

      restyleOverlay(osmOverlay.getLayers(), activeStyle, colorOverrides);
    }, 50); // Faster debounce for style updates

    return () => {
      if (styleUpdateDebounceRef.current) {
        clearTimeout(styleUpdateDebounceRef.current);
      }
    };
  }, [styleKey, activeStyle, osmOverlay, colorOverrides]);

  return {
    osmOverlay,
    layerMapRef,
  };
}
