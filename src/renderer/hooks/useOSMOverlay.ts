/**
 * Hook for managing OSM overlay on the map
 */

import { useState, useRef, useEffect } from 'react';
import L from 'leaflet';
import { RenderStyle, ColorOverridesState, ColorEditMode, ElementCategory } from '../types';
import { createOSMOverlay } from '../utils/osmOverlay';
import { deriveCasingColor } from '../utils/geometry';

export interface UseOSMOverlayReturn {
  osmOverlay: L.LayerGroup | null;
  layerMapRef: React.MutableRefObject<Map<number, L.Path>>;
}

export function useOSMOverlay(
  map: L.Map | null,
  osmData: any,
  activeStyle: RenderStyle,
  styleKey: string, // Pre-computed fingerprint from parent to avoid duplicate calculation
  colorOverrides: ColorOverridesState | undefined,
  colorEditMode: ColorEditMode | undefined,
  useOfflineMode: boolean,
  showPOI: boolean,
  handleElementClick: (wayId: number, category: ElementCategory) => void
): UseOSMOverlayReturn {
  const [osmOverlay, setOsmOverlay] = useState<L.LayerGroup | null>(null);

  const overlayDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const styleUpdateDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const layerMapRef = useRef<Map<number, L.Path>>(new Map());
  const prevOsmDataRef = useRef<any>(null);
  const osmOverlayRef = useRef<L.LayerGroup | null>(null);
  const prevColorOverridesRef = useRef<ColorOverridesState | undefined>(undefined);
  const prevStyleKeyRef = useRef<string>('');
  const activeStyleRef = useRef<RenderStyle>(activeStyle);

  // Keep activeStyleRef in sync (allows access without adding to effect dependencies)
  activeStyleRef.current = activeStyle;

  // Effect to create overlay when OSM data changes (full rebuild)
  // Note: colorOverrides is NOT in dependencies - color updates are handled in-place by style update effect
  useEffect(() => {
    if (!map || !osmData) return;

    // Clear previous debounce timer
    if (overlayDebounceRef.current) {
      clearTimeout(overlayDebounceRef.current);
    }

    overlayDebounceRef.current = setTimeout(() => {
      // Prepare options for overlay (no clickableCategory - handled separately)
      // Note: pass empty colorOverrides here - the style update effect will apply colors in-place
      const overlayOptions = {
        colorOverrides: { overrides: {} },
        onElementClick: handleElementClick,
        showLabels: useOfflineMode,  // Only show house numbers in offline mode (Carto tiles have labels)
        showPOI,  // Show/hide POI icons
      };

      // Create new overlay first (before removing old one to avoid flicker)
      // Use ref to get current style without adding to dependencies
      const newOverlay = createOSMOverlay(map, osmData, activeStyleRef.current, overlayOptions);
      newOverlay.addTo(map);

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

      // Remove old overlay after new one is added (using ref for reliable cleanup)
      if (osmOverlayRef.current) {
        osmOverlayRef.current.off(); // Remove all event listeners to prevent memory leak
        map.removeLayer(osmOverlayRef.current);
      }
      osmOverlayRef.current = newOverlay;

      prevOsmDataRef.current = osmData;
      setOsmOverlay(newOverlay);
    }, 200); // 200ms debounce

    // Cleanup: clear debounce timer only (layer cleanup handled by separate unmount effect)
    return () => {
      if (overlayDebounceRef.current) {
        clearTimeout(overlayDebounceRef.current);
      }
    };
  // Note: activeStyle intentionally NOT in dependencies - style updates are handled in-place by style update effect
  // Adding activeStyle here would cause full overlay rebuild on every style change (memory leak + performance issue)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osmData, map, handleElementClick, useOfflineMode, showPOI]);

  // Separate cleanup effect for OSM overlay on unmount (fixes memory leak)
  useEffect(() => {
    return () => {
      if (osmOverlayRef.current && map) {
        osmOverlayRef.current.off(); // Remove all event listeners
        map.removeLayer(osmOverlayRef.current);
        osmOverlayRef.current = null;
      }
      layerMapRef.current.clear();
      // Release OSM data reference
      prevOsmDataRef.current = null;
    };
  }, [map]);

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
  // Optimized to only update affected layers when colorOverrides changes
  useEffect(() => {
    if (!osmOverlay || !osmData) return;
    // Skip if osmData just changed (full rebuild handles it)
    if (prevOsmDataRef.current !== osmData) return;

    // Clear previous debounce timer
    if (styleUpdateDebounceRef.current) {
      clearTimeout(styleUpdateDebounceRef.current);
    }

    const prevColorOverrides = prevColorOverridesRef.current;
    const prevStyleKey = prevStyleKeyRef.current;
    const styleChanged = prevStyleKey !== styleKey;
    const colorOverridesChanged = prevColorOverrides !== colorOverrides;

    // Update refs for next comparison
    prevColorOverridesRef.current = colorOverrides;
    prevStyleKeyRef.current = styleKey;

    styleUpdateDebounceRef.current = setTimeout(() => {
      // If only colorOverrides changed (not style), update only affected layers
      if (colorOverridesChanged && !styleChanged && layerMapRef.current.size > 0) {
        // Find which wayIds changed
        const prevOverrides = prevColorOverrides?.overrides || {};
        const currentOverrides = colorOverrides?.overrides || {};
        const changedWayIds = new Set<number>();

        // Find added or changed overrides
        for (const wayId of Object.keys(currentOverrides)) {
          const id = Number(wayId);
          if (!prevOverrides[id] || prevOverrides[id].color !== currentOverrides[id].color) {
            changedWayIds.add(id);
          }
        }
        // Find removed overrides
        for (const wayId of Object.keys(prevOverrides)) {
          const id = Number(wayId);
          if (!currentOverrides[id]) {
            changedWayIds.add(id);
          }
        }

        // Update only changed layers
        changedWayIds.forEach(wayId => {
          const layer = layerMapRef.current.get(wayId);
          if (!layer) return;

          const layerAny = layer as any;
          const category = layerAny.wayCategory;
          const styleType = layerAny.styleType;
          const override = currentOverrides[wayId];

          if (category === 'building' && styleType) {
            const buildingStyle = activeStyle.building[styleType as keyof typeof activeStyle.building];
            if (buildingStyle) {
              const fillColor = override?.color || buildingStyle.color;
              const strokeColor = deriveCasingColor(fillColor);
              layerAny.setStyle({
                fillColor: fillColor,
                color: strokeColor,
              });
            }
          } else if (category === 'highway' && styleType && !layerAny.isCasing) {
            const highwayStyle = activeStyle.highway[styleType as keyof typeof activeStyle.highway];
            if (highwayStyle) {
              layerAny.setStyle({
                color: override?.color || highwayStyle.color,
              });
            }
          } else if (category === 'waterway' && styleType) {
            const waterwayStyle = activeStyle.waterway[styleType as keyof typeof activeStyle.waterway];
            if (waterwayStyle) {
              layerAny.setStyle({
                color: override?.color || waterwayStyle.color,
              });
            }
          } else if (category === 'natural' && styleType) {
            const naturalStyle = activeStyle.natural[styleType as keyof typeof activeStyle.natural];
            if (naturalStyle) {
              layerAny.setStyle({
                fillColor: override?.color || naturalStyle.color,
              });
            }
          }
        });
        return;
      }

      // Full style update (when style changed or first run)
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

  return {
    osmOverlay,
    layerMapRef,
  };
}
