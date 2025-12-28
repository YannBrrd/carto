# Carto - Éditeur de Cartes Interactif

Application de bureau multiplateforme pour l'édition de cartes interactives avec des données OpenStreetMap et l'export SVG haute qualité.

### Aperçu de l'application

<video src="https://github.com/YannBrrd/carto/raw/main/docs/apercu.mp4" autoplay loop muted playsinline width="100%"></video>

## Fonctionnalités

- **Sélection de zone polygonale** : Dessinez des zones, ajustez les points, arrondissez les angles
- **Export multi-format** : SVG (vectoriel), PNG (image), PDF (document)
- **Thèmes personnalisables** : Styles Maps, OpenStreetMap, ou personnalisés
- **Personnalisation des polices** : Choix de la police et option gras pour les labels
- **Mode hors-ligne** : Chargez des fichiers .osm locaux pour travailler sans connexion
- **Panneaux réductibles** : Minimisez les panneaux pour plus d'espace carte
- **Données OSM** : Routes, bâtiments, parcs, cours d'eau, POIs...
- **Noms de rues intelligents** : Abréviations automatiques (Rue → r., Avenue → av., etc.)
- **Multiplateforme** : Windows, macOS et Linux

---

## Installation

### Télécharger les binaires (recommandé)

Téléchargez la dernière version depuis la page [Releases](../../releases) :

