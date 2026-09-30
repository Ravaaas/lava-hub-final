---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

## Scope
Toute l'app LAVA Hub Cuisine (index.html), mode Operate. Deuxième passe de la refonte : la première version (clair épuré façon Notion) a été jugée « pas moderne, pas épurée » par le propriétaire. Direction imposée : application de type iPhone / Apple. L'ancienne version est une référence à dépasser, pas à polir.

## Audience, job, constraints
Équipe de cuisine et de salle sur tablette, téléphone et ordinateur : retrouver vite une fiche, un plat, un allergène, un groupe. Contraintes : textes utiles ≥ 14 px, contrastes AA, cibles 44 px, français, id et fonctions JS conservés (tests), PDF et feuilles document inchangés (rouge LAVA), aucune logique métier touchée.

## Direction contract
THESIS: Une vraie application, pas un tableau de bord : de grands titres, de grosses zones tactiles et presque aucun trait. Seul l'allergène porte de la couleur. Refuse les bordures partout, l'en-tête plein de boutons et les petits contrôles serrés.
OWN-WORLD: Clair : fond de page gris doux #f5f5f7, cartes blanches à coins de 20 px sans bordure, séparateurs fins en retrait (rgba 60,60,67,.12), encre #1d1d1f, secondaire #5b5b60. Sombre : page noire #000, cartes graphite #1c1c1e. Accent unique rouge LAVA #B5433C (boutons pleins, sélection). Ambre pour les allergènes (pastilles sans bordure), rouge pour les conflits et suppressions. Plus Jakarta Sans, titres de page 34 px gras, lignes de liste 17 px, corps 16 px. Champs remplis sans contour (coins 14 px), boutons en pilule de 44 px, commutateur segmenté façon iOS, icônes à trait de 1,75 px. Ombres très douces, mouvement à ressort discret.
STORY: On ouvre l'app et on sait immédiatement où l'on est grâce au grand titre ; on touche une ligne, une fenêtre glisse ; rien ne distrait de l'information et des allergènes.
FIRST VIEWPORT: En-tête vide (LAVA à gauche, pastille d'initiale à droite qui ouvre un menu). Barre d'onglets en pilule centrée sur ordinateur, barre du bas avec icônes sur téléphone et tablette. Grand titre de page, action principale en pilule pleine à droite, recherche pleine largeur en champ rempli, puis carte de liste aux lignes de 64 px : nom, méta en gris, pastilles d'allergènes, chevron léger.
FORM: Listes groupées façon iOS (cartes arrondies à séparateurs en retrait), fiche détail plein écran sur fond de page, fenêtres en feuille (glissent depuis le bas au téléphone, centrées à coins de 28 px sur grand écran), menu de profil en popover. Direction pinnée par le propriétaire : pas de tirage de concept.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
