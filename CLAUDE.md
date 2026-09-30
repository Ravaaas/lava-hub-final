# LAVA Hub Cuisine

Application interne du restaurant LAVA (Paris 5e) : fiches techniques, fiches recette, menus, groupes, journal, équipe.
**Version en ligne : un seul fichier `index.html`** (HTML + CSS + JS inline, ~3 300 lignes), sans étape de build.
Publiée sur GitHub Pages depuis `main` (https://ravaaas.github.io/lava-hub-final/). Interface **en français**.

**Refonte en cours (branche `refonte`)** : nouvelle version dans `app/` (React 19 + TypeScript strict + Vite, Supabase inchangé).
Elle remplacera `index.html` à la bascule, quand elle réussira `tests/parcours.test.js` tel quel. Étapes : 1 contrat ✓, 2 squelette ✓,
3 couche données (`app/src/db/`), 4 règles métier testées, 5 écrans un par un, 6 sécurité (CSP), 7 bascule (Pages via Actions depuis `dist/`).

## Commandes
- `npm ci` une fois (installe aussi puppeteer-core pour les tests navigateur).
- `node tests/static.js` : script d'index.html valide, ids uniques, `<div>` équilibrés, et **aucun secret** (chaque clé Supabase trouvée dans index.html et app/ est décodée : seule `anon` est admise). À lancer avant chaque commit.
- `npm run parcours` : **contrat de l'app**, les parcours de l'équipe joués comme un utilisateur (textes visibles, libellés des champs), base Supabase simulée (`tests/mock-supabase.js`, mêmes droits que la RLS ; rien n'est écrit dans la vraie base). `CHROME_PATH` choisit le navigateur, `APP_URL` l'adresse de l'app, `SCREENSHOTS=dossier` sauve des captures, `SEUL=mot` ne joue que certains scénarios. Ne jamais s'appuyer sur les fonctions internes.
- `npm run parcours:nouvelle` : compile app/ et joue le même contrat sur la nouvelle version (servie sur le port 4173).
- `npm run check` : nouvelle version — ESLint (typescript-eslint strict), Vitest, compilation. `npm run dev` pour la développer.
- GitHub Actions (`.github/workflows/verification.yml`) vérifie les deux versions à chaque push.
- TypeScript reste en 6.x : typescript-eslint ne prend pas encore en charge TypeScript 7.

## Nouvelle version (`app/`)
- `src/lib/supabase.ts` : client typé (`src/db/database.types.ts`, écrit à la main d'après la base ; jsonb en `Json`, normalisé par `src/db/`).
- `src/lib/denied.ts` : toute écriture fait `.select()` et passe par `denied` (RLS silencieuse = 0 ligne).
- `src/styles.css` : la feuille de style de index.html, reprise telle quelle (même apparence) ; logo en fichier (`src/assets/logo.avif`).
- React échappe le texte : pas de `escHTML`, jamais de `dangerouslySetInnerHTML` avec des données de la base.

## Architecture de `index.html`
Ordre du script : utilitaires (`escHTML`, `denied`, chargement PDF à la demande) → login (`pickTeam`, `pickProfile`, `checkPW`, `enterApp`, `loginAs`) → équipe (`loadMembres`, `openMembre`, `saveMembre`) → config → journal → chargement (`loadAll`) → fiches techniques → fiches recette → PDF (`buildFicheRecettePDF`, `addFicheToPDF`, `buildMenuPDF`, `buildGroupePDF`) → menus → groupes → glisser-déposer.
État global : `profil` (rôle), `moi` (ligne `membres`), `fiches`, `fichesRecette`, `menus`, `groupes`, `membres`, `cfg`.
Tout texte venant de la base passe par `escHTML`. Les ajouts visibles par l'équipe reçoivent une entrée dans `APP_CHANGELOG`.

## Base Supabase (projet « LAVA HUB », ref `qmvxmxzsmpigvseuidcd`, eu-west-1)
| Table | Notes |
|---|---|
| `fiches` | fiches techniques. `allergenes` est du **jsonb** : chaîne « Gluten, Lactose » OU tableau (les deux existent). `ingredients` jsonb, `ficheId` = lien vers une autre fiche. |
| `fiches_recette` | `allergenes` (texte) est **calculé par la base** ; `sous_recettes` jsonb `[{id,grammage}|{text,grammage}]` ; `photo` base64 (chargée à la demande, `ensurePhoto`) ; `statut` carte/bestof/archive. |
| `lava_config` | `main` = catégories ; `menus` = `{items:[{id,nom,services:[{nom,plats:[{frId}|{text}]}]}]}` (sans prix, voulu). |
| `groupes` | fiche groupe (date, pax, salle, menu, allergies, régimes). |
| `membres` | équipe : `email` (clé), prenom, nom, poste, `equipe` (cuisine/salle), `role` (admin/salle/cuisine), `actif`, `compte_cree`, `doit_changer_mdp`. |
| `audit_log`, `sauvegardes` | journal (une ligne par événement) et sauvegardes nocturnes (sans photos). |
La base est la source de vérité. Les fichiers `supabase-*.sql` sont **déjà appliqués** et rejouables ; ils documentent les migrations (`supabase-equipe`, `-premiere-connexion`, `-automatisation`, `-verrou`).

## Comptes et sécurité
- Un compte Supabase Auth par personne, email `prenom.nom@lava-hub.local` **fabriqué par l'app (jamais saisi ni affiché)**. Écran de connexion : Cuisine/Salle → profil « Prénom NOM » → mot de passe. Classement par hiérarchie des postes (Admin, puis Chef → Apprenti en cuisine, Directeur → Apprenti en salle), puis par nom.
- Première connexion : profil sans compte (`compte_cree=false`) → la personne crée son mot de passe via l'**Edge Function `equipe`** (`supabase/functions/equipe/index.ts`, actions `activer`/`reinitialiser`/`supprimer`, clé `service_role` côté serveur uniquement). **Elle se déploie à la main** dans Supabase > Edge Functions ; après modification du fichier, la recoller.
- RLS : lecture = `mon_role() is not null` (membre actif connecté) ; écriture = `is_admin()` (groupes : admin ou salle). L'email du propriétaire est codé en dur comme admin de secours dans `mon_role()` et l'app. Inscriptions publiques désactivées. `profils_connexion()` est la seule fonction publique (liste des profils).
- La clé `anon` dans `index.html` est publique par conception ; ne jamais y mettre `service_role`.
- Après un `update`/`delete`, **vérifier `denied(res)`** : la RLS ne renvoie pas d'erreur, seulement 0 ligne.

## Automatisations dans la base (ne pas les recoder côté app)
- Déclencheurs : allergènes des fiches recette recalculés depuis les fiches techniques liées — **jamais en baisse si un lien est cassé** (des fiches recette ont des liens vers des fiches supprimées : leurs allergènes enregistrés sont la seule trace) ; retrait des liens quand une fiche est supprimée ; `modifie_par/modifie_le`.
- `pg_cron` : sauvegarde à 3 h (14 gardées), purge du journal > 12 mois. Temps réel activé sur fiches, fiches recette, groupes, config.

## Conventions et pièges
- Noms de fiches techniques en MAJUSCULES. Pas de prix dans les menus. Config = onglets Équipe / Catégories / Sauvegarde.
- Beaucoup de titres sont en `text-transform:uppercase` : comparer les textes **sans tenir compte de la casse** dans les tests.
- L'app doit continuer à fonctionner avant qu'un nouveau SQL soit appliqué (colonnes/tables optionnelles avec repli).
- Le SQL sur la base peut être appliqué via le connecteur Composio Supabase (à reconnecter si besoin), mais le classifieur de permissions refuse parfois les écritures sensibles : dans ce cas, fournir le SQL à coller dans l'éditeur SQL.
- Fichiers en fin de ligne CRLF sous Windows ; git prévient mais c'est normal.
- Ne committer/pousser que sur demande explicite du propriétaire.
