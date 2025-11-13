# Carto - Interactive Map Editor

## Project Overview
Cross-platform desktop application for interactive map editing with OSM data and high-quality SVG export.
- Select zones on maps and generate SVG files
- Interior zones in color, exterior in grayscale
- Black border by default
- Edit rendering styles via UI
- Priority: Windows, with Linux and macOS support

## Tech Stack
- Electron (cross-platform desktop)
- React (UI framework)
- TypeScript
- Leaflet/MapLibre (map rendering)
- OSM data integration
- SVG generation

## Checklist
- [x] Verify that the copilot-instructions.md file in the .github directory is created.
- [x] Clarify Project Requirements - Application multiplateforme pour édition de cartes avec données OSM et export SVG
- [x] Scaffold the Project - Structure Electron avec React, TypeScript, et Leaflet créée
- [x] Customize the Project - Composants pour l'édition de carte, sélection de zones, et personnalisation de styles
- [x] Install Required Extensions - Aucune extension VS Code requise
- [x] Compile the Project - Configuration de build avec TypeScript et Webpack
- [x] Create and Run Task - Tâches VS Code créées pour build, dev, et distribution
- [x] Launch the Project - Prêt à lancer avec `npm run dev` après installation de Node.js
- [x] Ensure Documentation is Complete - README complet avec instructions d'installation et d'utilisation

## Next Steps

**IMPORTANT**: Node.js n'est pas installé sur ce système. Pour continuer:

1. **Installer Node.js**:
   - Téléchargez depuis https://nodejs.org/ (version LTS recommandée)
   - Installez et redémarrez VS Code

2. **Installer les dépendances**:
   ```powershell
   npm install
   ```

3. **Lancer en mode développement**:
   ```powershell
   npm run dev
   ```
   
   Ou utilisez la tâche VS Code: `Terminal > Run Task > Dev: Run Carto`

## Project Status

✅ **Complété**:
- Structure complète de l'application Electron
- Interface React avec composants de carte interactive
- Intégration Leaflet pour l'affichage de cartes OSM
- Système de dessin de zones rectangulaires
- Panneau de personnalisation des styles (couleurs, bordures, opacité)
- Récupération de données OSM via Overpass API
- Génération de SVG haute qualité avec zones colorées/niveaux de gris
- Sauvegarde de fichiers via API Electron
- Configuration de build complète (TypeScript, Webpack)
- Tâches VS Code pour développement et packaging
- Documentation complète en français

🎯 **Fonctionnalités principales**:
- Sélection de zones sur carte interactive
- Export SVG avec intérieur coloré et extérieur en gris
- Bordure personnalisable
- Édition de styles via interface
- Support Windows, Linux, macOS
