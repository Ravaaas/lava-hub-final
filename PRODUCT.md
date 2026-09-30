# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
L'équipe du restaurant LAVA (Paris 5e), en cuisine et en salle, plus le propriétaire (admin). Chaque personne a son compte et se connecte par profil « NOM Prénom » (classement par nom de famille). Rôles : admin, salle, cuisine. Usage sur ordinateur, téléphone et tablette de cuisine, pour consulter (recette, grammage, allergène) et pour préparer (fiches, menus, groupes) à parts égales.

## Product Purpose
Application interne qui centralise fiches techniques, fiches recette, menus, groupes, journal et équipe. Succès : l'équipe retrouve vite une information fiable (allergènes compris) et le propriétaire tient les données à jour sans effort.

## Positioning
Outil interne sur mesure, propre au restaurant : allergènes recalculés par la base depuis les fiches techniques, comptes individuels sans identifiant visible, sauvegardes nocturnes.

## Operating Context
Plus Jakarta Sansface entièrement en français. Application React + TypeScript (dossier `app/`), publiée sur GitHub Pages ; données dans Supabase. Export PDF des fiches recette, menus et groupes (la charte des PDF ne change pas).

## Capabilities and Constraints
- Noms de fiches techniques en MAJUSCULES ; pas de prix dans les menus ; Config = Équipe / Catégories / Sauvegarde.
- L'identifiant de connexion n'est jamais saisi ni affiché.
- Tout texte venant de la base passe par `escHTML` ; les ajouts visibles reçoivent une entrée `APP_CHANGELOG`.
- Les identifiants d'éléments (`id="..."`) et les noms de fonctions du JS sont utilisés par les tests (`tests/`) : les conserver.
- Refonte visuelle : CSS et balisage uniquement, aucune logique métier modifiée.

## Brand Commitments
Nom : LAVA Hub Cuisine. Refonte visuelle **complète** voulue (2026-09-30), identité libre. Première version (clair épuré Notion/Linear) jugée par le propriétaire « pas assez moderne et pas épurée » : trop de traits et de bordures, en-tête chargé, look de tableau, trop petit et serré. **Direction retenue : application de type iPhone / Apple** : grands titres, cartes blanches très arrondies sans bordure sur fond gris doux, séparateurs fins en retrait, beaucoup d'air, boutons en pilule, champs remplis sans contour, navigation en barre du bas sur téléphone et tablette, en-tête presque vide (marque + pastille de profil qui ouvre un menu), animations douces. Clair par défaut, mode sombre disponible (fond noir, cartes graphite). Un seul accent (rouge LAVA). L'accent est le rouge LAVA d'origine (#B5433C) ; l'ambre est réservé aux allergènes.

## Evidence on Hand
Code dans `app/`, données dans Supabase ; tests dans `tests/` (parcours de l'équipe en navigateur) et `app/src/**/*.test.ts`. Aucun témoignage ni chiffre externe : ne rien inventer.

## Product Principles
- Clarté avant densité : listes sobres, détail en fenêtre, peu de champs par ligne.
- Fiabilité des allergènes avant tout : ils doivent se voir au premier coup d'œil.
- Lisible en cuisine : texte utile jamais sous 14 px (corps 16-17 px), contrastes AA, cibles tactiles d'au moins 44 px.
- Utilisable aussi bien en consultation rapide qu'en édition posée, sur les trois types d'appareil.
- Ne jamais exposer d'identifiant technique à l'utilisateur.

## Accessibility & Inclusion
Contraste WCAG AA minimum, navigation au clavier complète, focus visible, cibles tactiles de 44 px, mouvement réduit respecté (`prefers-reduced-motion`).
