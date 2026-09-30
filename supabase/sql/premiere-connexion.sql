-- LAVA Hub Cuisine — première connexion : la personne crée elle-même son mot de passe
-- À coller dans Supabase > SQL Editor (rejouable sans risque). Ne change aucune règle d'accès.

-- Un profil est "actif" (compte créé) ou "ouvert" (pas encore de compte : la personne crée son mot de passe à sa première connexion).
alter table public.membres add column if not exists compte_cree boolean not null default false;

-- Les membres qui ont déjà un compte de connexion sont marqués comme actifs
update public.membres m set compte_cree = true
where exists (select 1 from auth.users u where lower(u.email) = m.email);

-- Liste affichée sur l'écran de connexion (avant d'être connecté) : membres actifs, triés par équipe puis nom de famille
drop function if exists public.profils_connexion();
create function public.profils_connexion()
returns table (email text, prenom text, nom text, poste text, equipe text, statut text)
language sql stable security definer set search_path = public as $$
  select m.email, m.prenom, m.nom, m.poste, m.equipe,
    case when m.compte_cree then 'actif' else 'ouvert' end
  from public.membres m where m.actif order by m.equipe, lower(m.nom), lower(m.prenom)
$$;
grant execute on function public.profils_connexion() to anon, authenticated;
