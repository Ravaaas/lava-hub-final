-- LAVA Hub Cuisine — lecture des recettes Yokitup (grammages Carte / Menu / Lunch)
-- À coller UNE FOIS dans Supabase > SQL Editor, puis « Run ». Rejouable sans risque.
-- Ne change aucune règle d'accès existante : seules de nouvelles tables sont créées.
--
-- Sens unique : Yokitup → Hub. L'Edge Function « yokitup » LIT Yokitup (jamais d'écriture là-bas) et range une copie
-- des recettes étiquetées RECETTE CARTE / RECETTE MENU / RECETTE LUNCH dans yokitup_recettes. Rien n'est recopié tout
-- seul dans les fiches recette : l'admin relie chaque plat Yokitup à sa fiche, compare, puis décide de reprendre ou non
-- les grammages (Config > Yokitup). Les corrections faites dans l'app ne sont donc jamais écrasées sans un clic.
--
-- Contenu :
--   yokitup_recettes  copie des recettes Yokitup (remplie par la fonction, lecture pour tout membre connecté)
--   yokitup_liens     plat Yokitup (nom sans « (CARTE) ») ↔ fiche recette du Hub (admin)
--   yokitup_synchros  historique des lectures (admin)
--   tâche pg_cron « yokitup-nuit » : lecture chaque nuit à 4 h UTC (jeton de la table perso_cron)

create table if not exists public.yokitup_recettes (
  id text primary key,                         -- identifiant du produit Yokitup
  nom text not null,                           -- « BŒUF/PLEUROTE/JUS CURRY VERT (CARTE) »
  plat text not null,                          -- « BŒUF/PLEUROTE/JUS CURRY VERT »
  version text not null default '',            -- « CARTE », « MENU », « LUNCH »…
  etiquettes text[] not null default '{}',
  -- [{ id, nom, quantite, unite, sous_recette, allergenes: [..], traces: [..] }]
  ingredients jsonb not null default '[]'::jsonb,
  lu_le timestamptz not null default now()
);

create table if not exists public.yokitup_liens (
  plat text primary key,
  fiche_recette_id uuid not null references public.fiches_recette(id) on delete cascade,
  relie_par text,
  relie_le timestamptz not null default now()
);

create table if not exists public.yokitup_synchros (
  id bigint generated always as identity primary key,
  le timestamptz not null default now(),
  par text,
  recettes int not null default 0,
  ok boolean not null default true,
  message text
);

alter table public.yokitup_recettes enable row level security;
alter table public.yokitup_liens enable row level security;
alter table public.yokitup_synchros enable row level security;

-- yokitup_recettes : lecture par tout membre actif (la cuisine voit les grammages Menu) ; écriture par la fonction seulement.
drop policy if exists yokitup_recettes_lecture on public.yokitup_recettes;
create policy yokitup_recettes_lecture on public.yokitup_recettes for select to authenticated using (public.mon_role() is not null);

-- yokitup_liens : lecture par tout membre actif ; écriture par l'admin.
drop policy if exists yokitup_liens_lecture on public.yokitup_liens;
create policy yokitup_liens_lecture on public.yokitup_liens for select to authenticated using (public.mon_role() is not null);
drop policy if exists yokitup_liens_ecriture on public.yokitup_liens;
create policy yokitup_liens_ecriture on public.yokitup_liens for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- yokitup_synchros : lecture par l'admin ; écriture par la fonction seulement.
drop policy if exists yokitup_synchros_lecture on public.yokitup_synchros;
create policy yokitup_synchros_lecture on public.yokitup_synchros for select to authenticated using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- Lecture automatique chaque nuit (4 h UTC). Même jeton que l'envoi du récap Pertes & Perso (table perso_cron,
-- illisible depuis l'app). Sans clé YOKITUP_API_KEY, la fonction répond simplement « clé absente » et ne change rien.
-- La clé « anon » ci-dessous est publique par conception (elle est aussi dans app/src/lib/supabase.ts).
-- ════════════════════════════════════════════════════════════════════════════
select cron.unschedule(jobid) from cron.job where jobname = 'yokitup-nuit';
select cron.schedule('yokitup-nuit', '0 4 * * *', $cron$
  select net.http_post(
    url := 'https://qmvxmxzsmpigvseuidcd.supabase.co/functions/v1/yokitup',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtdnhteHpzbXBpZ3ZzZXVpZGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTY1ODYsImV4cCI6MjA5NzI5MjU4Nn0._kDu_tyJbr9Hcckg_dC0OYsSqh23aPND96wMX_KLdAc', 'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtdnhteHpzbXBpZ3ZzZXVpZGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTY1ODYsImV4cCI6MjA5NzI5MjU4Nn0._kDu_tyJbr9Hcckg_dC0OYsSqh23aPND96wMX_KLdAc',
      'x-cron-token', (select jeton from public.perso_cron where id = 1)),
    body := '{"auto": true}'::jsonb,
    timeout_milliseconds := 60000)
$cron$);
