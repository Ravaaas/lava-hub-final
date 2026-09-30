-- LAVA Hub Cuisine — équipe : un compte par personne (PHASE 1, sans risque)
-- À coller dans Supabase > SQL Editor. Ne change AUCUNE règle d'accès existante :
-- le site actuel continue de fonctionner exactement comme avant.
-- L'accès n'est verrouillé qu'à la PHASE 2 (supabase-equipe-verrou.sql), plus tard.

-- 1. Liste des membres (un compte Supabase Auth par personne : identifiant@lava-hub.local)
create table if not exists public.membres (
  email text primary key check (email = lower(email)),
  prenom text not null,
  role text not null check (role in ('admin', 'salle', 'cuisine')),
  actif boolean not null default true,
  doit_changer_mdp boolean not null default false,
  created_at timestamptz default now()
);
-- Affichage sur l'écran de connexion : nom, poste, équipe (Cuisine ou Salle). Ne change pas les droits (role).
alter table public.membres add column if not exists nom text not null default '';
alter table public.membres add column if not exists poste text not null default '';
alter table public.membres add column if not exists equipe text not null default 'cuisine' check (equipe in ('cuisine', 'salle'));

-- Le propriétaire est toujours membre admin (jamais verrouillé dehors)
insert into public.membres (email, prenom, nom, role, equipe)
values ('alexandre.ravasio@outlook.com', 'Alexandre', 'Ravasio', 'admin', 'cuisine')
on conflict (email) do nothing;

-- 2. Rôle de la personne connectée (null = pas membre, inactif, ou mot de passe temporaire pas encore changé)
create or replace function public.mon_role() returns text
language sql stable security definer set search_path = public as $$
  select case
    when lower(coalesce(auth.jwt() ->> 'email', '')) = 'alexandre.ravasio@outlook.com' then 'admin'
    else (select m.role from public.membres m
          where m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
            and m.actif and not m.doit_changer_mdp)
  end
$$;

-- is_admin() / is_salle() (déjà utilisées par les règles existantes) s'appuient maintenant sur la table
create or replace function public.is_admin() returns boolean
language sql stable as $$ select public.mon_role() = 'admin' $$;
create or replace function public.is_salle() returns boolean
language sql stable as $$ select public.mon_role() = 'salle' $$;

-- 3. Appelée par l'app après le changement de mot de passe : lève le marquage "temporaire"
create or replace function public.mdp_change() returns void
language sql security definer set search_path = public as $$
  update public.membres set doit_changer_mdp = false
  where email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;
revoke execute on function public.mdp_change() from public, anon;
grant execute on function public.mdp_change() to authenticated;

-- 4. Sécurité de la table membres : chacun voit sa ligne, l'admin voit et gère tout
alter table public.membres enable row level security;
drop policy if exists "membre voit sa ligne" on public.membres;
drop policy if exists "admin gere membres"   on public.membres;
create policy "membre voit sa ligne" on public.membres for select
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')) or public.is_admin());
create policy "admin gere membres" on public.membres for all
  using (public.is_admin()) with check (public.is_admin());

-- 5. Liste des profils affichée sur l'écran de connexion (avant d'être connecté) : membres actifs uniquement,
--    et seulement prénom, nom, poste, équipe et identifiant. Ni rôle, ni statut du mot de passe.
create or replace function public.profils_connexion()
returns table (email text, prenom text, nom text, poste text, equipe text)
language sql stable security definer set search_path = public as $$
  select m.email, m.prenom, m.nom, m.poste, m.equipe
  from public.membres m where m.actif order by m.prenom, m.nom
$$;
grant execute on function public.profils_connexion() to anon, authenticated;