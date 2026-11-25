-- Fiche allergènes des menus : « À réimprimer » et email quand une fiche imprimée n'est plus à jour. Rejouable.
-- À coller dans Supabase > SQL Editor, puis « Run ». Nécessite supabase/sql/pertes-perso.sql (table perso_cron, son jeton).
-- Ne change aucune règle d'accès existante : seules de nouvelles tables et une tâche pg_cron sont créées.
--
--   allergenes_imprimes  dernière fiche allergènes imprimée de chaque menu (une ligne par menu) : la liste plat → allergènes
--                        telle qu'imprimée. Écrite par l'app quand on imprime la fiche ou qu'on la marque comme imprimée
--                        (tout membre connecté : la personne qui imprime solde l'alerte) ; « imprime_par » rempli par la base.
--   allergenes_alertes   mémoire de la fonction « allergenes-menus » (écart vu, depuis quand, déjà prévenu ?) ; illisible depuis l'app.
--   pg_cron              « allergenes-menus » toutes les 15 minutes, même jeton que le récap Pertes & Perso (table perso_cron).
--                        La fonction attend 30 minutes sans nouveau changement avant d'envoyer un email, une seule fois par changement.
-- La clé « anon » ci-dessous est publique par conception.

create extension if not exists pg_net;

create table if not exists public.allergenes_imprimes (
  menu_id     text primary key,                       -- id du menu dans lava_config (ligne « menus »)
  menu_nom    text not null default '',
  -- [{ cle, temps, nom, allergenes: [..], libre? }] : cle = id de la fiche recette, ou « texte:… » pour un plat libre
  lignes      jsonb not null default '[]'::jsonb,
  imprime_le  timestamptz not null default now(),
  imprime_par text not null default ''
);
alter table public.allergenes_imprimes enable row level security;
drop policy if exists allergenes_imprimes_lecture on public.allergenes_imprimes;
create policy allergenes_imprimes_lecture on public.allergenes_imprimes for select to authenticated using (public.mon_role() is not null);
drop policy if exists allergenes_imprimes_ajout on public.allergenes_imprimes;
create policy allergenes_imprimes_ajout on public.allergenes_imprimes for insert to authenticated with check (public.mon_role() is not null);
drop policy if exists allergenes_imprimes_modif on public.allergenes_imprimes;
create policy allergenes_imprimes_modif on public.allergenes_imprimes for update to authenticated using (public.mon_role() is not null) with check (public.mon_role() is not null);
drop policy if exists allergenes_imprimes_suppr on public.allergenes_imprimes;
create policy allergenes_imprimes_suppr on public.allergenes_imprimes for delete to authenticated using (public.is_admin());

-- Qui a imprimé, et quand : rempli par la base (jamais par l'app)
create or replace function public.trg_allergenes_imprimes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.imprime_le := now();
  new.imprime_par := coalesce((select m.prenom from public.membres m where m.email = lower(coalesce(auth.jwt() ->> 'email', ''))), '');
  return new;
end $$;
drop trigger if exists auteur on public.allergenes_imprimes;
create trigger auteur before insert or update on public.allergenes_imprimes for each row execute function public.trg_allergenes_imprimes();

create table if not exists public.allergenes_alertes (
  menu_id    text primary key,
  ecart      text not null,              -- empreinte de l'écart vu (signatureEcart)
  ecart_le   timestamptz not null default now(),   -- depuis quand cet écart n'a plus changé
  prevenu    text,                       -- empreinte de l'écart déjà envoyé par email
  prevenu_le timestamptz
);
alter table public.allergenes_alertes enable row level security;   -- aucune règle : la fonction seule (clé service_role)

-- En direct : une fiche imprimée sur un poste fait disparaître « À réimprimer » sur les autres
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'allergenes_imprimes') then
    alter publication supabase_realtime add table public.allergenes_imprimes;
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'allergenes-menus';
select cron.schedule('allergenes-menus', '*/15 * * * *', $cron$
  select net.http_post(
    url := 'https://qmvxmxzsmpigvseuidcd.supabase.co/functions/v1/allergenes-menus',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtdnhteHpzbXBpZ3ZzZXVpZGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTY1ODYsImV4cCI6MjA5NzI5MjU4Nn0._kDu_tyJbr9Hcckg_dC0OYsSqh23aPND96wMX_KLdAc', 'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtdnhteHpzbXBpZ3ZzZXVpZGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTY1ODYsImV4cCI6MjA5NzI5MjU4Nn0._kDu_tyJbr9Hcckg_dC0OYsSqh23aPND96wMX_KLdAc',
      'x-cron-token', (select jeton from public.perso_cron where id = 1)),
    body := '{"auto": true}'::jsonb,
    timeout_milliseconds := 60000)
$cron$);
