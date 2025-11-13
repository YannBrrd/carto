# Carto - Interactive Map Editor

## Architecture Overview
Cross-platform Electron app with React/TypeScript frontend for interactive map editing with OSM data and SVG export.

**Key Components:**
- `src/main/` - Electron main process (window management, file I/O)
- `src/renderer/` - React UI (map editor, style panel, components)
- `src/renderer/utils/` - Core logic (OSM data fetching, SVG generation)

**Data Flow:**
1. User draws rectangle on Leaflet map (`MapEditor.tsx`)
2. Fetch OSM data via Overpass API (`osmData.ts`)
3. Generate SVG with interior/exterior styling (`svgGenerator.ts`)
4. Save via Electron IPC (`main.ts` handles file dialog)

## Development Workflow

**Build System:**
- Two TypeScript configs: `tsconfig.json` (renderer), `tsconfig.main.json` (main process)
- Webpack bundles renderer, tsc compiles main process
- `npm run dev` - Concurrent watch mode with auto-restart
- `npm run build` - Production build for both processes

**Key Commands:**
```powershell
npm run dev          # Development with hot reload
npm run build        # Build both main and renderer
npm run build:main   # Main process only (faster iteration)
npm start            # Run built application
```

**File Structure Pattern:**
```
src/main/     - Electron main process (Node.js context)
  main.ts     - App lifecycle, window creation
  preload.ts  - Secure IPC bridge
src/renderer/ - React frontend (browser context)
  App.tsx     - Root component with state management
  components/ - UI components (MapEditor, StylePanel)
  utils/      - Pure functions (no React dependencies)
```

## Critical Integration Points

**Electron IPC Pattern:**
- Main process exposes `save-svg` IPC handler in `main.ts`
- Preload script (`preload.ts`) creates `window.electronAPI` bridge
- Renderer calls `window.electronAPI.saveSvg()` for file operations
- Always validate IPC inputs for security

**Map Coordinate System:**
- Leaflet uses `L.LatLngBounds` for geographic bounds
- SVG generator converts lat/lng to pixel coordinates
- Selection bounds passed from `MapEditor` → `osmData.ts` → `svgGenerator.ts`
- Critical: coordinate transformation in `svgGenerator.ts` uses `map.getBounds().pad(0.2)`

**OSM Data Processing:**
- Overpass API query fetches ways (roads, buildings) within bounds
- Query template in `osmData.ts` filters by feature types (`highway`, `building`, etc.)
- Response processing: build node map first, then process ways with node references
- Interior/exterior classification based on `bounds.contains([lat, lon])`

## Project-Specific Patterns

**State Management:**
```tsx
// App.tsx - Minimal state, props down
const [renderStyle, setRenderStyle] = useState<RenderStyle>({...});
const [selectedZone, setSelectedZone] = useState<any>(null);

// MapEditor receives both style and zone, calls onZoneSelect callback
<MapEditor renderStyle={renderStyle} onZoneSelect={setSelectedZone} />
```

**Error Handling Convention:**
- Async operations show user-friendly French messages via `setStatusMessage`
- Console.error for dev debugging, translated UI messages for users
- Example: `"Impossible de récupérer les données OSM. Veuillez réessayer."`

**TypeScript Patterns:**
- Global Window interface extension in `types.ts` for Electron API
- `RenderStyle` interface centralizes all styling options
- No class components - functional components with hooks only

## Common Development Tasks

**Adding New Map Features:**
1. Extend `RenderStyle` interface in `types.ts` for new options
2. Update `StylePanel.tsx` with UI controls
3. Modify `svgGenerator.ts` to apply new styling to SVG paths
4. Test with OSM data containing relevant features

**Debugging Map Issues:**
- `npm run dev` auto-opens DevTools
- Check Network tab for Overpass API calls (timeout issues common)
- Console errors often show coordinate transformation problems
- Use `map.getBounds()` in DevTools to verify selection bounds

**Performance Optimization:**
- Large OSM datasets can cause memory issues in `svgGenerator.ts`
- Consider streaming SVG generation for areas >1km²
- Overpass query timeout is 25s - may need adjustment for large areas
- Use `console.time()` around expensive coordinate transformations

**File Structure for New Features:**
- UI components → `src/renderer/components/`
- Data processing → `src/renderer/utils/`
- Type definitions → add to `src/renderer/types.ts`
- Main process features → `src/main/main.ts` (IPC handlers)

## Language & UI Conventions

**Dual Language Pattern:**
- **French**: User-facing UI text, status messages, error notifications
- **English**: Code (variables, functions, classes), technical comments, git commits

**Examples:**
```tsx
// ✅ Good - French UI, English code
setStatusMessage("Impossible de récupérer les données OSM. Veuillez réessayer.");

// Component names and props in English
interface MapEditorProps {
  renderStyle: RenderStyle;
  onZoneSelect: (zone: Zone) => void;
}
```

## Code Patterns & Conventions

**React Component Structure:**
```tsx
// Functional components with hooks only
export const MapEditor: React.FC<MapEditorProps> = ({ renderStyle, onZoneSelect }) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const mapRef = useRef<L.Map>(null);
  
  // Effects for setup/cleanup
  useEffect(() => {
    // Setup logic
    return () => { /* cleanup */ };
  }, []);
  
  return <div>...</div>;
};
```

**TypeScript Strictness:**
- Strict mode enabled, avoid `any` type
- Use `L.LatLngBounds` for geographic boundaries
- Extend `Window` interface in `types.ts` for Electron APIs
- `RenderStyle` interface centralizes all styling options

## Quick Reference

**Key Files:**
- `App.tsx` - Root state management, renders MapEditor + StylePanel
- `MapEditor.tsx` - Leaflet map, drawing tools, SVG export logic
- `osmData.ts` - Overpass API queries with 25s timeout
- `svgGenerator.ts` - Coordinate transformation, interior/exterior styling
- `main.ts` - Electron lifecycle, IPC handlers for file operations

**Common Debugging:**
- Network tab: Check Overpass API calls (timeout issues common)
- Console: Coordinate transformation errors in `svgGenerator.ts`
- DevTools: Use `map.getBounds()` to verify selection bounds
- Memory issues: Large OSM datasets in SVG generation

**Development Commands:**
```powershell
npm run dev          # Development with auto-restart
npm run build:main   # Main process only (faster iteration)
npm start            # Run built application
```

---

*Last Updated: November 13, 2025*
