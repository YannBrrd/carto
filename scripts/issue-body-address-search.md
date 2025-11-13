Contexte:
Besoin d'une barre de recherche d'adresse permettant de centrer rapidement la carte sur un lieu spécifique, avec suggestions au cours de la saisie pour faciliter la navigation.

Critères d'acceptation:
- Barre de recherche visible en haut de la carte (ou dans un menu dédié)
- Suggestions d'adresses en temps réel lors de la saisie (autocomplétion)
- Sélection d'une suggestion ou validation (Entrée) centre la carte sur l'adresse
- Zoom automatique adapté au type de lieu (ville, rue, numéro)
- Gestion des erreurs si aucune adresse n'est trouvée
- Accessibilité clavier (navigation dans les suggestions avec flèches)

Notes techniques proposées:
- API de géocodage: Nominatim (OSM) ou Photon pour l'autocomplétion gratuite
- Nouveau composant `AddressSearch.tsx` dans `src/renderer/components/`
- Debounce de la saisie (300-500ms) pour limiter les requêtes API
- État local: `searchQuery`, `suggestions[]`, `isLoading`
- Au clic/validation: récupérer lat/lon et appeler `map.setView([lat, lon], zoom)`
- Intégration dans `MapEditor.tsx` ou `App.tsx` (position overlay ou barre fixe)

API suggérée:
- Nominatim search: `https://nominatim.openstreetmap.org/search?q={query}&format=json&addressdetails=1&limit=5`
- Photon (plus rapide): `https://photon.komoot.io/api/?q={query}&limit=5`

Impact fichiers:
- `src/renderer/components/AddressSearch.tsx`: nouveau composant
- `src/renderer/components/MapEditor.tsx`: intégration de la barre de recherche
- `src/renderer/App.tsx`: gestion d'état si nécessaire
- `src/renderer/styles.css`: styles pour la barre et les suggestions
