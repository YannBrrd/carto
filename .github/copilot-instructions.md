# Carto - Interactive Map Editor

See `CLAUDE.md` at the repository root for the full developer guide. This file summarizes what matters most when generating code.

## Architecture Overview
Cross-platform Electron app with a React/TypeScript frontend for interactive map editing with OSM data, a WYSIWYG map preview and SVG/PNG/JPEG/PDF export.

**Key Components:**
- `src/main/` - Electron main process (window management, file I/O, updates)
- `src/renderer/components/` - React UI (MapEditor, StyleModal, ColorEditToolbar, RuleEditor...)
- `src/renderer/hooks/` - Map logic (overlay lifecycle, zones, color editing, export)
- `src/renderer/utils/` - Pure functions (OSM data, feature classification, styles, SVG generation)
- `src/renderer/rules/` - Rule engine and ruleset → style conversion
- `src/renderer/presets/` - Built-in presets (Maps, OpenStreetMap) and saved preset migration

**Data Flow:**
1. User draws up to 5 polygonal zones on the Leaflet map (`MapEditor.tsx`)
2. Fetch OSM data via Overpass (`osmData.ts`) or load a local `.osm` file
3. Classify features once (`features.ts`, `collectFeatures`)
4. Draw them on the map (`osmOverlay.ts` via `useOSMOverlay`) and in the SVG (`svgGenerator.ts`)
5. Save via Electron IPC (`main.ts` handles file dialogs)

## Development Workflow

```powershell
npm run dev          # Development with hot reload
npm run build        # Build both main and renderer
npm run build:main   # Main process only (faster iteration)
npm start            # Run built application
npm test             # Vitest suite (jsdom)
```

- Two TypeScript configs: `tsconfig.json` (renderer), `tsconfig.main.json` (main process)
- Work test-first; tests sit next to the code (`*.test.ts`, `*.test.tsx`)
- Before pushing: `npm test`, `npx tsc --noEmit -p tsconfig.json`, `npm run build`

## Critical Rule: Preview and Export Must Match

The map overlay and the SVG export draw the same features, in the same order, with the same style. Never classify a feature or compute a style in one renderer only:
- Classification, draw orders, area labels, POI icons: `features.ts`
- Area fill and outline (`areaPaint`), railways, tunnels, labels, fonts: `styleResolvers.ts`
- Road widths and order: `roadWeights.ts`; dashes: `lineStyles.ts`; zone union: `zoneUtils.ts`
- Overlay layers are created and restyled with the same `getOverlayLayerStyle` (`overlayStyle.ts`)
- The export uses scale 2 (one preview pixel = 2 SVG units)
- Color overrides are keyed by way id, or minus the relation id for multipolygons
- Styles are sanitized (`sanitizeStyle` in `colors.ts`) before reaching the renderers: only six-digit hex colors reach the SVG

## Critical Integration Points

**Electron IPC Pattern:**
- Main process exposes `save-svg`, `save-png`, `save-jpeg`, `save-pdf` and other handlers in `main.ts`
- Preload script (`preload.ts`) creates the `window.electronAPI` bridge
- Always validate IPC inputs for security

**OSM Data Processing:**
- Overpass query built by `buildOverpassQuery` (30 s timeout, fallback servers)
- Multipolygon relations of buildings and drawn areas are fetched with their member ways; rings are assembled in `geometry.ts`
- `collectFeatures` is cached per data set: never mutate its result

## Language & UI Conventions

- **French**: user-facing UI text, status messages, error notifications (with accents)
- **English**: code, comments, test names, git commits

```tsx
// ✅ Good - French UI, English code
setStatusMessage("Impossible de récupérer les données OSM. Veuillez réessayer.");
```

## Code Patterns & Conventions

- Functional components with hooks only
- Strict TypeScript, avoid `any` in new code
- `RenderStyle` (`types.ts`) centralizes styling options; new fields are optional and migrated in `migrateStyle.ts`
- UI components → `components/`, map logic → `hooks/`, pure logic → `utils/`

## Adding a Map Feature

1. Write tests for both renderers (`osmOverlay.test.ts`, `svgGenerator.test.ts`)
2. Extend `RenderStyle` in `types.ts`
3. Classify in `features.ts`, resolve the style in `styleResolvers.ts`
4. Draw in `svgGenerator.ts` and `osmOverlay.ts`, restyle in `overlayStyle.ts`
5. Add controls in `StyleModal.tsx` and map ruleset rules in `rules/converter.ts`

---

*Last Updated: October 11, 2026*
