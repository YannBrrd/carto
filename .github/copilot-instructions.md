# Carto - Interactive Map Editor

## Project Overview
Cross-platform desktop application for interactive map editing with OSM data and high-quality SVG export.

### Core Features
- Interactive zone selection on maps with polygon/rectangle tools
- High-quality SVG export with customizable styling
- Interior zones rendered in color, exterior in grayscale
- Configurable border styles and colors
- Real-time style preview and editing via UI
- OSM data integration with caching for performance

### Platform Support
- Primary: Windows 10/11
- Secondary: Linux (Ubuntu, Debian) and macOS 10.15+

## Tech Stack
- **Desktop**: Electron 28+ with security best practices
- **Frontend**: React 18+ with hooks and TypeScript 5+
- **Maps**: Leaflet 1.9+ with OpenStreetMap tiles
- **Styling**: CSS Modules or styled-components
- **Data**: Overpass API for OSM data, local caching
- **Export**: Custom SVG generation with optimized output
- **Build**: Webpack 5, ESLint, Prettier

## Architecture Guidelines
- Modular component structure
- Separation of concerns (UI/Logic/Data)
- Type-safe interfaces for all data structures
- Error boundaries and graceful error handling
- Performance optimization for large datasets
- Accessibility compliance (WCAG 2.1 AA)

## Development Workflow
- Feature branches with descriptive names
- Commit messages following conventional commits
- Code reviews for all changes
- Automated testing (unit + integration)
- Generate GitHub issues for new features/bugs
- Assign implementation tasks to @copilot

## Code Quality Standards
- TypeScript strict mode enabled
- ESLint rules enforced
- 80%+ test coverage target
- Performance budgets for bundle size
- Consistent naming conventions
- Comprehensive JSDoc comments for public APIs

## Project Status

### ✅ Completed Features
- [x] Electron app scaffold with React/TypeScript
- [x] Interactive Leaflet map integration
- [x] Rectangle selection tool for zone definition
- [x] Style customization panel (colors, opacity, borders)
- [x] OSM data fetching via Overpass API
- [x] SVG generation with color/grayscale zones
- [x] File save functionality via Electron APIs
- [x] Build configuration and VS Code tasks
- [x] Project documentation in French

### 🚧 In Progress
- [ ] Polygon selection tool (beyond rectangles)
- [ ] Advanced style templates and presets
- [ ] Data caching and offline support
- [ ] Performance optimization for large areas

### 📋 Backlog
- [ ] Multiple zone selection and management
- [ ] Layer management (roads, buildings, etc.)
- [ ] Export format options (PNG, PDF)
- [ ] Undo/redo functionality
- [ ] Keyboard shortcuts
- [ ] Multi-language support
- [ ] Plugin system for extensions

## Installation & Setup

