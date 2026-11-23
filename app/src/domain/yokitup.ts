// Recettes Yokitup (copie lue par l'Edge Function « yokitup ») : regroupement Carte / Menu / Lunch, rapprochement avec
// les fiches recette du Hub et comparaison des grammages. Règles pures : rien n'est écrit ici.
import type { Element, Fiche, FicheRecette } from './types';
import { elementsResolus } from './fichesRecette';

export interface IngredientYk {
  id: string;
  nom: string;
  quantite: string;
  unite: string;
  sousRecette: boolean;
  allergenes: string[];
  traces: string[];
}
export interface RecetteYk {
  id: string;
  nom: string;
  /** Nom sans la version : « BŒUF/PLEUROTE/JUS CURRY VERT ». */
  plat: string;
  /** « CARTE », « MENU », « LUNCH »… (vide si le nom n'en indique pas). */
  version: string;
  etiquettes: string[];
  ingredients: IngredientYk[];
}
/** Un plat Yokitup et ses versions (Carte, Menu, Lunch…). */
export interface PlatYk { plat: string; versions: RecetteYk[] }

const ORDRE = ['CARTE', 'MENU', 'LUNCH'];
const rang = (v: string) => { const i = ORDRE.indexOf(v); return i < 0 ? ORDRE.length : i; };

/** « CARTE » → « Carte », « MENU ENFANT » → « Menu enfant », vide → « Recette ». */
export const libelleVersion = (v: string): string => (v ? v.charAt(0) + v.slice(1).toLowerCase() : 'Recette');

export function platsYokitup(recettes: readonly RecetteYk[]): PlatYk[] {
  const m = new Map<string, RecetteYk[]>();
  for (const r of recettes) m.set(r.plat, [...(m.get(r.plat) ?? []), r]);
  return [...m].map(([plat, versions]) => ({ plat, versions: versions.sort((a, b) => rang(a.version) - rang(b.version) || a.version.localeCompare(b.version)) }))
    .sort((a, b) => a.plat.localeCompare(b.plat, 'fr'));
}

// ── Rapprochement par nom : sans accents ni casse, abréviations courantes, mots vides ignorés ──
const SYNONYMES: readonly [RegExp, string][] = [
  [/\bYUZUKOSHO\b/g, 'YUZU KOSHO'], [/\bST JACK\b/g, 'SAINT JACQUES'], [/\bST\b/g, 'SAINT'],
  [/\bCACHUETE\b/g, 'CACAHUETE'], [/\bHAUT DE CUISSE\b/g, 'VOLAILLE HAUT CUISSE'], [/\bFLATBREAD\b/g, 'FLATBREAD PAIN SOUFFLE'],
];
const VIDES = new Set(['DE', 'DU', 'LA', 'LE', 'LES', 'AU', 'AUX', 'ET', 'D', 'L', 'DES', 'EN', 'A', 'SV', 'BBQ']);
export function normaliser(s: string): string {
  const base = s.toUpperCase().replace(/Œ/g, 'OE').replace(/Æ/g, 'AE').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return SYNONYMES.reduce((x, [re, r]) => x.replace(re, r), base);
}
const racine = (t: string) => (t.length > 3 ? t.replace(/[SX]$/, '') : t);
const mots = (s: string) => new Set(normaliser(s).split(' ').filter(t => t && !VIDES.has(t)).map(racine));

/** Ressemblance de deux noms, de 0 à 1 (1 = même nom une fois normalisé). */
export function ressemblance(a: string, b: string): number {
  if (normaliser(a) === normaliser(b)) return 1;
  const A = mots(a), B = mots(b);
  if (!A.size || !B.size) return 0;
  let c = 0;
  for (const t of A) if (B.has(t)) c++;
  return (c / Math.min(A.size, B.size)) * (0.5 + (0.5 * c) / Math.max(A.size, B.size));
}

function meilleur<T>(nom: string, liste: readonly T[], nomDe: (x: T) => string): { x: T | null; s: number } {
  let x: T | null = null, best = 0;
  for (const e of liste) { const v = ressemblance(nom, nomDe(e)); if (v > best) { best = v; x = e; } }
  return { x, s: best };
}

