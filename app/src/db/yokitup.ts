// Yokitup : copie des recettes (lue par l'Edge Function « yokitup »), liens plat ↔ fiche recette, historique des lectures.
// Le Hub ne parle jamais directement à Yokitup : la clé reste côté serveur, dans la fonction.
import { supabase } from '../lib/supabase';
import type { Element } from '../domain/types';
import type { IngredientYk, RecetteYk } from '../domain/yokitup';
import { ecrireElement } from './fichesRecette';
import { objet, tableau, texte, textes, versJson } from './lecture';
import { prudent, verifier, type Resultat } from './resultat';

function lireIngredient(v: unknown): IngredientYk {
  const o = objet(v);
  return { id: texte(o.id), nom: texte(o.nom), quantite: texte(o.quantite), unite: texte(o.unite), sousRecette: o.sous_recette === true, allergenes: textes(o.allergenes), traces: textes(o.traces) };
}

export interface DonneesYokitup {
  recettes: RecetteYk[];
  /** plat Yokitup → id de la fiche recette */
  liens: Map<string, string>;
  /** Dernière lecture (admin seulement ; null sinon ou si aucune). */
  derniere: { le: string; par: string; recettes: number; ok: boolean; message: string } | null;
}

export async function chargerYokitup(): Promise<DonneesYokitup> {
  const [r, l, s] = await Promise.all([
    supabase.from('yokitup_recettes').select('id,nom,plat,version,etiquettes,ingredients').order('nom'),
    supabase.from('yokitup_liens').select('plat,fiche_recette_id'),
    supabase.from('yokitup_synchros').select('le,par,recettes,ok,message').order('le', { ascending: false }).limit(1),
  ]);
  const d = s.data?.[0];
  return {
    recettes: (r.data ?? []).map(x => ({ id: x.id, nom: x.nom, plat: x.plat, version: texte(x.version), etiquettes: textes(x.etiquettes), ingredients: tableau(x.ingredients).map(lireIngredient) })),
    liens: new Map((l.data ?? []).map(x => [x.plat, x.fiche_recette_id])),
    derniere: d ? { le: d.le, par: d.par ?? '', recettes: d.recettes, ok: d.ok, message: d.message ?? '' } : null,
  };
}

export const relier = (plat: string, ficheRecetteId: string, par: string): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('yokitup_liens').upsert({ plat, fiche_recette_id: ficheRecetteId, relie_par: par, relie_le: new Date().toISOString() }).select('plat')));

export const delier = (plat: string): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('yokitup_liens').delete().eq('plat', plat).select('plat')));

/** Remplace les seuls éléments (grammages) d'une fiche recette : nom, statut et photo ne sont pas touchés. */
export const enregistrerElements = (ficheRecetteId: string, elements: readonly Element[]): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('fiches_recette').update({ sous_recettes: versJson(elements.map(ecrireElement)) }).eq('id', ficheRecetteId).select('id')));

/** Edge Function « yokitup » : relit les recettes dans Yokitup (lecture seule là-bas). */
export async function lireYokitup(): Promise<Resultat & { recettes?: number }> {
  try {
    const res: { data: { ok: boolean; message?: string; recettes?: number } | null; error: unknown } =
      await supabase.functions.invoke<{ ok: boolean; message?: string; recettes?: number }>('yokitup', { body: {} });
    const data = res.data;
    if (res.error || !data) return { ok: false, message: 'La fonction « yokitup » est absente ou en erreur' };
    return data.ok ? { ok: true, recettes: data.recettes ?? 0 } : { ok: false, message: data.message ?? 'Refusé' };
  } catch { return { ok: false, message: 'La fonction « yokitup » est indisponible' }; }
}
