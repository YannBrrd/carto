Contexte:
Aujourd’hui, le panneau de style est visible en permanence. Besoin: la personnalisation du style ne doit être visible que lorsqu’un menu est activé. Cette action ouvre une fenêtre modale permettant de modifier le style de la carte et de voir les changements en temps réel sur la fenêtre principale.

Critères d’acceptation:
- Un bouton/menu "Personnaliser le style" ouvre une fenêtre modale centrée
- Les options de style (couleurs, opacités, bordures, niveaux de gris extérieur) s’affichent dans la modale
- Les changements dans la modale mettent à jour la carte principale en temps réel (prévisualisation)
- Boutons "Annuler" (revenir à l’état initial) et "Appliquer" (valider et fermer)
- Échap ferme la modale; focus piégé dans la modale; accessible au clavier
- L’ancien panneau latéral n’est plus affiché par défaut

Notes techniques proposées:
- Nouveau composant `StyleModal.tsx` (contenu de l’actuel `StylePanel.tsx`) rendu via portail React
- État UI dans `App.tsx`: `isStyleModalOpen`, `pendingStyle` vs `renderStyle` pour gérer Annuler/Appliquer
- Bouton/Menu pour ouvrir la modale (overlay map ou barre d’actions)
- Les modifications appellent `setPendingStyle` et appliquent un aperçu immédiat sur la carte
- Au clic "Appliquer", faire `setRenderStyle(pendingStyle)` puis fermer

Impact fichiers:
- `src/renderer/App.tsx`: gestion d’état et déclencheur d’ouverture
- `src/renderer/components/StylePanel.tsx` → contenu déplacé/retouché vers `StyleModal.tsx`
- `src/renderer/components/MapEditor.tsx`: aucun changement majeur, reçoit `renderStyle` à jour