| Plateforme | Fichier | Instructions |
|------------|---------|--------------|
| **Windows** | `Carto-X.X.X.exe` | Double-cliquez pour lancer (portable, pas d'installation) |
| **Windows** | `Carto-X.X.X-win.zip` | Décompressez et lancez `Carto.exe` |
| **macOS** | `Carto-X.X.X-mac.zip` | Décompressez, glissez `Carto.app` dans Applications |
| **Linux** | `Carto-X.X.X.AppImage` | `chmod +x` puis exécutez |

#### Notes d'installation

**Windows** : Au premier lancement, Windows Defender peut afficher un avertissement. Cliquez sur "Plus d'infos" → "Exécuter quand même".

**macOS** : Si macOS bloque l'app, allez dans Préférences Système → Sécurité et confidentialité → "Ouvrir quand même".

**Linux** :
```bash
chmod +x Carto-*.AppImage
./Carto-*.AppImage
```

---

## Utilisation

### Navigation sur la carte

| Action | Commande |
|--------|----------|
| Déplacer la carte | Glisser avec la souris |
| Zoomer/Dézoomer | Molette de la souris |
| Rechercher une adresse | Barre de recherche en haut à droite |

### Dessiner une zone

1. Cliquez sur **"Nouvelle zone"**
2. Cliquez sur la carte pour ajouter des points
3. Maintenez **Ctrl** pour déplacer la carte pendant le dessin
4. Cliquez sur le **point vert** (premier point) pour fermer le polygone
5. **Ajustez les points** : glissez-déposez les marqueurs bleus pour modifier la forme
6. **Arrondir** : Ctrl+clic sur des points consécutifs, puis cliquez sur "Arrondir"

### Personnaliser le style

1. Cliquez sur **"Modifier"** dans le panneau de gauche
2. Ajustez les couleurs par catégorie :
   - Routes (autoroutes, rues, chemins...)
   - Bâtiments (résidentiels, commerciaux...)
   - Zones naturelles (eau, forêts, parcs...)
3. Personnalisez les labels :
   - **Police** : Roboto, Arial, Georgia, Times New Roman, Verdana, Courier New
   - **Gras** : Active/désactive le texte en gras
   - **Taille** : Ajustez la taille des noms de rues et zones
4. Cliquez sur **"Appliquer"** pour valider

> Les paramètres de police sont automatiquement sauvegardés et restaurés au prochain lancement.

### Exporter la carte

1. Sélectionnez une zone sur la carte
2. Configurez les options d'export :
   - **Forcer tous les noms** : Affiche tous les noms de rues même s'ils ne tiennent pas
   - **Voile gris extérieur** : Assombrit la zone hors sélection
   - **Couleur de bordure** : Couleur du contour de la zone
3. Choisissez le format d'export :
   - **SVG** : Format vectoriel, compatible Inkscape avec calques séparés
   - **PNG** : Image haute résolution (2x)
   - **PDF** : Document avec orientation automatique

---

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl` + glisser | Déplacer la carte pendant le dessin |
| `Molette` | Zoom avant/arrière |
| `Échap` | Annuler le dessin en cours |

---

## Éditeur de Règles Avancé

L'éditeur de règles avancé permet un contrôle fin du rendu cartographique, au-delà des options de style simples.

### Accès

Cliquez sur le bouton **"Éditeur de Règles Avancé"** dans le panneau de gauche.

### Onglets

| Onglet | Description |
|--------|-------------|
| **Préréglages** | Chargez un style prédéfini (Maps, OpenStreetMap) |
| **Features** | Définitions des éléments cartographiques |
| **Règles** | Propriétés de rendu pour chaque feature |
| **Importer** | Importez un fichier .mrules |

### Types de propriétés

| Type | Propriétés | Description |
|------|------------|-------------|
| **Couleurs** | `line-color`, `fill-color`, `border-color`, `text-color` | Couleurs hexadécimales |
| **Dimensions** | `line-width`, `border-width`, `font-size` | Valeurs numériques ou zoom-dépendantes |
| **Opacités** | `fill-opacity`, `line-opacity` | Valeurs de 0 à 1 |
| **Styles** | `line-style`, `border-style` | `solid`, `dash`, `dot`, `none` |

### Valeurs spéciales

- **`none`** : Désactive complètement le rendu (pas de ligne, pas de bordure)
- **Zoom-dépendant** : Valeurs qui changent selon le niveau de zoom (affichées comme "z14: 2, z16: 4")

### Commandes de rendu

| Commande | Description |
|----------|-------------|
| `line` | Dessine le contour (routes, chemins) |
| `fill` | Remplit la surface (bâtiments, parcs) |
| `text` | Affiche les labels et noms |
| `icon` | Affiche une icône |
| `shape` | Dessine une forme |
| `shield` | Affiche un bouclier routier |

### Format .mrules

Le format `.mrules` est compatible avec Maperitive. Vous pouvez :
- **Exporter** vos règles avec le bouton "Exporter .mrules"
- **Importer** des fichiers .mrules existants via l'onglet "Importer"
- **Éditer** les fichiers dans un éditeur de texte pour des modifications avancées

---

## Développement

### Prérequis

- Node.js v18 ou supérieur
- npm (inclus avec Node.js)

### Installation des dépendances

```bash
git clone https://github.com/YannBrrd/carto.git
cd carto
npm install
```

### Scripts disponibles

```bash
npm run dev          # Mode développement avec hot reload
npm run build        # Compile le projet
npm start            # Lance l'application compilée
npm run dist         # Crée les packages distributables
```

### Structure du projet

```
carto/
├── src/
│   ├── main/              # Processus Electron (Node.js)
│   │   ├── main.ts        # Fenêtre, IPC, fichiers
│   │   └── preload.ts     # Bridge sécurisé
│   └── renderer/          # Interface React
│       ├── components/    # Composants UI
│       ├── utils/         # Génération SVG, données OSM
│       └── presets/       # Thèmes prédéfinis
├── build/                 # Ressources de build (entitlements macOS)
├── .github/workflows/     # CI/CD GitHub Actions
└── release/               # Binaires générés
```

### Créer une release

Les builds sont automatisés via GitHub Actions :

```bash
# Créer un tag de version
git tag v1.0.0
git push origin v1.0.0
```

Une GitHub Release sera créée automatiquement avec les binaires Windows, macOS et Linux.

---

## Technologies

- **Electron** - Framework desktop multiplateforme
- **React 18** - Interface utilisateur
- **TypeScript** - Typage statique
- **Leaflet** - Cartographie interactive
- **Overpass API** - Données OpenStreetMap
- **jsPDF** - Génération de fichiers PDF
- **electron-builder** - Packaging et distribution

---

## Dépannage

### L'application ne démarre pas

```bash
npm install
npm run build
npm start
```

### Les données OSM ne chargent pas

- Vérifiez votre connexion Internet
- Zoomez davantage (niveau 15 minimum)
- L'API Overpass peut être surchargée, réessayez après quelques minutes

### Le SVG est vide ou incomplet

- Assurez-vous que la zone contient des données (routes, bâtiments)
- Essayez une zone urbaine plus dense
- Vérifiez que le zoom est suffisant

### Windows affiche un avertissement de sécurité

L'application n'est pas signée numériquement. Cliquez sur "Plus d'infos" → "Exécuter quand même".

### macOS bloque l'application

```bash
xattr -cr /Applications/Carto.app
```

Ou : Préférences Système → Sécurité → "Ouvrir quand même"

---

## Licence

GPL-3.0 License - Voir [LICENSE](LICENSE)

---

## Remerciements

- [OpenStreetMap](https://www.openstreetmap.org/) - Données cartographiques
- [Leaflet](https://leafletjs.com/) - Bibliothèque de cartographie
- [Overpass API](https://overpass-api.de/) - Accès aux données OSM
- [CARTO](https://carto.com/) - Tuiles de fond de carte
