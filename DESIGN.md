---
name: LAVA Hub Cuisine
description: Application interne de cuisine et de salle, claire et fine façon iPhone : fond gris doux, listes blanches groupées à filet fin, pilules, un seul accent rouge LAVA, l'ambre réservé aux allergènes.
colors:
  accent: "#B5433C"
  accent-hi: "#9a342e"
  accent-text: "#A23A34"
  accent-ink: "#ffffff"
  page: "#f5f5f7"
  card: "#ffffff"
  card-alt: "#f5f5f7"
  card-alt-2: "#ececef"
  ink: "#1d1d1f"
  ink-2: "#55555a"
  ink-3: "#5f5f64"
  allergen-bg: "#fff0e0"
  allergen-ink: "#8a3800"
  allergen-line: "#e9a566"
  danger: "#d92d20"
  danger-ink: "#b42318"
  danger-solid: "#c4321f"
  ok: "#1a7f37"
  ok-soft: "#e6f6ea"
  dark-page: "#000000"
  dark-card: "#1c1c1e"
  dark-card-alt: "#2a2a2d"
  dark-card-alt-2: "#3a3a3d"
  dark-segment-on: "#636366"
  dark-ink: "#f5f5f7"
  dark-ink-2: "#b0b0b6"
  dark-ink-3: "#98989f"
  dark-accent: "#C24A43"
  dark-accent-hi: "#D25C55"
  dark-accent-text: "#F2A29C"
  dark-allergen-ink: "#ffc48d"
  dark-danger: "#ff6b60"
  dark-danger-ink: "#ff9b93"
  dark-danger-solid: "#d4402f"
  dark-ok: "#4cc36f"
  dark-ok-solid: "#1f8040"
  sheet-lava-red: "#B5433C"
  sheet-ink: "#221818"
typography:
  page-title:
    fontFamily: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  modal-title:
    fontFamily: "Plus Jakarta Sans, -apple-system, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  section-title:
    fontFamily: "Plus Jakarta Sans, -apple-system, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  row-title:
    fontFamily: "Plus Jakarta Sans, -apple-system, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Plus Jakarta Sans, -apple-system, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "Plus Jakarta Sans, -apple-system, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
  label:
    fontFamily: "Plus Jakarta Sans, -apple-system, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
rounded:
  field: "10px"
  control: "12px"
  card: "16px"
  sheet: "22px"
  login-card: "28px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "18px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 20px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hi}"
  button-tonal:
    textColor: "{colors.accent-text}"
    rounded: "{rounded.pill}"
    height: "44px"
  button-danger:
    textColor: "{colors.danger-ink}"
    rounded: "{rounded.pill}"
    height: "44px"
  field:
    backgroundColor: "{colors.card-alt}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "48px"
    padding: "0 16px"
  list-card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
  list-row:
    textColor: "{colors.ink}"
    height: "68px"
    padding: "12px 18px"
  allergen-tag:
    backgroundColor: "{colors.allergen-bg}"
    textColor: "{colors.allergen-ink}"
    rounded: "{rounded.pill}"
    height: "24px"
    padding: "0 10px"
  sheet:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.sheet}"
  tab-pill:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 18px"
---

# Design System: LAVA Hub Cuisine

## Overview

**Creative North Star: "L'application, pas le tableau de bord"**

Une application claire de type iPhone, fine et aérée : un fond de page gris doux, des listes blanches groupées aux coins arrondis cernées d'un filet à peine visible, des séparateurs en retrait, des boutons en pilule. Le rouge LAVA est l'unique accent d'interface ; l'ambre est réservé aux allergènes, le rouge vif au danger. Clair par défaut, thème sombre au choix depuis le menu de l'avatar (page noire, cartes graphite), mémorisé dans `localStorage` (`lava_theme`).

L'en-tête est presque vide : logotype LAVA (image d'origine utilisée comme masque, teinte = encre), pastille de synchronisation et avatar. L'écran de connexion est le logo et deux lignes Cuisine / Salle, sans titre ni sous-titre. Le mouvement est court et à ressort, coupé sous `prefers-reduced-motion`.

Exception assumée : les feuilles document (`.fdoc*`, `.fr-sr-card`) reflètent les PDF exportés, qui ne changent pas ; elles restent du papier blanc à filets et titres rouge LAVA, quel que soit le thème.

