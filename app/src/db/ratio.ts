// Onglet Ratio (admin) : coûts Yokitup (yokitup_couts, calculés par la fonction « yokitup »), règles, budgets des menus, prix de la carte.
// Toutes ces tables sont réservées à l'admin par la RLS (supabase/sql/ratio.sql) : pour les autres, elles sont vides.
import { supabase } from '../lib/supabase';
import { BUDGETS_DE_DEPART, REGLES_DE_DEPART, type BudgetMenu, type RecetteRatio, type Regles } from '../domain/ratio';
import { objet, tableau, texte, textes, versJson } from './lecture';
import { prudent, verifier, type Resultat } from './resultat';

export interface DonneesRatio {
  regles: Regles;
  budgets: BudgetMenu[];
  /** plat Yokitup → prix TTC réel saisi */
  prixCarte: Map<string, number>;
  recettes: RecetteRatio[];
  /** plat Yokitup → id de la fiche recette */
  liens: Map<string, string>;
  /** Dernière lecture de Yokitup. */
  derniere: { le: string; ok: boolean; message: string } | null;
  /** Les coûts n'ont encore jamais été lus (table vide ou absente). */
  sansCouts: boolean;
}

const nombre = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function lireBudget(x: { id: string; nom: string; menu_hub: string; version: string; prix_ttc: number; temps: unknown }): BudgetMenu {
  const depart = BUDGETS_DE_DEPART.find(b => b.id === x.id);
  const temps = tableau(x.temps).map(t => ({ nom: texte(objet(t).nom), budget: nombre(objet(t).budget) ?? 0 })).filter(t => t.nom);
  return { id: x.id, nom: x.nom, menuHub: x.menu_hub, version: x.version, prixTtc: nombre(x.prix_ttc) ?? depart?.prixTtc ?? 0, temps: temps.length ? temps : depart?.temps ?? [] };
}

export async function chargerRatio(): Promise<DonneesRatio> {
  const [r, c, rg, m, p, l, s] = await Promise.all([
    supabase.from('yokitup_recettes').select('id,nom,plat,version,etiquettes').order('nom'),
    supabase.from('yokitup_couts').select('recette_id,cout,manquants'),
    supabase.from('ratio_regles').select('coefficient,tva,perte').eq('id', 1).maybeSingle(),
    supabase.from('ratio_menus').select('id,nom,menu_hub,version,prix_ttc,temps,ordre').order('ordre'),
    supabase.from('ratio_carte').select('plat,prix_ttc'),
    supabase.from('yokitup_liens').select('plat,fiche_recette_id'),
    supabase.from('yokitup_synchros').select('le,ok,message').order('le', { ascending: false }).limit(1),
  ]);
  const couts = new Map((c.data ?? []).map(x => [x.recette_id, { cout: nombre(x.cout), manquants: textes(x.manquants) }]));
  const g = rg.data;
  const budgets = (m.data ?? []).map(lireBudget);
  const d = s.data?.[0];
  return {
    regles: g ? { coefficient: nombre(g.coefficient) ?? REGLES_DE_DEPART.coefficient, tva: nombre(g.tva) ?? REGLES_DE_DEPART.tva, perte: nombre(g.perte) ?? REGLES_DE_DEPART.perte } : REGLES_DE_DEPART,
    // tables pas encore créées : les budgets de la fiche servent de départ
    budgets: budgets.length ? budgets : BUDGETS_DE_DEPART.map(b => ({ ...b, temps: b.temps.map(t => ({ ...t })) })),
    prixCarte: new Map((p.data ?? []).flatMap(x => { const v = nombre(x.prix_ttc); return v === null ? [] : [[x.plat, v] as const]; })),
    recettes: (r.data ?? []).map(x => ({ id: x.id, nom: x.nom, plat: x.plat, version: texte(x.version), etiquettes: textes(x.etiquettes),
      cout: couts.get(x.id)?.cout ?? null, manquants: couts.get(x.id)?.manquants ?? [] })),
    liens: new Map((l.data ?? []).map(x => [x.plat, x.fiche_recette_id])),
    derniere: d ? { le: d.le, ok: d.ok, message: d.message ?? '' } : null,
    sansCouts: !(c.data ?? []).length,
  };
}

export const enregistrerBudget = (b: BudgetMenu, ordre: number, par: string): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('ratio_menus').upsert({
    id: b.id, nom: b.nom, menu_hub: b.menuHub, version: b.version, prix_ttc: b.prixTtc, temps: versJson(b.temps), ordre, modifie_par: par, modifie_le: new Date().toISOString(),
  }).select('id')));

export const enregistrerRegles = (r: Regles, par: string): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('ratio_regles').upsert({ id: 1, ...r, modifie_par: par, modifie_le: new Date().toISOString() }).select('id')));

/** Prix TTC réel d'un plat de la carte ; null l'efface. */
export const enregistrerPrixCarte = (plat: string, prix: number | null, par: string): Promise<Resultat> =>
  prudent(async () => verifier(prix === null
    ? await supabase.from('ratio_carte').delete().eq('plat', plat).select('plat')
    : await supabase.from('ratio_carte').upsert({ plat, prix_ttc: prix, modifie_par: par, modifie_le: new Date().toISOString() }).select('plat')));
