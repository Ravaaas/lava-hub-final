-- LAVA Hub Cuisine — sécurité + journal d'audit
-- À coller UNE FOIS dans Supabase > SQL Editor, AVANT de publier la nouvelle version de index.html.
-- Lecture : publique (profil Cuisine sans connexion). Écriture : admin connecté uniquement.

-- 1. Journal d'audit : une ligne par événement (plus de JSON réécrit en entier)
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  ts bigint not null,
  action text not null,
  fiche_nom text,
  profil text,
  detail jsonb
);
create index if not exists audit_log_ts_idx on public.audit_log (ts desc);

-- Reprise de l'ancien journal (une seule fois : seulement si la table est vide)
insert into public.audit_log (ts, action, fiche_nom, profil, detail)
select (e->>'ts')::bigint, coalesce(e->>'action',''), e->>'ficheNom', e->>'profil', e->'detail'
from public.lava_config c, jsonb_array_elements(c.data::jsonb->'entries') e
where c.id = 'audit_log'
  and jsonb_typeof(c.data::jsonb->'entries') = 'array'
  and not exists (select 1 from public.audit_log);

-- 2. Test admin (email présent dans le jeton de connexion, non falsifiable)
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'alexandre.ravasio@outlook.com'
$$;

-- 3. Suppression des anciennes règles (dont les "public write")
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public'
             and tablename in ('fiches', 'fiches_recette', 'lava_config', 'audit_log')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.fiches         enable row level security;
alter table public.fiches_recette enable row level security;
alter table public.lava_config    enable row level security;
alter table public.audit_log      enable row level security;

-- 4. Nouvelles règles
create policy "lecture fiches"          on public.fiches         for select using (true);
create policy "ecriture fiches"         on public.fiches         for insert with check (public.is_admin());
create policy "maj fiches"              on public.fiches         for update using (public.is_admin()) with check (public.is_admin());
create policy "suppression fiches"      on public.fiches         for delete using (public.is_admin());

create policy "lecture fiches_recette"     on public.fiches_recette for select using (true);
create policy "ecriture fiches_recette"    on public.fiches_recette for insert with check (public.is_admin());
create policy "maj fiches_recette"         on public.fiches_recette for update using (public.is_admin()) with check (public.is_admin());
create policy "suppression fiches_recette" on public.fiches_recette for delete using (public.is_admin());

-- lava_config : la config est lisible par tous ; l'ancien journal (id 'audit_log') seulement par l'admin
create policy "lecture config"     on public.lava_config for select using (id <> 'audit_log' or public.is_admin());
create policy "ecriture config"    on public.lava_config for insert with check (public.is_admin());
create policy "maj config"         on public.lava_config for update using (public.is_admin()) with check (public.is_admin());
create policy "suppression config" on public.lava_config for delete using (public.is_admin());

-- audit_log : lisible et écrit par l'admin uniquement
create policy "lecture audit"  on public.audit_log for select using (public.is_admin());
create policy "ecriture audit" on public.audit_log for insert with check (public.is_admin());

-- Ensuite, dans Supabase > Authentication > Providers > Email : désactiver "Allow new users to sign up".
