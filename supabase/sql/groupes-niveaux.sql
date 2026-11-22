-- Groupes : niveaux du menu (Entrée, Plat, Dessert…) avec le nombre de chaque plat commandé à l'avance.
-- Forme : [{"nom": "Entrée", "plats": [{"frId": "<id fiche recette>", "qte": 10} | {"text": "plat libre", "qte": null}]}], dans l'ordre.
-- Copiés du menu choisi puis modifiables pour le groupe seul ; vide = groupe enregistré avant (l'app reprend alors le menu choisi,
-- ou les anciens plats_sur_mesure). plats_sur_mesure reste écrit (liste plate) pour les groupes sur mesure.
-- À coller dans l'éditeur SQL de Supabase AVANT de mettre l'app en ligne. Rejouable sans risque.
alter table public.groupes add column if not exists niveaux jsonb not null default '[]'::jsonb;