/** Version de référence d'un plat pour une fiche : Lunch pour une fiche Lunch, sinon Carte, sinon la première. */
export function versionDeReference(p: PlatYk, fr?: Pick<FicheRecette, 'statut'>): RecetteYk {
  const v = (n: string) => p.versions.find(r => r.version === n);
  const r = (fr?.statut === 'lunch' ? v('LUNCH') : undefined) ?? v('CARTE') ?? v('LUNCH') ?? p.versions[0];
  if (!r) throw new Error('plat Yokitup sans recette');
  return r;
}

/** Part des éléments de la fiche retrouvés dans la recette Yokitup. */
function partCommune(fr: FicheRecette, r: RecetteYk, fiches: readonly Fiche[]): number {
  const el = elementsResolus(fr, fiches);
  if (!el.length) return 0;
  return el.filter(e => r.ingredients.some(i => ressemblance(e.nom, i.nom) >= 0.5)).length / el.length;
}

export interface Proposition { plat: string; fiche: FicheRecette; confiance: number }

/** Propose une fiche recette par plat Yokitup encore non relié (une fiche ne sert qu'une fois) : nom + éléments en commun.
 *  Les plats et fiches déjà reliés ne sont pas reproposés. Archives exclues. */
export function proposerLiens(plats: readonly PlatYk[], frs: readonly FicheRecette[], fiches: readonly Fiche[], liens: ReadonlyMap<string, string>): Proposition[] {
  const prises = new Set(liens.values());
  const candidates = frs.filter(f => f.statut !== 'archive' && !prises.has(f.id));
  const paires: Proposition[] = [];
  for (const p of plats) {
    if (liens.has(p.plat)) continue;
    const r = versionDeReference(p);
    for (const fr of candidates) {
      const confiance = 0.5 * ressemblance(p.plat, fr.nom) + 0.5 * partCommune(fr, r, fiches);
      if (confiance >= 0.3) paires.push({ plat: p.plat, fiche: fr, confiance });
    }
  }
  paires.sort((a, b) => b.confiance - a.confiance);
  const out: Proposition[] = [], platsPris = new Set<string>(), frsPrises = new Set<string>();
  for (const x of paires) {
    if (platsPris.has(x.plat) || frsPrises.has(x.fiche.id)) continue;
    out.push(x); platsPris.add(x.plat); frsPrises.add(x.fiche.id);
  }
  return out;
}

// ── Grammages ──
/** Ingrédient Yokitup au format des grammages du Hub : « 90 g » → « 90G », « 3 pièce » → « 3PCE ». */
export function grammageYk(i: Pick<IngredientYk, 'quantite' | 'unite'>): string {
  const q = String(Number(i.quantite.replace(',', '.')) || i.quantite).replace('.', ',');
  const u = i.unite.toLowerCase();
  return q + (u.startsWith('pi') ? 'PCE' : u.toUpperCase());
}

type Quantite = { v: number; u: 'G' | 'PCE' };
function quantite(g: string): Quantite | null {
  const m = g.toUpperCase().replace(',', '.').match(/([\d.]+)\s*(KG|GR|G|ML|CL|L|PCE|PIECES?|PIÈCES?|P)?/);
  if (!m || !m[1] || Number.isNaN(Number(m[1]))) return null;
  let v = Number(m[1]);
  const u = m[2] ?? 'G';
  if (u === 'KG' || u === 'L') v *= 1000;
  if (u === 'CL') v *= 10;
  return { v, u: u.startsWith('P') ? 'PCE' : 'G' };
}

export type EtatLigne = 'identique' | 'different' | 'unites' | 'vide' | 'absent';
export interface LigneComparaison {
  /** Position de l'élément dans la fiche (null : ingrédient présent seulement dans Yokitup). */
  index: number | null;
  nom: string;
  grammageHub: string;
  ingredient: IngredientYk | null;
  etat: EtatLigne | 'seulementYokitup' | 'assaisonnement';
  /** Rapprochement sur un nom seulement proche (à vérifier). */
  approx: boolean;
}

