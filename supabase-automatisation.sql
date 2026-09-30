-- LAVA Hub Cuisine — automatisations dans la base (rejouable sans risque)
-- À coller UNE FOIS dans Supabase > SQL Editor, puis « Run ».
-- Contenu : allergènes toujours à jour, ménage des liens, « modifié par », sauvegardes automatiques,
--           mise à jour en direct, purge du journal. Ne change aucune règle d'accès.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. ALLERGÈNES TOUJOURS À JOUR
--    Les allergènes d'une fiche recette = ceux de ses fiches techniques liées.
--    SÉCURITÉ : si un lien est cassé (fiche technique supprimée), la liste ne peut QUE grandir, jamais
--    diminuer : on ne perd pas l'information d'allergène d'un ancien élément.
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.allerg_liste(a jsonb) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct t) filter (where t <> ''), '{}'::text[])
  from (select trim(x) as t from unnest(case jsonb_typeof(a)
          when 'array'  then array(select jsonb_array_elements_text(a))
          when 'string' then string_to_array(a #>> '{}', ',')
          else '{}'::text[] end) x) s
$$;

create or replace function public.fr_allergenes(sous jsonb, stocke text) returns text
language sql stable set search_path = public as $$
  with liens as (
    select case jsonb_typeof(e) when 'string' then e #>> '{}' else e ->> 'id' end as fid
    from jsonb_array_elements(coalesce(sous, '[]'::jsonb)) e
  ),
  ids as (select fid from liens where fid is not null),
  calc as (select distinct unnest(public.allerg_liste(f.allergenes)) as a
           from public.fiches f where f.id::text in (select fid from ids)),
  orphelin as (select exists (select 1 from ids where fid not in (select id::text from public.fiches)) as o),
  ancien as (select unnest(public.allerg_liste(to_jsonb(coalesce(stocke, '')))) as a)
  select coalesce(string_agg(a, ', ' order by a), '')
  from (select a from calc union select a from ancien where (select o from orphelin)) r
$$;

-- À l'enregistrement d'une fiche recette : recalcul automatique
create or replace function public.trg_fr_allergenes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.allergenes := public.fr_allergenes(new.sous_recettes, new.allergenes);
  return new;
end $$;
drop trigger if exists fr_allergenes_calc on public.fiches_recette;
create trigger fr_allergenes_calc before insert or update of sous_recettes on public.fiches_recette
  for each row execute function public.trg_fr_allergenes();

-- ════════════════════════════════════════════════════════════════════════════
-- 2. FICHE TECHNIQUE MODIFIÉE OU SUPPRIMÉE : les fiches recette suivent
--    - allergènes modifiés  -> les fiches recette qui l'utilisent sont recalculées
--    - fiche supprimée      -> le lien est retiré partout (comme le fait l'app aujourd'hui, mais côté base)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.trg_fiche_apres() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    update public.fiches_recette fr
       set allergenes = public.fr_allergenes(fr.sous_recettes, fr.allergenes)
     where fr.allergenes is distinct from public.fr_allergenes(fr.sous_recettes, fr.allergenes)
       and exists (select 1 from jsonb_array_elements(coalesce(fr.sous_recettes, '[]'::jsonb)) e
                   where (case jsonb_typeof(e) when 'string' then e #>> '{}' else e ->> 'id' end) = new.id::text);
    return new;
  else
    update public.fiches x
       set ingredients = (select coalesce(jsonb_agg(case when i ->> 'ficheId' = old.id::text then i - 'ficheId' else i end), '[]'::jsonb)
                          from jsonb_array_elements(x.ingredients) i)
     where jsonb_typeof(x.ingredients) = 'array'
       and exists (select 1 from jsonb_array_elements(x.ingredients) i where i ->> 'ficheId' = old.id::text);
    update public.fiches_recette fr
       set sous_recettes = (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(fr.sous_recettes) e
                            where (case jsonb_typeof(e) when 'string' then e #>> '{}' else e ->> 'id' end) is distinct from old.id::text)
     where jsonb_typeof(fr.sous_recettes) = 'array'
       and exists (select 1 from jsonb_array_elements(fr.sous_recettes) e
                   where (case jsonb_typeof(e) when 'string' then e #>> '{}' else e ->> 'id' end) = old.id::text);
    return old;
  end if;
end $$;
drop trigger if exists fiche_maj   on public.fiches;
drop trigger if exists fiche_suppr on public.fiches;
create trigger fiche_maj after update of allergenes on public.fiches
  for each row when (old.allergenes is distinct from new.allergenes) execute function public.trg_fiche_apres();
create trigger fiche_suppr after delete on public.fiches
  for each row execute function public.trg_fiche_apres();

-- Correction unique des données existantes (aujourd'hui : « Mollusques » devient « Mollusque » sur BLACK CEVICHE)
update public.fiches_recette set allergenes = public.fr_allergenes(sous_recettes, allergenes)
 where allergenes is distinct from public.fr_allergenes(sous_recettes, allergenes);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. « MODIFIÉ PAR … LE … » rempli par la base (les recalculs automatiques ci-dessus ne comptent pas)
-- ════════════════════════════════════════════════════════════════════════════
alter table public.fiches         add column if not exists modifie_par text, add column if not exists modifie_le timestamptz;
alter table public.fiches_recette add column if not exists modifie_par text, add column if not exists modifie_le timestamptz;
alter table public.groupes        add column if not exists modifie_par text, add column if not exists modifie_le timestamptz;

create or replace function public.trg_modifie() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() <= 1 then
    new.modifie_le := now();
    new.modifie_par := coalesce(
      (select m.prenom from public.membres m where m.email = lower(coalesce(auth.jwt() ->> 'email', ''))),
      new.modifie_par);
  end if;
  return new;
end $$;
drop trigger if exists modifie on public.fiches;
drop trigger if exists modifie on public.fiches_recette;
drop trigger if exists modifie on public.groupes;
create trigger modifie before insert or update on public.fiches         for each row execute function public.trg_modifie();
create trigger modifie before insert or update on public.fiches_recette for each row execute function public.trg_modifie();
create trigger modifie before insert or update on public.groupes        for each row execute function public.trg_modifie();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. SAUVEGARDES AUTOMATIQUES (chaque nuit à 3 h, les 14 dernières gardées)
--    Contenu : fiches, fiches recette (sans les photos, trop lourdes), groupes, config/menus, membres.
--    Lisibles et téléchargeables par l'admin dans Config > Sauvegarde.
-- ════════════════════════════════════════════════════════════════════════════
create extension if not exists pg_cron;

create table if not exists public.sauvegardes (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  contenu jsonb not null
);
alter table public.sauvegardes enable row level security;
drop policy if exists "admin lit sauvegardes" on public.sauvegardes;
create policy "admin lit sauvegardes" on public.sauvegardes for select using (public.is_admin());

create or replace function public.faire_sauvegarde() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.sauvegardes (contenu) select jsonb_build_object(
    'fiches',         (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from public.fiches f),
    'fiches_recette', (select coalesce(jsonb_agg(to_jsonb(r) - 'photo'), '[]'::jsonb) from public.fiches_recette r),
    'groupes',        (select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from public.groupes g),
    'config',         (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.lava_config c where c.id <> 'audit_log'),
    'membres',        (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.membres m));
  delete from public.sauvegardes where id not in (select id from public.sauvegardes order by cree_le desc limit 14);
end $$;
revoke execute on function public.faire_sauvegarde() from public, anon, authenticated;

-- Bouton « Sauvegarder maintenant » de l'app (réservé à l'admin)
create or replace function public.sauvegarder_maintenant() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé à l''administrateur'; end if;
  perform public.faire_sauvegarde();
end $$;
revoke execute on function public.sauvegarder_maintenant() from public, anon;
grant execute on function public.sauvegarder_maintenant() to authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('sauvegarde-nuit', 'purge-journal');
select cron.schedule('sauvegarde-nuit', '0 3 * * *', 'select public.faire_sauvegarde()');
-- Le journal de plus d'un an est purgé chaque dimanche à 4 h
select cron.schedule('purge-journal', '0 4 * * 0',
  $$delete from public.audit_log where ts < (extract(epoch from now() - interval '12 months') * 1000)::bigint$$);

select public.faire_sauvegarde();   -- première sauvegarde tout de suite

-- ════════════════════════════════════════════════════════════════════════════
-- 5. MISE À JOUR EN DIRECT : la salle enregistre un groupe, la cuisine le voit sans recharger
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['fiches', 'fiches_recette', 'groupes', 'lava_config'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. DURCISSEMENT : fonctions de rôle avec chemin de recherche fixé
-- ════════════════════════════════════════════════════════════════════════════
alter function public.is_admin() set search_path = public;
alter function public.is_salle() set search_path = public;
