-- Groupes : où en est le paiement, et boissons précommandées (texte libre).
-- reglement : 'aucun' (rien reçu), 'empreinte' (empreinte bancaire), 'acompte' (acompte versé), 'regle' (réglé en totalité).
-- À coller dans l'éditeur SQL de Supabase AVANT de mettre l'app en ligne. Rejouable sans risque.
alter table public.groupes add column if not exists reglement text not null default 'aucun';
alter table public.groupes add column if not exists boissons text not null default '';
alter table public.groupes drop constraint if exists groupes_reglement_valide;
alter table public.groupes add constraint groupes_reglement_valide check (reglement in ('aucun', 'empreinte', 'acompte', 'regle'));
