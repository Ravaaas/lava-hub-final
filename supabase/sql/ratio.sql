-- LAVA Hub Cuisine — onglet Ratio (coûts matière, réservé à l'admin)
-- À coller UNE FOIS dans Supabase > SQL Editor, puis « Run ». Rejouable sans risque (les valeurs déjà modifiées sont gardées).
-- Ne change aucune règle d'accès existante : seules de nouvelles tables sont créées.
--
-- Ni la cuisine ni la salle ne voient les prix ou les coûts : toutes ces tables sont lues ET écrites par l'admin seulement
-- (is_admin()). Les coûts sont dans une table à part parce que yokitup_recettes est lisible par toute l'équipe.
--
--   yokitup_couts   coût matière de chaque recette Yokitup, recalculé par l'Edge Function « yokitup » à chaque lecture
--   ratio_regles    coefficient (4,5), TVA (10 %), perte incluse (5 %) : une seule ligne
--   ratio_menus     prix TTC et budget de chaque temps des menus soir 5 temps, soir 3 temps et midi
--   ratio_carte     prix de vente TTC réel de chaque plat de la carte (plat Yokitup)

create table if not exists public.yokitup_couts (
  recette_id text primary key references public.yokitup_recettes(id) on delete cascade,
  cout numeric(10,4) check (cout is null or cout >= 0),      -- € HT pour une portion ; null = rien de chiffrable
  manquants text[] not null default '{}',                     -- ingrédients sans prix dans Yokitup (coût incomplet)
  lu_le timestamptz not null default now()
);

create table if not exists public.ratio_regles (
  id smallint primary key default 1 check (id = 1),
  coefficient numeric(5,2) not null default 4.5 check (coefficient > 0),
  tva numeric(5,4) not null default 0.10 check (tva >= 0 and tva < 1),
  perte numeric(5,4) not null default 0.05 check (perte >= 0 and perte < 1),
  modifie_par text,
  modifie_le timestamptz not null default now()
);

create table if not exists public.ratio_menus (
  id text primary key,                                        -- soir5, soir3, midi
  nom text not null,
  menu_hub text not null,                                     -- menu du Hub d'où viennent les plats (« 5 temps »)
  version text not null check (version in ('MENU', 'LUNCH')), -- version Yokitup comparée au budget
  prix_ttc numeric(8,2) not null check (prix_ttc > 0),
  temps jsonb not null default '[]'::jsonb check (jsonb_typeof(temps) = 'array'),   -- [{ "nom": "Temps 1", "budget": 1.5 }]
  ordre smallint not null default 0,
  modifie_par text,
  modifie_le timestamptz not null default now()
);

create table if not exists public.ratio_carte (
  plat text primary key,                                      -- plat Yokitup (nom sans « (CARTE) »)
  prix_ttc numeric(8,2) not null check (prix_ttc > 0),
  modifie_par text,
  modifie_le timestamptz not null default now()
);

alter table public.yokitup_couts enable row level security;
alter table public.ratio_regles enable row level security;
alter table public.ratio_menus enable row level security;
alter table public.ratio_carte enable row level security;

-- Personne d'autre que l'admin connecté : aucun droit pour anon, et des politiques admin pour authenticated.
revoke all on public.yokitup_couts, public.ratio_regles, public.ratio_menus, public.ratio_carte from anon;

-- yokitup_couts : lecture admin ; écriture par la fonction seulement (clé service_role, hors RLS).
drop policy if exists yokitup_couts_lecture on public.yokitup_couts;
create policy yokitup_couts_lecture on public.yokitup_couts for select to authenticated using ((select public.is_admin()));

drop policy if exists ratio_regles_admin on public.ratio_regles;
create policy ratio_regles_admin on public.ratio_regles for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists ratio_menus_admin on public.ratio_menus;
create policy ratio_menus_admin on public.ratio_menus for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists ratio_carte_admin on public.ratio_carte;
create policy ratio_carte_admin on public.ratio_carte for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Valeurs de départ : fiche « Budgets matière par menu » (rien n'est écrasé si l'admin les a déjà modifiées).
insert into public.ratio_regles (id) values (1) on conflict (id) do nothing;
insert into public.ratio_menus (id, nom, menu_hub, version, prix_ttc, temps, ordre) values
  ('soir5', 'Menu soir 5 temps', '5 temps', 'MENU', 75,
    '[{"nom":"Temps 1","budget":1.5},{"nom":"Temps 2","budget":4},{"nom":"Temps 3","budget":4},{"nom":"Temps 4","budget":4},{"nom":"Temps 5","budget":1.5}]', 1),
  ('soir3', 'Menu soir 3 temps', '3 temps', 'MENU', 49,
    '[{"nom":"Temps 1","budget":2.5},{"nom":"Temps 2","budget":5.5},{"nom":"Temps 3","budget":1.5}]', 2),
  ('midi', 'Menu midi', 'Lunch', 'LUNCH', 29,
    '[{"nom":"Entrée","budget":1.5},{"nom":"Plat","budget":2.8},{"nom":"Dessert","budget":1.5}]', 3)
on conflict (id) do nothing;
