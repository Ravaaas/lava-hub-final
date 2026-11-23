-- Groupes : brouillon (fiche pas encore validée). Rejouable. À appliquer AVANT de publier l'app (elle écrit `statut`).
--
-- statut = 'confirme' (par défaut : tous les groupes existants) ou 'brouillon'.
-- Un brouillon peut n'avoir que le nom et la date : le nombre de personnes peut y être 0 (vide) ; une fiche confirmée en exige au moins 1.

alter table public.groupes add column if not exists statut text not null default 'confirme';
alter table public.groupes drop constraint if exists groupes_statut_valide;
alter table public.groupes add constraint groupes_statut_valide check (statut in ('confirme', 'brouillon'));
alter table public.groupes drop constraint if exists groupes_pax_check;
alter table public.groupes add constraint groupes_pax_check check (pax > 0 or (statut = 'brouillon' and pax = 0));
