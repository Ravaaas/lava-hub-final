-- Groupes : personnes avec allergies et régimes, une ligne par personne (ou par personnes qui ont exactement les mêmes).
-- Rejouable. Appliqué le 2026-11-22.
--
-- profils = [{nb, allergenes: [...], regimes: [...]}], ex. 1 personne Œuf + Moutarde, à part de 1 personne Œuf seul.
-- Vide = ancien groupe : l'app lit alors les colonnes texte allergenes / regimes (« Gluten (2), Lactose »), une ligne par allergie.
-- Les colonnes texte restent écrites (résumé avec le total de personnes par allergie) pour les versions d'avant et la sauvegarde.

alter table public.groupes add column if not exists profils jsonb not null default '[]'::jsonb;
