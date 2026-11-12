# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Author

**Yann Barraud** - Creator and maintainer

- GitHub: [@YannBrrd](https://github.com/YannBrrd)
- Repository: [github.com/YannBrrd/carto](https://github.com/YannBrrd/carto)

## Project Overview

Carto is a cross-platform Electron desktop application for interactive map editing. Users draw up to 5 polygonal zones on OpenStreetMap, style the map (presets, a style editor or Maperitive-like rulesets), recolor individual features, and export SVG, PNG, JPEG or georeferenced PDF (GeoPDF) files, or the zones as KML. The map preview is WYSIWYG: it draws the same features, in the same order and style, as the SVG export.

**Tech Stack:** Electron 39 + React 18 + TypeScript + Leaflet (canvas renderer) + Overpass API + Vitest

## Build and Test Commands

```powershell
npm run dev          # Development with hot reload (auto-opens DevTools)
npm run build        # Build both main and renderer
npm run build:main   # Main process only (faster iteration)
npm run build:renderer  # Renderer only
npm start            # Run built application
npm run dist         # Create distributable packages
npm test             # Run the Vitest suite once (jsdom)
npm run test:watch   # Vitest in watch mode
```

Before pushing, run `npm test`, `npx tsc --noEmit -p tsconfig.json` (and `-p tsconfig.main.json` when the main process changed) and `npm run build`.

## Architecture

**Two-Process Model:**
- `src/main/` - Electron main process (Node.js context): window management, file I/O via IPC
- `src/renderer/` - React frontend (browser context): UI components, map interaction
- The window never leaves the app page: a link without target (the map attributions) would replace the app and lose the zones. `will-navigate` keeps the app page, opens https pages in the system browser and blocks the rest (`navigationAction`). Links opening a new window (`target="_blank"`) never open an app window: https pages go to the system browser (`setWindowOpenHandler`)

**Key Data Flow:**
1. User draws zones on the Leaflet map (`MapEditor.tsx`, `usePolygonDrawing`, `usePolygonEditing`)
2. Fetch OSM data via Overpass (`osmData.ts`, `buildOverpassQuery`) or load a local `.osm` file (`osmXmlParser.ts`)
3. Classify the data once into map features (`features.ts`, `collectFeatures`)
4. Draw them on the map (`osmOverlay.ts`, managed by `useOSMOverlay`) and in the SVG export (`svgGenerator.ts`)
5. Rasterize for PNG/JPEG/PDF (`useExport.ts`, encodings and size limit in `rasterExport.ts`), georeference the PDF (`geoPdf.ts`) and save via Electron IPC (`main.ts` handles the file dialogs); KML writes the zones only (`kml.ts`)

**Batch export** (`src/renderer/batch/`): every territory KML of a tree (`readTerritoryKml`) is put on a page (`planPage`: A4 then A3, zoom 15 at least, 300 dpi), drawn without a map at that zoom (`projectionAtZoom`), rendered per format (`batchRender.ts`, same encodings as the application) and written into a mirrored tree with a `rapport.csv` (`runBatch`, `reportCsv`). Files, data and rendering are injected, so the application (`BatchExportModal`), the command line and the tests run the same batch.
- Command line: `carto --batch --input <dir> --output <dir> [--profile] [--formats] [--osm <file.osm.pbf>] [--refresh] [--overwrite]` (`cliArgs.ts`); the main process (`batchMain.ts`) opens a hidden window with `?mode=batch-cli`, whose `index.tsx` runs `runCliBatch` instead of the app; logs go to stdout, exit code 0/1/2. Linux without display needs `xvfb-run` (Electron's headless ozone platform crashes). Wrappers in `scripts/cli` are packaged in `resources/cli`
- Profile (`batchProfile.ts`): the last batch of the application is saved in `userData/batch-profile.json`, the default of the command line
- Outputs are written to a `.part` file then renamed (`batchFiles.ts`): an interrupted batch leaves no partial file that a resumed batch would skip
- Data sources (`BatchRenderer.fetchData` gives the data and its `source`: `network`, `cache` or `file`; `rendererFor` picks the renderer): Overpass through a 30-day gzip disk cache in the main process (`overpassCache.ts`, `userData/overpass-cache`, purged at the start of a batch, `--refresh` skips it), or an OSM PBF extract (`--osm`). The batch pauses only after a download and never retries local data
- PBF extracts (`src/main/osm/`): `pbfFile.ts` decodes blocks (minimal protobuf reader, raw and zlib blobs, no dependency); `osmExtract.ts` (`buildOsmStore`) reads the file in four passes (multipolygons, nodes in the territory bounds, ways touching them, outside nodes of the kept ways) into typed arrays with shared tag sets and a grid index, and answers each territory as the Overpass query of its bounds would (`>;` included). The tag filter is `OSM_FILTER` (`osmData.ts`), the one the Overpass query is built from, sent by the renderer. The runner calls `prepare` with the bounds of the territories to export before the first one, and `close` at the end. Test PBF files are written by `src/main/osm/testing/pbfWriter.ts` (excluded from the build)

**IPC Pattern:**
- Main process exposes `save-svg`, `save-png`, `save-jpeg`, `save-pdf`, `save-pdf-buffer`, `save-kml`, `save-kml-beside`, `open-osm-file`, `read-osm-file` (the file of last time, at startup) and update handlers in `main.ts`, and the `batch-*` handlers in `batchMain.ts` (`window.electronAPI.batch`: relative paths with `/`, never outside the chosen folders)
- Preload script (`preload.ts`) creates the `window.electronAPI` bridge
- Renderer calls e.g. `window.electronAPI.saveSvg()` for file operations
- Window interface extended in `types.ts`

## Rendering Parity (WYSIWYG)

The map overlay and the SVG export must stay identical. Both renderers only consume shared modules; never classify features or compute a style inside one renderer only.

| Concern | Shared code |
|---------|-------------|
| Which ways and multipolygons are drawn, as what | `features.ts`: `classifyWay`, `collectFeatures` (cached per data set, never mutate its result) |
| Stacking order | `LANDUSE_DRAW_ORDER`, `NATURAL_DRAW_ORDER`, `BUILDING_DRAW_ORDER` (`features.ts`), `ROAD_DRAW_ORDER` (`roadWeights.ts`), `RAILWAY_DRAW_ORDER`, `WATERWAY_TYPES` (`styleResolvers.ts`) |
| Area fill and outline | `areaPaint` (`styleResolvers.ts`) |
| Road and railway widths | `getRoadWeight`, `getRailwayWeight` (`roadWeights.ts`), `scaleRoadWeight` (`styleResolvers.ts`) |
| Dashes | `getDashArray`, `getCasingDashArray`, `isCasingHidden` (`lineStyles.ts`) |
| Tunnels and underground ways | `isUnderground`, `resolveHighwayStyle`, `resolveWaterwayStyle`, `resolveRailwayStyle` (`styleResolvers.ts`) |
| Labels and fonts | `areaLabels` (`features.ts`), `resolveLabelStyle`, `resolveFontFamily` (`styleResolvers.ts`) |
| POI icons | `getPOIIcon` (`features.ts`) |
| Zone outlines | `mergeZoneRings` (`zoneUtils.ts`) |

**Rules:**
- The export uses `scale = 2`: one preview pixel is 2 SVG units. Widths and dashes are computed in preview pixels and multiplied by the scale in the export.
- The overlay creates every layer with `getOverlayLayerStyle` (`overlayStyle.ts`), the same function the in-place restyle uses (`restyleOverlay`), so creation and restyle cannot diverge. Each layer carries the metadata the restyle needs (`OverlayLayer`: `wayId`, `wayCategory`, `styleType`, `roadWeight`, `railwayType`, `underground`, `waterwayWidth`, `isCasing`, `editCategory`).
- Line ends and joins follow Leaflet: round, flat ends on dashed lines.
- Color overrides are keyed by way id, or by minus the relation id for multipolygons. An override recolors the fill and derives the outline or casing (`resolveStrokeColor`).
- Only features with an `editCategory` (`editCategoryOf`) are interactive; a click on them stops propagation only when `onElementClick` returns `true`, so polygon drawing still gets the clicks.
- Styles are sanitized at every entry point with `sanitizeStyle` (`colors.ts`): ruleset conversion, saved preset migration and `generateSVG`. Colors become six-digit hex (`normalizeColor` reads hex, `rgb()`, `hsl()` and named colors), so nothing but colors reaches the SVG `<style>` block.
- Known by-design differences: the preview has no road or area labels (the CARTO label tiles provide them; house numbers only in offline mode), building shadows exist only in the export, and the preview shows the exterior veil but not the grayscale filter.

## Key Files

| File | Purpose |
|------|---------|
| `src/renderer/App.tsx` | Root state, presets, saved font settings, ruleset changes, style modal coordination |
| `src/renderer/components/MapEditor.tsx` | Leaflet map, zones, exterior mask, export panel |
| `src/renderer/components/StyleModal.tsx` | Style editor with live preview (zones shown with the export look); number fields (`NumberField`) never write NaN, and only a click that started on the overlay cancels |
| `src/renderer/components/ColorEditToolbar.tsx` | Per-feature recoloring (click or polygon selection) |
| `src/renderer/components/RuleEditor/RuleEditor.tsx` | Advanced rule-based styling with Maperitive syntax; an import clears the selected rule. `PropertyEditor.tsx` keeps `line-width` and `font-size` numeric (or per zoom, `13:1;16:4`): the converter ignores a text |
| `src/renderer/components/AddressSearch.tsx` | Address search via Nominatim API |
| `src/renderer/hooks/useOSMOverlay.ts` | Overlay lifecycle: rebuild on new data, in-place restyles, one shared canvas renderer, POI pane |
| `src/renderer/hooks/useColorEditing.ts` | Click and polygon recoloring, based on `editableFeatures`; an override carries the id of the zone its feature is in (not the active zone) and goes with that zone |
| `src/renderer/hooks/useOfflineFile.ts` | Offline mode: toggle, file chosen or reloaded at startup from its saved path (`read-osm-file`, `osmFile.ts` in main), persistence (`offlineModeState.ts`) |
| `src/renderer/hooks/useExport.ts` | SVG/PNG/JPEG/PDF export, size limit; the canvas scale is lowered to the browser limits (`canvasLimits.ts`) and an image the canvas could not encode is refused, in the renderer and again in the main process (`dataUrl.ts`) |
| `src/renderer/utils/osmData.ts` | Overpass query (`buildOverpassQuery` from the tag filter `OSM_FILTER`, 30 s timeout), server fallback (`fetchFromOverpass`: 40 s client timeout, a `remark` answer counts as a failure), cache, offline data indexed by bounding box so a view only gets what it shows |
| `src/renderer/components/CartoKeyField.tsx` | CARTO API key field of the tools panel |
| `src/renderer/utils/features.ts` | Feature classification, draw orders, multipolygon areas, area labels, editable features, POI icons |
| `src/renderer/utils/osmOverlay.ts` | Map overlay (`createOSMOverlay`, `restyleOverlay`, `houseNumberIcon`) |
| `src/renderer/utils/overlayStyle.ts` | Leaflet path options of every overlay layer |
| `src/renderer/utils/svgGenerator.ts` | SVG export with Inkscape layers; `exportFrame`/`projectInFrame`: image size and projection, shared with the GeoPDF; `projectionAtZoom`: the frame of a map at a zoom, without a map (batch export) |
| `src/renderer/utils/geoPdf.ts` | PDF image placement and GeoPDF viewport (ISO 32000-2 measure dictionary, WGS 84) |
| `src/renderer/utils/basemap.ts` | CARTO tile URLs with the user's API key (`cartoTileUrl`) |
| `src/renderer/utils/kml.ts` | KML 2.2 export of the zones (counterclockwise closed rings, border color) |
| `src/renderer/utils/kmlReader.ts` | Territory KML → zones (`readTerritoryKml`, batch export): every polygon is a zone; a file with no polygon, more than `MAX_ZONES`, invalid coordinates, a degenerate polygon or holes is rejected as a whole, with a reason code and a French message |
| `src/renderer/components/BatchExportModal.tsx` | Batch export window: folders (remembered), formats, overwrite, progress, cancel, report, profile saved for the command line |
| `src/renderer/utils/rasterExport.ts` | SVG to canvas, PNG/JPEG/GeoPDF encodings and the size limit search (`bestUnderLimit`, `encodePngUnderLimit`), shared by `useExport` and the batch. The PNG search measures reductions of the full-scale image and draws the SVG again only at the scale kept: reductions are faster but soften small labels, so they are never saved |
| `src/renderer/batch/batchRunner.ts` | `runBatch` (skip done, one retry of the data after a pause, 2 s between downloads, cancel), `outputPath`, `reportCsv`, `summarizeBatch` |
| `src/renderer/batch/batchRender.ts` | Batch data (Overpass with disk cache and 90 s server timeout, or OSM PBF file: `rendererFor`, `createOsmFileRenderer`) and rendering of each format at the size of its page |
| `src/renderer/batch/cliBatch.ts` | Batch of the command line, in the hidden window |
| `src/renderer/batch/pagePlan.ts` | Page of a batch territory (`planPage`): first format of the list (A4 then A3) where the map is drawn at `minZoom` at least, best orientation, zoom capped at `maxZoom`, image filling the printable area at the resolution (`rasterScale`) |
| `src/renderer/batch/batchProfile.ts` | Batch profile (style, formats, export options, page settings): `defaultBatchProfile`, `serializeBatchProfile`, `parseBatchProfile` completes a partial JSON with the defaults, migrates the style and refuses a wrong value with the field name |
| `src/renderer/utils/styleResolvers.ts` | Concrete styles from a `RenderStyle`: area paint, railways, tunnels, labels, fonts |
| `src/renderer/utils/roadWeights.ts` | Road levels, widths and draw order |
| `src/renderer/utils/lineStyles.ts` | Line styles (`solid`, `dot`, `dash`, `dashlong`, `dashdot`, `dashdotdot`, `none`) |
| `src/renderer/utils/colors.ts` | Color normalization and style sanitization |
| `src/renderer/utils/geometry.ts` | Node map, multipolygon ring assembly, point in polygon, casing color derivation |
| `src/renderer/utils/zoneUtils.ts` | Zone ids, context bounds, union of zones |
| `src/renderer/presets/defaultPresets.ts` | Built-in presets: Maps (Google Maps palette) and OpenStreetMap |
| `src/renderer/presets/migrateStyle.ts` | Brings saved custom presets up to date |
| `src/renderer/rules/defaultRules.ts` | Feature definitions and built-in rulesets (Maps, OpenStreetMap) |
| `src/renderer/rules/converter.ts` | Ruleset → `RenderStyle` (`rulesetToRenderStyle`) |
| `src/renderer/rules/evaluator.ts` | Rule condition evaluation engine |
| `src/renderer/rules/parser.ts` | Ruleset import/export (.mrules format): tabs or spaces as indentation, nested if/elseif/else chains, a file with no readable feature or rule is refused |
| `src/renderer/types.ts` | TypeScript interfaces (`RenderStyle`, `FeatureStyle`, `Zone`, overrides) |
| `src/main/main.ts` | Electron lifecycle, IPC handlers, app User-Agent for Overpass/Nominatim, external links in the system browser |
| `src/main/navigation.ts` | In-window navigation decision (`navigationAction`); https check in `externalLinks.ts` (`isExternalWebUrl`) |
| `src/main/apiUserAgent.ts` | User-Agent sent to Overpass and Nominatim (`IDENTIFIED_API_URLS`) |
| `src/main/batchMain.ts` | Batch IPC handlers, command line run (hidden window, logs, exit code) |
| `src/main/batchFiles.ts` | KML listing of a tree, atomic output writes, paths confined to their root (`resolveInside`) |
| `src/main/overpassCache.ts` | Disk cache of the batch Overpass answers (30 days, gzip, atomic writes, purge) |
| `src/main/osm/pbfFile.ts` | OSM PBF reading, block by block (`readPbfBlocks`, `decodePrimitiveBlock`) |
| `src/main/osm/osmExtract.ts` | Territory data from a PBF extract (`buildOsmStore`, `query`) |
| `src/main/cliArgs.ts` | Command line parsing and usage (`parseCliArgs`, `CLI_USAGE`) |
| `src/main/preferencesStore.ts` | Preferences file (`get-preference`, `set-preference`): read once, kept in memory, writes one after the other through a temporary file; a file that is not JSON is kept as `.corrupt` |
| `src/main/companionFile.ts` | File written beside an exported file with the same name (`companionPath`, `writeCompanionFile`); write error messages in `fileErrors.ts` |

## Language Convention

**Dual Language Pattern:**
- **French**: User-facing UI text, status messages, error notifications (with accents)
- **English**: Code (variables, functions, comments), test names, git commits

```tsx
// French UI, English code
setStatusMessage("Impossible de récupérer les données OSM. Veuillez réessayer.");
```

## Features Overview

**Styling:**
- Presets: Maps (colors measured on Google Maps in October 2026) and OpenStreetMap; custom presets saved in localStorage
- `RenderStyle` per road level (motorway, primary, secondary, tertiary, residential, path, footway, cycleway): color, opacity, casing color (`strokeColor`), casing opacity (`casingOpacity`, defaults to the opacity; a border-only road has opacity 0), width scale, line style and casing line style
- Railways styled per type (`rail`, `lightRail`, `tram`, `subway`, `tunnel`)
- Roads in tunnels (`highwayTunnel`) and culverted waterways (`waterwayTunnel`) only override what they set
- Buildings: border on/off, optional border color, width scale, hidden border (`casingLineStyle: 'none'`), shadows (`buildingShadows`, export only, off in Maps)
- Natural and landuse areas are outlined only when their style has a `strokeColor`
- Label colors (`labels`); label font and sizes are user settings, saved when changed in the style editor and applied over presets and rulesets, except the font and weight a ruleset names (`rulesetToStyleWithFonts`), which are never saved

**Rule-Based Styling System:**
- Built-in rulesets: Maps, OpenStreetMap
- Draw commands (`draw : fill`...) are kept in `.mrules` files but ignored by the converter: rendering depends on properties only
- Color blends (`#849bbd black 20%`) accept any color `normalizeColor` reads
- Create custom rulesets with tag-based conditions
- Zoom-dependent values (converted at zoom 16)
- Import/export rulesets as `.mrules` files, drag & drop to import

**Map Integration:**
- Address search via Nominatim API
- CARTO Voyager tiles without labels under the overlay, CARTO label tiles above it (`cartoTileUrl`, `basemap.ts`)
- CARTO API key, required since September 2026 (free, carto.com/basemaps/apikey); without one the tiles carry an "API key required" watermark. The key the user saves in the tools panel (`CartoKeyField`, preference `cartoApiKey`) wins over the build's: `CARTO_API_KEY` environment variable at build time (GitHub secret in CI), else `CARTO_API_KEY` in the gitignored `.env` file at the repository root (`scripts/buildEnv.js`), injected by webpack (`__CARTO_API_KEY__`, `effectiveCartoKey`). Never commit a key. The field only asks for a key when there is none at all
- Overpass and Nominatim require an identifying User-Agent (Overpass answers 406 to browser-like ones): the main process sets `Carto/<version> (+repo URL)` on their requests, since the renderer cannot
- Offline mode with local `.osm` files (house numbers drawn on the overlay). The parsed file lives in memory and survives the toggle; at startup the file of last time is read again from its saved path (`useOfflineFile`), and forgotten with a message when it cannot be. The map leaves Overpass only while a file is loaded. A view gets only the elements it shows (ways and tagged nodes in the padded bounds, multipolygons complete), and the zoom 15 guard applies as online

**Export Formats:**
- SVG (vector, Inkscape layers, colored interior, veiled and optionally grayscale exterior)
- PNG and JPEG (raster, 2x resolution, optional size limit)
- PDF (document with auto-orientation), georeferenced: a viewport over the selected bounds maps its corners to WGS 84 (GPTS/LPTS). Inside the bounds the export is linear in latitude and longitude (`projectInFrame`), which is how GeoPDF readers interpolate; checked with GDAL
- KML of the zones (no map data), named "Zone n" after their position
- Batch export of a tree of territory KML files, from the application or the command line (see Architecture)
- Any map export can also write that KML beside the exported file, with the same name (`kmlAlongside` export option, `finishMapExport` in `useExport.ts`): no second dialog, an existing KML is replaced only after confirmation (`companionFile.ts`, `save-kml-beside`)

## Code Patterns

- Functional components with hooks only (no class components)
- Strict TypeScript mode enabled
- `RenderStyle` interface centralizes all styling options; optional fields keep older saved presets valid (`migrateStyle`)
- Props flow down from `App.tsx`, callbacks for child-to-parent communication
- Two TypeScript configs: `tsconfig.json` (renderer), `tsconfig.main.json` (main process)
- Test-driven: tests sit next to the code (`*.test.ts`, `*.test.tsx`), Vitest + jsdom + Testing Library; renderer parity is tested on both renderers

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
  properties: MapProperties;      // Map background, fonts, building-shadows...
  rules: RenderRule[];            // Styling rules per feature
}
```

**Evaluator:**
- Matches OSM elements against feature conditions
- Evaluates conditional blocks (if/else)
- Applies rules with zoom interpolation
- Result: `EvaluatedStyle` with all computed properties

**Conversion to `RenderStyle` (`converter.ts`):**
- A rule for a road level wins over the rules of the roads drawn with its style (`highway_trunk` and links → their level, `highway_unclassified`/`living_street`/`service` → residential, `highway_track`/`bridleway` → path, `highway_pedestrian`/`steps` → footway), which win over a generic `highway`/`highway*` rule, whatever the order
- Same precedence for waterways (`waterway_drain`/`ditch` → canal, `waterway_brook` → stream, `waterway*` generic) and buildings (`building*` generic vs `building_<type>`)
- Lines: `line-width` → width scale, `line-style` → dashes, `border-color` → casing, `border-style` → casing dashes, `border-opacity` → casing opacity; a `transparent` line with a border color keeps only its casing
- Areas: `fill-color`, `fill-opacity`, `line-color` → outline unless `line-style: none`; buildings: `line-width` scales the border, `line-style: none` or `line-width: 0` hides it
- `highway_tunnel`, `waterway_tunnel`, `railway_tunnel` rules style underground ways
- Map properties: `map-background-color`, `border-color`, `border-width`, `text-halo-color`, `font-family` (first supported font of the list), `font-weight` (keyword or number), `building-shadows`

## Adding New Map Features

**Option 1: Simple Styling (UI-based)**
1. Write the tests first, for both renderers (`osmOverlay.test.ts`, `svgGenerator.test.ts`)
2. Extend `RenderStyle` in `types.ts` (optional field, with a migration in `migrateStyle.ts` if older presets need a value)
3. Classify the feature in `features.ts` and resolve its style in `styleResolvers.ts` (shared by both renderers)
4. Draw it in `svgGenerator.ts` and `osmOverlay.ts`, and restyle it in `overlayStyle.ts`
5. Add UI controls in `StyleModal.tsx`, and map ruleset rules in `converter.ts`

**Option 2: Advanced Rules (Rule Editor)**
1. Add new feature definitions to `COMMON_FEATURES` in `defaultRules.ts`
2. Create new builtin ruleset in `getBuiltInRulesets()`
3. Rule engine automatically evaluates conditions and applies styles
4. Users can edit, import, and export rules via RuleEditor component
5. A rule only changes the map if `converter.ts` maps it to a `RenderStyle` field

## Debugging

- DevTools opens automatically in dev mode
- Network tab: Check Overpass API calls (timeouts, 406, 429 and 504 happen; the app tries the other servers on any failure)
- Console: Coordinate transformation errors in `svgGenerator.ts`
- Use `map.getBounds()` in DevTools to verify selection bounds

## Map Coordinate System

- Leaflet uses `L.LatLngBounds` for geographic bounds
- SVG generator converts lat/lng to pixel coordinates using linear interpolation, at scale 2
- Selection bounds passed: `MapEditor` → `osmData.ts` → `svgGenerator.ts`
- Coordinate transformation uses `map.latLngToContainerPoint()` for accurate sizing

## OSM Data Processing

- Overpass fetches ways (`highway`, `building`, `natural`, `waterway`, `landuse`, `leisure`, `railway`), multipolygon relations of buildings and of the areas the map draws (`AREA_TAGS`), POI nodes and house numbers; `>;` adds member ways and nodes
- `collectFeatures` builds the node map, classifies tagged ways, assembles multipolygon rings from member ways (`assembleRings`, incomplete rings dropped) and groups everything by feature and style
- A way is drawn once, as the first of: building, road, railway, waterway line, water area, natural area, landuse, park; planned, disused and platform ways are not drawn, nor the grounds of amenities
- Generated SVG uses Inkscape-compatible layers (`inkscape:groupmode="layer"`)
