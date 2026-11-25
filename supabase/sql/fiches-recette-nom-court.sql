-- Nom court d'une fiche recette (élément principal du plat : BŒUF, BROCAMOLE…), écrit sur la fiche allergènes de la carte.
-- Vide = premier élément du nom (avant la virgule). Modifiable dans le formulaire de la fiche recette (admin, comme le reste de la fiche).
alter table public.fiches_recette add column if not exists nom_court text;
comment on column public.fiches_recette.nom_court is 'Nom court (élément principal du plat), écrit sur la fiche allergènes ; vide = premier élément du nom';