### Prerequisites
- Node.js 18+ LTS (https://nodejs.org/)
- Git for version control

### Quick Start
```powershell
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Create distributable packages
npm run dist
```

### Available Tasks (VS Code)
- `Terminal > Run Task > Install Dependencies`
- `Terminal > Run Task > Build: All` (default build)
- `Terminal > Run Task > Dev: Run Carto` (development mode)
- `Terminal > Run Task > Package: Create Distributables`

## Issue Management & Documentation

### Creating GitHub Issues

**IMPORTANT**: For every user request (feature, bug, enhancement), create a GitHub issue first before implementing.

#### 1. Gather Requirements

When a user makes a request, ask these questions if unclear:

- **What exactly do you want to accomplish?**
- **What should the behavior be?**
- **Are there any specific requirements or constraints?**
- **Which platform(s) should this support?**
- **How should this integrate with existing features?**
- **Do you have examples, mockups, or references?**
- **What is the priority? (High/Medium/Low)**

#### 2. Generate Issue Content

Create a well-structured issue using this template:

**Title Format**: `[Type] Brief description (max 60 chars)`
- Types: `Feature`, `Bug`, `Enhancement`, `Docs`, `Refactor`, `Test`
- Example: `[Feature] Add polygon selection tool`

**Description Template**:
```markdown
## 📝 Summary
Brief overview of the request (2-3 sentences)

## 🎯 Context
- **Why is this needed?** Explain the problem or opportunity
- **Who benefits?** Users, developers, both
- **Use case:** Real-world scenario

## 💡 Proposed Solution
Detailed description of the implementation approach

### Technical Approach
- Affected components/files
- New dependencies (if any)
- Architecture considerations

## ✅ Acceptance Criteria
- [ ] Criterion 1 (specific, testable)
- [ ] Criterion 2
- [ ] Criterion 3
- [ ] Tests added/updated
- [ ] Documentation updated

## 🔧 Technical Details
- **Affected files:** `src/renderer/components/MapEditor.tsx`, etc.
- **Dependencies:** None / `library-name@version`
- **Breaking changes:** Yes/No
- **Database/API changes:** Yes/No

## 🚧 Potential Challenges
- Challenge 1 and mitigation strategy
- Challenge 2 and mitigation strategy

## 📎 Additional Notes
- Related issues: #XX, #YY
- Priority: 🔴 High / 🟡 Medium / 🟢 Low
- Estimated effort: 🐭 Small (< 4h) / 🐰 Medium (4-16h) / 🐘 Large (> 16h)
- Platform: 💻 All / 🪟 Windows / 🐧 Linux / 🍎 macOS
```

#### 3. Assign Labels

Add appropriate labels:
- **Type**: `feature`, `bug`, `enhancement`, `documentation`, `refactor`, `test`
- **Priority**: `priority:high`, `priority:medium`, `priority:low`
- **Status**: `status:todo`, `status:in-progress`, `status:blocked`, `status:review`
- **Difficulty**: `good-first-issue`, `help-wanted`, `complex`
- **Platform**: `windows`, `linux`, `macos`, `cross-platform`
- **Component**: `ui`, `maps`, `export`, `data`, `build`

#### 4. Link to Project Board

- Add to appropriate project column (Backlog/Todo/In Progress/Done)
- Link related issues and PRs using keywords:
  - `Closes #XX` (automatically closes issue when PR merged)
  - `Fixes #XX`
  - `Related to #XX`
- Set milestone if applicable

### Documentation Standards

Every implementation MUST include:

#### 1. Code Comments
```typescript
/**
 * Generates SVG content from OSM data with custom styling
 * @param osmData - Raw OSM data from Overpass API
 * @param bounds - Geographic bounds of the selected zone
 * @param style - User-defined rendering styles
 * @param map - Leaflet map instance for coordinate conversion
 * @returns SVG string ready for file export
 * @throws {Error} If OSM data is invalid or empty
 * @see https://wiki.openstreetmap.org/wiki/Overpass_API
 */
export function generateSVG(
  osmData: OSMData,
  bounds: L.LatLngBounds,
  style: RenderStyle,
  map: L.Map
): string {
  // Implementation...
}
```

- JSDoc for all exported functions, classes, interfaces
- Inline comments for complex logic or non-obvious code
- TODO/FIXME with issue references: `// TODO(#123): Optimize this algorithm`

#### 2. README Updates

When adding features, update:
- Feature list with bullet point
- Usage instructions with examples
- Screenshots/GIFs if UI changed
- Troubleshooting section if needed

#### 3. Changelog (CHANGELOG.md)

Follow [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
## [1.1.0] - 2025-11-15

### Added
- Polygon selection tool for complex zones (#45)
- Export presets for common use cases (#52)

### Changed
- Improved OSM data caching performance (#48)
- Updated UI colors for better contrast (#50)

### Fixed
- SVG export crash on large datasets (#49)
- Map zoom controls not responding (#51)

### Removed
- Deprecated legacy rectangle API (#47)
```

#### 4. Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Examples:**
```
feat(map): add polygon selection tool

Implements free-form polygon drawing using Leaflet.Draw.
Users can now select complex zones beyond rectangles.

Closes #45

---

fix(export): prevent crash on large datasets

Added streaming SVG generation to handle large OSM responses
without exceeding memory limits.

Fixes #49

---

docs(readme): add polygon tool usage instructions

Added screenshots and step-by-step guide for the new
polygon selection feature.
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code restructuring (no behavior change)
- `perf`: Performance improvement
- `test`: Adding/updating tests
- `chore`: Build, dependencies, tooling

## Communication Style

### Language
- **French** for:
  - User-facing UI text
  - User documentation (README sections)
  - Issue descriptions when discussing with users
  - Status messages and notifications
  
- **English** for:
  - Code (variables, functions, classes)
  - Code comments and JSDoc
  - Technical documentation
  - Git commit messages
  - Issue labels and metadata

### Tone
- **Concise**: Brief responses (1-3 sentences) for simple questions
- **Detailed**: Comprehensive explanations for complex topics
- **Professional**: Helpful, respectful, and clear
- **Proactive**: Suggest improvements and best practices

### Response Format
- Start with direct answer
- Provide code examples when relevant
- Link to documentation for deep dives
- Offer alternatives when appropriate

## Development Best Practices

### TypeScript
```typescript
// ✅ Good
interface UserPreferences {
  theme: 'light' | 'dark';
  language: 'fr' | 'en';
  autoSave: boolean;
}

function savePreferences(prefs: UserPreferences): void {
  // Implementation
}

// ❌ Bad
function savePreferences(prefs: any) {
  // Implementation
}
```

- Use strict type checking (`strict: true` in tsconfig)
- Prefer `interface` for objects, `type` for unions/intersections
- Avoid `any`; use `unknown` when type is uncertain
- Use enums for fixed sets of values
- Leverage discriminated unions for state management

### React
```typescript
// ✅ Good - Functional component with hooks
interface MapEditorProps {
  style: RenderStyle;
  onZoneSelect: (zone: Zone) => void;
}

export const MapEditor: React.FC<MapEditorProps> = ({ style, onZoneSelect }) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const mapRef = useRef<L.Map>(null);
  
  useEffect(() => {
    // Setup logic
    return () => {
      // Cleanup
    };
  }, []);
  
  return <div>...</div>;
};

// ❌ Bad - Class component, no types
class MapEditor extends React.Component {
  render() {
    return <div>...</div>;
  }
}
```

- Functional components with hooks (no class components)
- Custom hooks for reusable logic (`useOSMData`, `useMapControls`)
- Memoization for expensive computations (`useMemo`, `useCallback`)
- PropTypes or TypeScript interfaces for all props
- Proper cleanup in `useEffect` to prevent memory leaks

### Electron
```typescript
// ✅ Good - Secure IPC communication
// preload.ts
contextBridge.exposeInMainWorld('api', {
  saveSvg: (content: string, filename: string) => 
    ipcRenderer.invoke('save-svg', content, filename),
});

// main.ts
ipcMain.handle('save-svg', async (event, content: string, filename: string) => {
  // Validate input
  if (!content || typeof content !== 'string') {
    throw new Error('Invalid SVG content');
  }
  // Implementation
});

// ❌ Bad - No context isolation
webPreferences: {
  nodeIntegration: true, // Dangerous!
  contextIsolation: false, // Dangerous!
}
```

- Context isolation always enabled
- Preload scripts for API exposure
- IPC for main/renderer communication
- Input validation on all IPC handlers
- Security best practices (CSP, no eval, no remote module)

### Testing
```typescript
// Unit test example
describe('generateSVG', () => {
  it('should generate valid SVG from OSM data', () => {
    const osmData = mockOSMData();
    const bounds = new L.LatLngBounds([48.8, 2.3], [48.9, 2.4]);
    const style = defaultRenderStyle();
    const map = mockLeafletMap();
    
    const svg = generateSVG(osmData, bounds, style, map);
    
    expect(svg).toContain('<?xml version="1.0"');
    expect(svg).toContain('<svg');
    expect(svg).toMatch(/<path.*>/);
  });
  
  it('should throw error on invalid data', () => {
    expect(() => generateSVG(null, bounds, style, map))
      .toThrow('Invalid OSM data');
  });
});
```

- Unit tests for utility functions (Jest)
- Component tests for UI logic (React Testing Library)
- Integration tests for critical flows (Playwright)
- E2E tests for main user journeys (Playwright)
- Aim for 80%+ code coverage
- Test edge cases and error conditions

### Performance
- **Code splitting**: Use dynamic imports for large modules
- **Lazy loading**: Load components on demand
- **Debounce/throttle**: User interactions (search, resize)
- **Virtual scrolling**: Large lists (using react-window)
- **Web Workers**: Heavy computations (SVG generation, data processing)
- **Memoization**: Expensive calculations (React.memo, useMemo)
- **Bundle analysis**: Monitor bundle size (webpack-bundle-analyzer)

## Troubleshooting

### Common Issues

#### Node.js not installed
```powershell
# Download from: https://nodejs.org/
# Install LTS version (18.x or 20.x)
# Restart VS Code after installation
node --version  # Should show v18.x or v20.x
npm --version   # Should show 9.x or 10.x
```

#### Dependencies not installing
```powershell
# Clear npm cache
npm cache clean --force

# Remove node_modules and package-lock
Remove-Item -Recurse -Force node_modules, package-lock.json

# Reinstall
npm install
```

#### Build errors
```powershell
# Clean build artifacts
Remove-Item -Recurse -Force dist

# Clean TypeScript cache
Remove-Item -Recurse -Force *.tsbuildinfo

# Rebuild
npm run build
```

#### Electron won't start
1. Check console for errors (F12)
2. Ensure all dependencies installed: `npm install`
3. Verify Node.js version: `node --version` (18+)
4. Check if ports already in use
5. Try clean build: `Remove-Item -Recurse -Force dist; npm run build`

#### Map not loading
- Check internet connection (OSM tiles require network)
- Verify Leaflet CSS is loaded
- Check browser console for CORS errors
- Try different tile server in emergency

#### SVG export issues
- Ensure zone is selected before export
- Check if zone contains OSM data (try urban area)
- Monitor memory usage for large exports
- Check file system permissions for save location

## Contributing Guidelines

### 1. Fork and Branch
```bash
# Fork repository on GitHub
git clone https://github.com/YannBrrd/carto.git
cd carto

# Create feature branch
git checkout -b feature/polygon-tool

# Make changes...
git add .
git commit -m "feat(map): add polygon selection tool"

# Push to fork
git push origin feature/polygon-tool
```

### 2. Commit Standards

Follow Conventional Commits:
- `feat(scope)`: New feature
- `fix(scope)`: Bug fix
- `docs(scope)`: Documentation
- `style(scope)`: Formatting
- `refactor(scope)`: Code restructuring
- `test(scope)`: Tests
- `chore(scope)`: Tooling

### 3. Pull Requests

Template:
```markdown
## Description
Brief description of changes

## Related Issues
Closes #XX
Related to #YY

## Changes Made
- Added polygon selection tool
- Updated MapEditor component
- Added tests for polygon geometry

## Screenshots
[If UI changed]

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No console errors
- [ ] Tested on Windows
- [ ] Follows coding standards
```

### 4. Code Review

- Address all review comments
- Keep discussions respectful and constructive
- Update PR based on feedback
- Squash commits before merge (if requested)

## Resources

### Official Documentation
- [Electron Docs](https://www.electronjs.org/docs/latest/) - Desktop framework
- [React Docs](https://react.dev) - UI library
- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - Language guide
- [Leaflet API](https://leafletjs.com/reference.html) - Map library

### OpenStreetMap
- [OSM Wiki](https://wiki.openstreetmap.org/) - General OSM info
- [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) - Query language
- [Overpass Turbo](https://overpass-turbo.eu/) - Interactive query builder
- [TagInfo](https://taginfo.openstreetmap.org/) - Tag statistics

### Development Tools
- [VS Code](https://code.visualstudio.com/docs) - Editor
- [Chrome DevTools](https://developer.chrome.com/docs/devtools/) - Debugging
- [Webpack Docs](https://webpack.js.org/concepts/) - Bundler
- [Jest Docs](https://jestjs.io/docs/getting-started) - Testing

### Best Practices
- [Clean Code JavaScript](https://github.com/ryanmcdermott/clean-code-javascript)
- [React Best Practices](https://react.dev/learn/thinking-in-react)
- [TypeScript Do's and Don'ts](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)

---

**Last Updated**: November 13, 2025  
**Version**: 1.0.0  
**Maintainer**: @YannBrrd  
**License**: MIT
