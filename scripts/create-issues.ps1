param(
  [string]$Repo = "YannBrrd/carto",
  [string]$Assignee = "copilot"
)

# Requires: GitHub CLI (gh) and auth (gh auth login)
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Error "GitHub CLI (gh) not found. Install from https://cli.github.com/";
  exit 1
}

Write-Host "Using repository: $Repo" -ForegroundColor Cyan
Write-Host "Assigning to: $Assignee" -ForegroundColor Cyan

# Optional: show auth status
try { gh auth status } catch { Write-Warning "GitHub CLI not authenticated. Run: gh auth login" }

# In Progress

gh issue create -R $Repo --title "[Feature] Polygon selection tool" --body "Implement free-form polygon drawing beyond rectangles.`n`nAcceptance Criteria:`n- Draw polygons with click-to-add vertices`n- Edit/move vertices and close polygon`n- Selection bounds passed through to OSM fetch + SVG export" --assignee $Assignee --label feature --label maps --label ui

gh issue create -R $Repo --title "[Enhancement] Style templates and presets" --body "Add reusable style presets (colors, borders, opacity) and quick switching.`n`nAcceptance Criteria:`n- Preset list in StylePanel`n- Save/apply/delete presets`n- Persist last used preset" --assignee $Assignee --label enhancement --label ui

gh issue create -R $Repo --title "[Enhancement] Data caching and offline support" --body "Cache Overpass responses per bbox + tags; basic offline reuse." --assignee $Assignee --label enhancement --label data

gh issue create -R $Repo --title "[Perf] Optimize large-area performance" --body "Improve performance for >1km² selections (throttling, simplification, streaming SVG)." --assignee $Assignee --label perf --label maps --label export

# Backlog

gh issue create -R $Repo --title "[Feature] Multiple zone selection and management" --body "Support multiple zones, list management, per-zone styles, combined export." --assignee $Assignee --label feature --label ui

gh issue create -R $Repo --title "[Feature] Layer management (roads, buildings, etc.)" --body "Toggle visibility/weight of layers (highway/building/water/landuse)." --assignee $Assignee --label feature --label maps

gh issue create -R $Repo --title "[Feature] Export formats: PNG and PDF" --body "Add PNG/PDF export paths alongside SVG (rasterize or vector pipeline)." --assignee $Assignee --label feature --label export

gh issue create -R $Repo --title "[Feature] Undo/redo functionality" --body "Add undo/redo for drawing and style changes (history stack)." --assignee $Assignee --label feature --label ui

gh issue create -R $Repo --title "[Enhancement] Keyboard shortcuts" --body "Shortcuts for new zone, export, undo/redo, zoom, preset switch." --assignee $Assignee --label enhancement --label ui

gh issue create -R $Repo --title "[Feature] Multi-language support" --body "Internationalize UI strings (keep French default, add EN), language switcher." --assignee $Assignee --label feature --label i18n

gh issue create -R $Repo --title "[Feature] Plugin system for extensions" --body "Design lightweight plugin API for new exporters, styles, or data processors." --assignee $Assignee --label feature --label architecture

Write-Host "Issue creation commands executed. Verify on GitHub: https://github.com/$Repo/issues" -ForegroundColor Green