/** Compare les éléments d'une fiche aux ingrédients d'une recette Yokitup. Chaque ingrédient Yokitup sert au plus une fois. */
export function comparer(fr: FicheRecette, r: RecetteYk, fiches: readonly Fiche[]): LigneComparaison[] {
  const el = fr.elements.map((e, index) => ({ e, index, nom: nomElement(e, fiches) })).filter(x => x.nom);
  const pris = new Set<IngredientYk>();
  const assoc = new Map<number, { i: IngredientYk; approx: boolean }>();
  for (const passe of [{ seuil: 0.5, approx: false }, { seuil: 0.25, approx: true }]) {
    for (const x of el) {
      if (assoc.has(x.index)) continue;
      const { x: i, s } = meilleur(x.nom, r.ingredients.filter(i => !pris.has(i)), i => i.nom);
      if (i && s >= passe.seuil) { assoc.set(x.index, { i, approx: passe.approx }); pris.add(i); }
    }
  }
  const lignes: LigneComparaison[] = el.map(x => {
    const a = assoc.get(x.index);
    const ligne = { index: x.index, nom: x.nom, grammageHub: x.e.grammage, ingredient: a?.i ?? null, approx: a?.approx ?? false };
    if (!a) return { ...ligne, etat: 'absent' as const };
    const h = quantite(x.e.grammage), y = quantite(`${a.i.quantite}${a.i.unite}`);
    if (!h) return { ...ligne, etat: 'vide' as const };
    if (!y || h.u !== y.u) return { ...ligne, etat: 'unites' as const };
    return { ...ligne, etat: Math.abs(h.v - y.v) < 0.01 ? 'identique' as const : 'different' as const };
  });
  for (const i of r.ingredients) if (!pris.has(i)) {
    lignes.push({ index: null, nom: i.nom, grammageHub: '', ingredient: i, approx: false, etat: /^(SEL|POIVRE)\b/.test(normaliser(i.nom)) ? 'assaisonnement' : 'seulementYokitup' });
  }
  return lignes;
}

const nomElement = (e: Element, fiches: readonly Fiche[]): string =>
  e.type === 'fiche' ? fiches.find(f => f.id === e.id)?.nom ?? '' : e.texte.trim();

/** Nombre d'écarts à regarder (grammages différents, éléments absents d'un côté, unités incompatibles, grammage vide). */
export const nbEcarts = (lignes: readonly LigneComparaison[]): number =>
  lignes.filter(l => l.etat !== 'identique' && l.etat !== 'assaisonnement').length;

/** Lignes dont le grammage peut être repris : élément retrouvé sous un nom sûr (pas seulement proche), quantité différente ou vide. */
export const lignesAReprendre = (lignes: readonly LigneComparaison[]): LigneComparaison[] =>
  lignes.filter(l => l.index !== null && l.ingredient && !l.approx && (l.etat === 'different' || l.etat === 'vide'));

/** Grammages de la fiche remplacés par ceux de Yokitup, pour les seuls éléments retrouvés sûrement dont la quantité diffère ou manque.
 *  N'ajoute ni ne retire aucun élément, et ne reprend jamais un rapprochement sur un nom seulement proche. */
export function reprendreGrammages(fr: FicheRecette, lignes: readonly LigneComparaison[]): Element[] {
  const nouveaux = new Map<number, string>();
  for (const l of lignesAReprendre(lignes)) if (l.index !== null && l.ingredient) nouveaux.set(l.index, grammageYk(l.ingredient));
  return fr.elements.map((e, k) => { const g = nouveaux.get(k); return g === undefined ? e : { ...e, grammage: g }; });
}

/** Grammages d'une version Yokitup pour chaque élément de la fiche (affichage Carte | Menu sur la fiche). */
export function grammagesVersion(fr: FicheRecette, r: RecetteYk, fiches: readonly Fiche[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const l of comparer(fr, r, fiches)) if (l.index !== null && l.ingredient && !l.approx) m.set(l.index, grammageYk(l.ingredient));
  return m;
}
