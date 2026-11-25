# Base Supabase — détail des tables

Projet « LAVA HUB », ref `qmvxmxzsmpigvseuidcd`, eu-west-1. La base est la source de vérité. Les fichiers `supabase/sql/*.sql` sont **déjà appliqués** et rejouables ; ils documentent les migrations.

| Table | Notes |
|---|---|
| `fiches` | fiches techniques. `allergenes` est du **jsonb** : chaîne « Gluten, Lactose » OU tableau (les deux existent). `ingredients` jsonb, `ficheId` = lien vers une autre fiche. |
| `fiches_recette` | `allergenes` (texte) est **calculé par la base** ; `sous_recettes` jsonb `[{id,grammage}|{text,grammage}]` (+ `grammage_menu` facultatif : portion Menu quand elle diffère de la Carte ; absent = même grammage) ; `photo` base64 (chargée à la demande) ; `nom_court` (élément principal, écrit sur la fiche allergènes ; `supabase/sql/fiches-recette-nom-court.sql`) ; `statut` carte/partages/lunch/bestof/archive. |
| `lava_config` | `main` = catégories ; `menus` = `{items:[{id,nom,services:[{nom,plats:[{frId}|{text}]}]}]}` (sans prix, voulu). |
| `groupes` | Voir « Groupes » ci-dessous. |
| `groupes_contacts` | email et téléphone du référent, **admin et salle seulement** (lecture comprise ; la cuisine ne les voit pas, jamais imprimés). Une ligne par groupe (`groupe_id` unique, `on delete set null` : le contact survit au groupe, nom et date du groupe recopiés). Base marketing : bouton « Contacts » de l'onglet Groupes, un contact par email (sinon téléphone), export CSV. |
| `membres` | équipe : `email` (clé), prenom, nom, poste, `equipe` (cuisine/salle), `role` (admin/salle/cuisine), `actif`, `compte_cree`, `doit_changer_mdp`. Écran de connexion classé par hiérarchie des postes (Admin, puis Chef → Apprenti en cuisine, Directeur → Apprenti en salle), puis par nom. Inscriptions publiques désactivées. |
| `yokitup_recettes`, `yokitup_liens`, `yokitup_synchros` | **Yokitup → Hub, lecture seule** (`supabase/sql/yokitup.sql`). Copie des recettes Yokitup étiquetées RECETTE CARTE / MENU / LUNCH (`plat` = nom sans « (CARTE) », `version`, `ingredients` jsonb `[{id,nom,quantite,unite,sous_recette,allergenes,traces}]`), **remplie par l'Edge Function `yokitup` seulement** (lecture : tout membre). `yokitup_liens` : plat Yokitup ↔ fiche recette (admin). Rien n'est recopié tout seul : Config > Yokitup compare et l'admin reprend les grammages (seuls les éléments de la fiche sont réécrits). Version MENU de Yokitup → portion Menu de la fiche (`grammage_menu`), CARTE/LUNCH → grammage ; autres versions (MENU ENFANT…) : comparaison seulement. |
| `allergenes_imprimes`, `allergenes_alertes` | Fiche allergènes **unique de la carte** (onglet Menus > « Fiche allergènes » : fiches recette `carte`, `partages`, `lunch`) : `allergenes_imprimes` = dernière fiche imprimée, une ligne de clé `menu_id = 'carte'` (`lignes` jsonb `[{cle,temps,nom,allergenes}]`, `imprime_le`/`imprime_par` remplis par la base), écrite par **tout membre** quand il imprime la fiche ou la note « imprimée » ; écart avec la carte actuelle = pastille « À réimprimer ». Jamais imprimée depuis le Hub = pas surveillée. `allergenes_alertes` : mémoire de la fonction `allergenes-menus` (illisible depuis l'app). `supabase/sql/allergenes-menus.sql`. |
| `audit_log`, `sauvegardes` | journal (une ligne par événement) et sauvegardes nocturnes (sans photos). |
| `perso_produits`, `perso_saisies`, `perso_commentaires`, `perso_validations`, `pertes`, `perso_recaps` | onglet **Pertes & Perso** (cuisine + admin ; remplace l'app Google Apps Script). Saisie = clé `(date, produit_cle)`, une ligne par produit et par jour ; journée validée = verrouillée sauf admin ; auteur (`saisi_par`, `nom`, `valide_par`) **rempli par la base** ; pertes jamais verrouillées, supprimables par leur auteur ou l'admin. `supabase/sql/pertes-perso.sql`. |

## Groupes (`groupes`)
Fiche groupe : date, pax, salle, menu, allergies, régimes.
- `niveaux` jsonb `[{nom, plats:[{frId|text, qte, remplace?}]}]` : niveaux du menu du groupe (copiés du menu choisi puis modifiables) et nombre de chaque plat commandé. Vide = anciens groupes (menu choisi ou `plats_sur_mesure`). `supabase/sql/groupes-niveaux.sql`.
  - `pour` = id des lignes de `profils` servies avec ce plat (écrites en face du plat sur la fiche ; `profils[].id` donné à chaque ligne).
  - `remplace` = clé (frId ou texte) du plat du même niveau qu'il remplace pour les allergiques (conflit « adapté » dans l'encadré).
  - La fiche n'affiche que les plats avec un nombre dès qu'un nombre est saisi dans le niveau (`platsCommandes`).
- `profils` jsonb `[{nb, allergenes, regimes}]` : une ligne par personne (ou personnes identiques) ; `allergenes` peut contenir des allergies libres (hors des 13, ex. « Kiwi »), cherchées dans le nom, les éléments et les ingrédients des fiches du plat (`alertesMenu`). Vide = ancien groupe, lu depuis les colonnes texte `allergenes`/`regimes` (« Gluten (2) »), toujours réécrites avec le résumé. `supabase/sql/groupes-profils.sql`.
- `reglement` (aucun/empreinte/acompte/regle) et `boissons` (texte libre) : `supabase/sql/groupes-reglement-boissons.sql`.
- `statut` (confirme/brouillon ; brouillon = nom et date seuls exigés, pax peut y être 0, ne réserve pas la salle, bandeau imprimé) : `supabase/sql/groupes-brouillon.sql`.
- `montant` (euros, vide si rien reçu) et `referent` (nom, imprimé) : `supabase/sql/groupes-contacts.sql`.

## Automatisations dans la base (ne pas les recoder côté app)
- Déclencheurs : allergènes des fiches recette recalculés depuis les fiches techniques liées — **jamais en baisse si un lien est cassé** (des fiches recette ont des liens vers des fiches supprimées : leurs allergènes enregistrés sont la seule trace) ; retrait des liens quand une fiche est supprimée ; `modifie_par/modifie_le`.
- `pg_cron` : sauvegarde à 3 h (14 gardées), purge du journal > 12 mois, récaps Pertes & Perso et Groupes le lundi à 7 h UTC, lecture Yokitup chaque nuit à 4 h UTC (`pg_net`), alerte allergènes des menus toutes les 15 min.
- Temps réel activé sur fiches, fiches recette, groupes, config, fiches allergènes imprimées.

## Installer l'app (gratuit, sans App Store)
`app/public/manifest.webmanifest` + icônes `icone-180/192/512.png` (logo LAVA noir sur #F5F5F7). Mac : Safari > Fichier > Ajouter au Dock (ou Chrome > Installer) ; iPhone/iPad : Safari > Partager > Sur l'écran d'accueil. App iPhone de test (Xcode, compte Apple gratuit, 7 jours) : `ios/` (`LavaApp.swift` = le site dans une vue web, captures et enregistrements d'écran masqués ; marche à suivre dans `ios/LISEZMOI.md`).

## Retour arrière d'urgence
Étiquette git `ancienne-version` : ancienne version à fichier unique, à republier sur Pages depuis cette étiquette ; elle n'a pas les évolutions faites depuis.