**Key Characteristics:**
- Page grise (#f5f5f7), listes blanches de 16 px cernées d'un filet, sans ombre.
- Un accent rouge LAVA ; ambre = allergènes ; rouge vif = danger seulement.
- Boutons en pilule, champs remplis sans contour, filtres segmentés.
- Onglets : pilule centrée au-dessus de 900 px, barre du bas en dessous.
- Plus Jakarta Sans seule, hiérarchie par le poids (400 à 600) et la taille.

## Colors

Neutres froids et discrets ; le rouge LAVA est la seule teinte d'interface, l'ambre est un signal.

### Primary
- **Rouge LAVA** (#B5433C) : boutons pleins, avatar, focus, curseur de saisie, sélection. Survol #9a342e. Texte et liens rouge LAVA sur fond clair : #A23A34. Lavis `rgba(181,67,60,.10)` pour boutons tonals, numéros d'étape et survol du bouton d'ajout.
- **Rouge LAVA sombre** (#C24A43, survol #D25C55, texte #F2A29C, lavis `rgba(226,110,102,.20)`) : équivalents du thème sombre.

### Secondary
- **Ambre allergène** (fond #fff0e0, texte #8a3800, filet #e9a566) : pastilles d'allergènes et sélecteur actif. Sombre : fond `rgba(255,159,64,.18)`, texte #ffc48d, filet `rgba(255,159,64,.55)`.
- **Rouge danger** (#d92d20 ; texte #b42318 ; plein #c4321f ; sombre #ff6b60 / #ff9b93 / #d4402f) : alertes, suppression, toast d'erreur. Jamais décoratif.
- **Vert succès** (#1a7f37, lavis #e6f6ea ; sombre #4cc36f, plein #1f8040) : point de synchronisation, toast de succès.

### Neutral
- **Page** (#f5f5f7 ; sombre #000000) : fond de l'app, de l'en-tête et des fiches plein écran.
- **Carte** (#ffffff ; sombre #1c1c1e) : listes, fenêtres, menu, barre du bas. Variantes #f5f5f7 et #ececef (sombre #2a2a2d et #3a3a3d) pour survol et bandeaux de section.
- **Encre** (#1d1d1f ; sombre #f5f5f7), **secondaire** (#55555a ; sombre #b0b0b6), **tertiaire** (#5f5f64 ; sombre #98989f). Secondaire et tertiaire tiennent 4,5:1 sur carte et sur page.
- **Remplissage** `rgba(118,118,128,.12)` (survol .20 ; sombre .24 et .36) : champs, segments, pastilles neutres, pilule d'onglet active. Segment actif blanc (sombre #636366). **Filet** `rgba(60,60,67,.14)` (sombre `rgba(255,255,255,.12)`), pointillé du bouton d'ajout `rgba(60,60,67,.30)`.

### Feuilles document (exception miroir PDF)
- **Rouge LAVA** (#B5433C) : titres, filets, numéros d'étape et badges des feuilles uniquement. Encre de feuille #221818, filets #E0D0D0 / #EDD8D8, zébrure #F5ECEC, entête de sous-recette #FBF3F1, tag d'allergène de feuille #FBEDEC.

### Named Rules
**The One Accent Rule.** Le rouge LAVA (#B5433C) est le seul accent d'interface : action, sélection, focus.
**The Allergen Amber Rule.** L'ambre appartient aux allergènes ; le rouge vif appartient au danger. Aucun des deux ne décore.
**The Paper Mirror Rule.** Les feuilles document copient le PDF, pas le thème : elles ne suivent ni le mode sombre ni les rayons de l'interface.

## Typography

**Display et Body Font:** Plus Jakarta Sans (repli -apple-system, SF Pro Text, Segoe UI, system-ui)

**Character:** Un seul sans-serif, fin et lisible ; la hiérarchie vient de la taille et d'un poids de 400 à 600, avec un interlettrage légèrement serré sur les titres.

### Hierarchy
- **Page title** (600, 26 px, 1.1, -0.02em ; 30 px déclaré sous 640 px mais écrasé par la couche finale) : un par onglet, sous-titre 14 px gris.
- **Modal title** (600, 18 px, -0.02em) : titre de fenêtre.
- **Section title** (600, 17 px, -0.02em) : sections de réglages ; sous-sections de formulaire 15 px / 600.
- **Row title** (600, 15 px, 1.3) : nom dans une ligne de liste ; méta 13 px, gris secondaire.
- **Body** (400, 15 px, 1.5) : texte courant, champs, libellés de ligne de réglage.
- **Control** (500, 14 px) : boutons, onglets de bureau, segments, pastilles d'allergènes ; boutons de connexion 16 px / 500.
- **Label** (500, 13 px, casse normale) : libellés de formulaire, jours du journal, petit bouton.
- **Wordmark** : image LAVA en masque (56 × 25 px en-tête, 300 px max en connexion), jamais du texte.

### Named Rules
**The Weight-Not-Case Rule.** Casse normale partout dans l'interface ; la hiérarchie passe par le poids et la taille. Les noms de fiches techniques restent en majuscules parce que la donnée l'est.

## Layout

Colonne unique centrée : `main` 880 px max (marges 24 px, 16 px sous 640 px), fiche plein écran 820 px max. En-tête sticky de 60 px (56 px au téléphone) sur fond de page : logo à gauche, point de synchro 9 px et avatar à droite. Rythme d'espacement en pas de 2 à 4 autour de 8, 12, 16, 18, 24 ; 22 à 28 px entre blocs. Lignes de liste : 12 px de gap, 18 px de marge latérale.

Densité par pointeur : cibles tactiles de 44 px par défaut ; avec `pointer:fine` (souris) l'interface se resserre (boutons 36 px, petits 32, champs de recherche 40, onglets 36, lignes 56, avatar 36).

Responsive : au-dessus de 900 px, onglets en texte simple sur fond transparent, actif = remplissage clair, compteurs masqués. Jusqu'à 900 px, barre d'onglets fixe en bas (58 px, icône + libellé court, actif en texte rouge LAVA, safe-area respectée). Jusqu'à 640 px, fenêtres collées au bas avec poignée de 40 × 5 px, formulaires en une colonne, tags sous le nom.

## Elevation & Depth

Profondeur tonale : page grise, cartes blanches, cernées d'un filet de 1 px (`0 0 0 1px` filet). Pas d'ombre de repos. Les ombres n'existent que pour ce qui flotte ; en sombre elles s'épaississent et la carte graphite porte la hiérarchie.

### Shadow Vocabulary
- **Hairline** (`0 0 0 1px rgba(60,60,67,.14)` ; sombre `rgba(255,255,255,.12)`) : listes groupées, sans ombre.
- **Rest** (`0 1px 2px rgba(0,0,0,.04), 0 0 0 .5px rgba(0,0,0,.04)` ; sombre : aucune) : pastille d'onglet, feuilles document, cartes du journal.
- **Panel** (`0 6px 24px rgba(0,0,0,.08)` ; sombre `.5`) : carte de connexion.
- **Float** (`0 12px 36px rgba(0,0,0,.18)` ; sombre `.7`) : fenêtres, menu du profil, toast. Voile de fond `rgba(0,0,0,.36)` (sombre `.6`).

### Named Rules
**The Flat-Until-Floating Rule.** Aucune ombre au repos sur les listes ; seule la couche flottante (fenêtre, menu, toast) porte une ombre marquée.

## Shapes

Formes arrondies et continues : listes 16 px, fenêtres 22 px, carte de connexion 28 px, lignes de connexion 18 px, menu 18 px, champs de recherche et de formulaire 10 px, lignes de réglage en fenêtre 14 px, contrôles carrés-arrondis 12 px (boutons d'icône, segments extérieurs 10 px, segment intérieur 8 à 9 px), pilule (999 px) pour boutons, onglets, tags, toast ; avatar et boutons de fermeture ronds. Aucune bordure sur les surfaces d'interface : les seuls traits sont le filet de liste, les séparateurs en retrait de 20 px et le bouton d'ajout en pointillé (1,5 px). Icônes à trait uniquement.

## Components

### Buttons
- **Shape:** pilule (999 px), 14 px / 500, 44 px de haut (36 px souris).
- **Primary:** rouge LAVA plein, texte blanc, survol #9a342e, enfoncement `scale(.97)`.
- **Tonal:** lavis rouge LAVA, texte #A23A34. **Gris:** remplissage neutre. **Danger:** lavis rouge vif, texte #b42318.
- **Texte:** lien rouge LAVA sans fond (retour, actions discrètes). Bouton d'ajout : pointillé 1,5 px, survol lavis rouge LAVA.

### Chips et tags
- Tag : 24 px, pilule, 12 px / 500. Neutre (remplissage), accent (lavis rouge LAVA), danger (lavis rouge), **allergène** (ambre, sans bordure).
- Sélecteur d'allergènes : pilule de 44 px (36 px souris) avec case ; actif = fond ambre, filet intérieur 1,5 px.

### Cards / Containers
- Liste groupée blanche 16 px, filet de 1 px, lignes de 68 px (56 px souris) avec chevron gris à droite, séparateur en retrait de 20 px, survol #f5f5f7 (pointeur fin uniquement). Bandeau de section : fond #f5f5f7, 14 px / 600, gris secondaire.

### Inputs / Fields
- Remplis (`rgba(118,118,128,.12)`), sans contour, 48 px (40 px souris), coins 10 px. Focus : fond de carte et anneau rouge LAVA de 2 px. Focus clavier global : contour rouge LAVA 2 px décalé de 2 px.

### Navigation
- Bureau : onglets 14 px, gris secondaire, actif = remplissage clair et encre 600. Sous 900 px : barre du bas sur fond de carte. Segmenté (journal, brut/net) : piste 10-12 px, segment actif blanc en relief léger.

### Fenêtres
- Modale centrée 580 px max, coins 22 px, en-tête 18 px / 600, bouton de fermeture rond de remplissage. Feuille collée au bas sous 640 px. Voile `rgba(0,0,0,.36)`.

### Menu de profil
- Carte 18 px flottante ancrée à l'avatar, lignes de 46 px (40 px souris), action Thème (soleil ou lune), action destructive en rouge.

### Feuille document
- Page blanche, **identique à l'impression A4** (`window.print()` + `@media print`) : c'est la mise en page de toute fiche, de tout onglet présent ou à venir (fiche technique, fiche recette, fiche groupe, menu…).
- En-tête, toujours dans cet ordre : type en petites capitales rouges (`fdoc-sur`, ex. FICHE GROUPE) → nom en capitales 2 rem (`fdoc-nom`) → une ligne d'infos grises séparées par « · » (`fdoc-cles`) → ligne rouge 2 px (`fdoc-sep`).
- Corps : titres de section en petites capitales rouges soulignées (`fdoc-ptitle`), tableaux à en-tête rouge et zébrure rosée (`fdoc-table`), lignes numérotées sur bande rouge (`fdoc-steps`), libellés en petites capitales, étiquettes d'allergènes en pastilles (blanches sur une ligne rosée).
- Papier : marges A4 12/14/13 mm, numéro de page « 1 / 2 » en bas à droite ; fiche technique, groupe et menu sur 1 page, fiche recette sur 2 pages au plus (éléments en 2 colonnes).

## Do's and Don'ts

### Do:
- **Do** utiliser le rouge LAVA (#B5433C) pour l'action, la sélection et le focus, et rien d'autre.
- **Do** garder l'ambre pour les allergènes, le rouge vif pour le danger.
- **Do** définir chaque couleur en clair et en sombre (`:root[data-theme="dark"]`).
- **Do** grouper les lignes dans une liste blanche à filet fin, séparées par un trait en retrait.
- **Do** tenir 44 px pour les cibles tactiles (32 à 36 px admis seulement sous `pointer:fine`).
- **Do** laisser les feuilles `.fdoc*` et `.fr-sr-card` en papier rouge LAVA pour rester fidèles au PDF.

### Don't:
- **Don't** ajouter une bordure pleine ou une ombre de repos autour d'une carte ou d'un champ de l'interface.
- **Don't** utiliser l'ambre ou le rouge LAVA comme décor en dehors de leur rôle.
- **Don't** empiler des boutons dans l'en-tête : logo, point de synchro et avatar seulement.
- **Don't** afficher un titre ou un sous-titre à l'écran de connexion : le logo suffit.

## Non canonisé

Défauts ou dérives portés par le build, pas des règles pour les futures surfaces : (1) du texte sous le plancher de 14 px de PRODUCT.md (tags et pastilles d'allergènes 12 px, méta de ligne 13 px, libellés 13 px, jours du journal 13 px, petit bouton 13 px) ; (2) sous 640 px la couche « affinage » écrase les coins hauts de la feuille (22 px sur les quatre coins) et le titre de page (26 px), alors que le bloc téléphone les visait à 28 px hauts et 30 px ; (3) des règles mortes ou écrasées dans les couches empilées (tailles 34 et 20 px, bordures `.fdoc`) ; (4) des littéraux hex écrits en ligne dans le JS (badges et alertes de menu) et des alias hérités (`--rouge`, `--rose`, `--creme`…) à ne pas réutiliser.
