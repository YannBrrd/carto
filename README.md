# Carto - Éditeur de Cartes Interactif

Application de bureau multiplateforme pour l'édition de cartes interactives avec des données OSM et l'export SVG haute qualité.

## 🎯 Fonctionnalités

- **Sélection de zone**: Dessinez des zones rectangulaires sur la carte interactive
- **Export SVG haute qualité**: Génère des fichiers SVG vectoriels avec:
  - Intérieur de la zone en couleur
  - Extérieur en niveaux de gris
  - Bordure noire personnalisable
- **Édition de styles**: Interface utilisateur pour personnaliser:
  - Couleurs intérieures et de bordure
  - Épaisseur de bordure
  - Opacité du remplissage et du contour
  - Option niveaux de gris pour l'extérieur
- **Données OSM**: Intégration complète avec OpenStreetMap (routes, bâtiments, cours d'eau, etc.)
- **Multiplateforme**: Compatible Windows (prioritaire), Linux et macOS

## 🛠️ Stack Technique

- **Electron** - Framework d'application de bureau multiplateforme
- **React** - Framework d'interface utilisateur
- **TypeScript** - Langage de programmation typé
- **Leaflet** - Bibliothèque de cartographie interactive
- **React-Leaflet** - Intégration React pour Leaflet
- **Overpass API** - Récupération de données OpenStreetMap
- **Turf.js** - Opérations géospatiales

## 📋 Prérequis

Avant de commencer, assurez-vous d'avoir installé:

- **Node.js** (v18 ou supérieur) - [Télécharger](https://nodejs.org/)
- **npm** (inclus avec Node.js)
- **Git** (optionnel) - [Télécharger](https://git-scm.com/)

### Vérification de l'installation

```powershell
node --version
npm --version
```

## 🚀 Installation

### 1. Installer Node.js (si nécessaire)

**Windows:**
1. Téléchargez l'installateur depuis [nodejs.org](https://nodejs.org/)
2. Exécutez l'installateur (choisissez la version LTS)
3. Redémarrez votre terminal/VS Code

### 2. Installer les dépendances du projet

```powershell
npm install
```

Cette commande installera tous les packages nécessaires listés dans `package.json`.

## 🎮 Utilisation

### Mode Développement

Pour lancer l'application en mode développement avec rechargement automatique:

```powershell
npm run dev
```

Cette commande:
- Compile le processus principal Electron
- Compile l'interface React
- Lance l'application en mode développement
- Ouvre les DevTools automatiquement

### Build Production

Pour compiler l'application:

```powershell
npm run build
```

### Lancement Simple

Pour lancer l'application après compilation:

```powershell
npm start
```

### Création de l'Exécutable

Pour créer un installateur/package distributable:

```powershell
npm run dist
```

Les fichiers seront générés dans le dossier `release/`:
- **Windows**: `.exe` (installateur NSIS)
- **Linux**: `.AppImage` et `.deb`
- **macOS**: `.dmg`

## 📖 Guide d'Utilisation

1. **Démarrer l'application**: Lancez avec `npm run dev` ou `npm start`

2. **Naviguer sur la carte**: 
   - Utilisez la souris pour déplacer la carte
   - Molette pour zoomer/dézoomer

3. **Dessiner une zone**:
   - Cliquez sur "Nouvelle zone"
   - Cliquez sur la carte pour commencer
   - Déplacez la souris pour définir la taille
   - Cliquez à nouveau pour terminer

4. **Personnaliser les styles**:
   - Utilisez le panneau latéral gauche
   - Modifiez les couleurs, épaisseurs, opacités
   - Les modifications sont appliquées en temps réel

5. **Exporter en SVG**:
   - Cliquez sur "Exporter SVG"
   - Choisissez l'emplacement de sauvegarde
   - Le fichier SVG est généré avec vos paramètres

## 📁 Structure du Projet

```
carto/
├── src/
│   ├── main/                 # Processus principal Electron
│   │   ├── main.ts          # Point d'entrée principal
│   │   └── preload.ts       # Script de préchargement
│   └── renderer/            # Processus de rendu (UI)
│       ├── App.tsx          # Composant principal
│       ├── index.tsx        # Point d'entrée React
│       ├── styles.css       # Styles globaux
│       ├── types.ts         # Définitions TypeScript
│       ├── components/      # Composants React
│       │   ├── MapEditor.tsx    # Éditeur de carte principal
│       │   └── StylePanel.tsx   # Panneau de personnalisation
│       └── utils/           # Utilitaires
│           ├── osmData.ts       # Récupération données OSM
│           └── svgGenerator.ts  # Génération SVG
├── dist/                    # Fichiers compilés
├── release/                 # Packages distributables
├── package.json            # Configuration npm
├── tsconfig.json           # Configuration TypeScript
├── webpack.config.js       # Configuration Webpack
└── README.md              # Ce fichier
```

## 🔧 Scripts Disponibles

- `npm start` - Lance l'application compilée
- `npm run dev` - Mode développement avec watch
- `npm run build` - Compile le projet
- `npm run build:main` - Compile le processus principal uniquement
- `npm run build:renderer` - Compile le rendu uniquement
- `npm run dist` - Crée les packages distributables
- `npm run package` - Crée le package sans installateur

## 🐛 Dépannage

### L'application ne démarre pas

1. Vérifiez que toutes les dépendances sont installées: `npm install`
2. Compilez le projet: `npm run build`
3. Vérifiez la console pour les erreurs

### Erreurs de compilation TypeScript

- Assurez-vous d'utiliser Node.js v18 ou supérieur
- Supprimez `node_modules` et `dist`, puis réinstallez: 
  ```powershell
  Remove-Item -Recurse -Force node_modules, dist
  npm install
  ```

### Les données OSM ne se chargent pas

- Vérifiez votre connexion Internet
- L'API Overpass peut avoir des limites de taux - attendez quelques minutes
- Essayez une zone plus petite

### Le SVG généré est vide

- Assurez-vous qu'une zone est sélectionnée avant l'export
- Vérifiez que la zone contient des données OSM
- Essayez de zoomer sur une zone urbaine avec plus de données

## 🤝 Contribution

Les contributions sont les bienvenues! N'hésitez pas à:

1. Fork le projet
2. Créer une branche pour votre fonctionnalité
3. Commit vos changements
4. Push vers la branche
5. Ouvrir une Pull Request

## 📝 Licence

MIT License - voir le fichier LICENSE pour plus de détails

## 🙏 Remerciements

- [OpenStreetMap](https://www.openstreetmap.org/) pour les données cartographiques
- [Electron](https://www.electronjs.org/) pour le framework d'application
- [Leaflet](https://leafletjs.com/) pour la bibliothèque de cartographie
- [Overpass API](https://overpass-api.de/) pour l'accès aux données OSM

## 📞 Support

Pour toute question ou problème, veuillez ouvrir une issue sur le dépôt GitHub.

---

Développé avec ❤️ pour la cartographie interactive
