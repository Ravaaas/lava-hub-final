import type { Fiche, Ingredient } from './types';
import { joindre } from './allergenes';

export const UNITES = ['g', 'kg', 'botte', 'pièce', 'pm'] as const;
export const TYPES_CONDITIONNEMENT = ['Sac sous vide', 'Siphon', 'Petite boite', 'Moyenne boite', 'Grande boite', 'Poche à pâtisserie', 'Pipette', 'Petit gilac', 'Gilac moyen', 'Grand gilac', 'Boudin', 'Sceau', 'Paco'] as const;

/** Quantité × nombre de portions, au format français (« 1,5 »). Une quantité non numérique reste telle quelle. */
export function quantitePour(v: string, coef: number): string {
  const n = parseFloat(v.replace(',', '.')) * coef;
  if (Number.isNaN(n)) return v;
  const r = Number.isInteger(n) ? n : Math.round(n * 100) / 100;
  return String(r).replace('.', ',');
}

/** Cellule « quantité » d'un ingrédient. mode net : la quantité nette quand elle existe. */
export function quantiteAffichee(i: Ingredient, coef: number, mode: 'brut' | 'net'): string {
  if (i.unite === 'pm') return 'pm';
  const q = mode === 'net' && i.brut && i.quantite_net ? i.quantite_net : i.quantite;
  return q ? `${quantitePour(q, coef)} ${i.unite}` : '—';
}

export const aDesQuantitesNettes = (f: Fiche): boolean => f.ingredients.some(i => i.brut && i.quantite_net);

/** Une ligne de conditionnement : « Sac sous vide — 850 g » ↔ { type, quantite }. */
export function lireConditionnement(ligne: string): { type: string; quantite: string } {
  const type = TYPES_CONDITIONNEMENT.find(t => ligne.startsWith(t));
  if (!type) return { type: '', quantite: ligne };
  return { type, quantite: ligne.slice(type.length).replace(/^\s*—\s*/, '').trim() };
}
export const ecrireConditionnement = (type: string, quantite: string): string => type + (quantite ? ` — ${quantite}` : '');

/** Fiches qui utilisent `id` comme ingrédient. */
export const fichesUtilisant = (fiches: readonly Fiche[], id: string): Fiche[] =>
  fiches.filter(f => f.id !== id && f.ingredients.some(i => i.ficheId === id));

/** Détail des changements d'une fiche, pour le journal (« CRÈME : 400 g → 500 g »). */
export function diffFiche(avant: Fiche, apres: Omit<Fiche, 'id'>): string[] {
  const c: string[] = [];
  const champ = (libelle: string, a: string, b: string) => { if (a !== b) c.push(`${libelle} : ${a || '—'} → ${b || '—'}`); };
  champ('Nom', avant.nom, apres.nom);
  champ('Catégorie', avant.categorie, apres.categorie);
  champ('Quantité nette', avant.quantite_nette, apres.quantite_nette);
  champ('Allergènes', joindre(avant.allergenes), joindre(apres.allergenes));
  const cle = (i: Ingredient) => i.nom.normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  const qte = (i: Ingredient) => `${i.quantite} ${i.unite}`.trim();
  const anciens = new Map(avant.ingredients.map(i => [cle(i), i]));
  const nouveaux = new Map(apres.ingredients.map(i => [cle(i), i]));
  for (const [k, n] of nouveaux) {
    const a = anciens.get(k);
    if (!a) c.push(`+ ${n.nom}`);
    else if (qte(a) !== qte(n)) c.push(`${n.nom} : ${qte(a) || '—'} → ${qte(n) || '—'}`);
  }
  for (const [k, a] of anciens) if (!nouveaux.has(k)) c.push(`− ${a.nom}`);
  if (JSON.stringify(avant.process) !== JSON.stringify(apres.process)) {
    c.push(avant.process.length !== apres.process.length ? `Process : ${avant.process.length} → ${apres.process.length} étape(s)` : 'Process modifié');
  }
  return c;
}
