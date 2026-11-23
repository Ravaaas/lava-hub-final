-- Fiches des groupes de la semaine envoyées par email chaque lundi (Edge Function « recap-groupes »). Rejouable.
--
-- groupes_recaps : une ligne par semaine déjà envoyée (clé = lundi), pour ne pas renvoyer deux fois ; illisible depuis l'app.
-- pg_cron : chaque lundi à 7 h UTC (8 h l'hiver, 9 h l'été à Paris), même jeton que le récap Pertes & Perso (table perso_cron,
--           supabase/sql/pertes-perso.sql, qui doit être appliqué avant). La clé « anon » ci-dessous est publique par conception.
-- La fonction n'envoie que les groupes validés (pas les brouillons) de la semaine en cours, lundi → dimanche, et rien s'il n'y en a aucun.

create extension if not exists pg_net;

create table if not exists public.groupes_recaps (
  semaine      date primary key,
  envoye_le    timestamptz not null default now(),
  destinataire text not null default '',
  nb           integer not null default 0
);
alter table public.groupes_recaps enable row level security;   -- aucune règle : personne ne le lit depuis l'app

select cron.unschedule(jobid) from cron.job where jobname = 'recap-groupes-lundi';
select cron.schedule('recap-groupes-lundi', '0 7 * * 1', $cron$
  select net.http_post(
    url := 'https://qmvxmxzsmpigvseuidcd.supabase.co/functions/v1/recap-groupes',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtdnhteHpzbXBpZ3ZzZXVpZGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTY1ODYsImV4cCI6MjA5NzI5MjU4Nn0._kDu_tyJbr9Hcckg_dC0OYsSqh23aPND96wMX_KLdAc', 'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtdnhteHpzbXBpZ3ZzZXVpZGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTY1ODYsImV4cCI6MjA5NzI5MjU4Nn0._kDu_tyJbr9Hcckg_dC0OYsSqh23aPND96wMX_KLdAc',
      'x-cron-token', (select jeton from public.perso_cron where id = 1)),
    body := '{"auto": true}'::jsonb,
    timeout_milliseconds := 60000)
$cron$);
