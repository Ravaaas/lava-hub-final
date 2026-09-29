-- LAVA Hub Cuisine — Fiches Groupe + profil Salle
-- À coller UNE FOIS dans Supabase > SQL Editor, APRÈS supabase-securite.sql.
--
-- Avant ou après : créer le compte du responsable de salle dans
-- Supabase > Authentication > Users > Add user > Create new user
--   Email : salle@lava-hub.local   (doit être exactement celui de SALLE_EMAIL dans index.html)
--   Mot de passe : au choix, "Auto Confirm User" coché.

-- 1. Test "responsable de salle" (email présent dans le jeton de connexion)
create or replace function public.is_salle() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'salle@lava-hub.local'
$$;

-- 2. Table des groupes (aucune coordonnée client : nom, effectif, contraintes seulement)
create table if not exists public.groupes (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  date date not null,
  heure text,
  pax integer not null check (pax > 0),
  salle text,
  source text,
  menu_id text,
  menu_nom text,
  allergenes text,
  regimes text,
  notes text,
  created_at timestamptz default now()
);
create index if not exists groupes_date_idx on public.groupes (date);

alter table public.groupes enable row level security;

drop policy if exists "lecture groupes"     on public.groupes;
drop policy if exists "ecriture groupes"    on public.groupes;
drop policy if exists "maj groupes"         on public.groupes;
drop policy if exists "suppression groupes" on public.groupes;

-- Lecture : tout le monde (la cuisine consulte sans connexion). Écriture : admin ou salle.
create policy "lecture groupes"     on public.groupes for select using (true);
create policy "ecriture groupes"    on public.groupes for insert with check (public.is_admin() or public.is_salle());
create policy "maj groupes"         on public.groupes for update using (public.is_admin() or public.is_salle()) with check (public.is_admin() or public.is_salle());
create policy "suppression groupes" on public.groupes for delete using (public.is_admin() or public.is_salle());

-- 3. Le responsable de salle peut aussi alimenter le journal (création/modification/suppression de groupes)
drop policy if exists "ecriture audit" on public.audit_log;
create policy "ecriture audit" on public.audit_log for insert with check (public.is_admin() or public.is_salle());
