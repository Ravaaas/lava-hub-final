# LAVA Hub Cuisine

Application interne du restaurant LAVA (Paris 5e) : fiches techniques, fiches recette, menus, groupes, journal, équipe.
**Un seul fichier `index.html`** (HTML + CSS + JS inline, ~3 000 lignes), sans étape de build.
Publiée sur GitHub Pages depuis `main` (https://ravaaas.github.io/lava-hub-final/). Interface **en français**.

## Commandes
- `node tests/static.js` : script valide, ids uniques, `<div>` équilibrés, aucun secret. À lancer avant chaque commit.
- `npm i --no-save puppeteer-core && node tests/parcours.test.js` : **contrat de l'app**, les parcours de l'équipe joués comme un utilisateur (textes visibles, libellés des champs), base Supabase simulée (`tests/mock-supabase.js`, mêmes droits que la RLS ; rien n'est écrit dans la vraie base). `CHROME_PATH` choisit le navigateur, `APP_URL` l'adresse de l'app, `SCREENSHOTS=dossier` sauve des captures, `SEUL=mot` ne joue que certains scénarios. Ne pas s'appuyer sur les fonctions internes : la refonte (branche `refonte`) doit réussir ce test tel quel.
- GitHub Actions (`.github/workflows/verification.yml`) lance les deux à chaque push.
- Pas de serveur local : ouvrir `index.html` suffit (les données viennent de Supabase).

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
