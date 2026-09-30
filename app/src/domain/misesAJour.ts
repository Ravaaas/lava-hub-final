// Mises à jour de l'application affichées dans le Journal (la plus récente en premier).
// Chaque ajout visible par l'équipe reçoit une entrée ici.
export const MISES_A_JOUR: readonly { date: string; titre: string; desc: string }[] = [
  {
    date: "2026-09-30",
    titre: "Nouvelle version de l'application",
    desc: "L'application a été entièrement reconstruite sur des bases modernes et plus solides, avec le même fonctionnement et la même apparence. Chaque parcours de l'équipe est vérifié automatiquement avant toute mise en ligne."
  },
  {
    date: "2026-09-30",
    titre: "Onglet Partages",
    desc: "Les fiches recette ont un nouvel onglet Partages, à côté de Carte du soir et Lunch. La Carte du soir du menu se compose désormais de Partages, Plat et Dessert."
  },
  {
    date: "2026-09-30",
    titre: "Photos des fiches recette mieux cadrées",
    desc: "Toutes les photos sont enregistrées au même format (16/10). À l'ajout, on glisse la photo pour choisir le cadrage. Les anciennes photos s'affichent en entier, sans être coupées."
  },
  {
    date: "2026-09-30",
    titre: "Nouveau design",
    desc: "Interface entièrement refaite façon application : grands titres, cartes arrondies sans traits, en-tête réduit à une pastille de profil (mot de passe, thème et déconnexion s'y trouvent), navigation en barre du bas sur tablette et téléphone, et mode sombre (menu du profil, ou selon le réglage de l'appareil). Les allergènes ressortent sur chaque ligne, les textes sont plus grands et les boutons plus faciles à toucher."
  },
  {
    date: "2026-09-30",
    titre: "Un compte par personne",
    desc: "On choisit Cuisine ou Salle, puis son profil (nom, poste), puis on entre son mot de passe. À sa première connexion, la personne crée elle-même son mot de passe. L'admin gère l'équipe dans Config (rôle, accès actif ou coupé). Le bouton « Mot de passe » permet de le changer, la session se ferme après 30 minutes d'inactivité, et le journal indique qui a fait chaque modification."
  },
  {
    date: "2026-09-30",
    titre: "Menus et Fiches Groupe",
    desc: "Nouvel onglet Menus (Lunch, Carte du soir, 3 temps, 5 temps) : chaque plat est décrit par ses éléments et ses allergènes. Nouvel onglet Groupes : le responsable de salle saisit un groupe (date, personnes, menu, allergies, régimes) et la cuisine voit une fiche imprimable avec une alerte si un plat contient une allergie déclarée. Nouveau profil Salle."
  },
  {
    date: "2026-09-29",
    titre: "Sauvegarde complète en JSON",
    desc: "Dans Config, un bouton télécharge toutes les fiches techniques, fiches recette (photos comprises) et la configuration. L'export PDF garde son propre bouton."
  },
  {
    date: "2026-09-29",
    titre: "Sécurité renforcée",
    desc: "Seul l'admin connecté peut désormais créer, modifier ou supprimer des fiches. Le journal est stocké ligne par ligne. Les erreurs de suppression ou d'enregistrement sont maintenant affichées au lieu d'un faux succès."
  },
  {
    date: "2026-09-29",
    titre: "Chargement plus rapide, photos allégées",
    desc: "Les photos sont réduites à l'ajout (et un bouton dans Config allège les anciennes). Les fiches se chargent plus vite et les PDF ne sont préparés qu'à la demande."
  },
  {
    date: "2026-09-29",
    titre: "Confort d'utilisation",
    desc: "Échap ferme les fenêtres, la navigation au clavier fonctionne sur les cartes et les allergènes, les données se rafraîchissent au retour sur l'onglet, la session admin est conservée, et supprimer une fiche prévient si elle est utilisée dans une fiche recette."
  },
  {
    date: "2026-07-28",
    titre: "Allergènes élargis à 13",
    desc: "La liste fixe d'allergènes passe de 7 à 13 pour couvrir tous ceux réellement utilisés dans les fiches (ajout de Poisson, Soja, Céleri, Moutarde, Sésame, Sulfites)."
  },
  {
    date: "2026-07-28",
    titre: "Fiche Technique : nom toujours en majuscules",
    desc: "Le nom d'une fiche technique est automatiquement mis en majuscules à la saisie et à l'enregistrement, pour une cohérence d'affichage partout dans l'app."
  },
  {
    date: "2026-07-28",
    titre: "Journal : précision des modifications",
    desc: "Chaque modification de fiche affiche désormais le détail des changements (diff), une couleur selon le type d'action (création, modification, suppression), et les modifications rapprochées sont regroupées."
  },
  {
    date: "2026-07-28",
    titre: "Journal : mise en page épurée",
    desc: "Les événements sont présentés en lignes plates, regroupées par jour, avec un filtre par type."
  },
  {
    date: "2026-07-28",
    titre: "Nouvel onglet Journal",
    desc: "Un onglet Journal (réservé aux admins) liste les mises à jour de l'application et les modifications de fiches, dans l'ordre chronologique."
  },
  {
    date: "2026-07-24",
    titre: "Navigation au clavier dans les fiches techniques",
    desc: "Dans le détail d'une fiche technique, les flèches gauche/droite du clavier permettent de passer directement à la fiche précédente ou suivante."
  },
  {
    date: "2026-07-24",
    titre: "PDF Fiche Recette : mise en page nettoyée",
    desc: "Les cartes de recette (bandeau, pastilles d'allergènes, étapes de process) sont réalignées et les espaces vides inutiles ont été supprimés."
  },
  {
    date: "2026-07-24",
    titre: "Allergènes normalisés",
    desc: "Seuls 7 allergènes sont désormais disponibles (Gluten, Crustacé, Œuf, Arachide, Fruit à coque, Lactose, Mollusque), sélectionnables en un clic. Ils s'affichent en sous-titre et par recette liée, uniquement sur la Fiche Recette."
  },
  {
    date: "2026-07-23",
    titre: "\"Éléments\" à la place de \"Recettes (N)\"",
    desc: "Le titre de la liste des composants d'une Fiche Recette est simplifié, sans le compteur entre parenthèses."
  },
  {
    date: "2026-07-23",
    titre: "Ordre de dressage et éléments libres",
    desc: "Chaque recette liée dans une Fiche Recette est numérotée selon l'ordre de dressage, et on peut ajouter un élément libre (sans fiche technique liée, ex: une garniture simple)."
  },
  {
    date: "2026-07-23",
    titre: "PDF Fiche Recette en grille 2 colonnes",
    desc: "Le PDF tient toujours en 2 pages maximum, avec une mise en page en 2 colonnes propre et sans chevauchement."
  }
];
