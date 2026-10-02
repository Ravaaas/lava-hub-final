# LAVA Hub Cuisine

Application interne du restaurant LAVA (Paris 5e) : fiches techniques, fiches recette, menus, groupes, journal, équipe. Interface **en français**.
React 19 + TypeScript strict + Vite dans `app/`, données dans Supabase. Chaque push sur `main` est vérifié puis, si tout est vert,
publié sur GitHub Pages (https://ravaaas.github.io/lava-hub-final/) par `.github/workflows/ci.yml`.

## Commandes
- `npm ci` une fois, puis `npm run dev` pour développer : aperçu **déjà connecté en admin, sur la base simulée** (`tests/apercu-demo.mjs`, données fictives remises à zéro à chaque rechargement, rien d'écrit en vrai). `npm run apercu` : aperçu sur la **vraie base, en direct** en **mode test** (`tests/apercu-reel.mjs` : toute écriture reste dans l'onglet du navigateur, jamais envoyée à la base ; les calculs faits par la base, comme les allergènes des fiches recette, ne sont pas refaits ; connecté d'office avec `.env.local` — email et mot de passe, jamais poussé ; `?ecriture` à la fin de l'adresse autorise les enregistrements, alors réels).
- `npm run check` : **tout vérifier avant de committer** (ESLint strict, Vitest, secrets, parcours). `CHROME_PATH` choisit le navigateur.
- `npm run parcours` : **contrat de l'app** (`tests/parcours.test.js`) — les parcours de l'équipe joués comme un utilisateur (textes visibles,
  libellés des champs) sur la version compilée, avec une base Supabase simulée (`tests/mock-supabase.mjs`, mêmes droits que la RLS ; rien n'est
  écrit dans la vraie base). `SEUL=mot` ne joue que certains scénarios, `SCREENSHOTS=dossier` sauve des captures. Ne jamais s'appuyer sur les
  fonctions internes ; toute évolution visible ajoute ou adapte un scénario.
- `npm run secrets` : chaque clé Supabase trouvée dans `app/` et `supabase/` est décodée ; seule la clé publique `anon` est admise.
- TypeScript reste en 6.x : typescript-eslint ne prend pas encore en charge TypeScript 7.

## Code (`app/src/`)
- `domain/` : **règles métier pures, testées** (`domain.test.ts`) : allergènes (2 formats), équipe (identifiant, classement, postes), fiches
  (quantités, diff du journal), fiches recette (statuts, éléments, allergènes), menus (temps fixes, anciens menus rangés par nom, alertes groupe),
  journal, photo (cadrage 16/10), groupes. `misesAJour.ts` : entrées « Mises à jour » du Journal, **une par ajout visible par l'équipe**.
- `db/` : un module par table. Toute lecture passe par `lecture.ts` (valeur inattendue → valeur vide, jamais d'erreur) ; toute écriture fait
  `.select()` et renvoie un `Resultat` vérifié par `denied` (la RLS ne renvoie pas d'erreur, seulement 0 ligne). `database.types.ts` est écrit à la main d'après la base.
- `etat/` : `Session` (connexion, rôle, déconnexion après 30 min) et `Donnees` (listes, rechargement en direct, photos à la demande, `journal()`).
- `ui/` : `Fenetre` (modale role=dialog ; Échap ferme le calque du dessus), `PleinEcran`, `Notifications` (role=status), `Confirmation`, `Puces`, `Icone`, `useReordonner`, `NouvelleVersion` (bandeau « Nouvelle version disponible » : le site publié est relu chaque minute et au retour sur l'onglet, version compilée seulement).
- `screens/` : un dossier par onglet. `pdf/` : export de plusieurs fiches (Config), avec jsPDF chargé à la demande.
- **Règle de mise en page pour tout onglet (actuel ou futur)** : ce qu'on consulte ou imprime s'affiche sur une **feuille `.fdoc`**, même dessin partout : en-tête `fdoc-sur` (type en petites capitales rouges : FICHE TECHNIQUE, MENU…) → `fdoc-nom` (nom en capitales) → `fdoc-cles` (une ligne d'infos grises séparées par « · ») → ligne rouge `fdoc-sep` → sections `fdoc-ptitle` ; lignes numérotées `fdoc-steps` / tableaux `fdoc-table` ; libellés en petites capitales. « Imprimer » = `window.print()` : la règle `@media print` de `styles.css` n'imprime que la feuille, sur A4, resserrée (fiche technique, groupe, menu : 1 page ; fiche recette : 2 pages au plus). Pas de nouveau PDF jsPDF. Vérifier l'écran (ordinateur + téléphone) et le PDF A4 avant de livrer.
- `styles.css` : feuille de style unique ; les écrans réutilisent ses classes. Charte : voir `DESIGN.md`.
- React échappe le texte : jamais de `dangerouslySetInnerHTML`. CSP stricte dans `app/index.html` (aucun script en ligne ; connexions vers Supabase seulement).
- Libellés reliés aux champs (`<label htmlFor>`) : le contrat trouve les champs par leur libellé.

## Base Supabase (projet « LAVA HUB », ref `qmvxmxzsmpigvseuidcd`, eu-west-1)
| Table | Notes |
|---|---|
| `fiches` | fiches techniques. `allergenes` est du **jsonb** : chaîne « Gluten, Lactose » OU tableau (les deux existent). `ingredients` jsonb, `ficheId` = lien vers une autre fiche. |
| `fiches_recette` | `allergenes` (texte) est **calculé par la base** ; `sous_recettes` jsonb `[{id,grammage}|{text,grammage}]` ; `photo` base64 (chargée à la demande) ; `statut` carte/partages/lunch/bestof/archive. |
| `lava_config` | `main` = catégories ; `menus` = `{items:[{id,nom,services:[{nom,plats:[{frId}|{text}]}]}]}` (sans prix, voulu). |
| `groupes` | fiche groupe (date, pax, salle, menu, allergies, régimes). |
| `membres` | équipe : `email` (clé), prenom, nom, poste, `equipe` (cuisine/salle), `role` (admin/salle/cuisine), `actif`, `compte_cree`, `doit_changer_mdp`. |
| `audit_log`, `sauvegardes` | journal (une ligne par événement) et sauvegardes nocturnes (sans photos). |
La base est la source de vérité. Les fichiers `supabase/sql/*.sql` sont **déjà appliqués** et rejouables ; ils documentent les migrations.

## Comptes et sécurité
- Un compte Supabase Auth par personne, email `prenom.nom@lava-hub.local` **fabriqué par l'app (jamais saisi ni affiché)**. Écran de connexion : Cuisine/Salle → profil « Prénom NOM » → mot de passe. Classement par hiérarchie des postes (Admin, puis Chef → Apprenti en cuisine, Directeur → Apprenti en salle), puis par nom.
- Première connexion : profil sans compte (`compte_cree=false`) → la personne crée son mot de passe via l'**Edge Function `equipe`** (`supabase/functions/equipe/index.ts`, actions `activer`/`reinitialiser`/`supprimer`, clé `service_role` côté serveur uniquement). **Elle se déploie à la main** dans Supabase > Edge Functions ; après modification du fichier, la recoller.
- RLS : lecture = `mon_role() is not null` (membre actif connecté) ; écriture = `is_admin()` (groupes : admin ou salle). L'email du propriétaire est codé en dur comme admin de secours dans `mon_role()` et l'app. Inscriptions publiques désactivées. `profils_connexion()` est la seule fonction publique (liste des profils).
- La clé `anon` (`app/src/lib/supabase.ts`) est publique par conception ; ne jamais y mettre `service_role`.

## Automatisations dans la base (ne pas les recoder côté app)
- Déclencheurs : allergènes des fiches recette recalculés depuis les fiches techniques liées — **jamais en baisse si un lien est cassé** (des fiches recette ont des liens vers des fiches supprimées : leurs allergènes enregistrés sont la seule trace) ; retrait des liens quand une fiche est supprimée ; `modifie_par/modifie_le`.
- `pg_cron` : sauvegarde à 3 h (14 gardées), purge du journal > 12 mois. Temps réel activé sur fiches, fiches recette, groupes, config.

## Conventions et pièges
- Noms de fiches techniques en MAJUSCULES. Pas de prix dans les menus. Config = onglets Équipe / Catégories / Sauvegarde.
- Beaucoup de titres sont en `text-transform:uppercase` : comparer les textes **sans tenir compte de la casse** dans les tests.
- Le SQL sur la base peut être appliqué via le connecteur Composio Supabase (à reconnecter si besoin), mais le classifieur de permissions refuse parfois les écritures sensibles : dans ce cas, fournir le SQL à coller dans l'éditeur SQL.
- Fichiers en fin de ligne CRLF sous Windows ; git prévient mais c'est normal.
- Ne committer/pousser que sur demande explicite du propriétaire.
- Retour arrière d'urgence vers l'ancienne version à fichier unique : étiquette git `ancienne-version` (à republier sur Pages depuis cette étiquette ; elle n'a pas les évolutions faites depuis).
