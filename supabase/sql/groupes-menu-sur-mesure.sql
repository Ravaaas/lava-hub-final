-- Groupes : plats d'un menu sur mesure (quand aucun menu n'est choisi).
-- Même forme que les plats des menus : [{"frId": "<id fiche recette>"} | {"text": "plat libre"}], dans l'ordre.
-- À coller dans l'éditeur SQL de Supabase AVANT de mettre l'app en ligne. Rejouable sans risque.
alter table public.groupes add column if not exists plats_sur_mesure jsonb not null default '[]'::jsonb;
