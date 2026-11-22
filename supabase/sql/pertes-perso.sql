-- LAVA Hub Cuisine — onglet « Pertes & Perso » (remplace l'app Google Apps Script « LAVA - PERTES & PERSO »)
-- À coller UNE FOIS dans Supabase > SQL Editor, puis « Run ». Rejouable sans risque.
-- Ne change aucune règle d'accès existante : seules de nouvelles tables sont créées.
--
-- Contenu :
--   perso_produits      liste des produits du repas du personnel (gérée par l'admin)
--   perso_saisies       quantité utilisée par produit et par jour (une ligne par produit et par jour, toute l'équipe cuisine)
--   perso_commentaires  un commentaire par personne et par jour
--   perso_validations   journées validées par l'admin (saisie verrouillée pour l'équipe)
--   pertes              pertes diverses (jamais verrouillées ; chacun supprime les siennes, l'admin toutes)
--   perso_recaps        récaps hebdomadaires déjà envoyés par email (rempli par la fonction « recap-pertes »)
-- Droits : lecture et saisie = cuisine + admin ; validation et liste des produits = admin. Le nom de la personne
-- est rempli par la base (jamais par le navigateur).

-- ════════════════════════════════════════════════════════════════════════════
-- 1. OUTILS
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.jour_paris() returns date
language sql stable set search_path = public as $$ select (now() at time zone 'Europe/Paris')::date $$;

create or replace function public.est_cuisine() returns boolean
language sql stable set search_path = public as $$ select public.mon_role() in ('admin', 'cuisine') $$;

create or replace function public.email_connecte() returns text
language sql stable set search_path = public as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. TABLES
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.perso_produits (
  cle text primary key,
  nom text not null,
  unite text not null default 'kg' check (unite in ('kg', 'L', 'pièce')),
  categorie text not null default 'Autres',
  actif boolean not null default true,
  cree_le timestamptz not null default now()
);

create table if not exists public.perso_saisies (
  date date not null,
  produit_cle text not null references public.perso_produits (cle) on update cascade,
  quantite numeric not null check (quantite >= 0 and quantite < 1000),
  saisi_par text not null default '',
  saisi_email text not null default '',
  modifie_le timestamptz not null default now(),
  primary key (date, produit_cle)
);

create table if not exists public.perso_commentaires (
  date date not null,
  email text not null default '',
  nom text not null default '',
  texte text not null check (char_length(texte) between 1 and 1000),
  modifie_le timestamptz not null default now(),
  primary key (date, email)
);

create table if not exists public.perso_validations (
  date date primary key,
  valide_le timestamptz not null default now(),
  valide_par text not null default ''
);

create table if not exists public.pertes (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  produit text not null check (char_length(produit) between 1 and 80),
  quantite numeric not null check (quantite > 0 and quantite < 10000),
  unite text not null check (unite in ('kg', 'L', 'pièce', 'portion')),
  raison text not null check (raison in ('DLC dépassée', 'Non conforme', 'Abîmé / cassé', 'Erreur de préparation', 'Retour client', 'Autre')),
  precision text not null default '' check (char_length(precision) <= 300),
  saisi_par text not null default '',
  saisi_email text not null default '',
  cree_le timestamptz not null default now(),
  check (raison <> 'Autre' or precision <> '')
);
create index if not exists pertes_date on public.pertes (date);

create table if not exists public.perso_recaps (
  semaine date primary key,          -- lundi de la semaine
  envoye_le timestamptz not null default now(),
  destinataire text not null default ''
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. AUTEUR REMPLI PAR LA BASE (le navigateur ne peut pas signer au nom d'un autre)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.trg_perso_auteur() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  e text := public.email_connecte();
  p text := coalesce((select m.prenom from public.membres m where m.email = public.email_connecte()), 'Admin');
begin
  if e = '' then return new; end if;   -- import ou fonction serveur : on garde les valeurs fournies
  if tg_table_name in ('perso_saisies', 'pertes') then
    new.saisi_email := e; new.saisi_par := p;
  elsif tg_table_name = 'perso_commentaires' then
    new.email := e; new.nom := p;
  elsif tg_table_name = 'perso_validations' then
    new.valide_par := p;
  end if;
  if tg_table_name in ('perso_saisies', 'perso_commentaires') then new.modifie_le := now(); end if;
  return new;
end $$;

drop trigger if exists auteur on public.perso_saisies;
drop trigger if exists auteur on public.perso_commentaires;
drop trigger if exists auteur on public.perso_validations;
drop trigger if exists auteur on public.pertes;
create trigger auteur before insert or update on public.perso_saisies      for each row execute function public.trg_perso_auteur();
create trigger auteur before insert or update on public.perso_commentaires for each row execute function public.trg_perso_auteur();
create trigger auteur before insert or update on public.perso_validations  for each row execute function public.trg_perso_auteur();
create trigger auteur before insert or update on public.pertes             for each row execute function public.trg_perso_auteur();

create or replace function public.journee_validee(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perso_validations v where v.date = d)
$$;
-- Le déclencheur n'est jamais appelé directement ; journee_validee sert aux règles d'accès (membres connectés).
revoke execute on function public.trg_perso_auteur() from public, anon, authenticated;
revoke execute on function public.journee_validee(date) from public, anon;
grant execute on function public.journee_validee(date) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. DROITS (RLS)
-- ════════════════════════════════════════════════════════════════════════════
alter table public.perso_produits     enable row level security;
alter table public.perso_saisies      enable row level security;
alter table public.perso_commentaires enable row level security;
alter table public.perso_validations  enable row level security;
alter table public.pertes             enable row level security;
alter table public.perso_recaps       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['perso_produits', 'perso_saisies', 'perso_commentaires', 'perso_validations', 'pertes'] loop
    execute format('drop policy if exists "cuisine lit" on public.%I', t);
    execute format('create policy "cuisine lit" on public.%I for select using (public.est_cuisine())', t);
  end loop;
end $$;

drop policy if exists "admin gere produits" on public.perso_produits;
create policy "admin gere produits" on public.perso_produits for all using (public.is_admin()) with check (public.is_admin());

-- Quantités : toute la cuisine, jamais un jour futur ; journée validée = admin seulement
drop policy if exists "cuisine saisit" on public.perso_saisies;
create policy "cuisine saisit" on public.perso_saisies for all
  using (public.est_cuisine() and (public.is_admin() or not public.journee_validee(date)))
  with check (public.est_cuisine() and date <= public.jour_paris() and (public.is_admin() or not public.journee_validee(date)));

-- Commentaires : chacun le sien ; journée validée = admin seulement
drop policy if exists "chacun son commentaire" on public.perso_commentaires;
create policy "chacun son commentaire" on public.perso_commentaires for all
  using (public.is_admin() or (public.est_cuisine() and email = public.email_connecte() and not public.journee_validee(date)))
  with check (public.est_cuisine() and date <= public.jour_paris() and (public.is_admin() or (email = public.email_connecte() and not public.journee_validee(date))));

drop policy if exists "admin valide" on public.perso_validations;
create policy "admin valide" on public.perso_validations for all using (public.is_admin()) with check (public.is_admin() and date <= public.jour_paris());

-- Pertes : jamais verrouillées ; chacun supprime les siennes, l'admin toutes
drop policy if exists "cuisine declare" on public.pertes;
drop policy if exists "auteur ou admin supprime" on public.pertes;
create policy "cuisine declare" on public.pertes for insert
  with check (public.est_cuisine() and date <= public.jour_paris() and saisi_email = public.email_connecte());
create policy "auteur ou admin supprime" on public.pertes for delete
  using (public.is_admin() or (public.est_cuisine() and saisi_email = public.email_connecte()));

drop policy if exists "admin lit recaps" on public.perso_recaps;
create policy "admin lit recaps" on public.perso_recaps for select using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 5. PRODUITS DE DÉPART (ceux du script ; ceux du Google Sheet les remplacent lors de l'import)
-- ════════════════════════════════════════════════════════════════════════════
insert into public.perso_produits (cle, nom, unite, categorie) values
  ('cuisse_de_poulet', 'CUISSE DE POULET', 'kg', 'Viandes'), ('haut_de_cuisse_de_poulet', 'HAUT DE CUISSE DE POULET', 'kg', 'Viandes'),
  ('filet_de_poulet', 'FILET DE POULET', 'kg', 'Viandes'), ('supreme_de_poulet', 'SUPREME DE POULET', 'kg', 'Viandes'),
  ('poulet_fermier', 'POULET FERMIER', 'kg', 'Viandes'), ('saute_de_dinde', 'SAUTÉ DE DINDE', 'kg', 'Viandes'),
  ('saute_de_porc', 'SAUTÉ DE PORC', 'kg', 'Viandes'), ('saute_de_porc_sous_vide', 'SAUTÉ DE PORC SOUS VIDE', 'kg', 'Viandes'),
  ('echine_de_cochon', 'ÉCHINE DE COCHON', 'kg', 'Viandes'), ('viande_hachee', 'VIANDE HACHÉE', 'kg', 'Viandes'),
  ('steak_hache', 'STEAK HACHÉ', 'kg', 'Viandes'), ('cordon_bleue', 'CORDON BLEUE', 'kg', 'Viandes'),
  ('demi_jambon_cuit', 'DEMI JAMBON CUIT', 'kg', 'Viandes'), ('saucisse_de_toulouse', 'SAUCISSE DE TOULOUSE', 'kg', 'Viandes'),
  ('saucisse_de_francfort', 'SAUCISSE DE FRANCFORT', 'kg', 'Viandes'), ('merguez', 'MERGUEZ', 'kg', 'Viandes'),
  ('chipolata', 'CHIPOLATA', 'kg', 'Charcuterie'), ('mini_chorizo_piquant_a_cuire', 'MINI CHORIZO PIQUANT A CUIRE', 'kg', 'Charcuterie'),
  ('comte', 'COMTÉ', 'kg', 'Fromages & crèmerie'), ('emmental_rape', 'EMMENTAL RÂPÉ', 'kg', 'Fromages & crèmerie'),
  ('cheddar_rape', 'CHEDDAR RÂPÉ', 'kg', 'Fromages & crèmerie'), ('parmesan_en_poudre', 'PARMESAN EN POUDRE', 'kg', 'Fromages & crèmerie'),
  ('philadelphia', 'PHILADELPHIA', 'kg', 'Fromages & crèmerie'), ('yaourt_fruit', 'YAOURT FRUIT', 'kg', 'Fromages & crèmerie'),
  ('beurre', 'BEURRE', 'kg', 'Fromages & crèmerie'), ('creme', 'CRÈME', 'L', 'Fromages & crèmerie'), ('lait', 'LAIT', 'L', 'Fromages & crèmerie'),
  ('spaghetti', 'SPAGHETTI', 'kg', 'Épicerie'), ('penne', 'PENNE', 'kg', 'Épicerie'), ('farfalle', 'FARFALLE', 'kg', 'Épicerie'),
  ('coquillette', 'COQUILLETTE', 'kg', 'Épicerie'), ('riz_basmati', 'RIZ BASMATI', 'kg', 'Épicerie'), ('coulis_de_tomate', 'COULIS DE TOMATE', 'kg', 'Épicerie'),
  ('carotte', 'CAROTTE', 'kg', 'Légumes'), ('courgette', 'COURGETTE', 'kg', 'Légumes'), ('concombre', 'CONCOMBRE', 'kg', 'Légumes'),
  ('chou_fleur', 'CHOU-FLEUR', 'kg', 'Légumes'), ('brocoli', 'BROCOLI', 'kg', 'Légumes'), ('pomme_de_terre', 'POMME DE TERRE', 'kg', 'Légumes')
on conflict (cle) do nothing;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. MISE À JOUR EN DIRECT (deux cuisiniers sur deux téléphones voient les mêmes chiffres)
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['perso_produits', 'perso_saisies', 'perso_commentaires', 'perso_validations', 'pertes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. SAUVEGARDE DE NUIT : les nouvelles tables y sont ajoutées (même fonction, mêmes horaires)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.faire_sauvegarde() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.sauvegardes (contenu) select jsonb_build_object(
    'fiches',             (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from public.fiches f),
    'fiches_recette',     (select coalesce(jsonb_agg(to_jsonb(r) - 'photo'), '[]'::jsonb) from public.fiches_recette r),
    'groupes',            (select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from public.groupes g),
    'config',             (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.lava_config c where c.id <> 'audit_log'),
    'membres',            (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.membres m),
    'perso_produits',     (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.perso_produits x),
    'perso_saisies',      (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.perso_saisies x),
    'perso_commentaires', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.perso_commentaires x),
    'perso_validations',  (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.perso_validations x),
    'pertes',             (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.pertes x));
  delete from public.sauvegardes where id not in (select id from public.sauvegardes order by cree_le desc limit 14);
end $$;
revoke execute on function public.faire_sauvegarde() from public, anon, authenticated;
