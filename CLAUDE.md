# LAVA Hub Cuisine

Application interne du restaurant LAVA (Paris 5e) : fiches techniques, fiches recette, menus, groupes, Pertes & Perso, journal, équipe. Interface **en français**.
React 19 + TypeScript strict + Vite dans `app/`, données dans Supabase. Chaque push sur `main` est vérifié puis, si tout est vert, publié sur GitHub Pages (https://ravaaas.github.io/lava-hub-final/) par `.github/workflows/ci.yml`.

**Détails à lire seulement si la tâche les touche** : `docs/BASE.md` (colonnes de chaque table, groupes, automatisations de la base), `docs/FONCTIONS.md` (Edge Functions, emails, pg_cron, Yokitup, fiche allergènes), `DESIGN.md` (charte).

## Commandes
- `npm ci` une fois, puis `npm run dev` : aperçu **connecté en admin sur une base simulée** (`tests/apercu-demo.mjs`, données fictives, rien d'écrit en vrai).
- `npm run apercu` : **vraie base en mode test** (`tests/apercu-reel.mjs` : écritures gardées dans l'onglet ; calculs de la base non refaits ; connexion via `.env.local`, jamais poussé ; `?ecriture` dans l'adresse = enregistrements réels).
- `npm run check` : **tout vérifier avant de committer** (ESLint strict, Vitest, secrets, parcours). `CHROME_PATH` choisit le navigateur.
- `npm run parcours` : **contrat de l'app** (`tests/parcours.test.js`), parcours joués comme un utilisateur (textes visibles, libellés des champs) sur la version compilée, base simulée `tests/mock-supabase.mjs` (mêmes droits que la RLS). `SEUL=mot` filtre les scénarios, `SCREENSHOTS=dossier` sauve des captures. Jamais de fonctions internes ; **toute évolution visible ajoute ou adapte un scénario**.
- `npm run secrets` : seule la clé publique `anon` est admise dans `app/` et `supabase/`.
- TypeScript reste en 6.x (typescript-eslint ne gère pas encore la 7).

## Code (`app/src/`)
- `domain/` : **règles métier pures, testées** (`domain.test.ts`) : allergènes (2 formats), équipe, fiches, fiches recette (portions Carte/Menu), menus, fiche allergènes (`allergenesMenus.ts`), journal, photo (16/10), groupes, Pertes & Perso, Yokitup (`yokitup.ts`). `misesAJour.ts` : entrées « Mises à jour » du Journal, **une par ajout visible par l'équipe**.
- `db/` : un module par table. Lecture via `lecture.ts` (valeur inattendue → valeur vide, jamais d'erreur) ; écriture avec `.select()` et `Resultat` vérifié par `denied` (la RLS renvoie 0 ligne, pas d'erreur). `database.types.ts` écrit à la main.
- `etat/` : `Session` (connexion, rôle, déconnexion après 30 min), `Donnees` (listes, temps réel, photos à la demande, `journal()`).
- `ui/` : `Fenetre` (modale, Échap ferme le calque du dessus), `PleinEcran`, `Notifications`, `Confirmation`, `Puces`, `Choix` (2 à 5 options côte à côte), `Selecteur` (listes longues ; **aucun `<select>` natif**), `useReordonner`, `NouvelleVersion` (bandeau de mise à jour).
- `screens/` : un dossier par onglet. `pdf/` : export jsPDF de Config (ne pas en créer d'autres).
- **Mise en page de tout onglet** : ce qu'on consulte ou imprime est une **feuille `.fdoc`** : `fdoc-sur` (type en petites capitales rouges) → `fdoc-nom` → `fdoc-cles` (infos grises séparées par « · ») → `fdoc-sep` → sections `fdoc-ptitle`, `fdoc-steps` / `fdoc-table`. « Imprimer » = `window.print()` ; `@media print` n'imprime que la feuille, A4, **4 cm de marge en haut de chaque page**, resserrée : fiche technique, groupe, menu = 1 page ; fiche recette ≤ 2 pages ; fiche allergènes = 1 page A4 paysage. Vérifier écran (ordinateur + téléphone) et PDF A4 avant de livrer.
- `styles.css` : feuille de style unique. Jamais de `dangerouslySetInnerHTML` ; CSP stricte dans `app/index.html`. Libellés reliés aux champs (`<label htmlFor>`).
- Installable comme app (`app/public/manifest.webmanifest`) ; app iPhone de test dans `ios/` (voir `ios/LISEZMOI.md`).

## Base Supabase (projet `qmvxmxzsmpigvseuidcd`) — détail dans `docs/BASE.md`
- Tables : `fiches`, `fiches_recette`, `lava_config` (catégories, menus sans prix), `groupes` + `groupes_contacts`, `membres`, `yokitup_*`, `allergenes_imprimes`/`_alertes`, `audit_log`, `sauvegardes`, `perso_*` + `pertes`.
- Pièges : `fiches.allergenes` est du jsonb **chaîne OU tableau** ; `fiches_recette.allergenes` est **calculé par la base** (déclencheurs, jamais en baisse si un lien est cassé) : ne pas le recoder côté app.
- La base est la source de vérité ; `supabase/sql/*.sql` sont **déjà appliqués** et rejouables.

## Comptes et sécurité
- Un compte Auth par personne, email `prenom.nom@lava-hub.local` **fabriqué par l'app (jamais saisi ni affiché)**. Connexion : Cuisine/Salle → profil → mot de passe ; création du mot de passe par l'Edge Function `equipe`.
- RLS : lecture = membre actif connecté (`mon_role()`) ; écriture = `is_admin()` (groupes : admin ou salle). L'email du propriétaire est admin de secours dans `mon_role()` et l'app. `profils_connexion()` est la seule fonction publique.
- La clé `anon` (`app/src/lib/supabase.ts`) est publique ; **jamais de `service_role`** dans l'app ou le dépôt.
- Edge Functions (`equipe`, `recap-pertes`, `recap-groupes`, `allergenes-menus`, `yokitup`) : **déploiement à la main**, tous leurs fichiers ensemble ; secrets collés par le propriétaire. **Toute évolution de la fiche groupe se répercute dans `supabase/functions/recap-groupes/domaine.ts` et `pdf.ts`** (voir `docs/FONCTIONS.md`).

## Conventions et pièges
- Noms de fiches techniques en MAJUSCULES. Config = Équipe / Catégories / Yokitup / Sauvegarde.
- Titres souvent en `text-transform:uppercase` : comparer les textes **sans la casse** dans les tests.
- SQL : via le connecteur Supabase ; si une écriture sensible est refusée, fournir le SQL à coller dans l'éditeur.
- Fins de ligne CRLF sous Windows : avertissement git normal.
- **Ne committer/pousser que sur demande explicite du propriétaire.**
- Retour arrière d'urgence : étiquette git `ancienne-version` (ancienne app à fichier unique).
