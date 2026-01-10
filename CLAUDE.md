# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Author

**Yann Barraud** - Creator and maintainer

- GitHub: [@YannBrrd](https://github.com/YannBrrd)
- Repository: [github.com/YannBrrd/carto](https://github.com/YannBrrd/carto)

## Project Overview

Carto is a cross-platform Electron desktop application for interactive map editing. Users draw rectangular zones on OpenStreetMap, customize styling (colors, borders, opacity), and export high-quality SVG files.

**Tech Stack:** Electron 27 + React 18 + TypeScript + Leaflet + Overpass API

## Build Commands

```powershell
npm run dev          # Development with hot reload (auto-opens DevTools)
npm run build        # Build both main and renderer
npm run build:main   # Main process only (faster iteration)
npm run build:renderer  # Renderer only
npm start            # Run built application
npm run dist         # Create distributable packages
```

## Architecture

**Two-Process Model:**
- `src/main/` - Electron main process (Node.js context): window management, file I/O via IPC
- `src/renderer/` - React frontend (browser context): UI components, map interaction

**Key Data Flow:**
1. User draws rectangle on Leaflet map (`MapEditor.tsx`)
2. Fetch OSM data via Overpass API (`osmData.ts`)
3. Render features on map (`osmOverlay.ts`)
4. Generate SVG with interior/exterior styling (`svgGenerator.ts`)
5. Save via Electron IPC (`main.ts` handles file dialog)

**IPC Pattern:**
- Main process exposes `save-svg` handler in `main.ts`
- Preload script (`preload.ts`) creates `window.electronAPI` bridge
- Renderer calls `window.electronAPI.saveSvg()` for file operations
- Window interface extended in `types.ts`

## Key Files

| File | Purpose |
|------|---------|
| `src/renderer/App.tsx` | Root state management, style modal coordination |
| `src/renderer/components/MapEditor.tsx` | Leaflet map, drawing tools, SVG export |
| `src/renderer/components/StyleModal.tsx` | Style customization with real-time preview |
| `src/renderer/components/RuleEditor/RuleEditor.tsx` | Advanced rule-based styling with Maperitive syntax |
| `src/renderer/components/AddressSearch.tsx` | Address search via Nominatim API |
| `src/renderer/utils/osmData.ts` | Overpass API queries (25s timeout) |
| `src/renderer/utils/osmOverlay.ts` | Render OSM features on map |
| `src/renderer/utils/svgGenerator.ts` | Coordinate transformation, SVG generation |
| `src/renderer/rules/types.ts` | Rule engine types (TagCondition, RenderRule, Ruleset) |
| `src/renderer/rules/defaultRules.ts` | Built-in rulesets (default, minimal, detailed) |
| `src/renderer/rules/evaluator.ts` | Rule condition evaluation engine |
| `src/renderer/rules/parser.ts` | Ruleset import/export (.mrules format) |
| `src/renderer/types.ts` | TypeScript interfaces (`RenderStyle`, `Zone`) |
| `src/main/main.ts` | Electron lifecycle, IPC handlers |

## Language Convention

**Dual Language Pattern:**
- **French**: User-facing UI text, status messages, error notifications
- **English**: Code (variables, functions, comments), git commits

```tsx
// French UI, English code
setStatusMessage("Impossible de récupérer les données OSM. Veuillez réessayer.");
```

## Features Overview

**Rule-Based Styling System:**
- Built-in rulesets: Default, Minimal, Detailed
- Create custom rulesets with tag-based conditions
- Zoom-dependent values for adaptive styling
- Color blending for sophisticated color schemes
- Import/export rulesets as `.mrules` files
- Drag & drop ruleset files to import

**Map Integration:**
- Address search via Nominatim API
- Real-time feature rendering with rule engine
- Coordinate system: Leaflet LatLngBounds → SVG pixel coordinates
- OSM data via Overpass API with 25-second timeout

**Export Formats:**
- SVG (vector, with interior/exterior classification)
- PNG (raster, 2x resolution)
- PDF (document with auto-orientation)

## Code Patterns

- Functional components with hooks only (no class components)
- Strict TypeScript mode enabled
- `RenderStyle` interface centralizes all styling options
- Props flow down from `App.tsx`, callbacks for child-to-parent communication
- Two TypeScript configs: `tsconfig.json` (renderer), `tsconfig.main.json` (main process)

## Rule Engine

**Condition Operators:**
- `equals` - Exact tag match (e.g., `highway=residential`)
- `not_equals` - Tag not equal
- `exists` - Tag present (any value)
- `not_exists` - Tag not present
- `matches` - Regex pattern matching
- `one_of` - Tag matches one of multiple values
- `is_multi` - Numeric tag divisible by value (for streets classified by lanes, etc.)

**Property Types:**
- String values (e.g., colors as hex: `#FF0000`)
- Numeric values (zoom, opacity, width)
- ZoomDependentValue - Different values per zoom level with interpolation
- ColorValue - Base color with optional blend

**Ruleset Structure:**
```tsx
interface Ruleset {
  name: string;
  features: FeatureDefinition[];  // Feature conditions
  rules: RenderRule[];            // Styling rules per feature
  mapProperties: MapProperties;   // Map background, etc.
}
```

**Evaluator:**
- Matches OSM elements against feature conditions
- Evaluates conditional blocks (if/else)
- Applies rules with zoom interpolation
- Result: `EvaluatedStyle` with all computed properties

## Adding New Map Features

**Option 1: Simple Styling (UI-based)**
1. Extend `RenderStyle` interface in `types.ts`
2. Add UI controls in `StyleModal.tsx`
3. Modify `svgGenerator.ts` to apply styling to SVG paths
4. Update `osmOverlay.ts` for map preview if needed

**Option 2: Advanced Rules (Rule Editor)**
1. Add new feature definitions to `COMMON_FEATURES` in `defaultRules.ts`
2. Create new builtin ruleset in `getBuiltInRulesets()`
3. Rule engine automatically evaluates conditions and applies styles
4. Users can edit, import, and export rules via RuleEditor component
5. Rules support: conditions (tags), zoom-dependent values, color blending

## Debugging

- DevTools opens automatically in dev mode
- Network tab: Check Overpass API calls (common timeout issues)
- Console: Coordinate transformation errors in `svgGenerator.ts`
- Use `map.getBounds()` in DevTools to verify selection bounds

## Map Coordinate System

- Leaflet uses `L.LatLngBounds` for geographic bounds
- SVG generator converts lat/lng to pixel coordinates using linear interpolation
- Selection bounds passed: `MapEditor` → `osmData.ts` → `svgGenerator.ts`
- Coordinate transformation uses `map.latLngToContainerPoint()` for accurate sizing

## OSM Data Processing

- Overpass API fetches ways (roads, buildings, water, parks, railways) within bounds
- Two-pass processing: build node map first, then process ways with node references
- Features categorized into layers: forests, parks, water, buildings, railways, roads
- Generated SVG uses Inkscape-compatible layers (`inkscape:groupmode="layer"`)
