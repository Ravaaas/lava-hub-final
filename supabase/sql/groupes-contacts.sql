-- Groupes : montant du règlement, nom du référent, et coordonnées du référent (base de contacts marketing).
-- Rejouable. Appliqué le 2026-11-22.
--
-- groupes.montant  : montant de l'empreinte, de l'acompte ou du règlement (euros, vide = non précisé).
-- groupes.referent : nom de la personne référente, lisible par toute l'équipe (imprimé sur la fiche).
-- groupes_contacts : email et téléphone du référent, lisibles et modifiables par l'admin et la salle seulement
--                    (la cuisine ne les voit pas). Une ligne par groupe ; si le groupe est supprimé, le contact
--                    reste (groupe_id vidé) avec le nom et la date du groupe recopiés : c'est la base marketing.

alter table public.groupes add column if not exists montant numeric(10, 2);
alter table public.groupes add column if not exists referent text not null default '';
alter table public.groupes drop constraint if exists groupes_montant_positif;
alter table public.groupes add constraint groupes_montant_positif check (montant is null or montant >= 0);

create table if not exists public.groupes_contacts (
  id          uuid primary key default gen_random_uuid(),
  groupe_id   uuid unique references public.groupes(id) on delete set null,
  nom         text not null default '',
  email       text not null default '',
  telephone   text not null default '',
  groupe      text not null default '',
  date_groupe date,
  modifie_le  timestamptz not null default now()
);

alter table public.groupes_contacts enable row level security;
drop policy if exists "lecture contacts"     on public.groupes_contacts;
drop policy if exists "ecriture contacts"    on public.groupes_contacts;
drop policy if exists "maj contacts"         on public.groupes_contacts;
drop policy if exists "suppression contacts" on public.groupes_contacts;
create policy "lecture contacts"     on public.groupes_contacts for select using (public.is_admin() or public.is_salle());
create policy "ecriture contacts"    on public.groupes_contacts for insert with check (public.is_admin() or public.is_salle());
create policy "maj contacts"         on public.groupes_contacts for update using (public.is_admin() or public.is_salle()) with check (public.is_admin() or public.is_salle());
create policy "suppression contacts" on public.groupes_contacts for delete using (public.is_admin() or public.is_salle());
revoke all on public.groupes_contacts from anon;
grant select, insert, update, delete on public.groupes_contacts to authenticated;

create or replace function public.trg_contact_modifie() returns trigger language plpgsql as $$
begin new.modifie_le := now(); return new; end $$;
drop trigger if exists modifie on public.groupes_contacts;
create trigger modifie before update on public.groupes_contacts for each row execute function public.trg_contact_modifie();

-- Sauvegarde de nuit : les contacts y sont ajoutés (même fonction que supabase/sql/pertes-perso.sql, une table de plus).
create or replace function public.faire_sauvegarde() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.sauvegardes (contenu) select jsonb_build_object(
    'fiches',             (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from public.fiches f),
    'fiches_recette',     (select coalesce(jsonb_agg(to_jsonb(r) - 'photo'), '[]'::jsonb) from public.fiches_recette r),
    'groupes',            (select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from public.groupes g),
    'groupes_contacts',   (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.groupes_contacts x),
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
