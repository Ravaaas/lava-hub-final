-- LAVA Hub Cuisine — VERROU : plus aucune lecture sans compte actif (à coller dans Supabase > SQL Editor)
--
-- À faire SEULEMENT quand :
--   1. tu t'es connecté sur le site en ligne avec ton profil et tu vois bien tes fiches,
--   2. chaque membre de l'équipe a créé son mot de passe (ou n'est pas encore concerné).
-- Effet : sans être connecté avec un profil actif, l'app ne montre plus ni fiches, ni groupes, ni menus.
-- Un membre passé « inactif » (Config > Équipe) est coupé aussitôt.
-- Pour annuler : voir le bloc « RETOUR ARRIÈRE » en bas.

drop policy if exists "lecture fiches"         on public.fiches;
drop policy if exists "lecture fiches_recette" on public.fiches_recette;
drop policy if exists "lecture config"         on public.lava_config;
drop policy if exists "lecture groupes"        on public.groupes;

create policy "lecture fiches"         on public.fiches         for select using (public.mon_role() is not null);
create policy "lecture fiches_recette" on public.fiches_recette for select using (public.mon_role() is not null);
create policy "lecture config"         on public.lava_config    for select
  using (public.mon_role() is not null and (id <> 'audit_log' or public.is_admin()));
create policy "lecture groupes"        on public.groupes        for select using (public.mon_role() is not null);

-- Les écritures ne changent pas : admin (fiches, config, menus), admin ou salle (groupes).

-- ── RETOUR ARRIÈRE (si besoin, à coller à la place) ─────────────────────────
-- drop policy "lecture fiches" on public.fiches;                 create policy "lecture fiches" on public.fiches for select using (true);
-- drop policy "lecture fiches_recette" on public.fiches_recette; create policy "lecture fiches_recette" on public.fiches_recette for select using (true);
-- drop policy "lecture groupes" on public.groupes;               create policy "lecture groupes" on public.groupes for select using (true);
-- drop policy "lecture config" on public.lava_config;            create policy "lecture config" on public.lava_config for select using (id <> 'audit_log' or public.is_admin());
