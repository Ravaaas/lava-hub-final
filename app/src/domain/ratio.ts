// Onglet Ratio (admin) : coût matière des plats, lu dans Yokitup, comparé aux budgets de la fiche « Budgets matière par menu ».
// Règles pures, sans accès à la base.
//   - prix HT = prix TTC ÷ (1 + TVA) ; plafond matière d'un menu = prix HT ÷ coefficient (4,5) ;
//   - perte de 5 % incluse : ce qu'on peut mettre dans l'assiette pour un temps = budget × 0,95 (« après perte ») ;
//   - un plat de menu est comparé (coût de sa version MENU, LUNCH pour le midi) au budget après perte de son temps ;
//   - un plat de la carte : prix TTC conseillé = coût de sa version CARTE × coefficient × (1 + TVA), arrondi au demi-euro supérieur.
// Pastilles : vert = sous 90 % du plafond, ambre = entre 90 % et le plafond, rouge = au-dessus.
import type { FicheRecette, Menu } from './types';
import { servicesAffiches } from './menus';
import { compareFr } from './texte';

export interface Regles {
  /** Prix de vente HT ÷ coût matière, au moins (4,5). */
  coefficient: number;
  /** TVA de la restauration (0,10). */
  tva: number;
  /** Perte incluse dans les budgets (0,05). */
  perte: number;
}
export const REGLES_DE_DEPART: Regles = { coefficient: 4.5, tva: 0.1, perte: 0.05 };

export interface TempsBudget { nom: string; budget: number }
export interface BudgetMenu {
  /** « soir5 », « soir3 », « midi ». */
  id: string;
  nom: string;
  /** Nom du menu du Hub d'où viennent les plats de chaque temps (« 5 temps », « 3 temps », « Lunch »). */
  menuHub: string;
  /** Version Yokitup comparée au budget : MENU le soir, LUNCH le midi. */
  version: string;
  prixTtc: number;
  temps: TempsBudget[];
}

/** Valeurs de la fiche « Budgets matière par menu » (modifiables dans l'onglet). */
export const BUDGETS_DE_DEPART: readonly BudgetMenu[] = [
  { id: 'soir5', nom: 'Menu soir 5 temps', menuHub: '5 temps', version: 'MENU', prixTtc: 75,
    temps: [{ nom: 'Temps 1', budget: 1.5 }, { nom: 'Temps 2', budget: 4 }, { nom: 'Temps 3', budget: 4 }, { nom: 'Temps 4', budget: 4 }, { nom: 'Temps 5', budget: 1.5 }] },
  { id: 'soir3', nom: 'Menu soir 3 temps', menuHub: '3 temps', version: 'MENU', prixTtc: 49,
    temps: [{ nom: 'Temps 1', budget: 2.5 }, { nom: 'Temps 2', budget: 5.5 }, { nom: 'Temps 3', budget: 1.5 }] },
  { id: 'midi', nom: 'Menu midi', menuHub: 'Lunch', version: 'LUNCH', prixTtc: 29,
    temps: [{ nom: 'Entrée', budget: 1.5 }, { nom: 'Plat', budget: 2.8 }, { nom: 'Dessert', budget: 1.5 }] },
];

/** Au-delà de cette part du plafond, la pastille passe à l'ambre (proche du plafond). */
export const SEUIL_PROCHE = 0.9;

const centimes = (n: number): number => Math.round(n * 100) / 100;
export const prixHt = (ttc: number, r: Regles): number => ttc / (1 + r.tva);
/** Coût matière maximal pour un prix de vente TTC. */
export const plafondMatiere = (ttc: number, r: Regles): number => prixHt(ttc, r) / r.coefficient;
export const apresPerte = (budget: number, r: Regles): number => budget * (1 - r.perte);
export const totalBudgets = (m: Pick<BudgetMenu, 'temps'>): number => m.temps.reduce((t, x) => t + x.budget, 0);
/** Coefficient obtenu : prix HT ÷ coût (null si le coût est nul). */
export const coefficient = (ttc: number, cout: number, r: Regles): number | null => (cout > 0 ? prixHt(ttc, r) / cout : null);

/** Prix TTC conseillé d'un plat à la carte : coût × coefficient × (1 + TVA), arrondi au demi-euro supérieur. */
export function prixConseille(cout: number, r: Regles): { brut: number; arrondi: number } {
  const brut = cout * r.coefficient * (1 + r.tva);
  return { brut, arrondi: Math.ceil(centimes(brut) * 2 - 1e-9) / 2 };
}

export type Pastille = 'vert' | 'ambre' | 'rouge';
export function pastille(cout: number, plafond: number): Pastille {
  if (cout > plafond + 1e-9) return 'rouge';
  return cout > plafond * SEUIL_PROCHE + 1e-9 ? 'ambre' : 'vert';
}

// ── Recettes Yokitup avec leur coût ──
export interface RecetteRatio {
  id: string;
  nom: string;
  plat: string;
  version: string;
  etiquettes: string[];
  /** Coût en € HT d'une portion (null : pas encore lu ou rien de chiffrable). */
  cout: number | null;
  /** Ingrédients sans coût connu dans Yokitup (coût incomplet). */
  manquants: string[];
}

/** Ce qui empêche de vérifier un plat, et l'action à faire. */
export type Probleme = 'libre' | 'supprime' | 'nonRelie' | 'sansVersion' | 'sansCout';
export const ACTION: Record<Probleme, (version: string) => string> = {
  libre: () => 'Plat libre : le remplacer par sa fiche recette dans Menus',
  supprime: () => 'Fiche recette supprimée : corriger le menu dans Menus',
  nonRelie: () => 'Non relié à Yokitup : relier dans Config > Yokitup',
  sansVersion: v => `Pas de version ${v} dans Yokitup : la créer dans Yokitup`,
  sansCout: () => 'Coût introuvable dans Yokitup : vérifier les prix de ses produits',
};

export interface PlatVerifie {
  /** Ancre de la ligne (liens du résumé). */
  ancre: string;
  nom: string;
  /** Plat Yokitup relié (null : non relié). */
  plat: string | null;
  recette: RecetteRatio | null;
  probleme: Probleme | null;
  /** Coût Yokitup (null si inconnu). */
  cout: number | null;
  pastille: Pastille | null;
  /** Coût − plafond du temps (négatif = marge). */
  ecart: number | null;
}
export interface TempsVerifie extends TempsBudget { apresPerte: number; part: number; plats: PlatVerifie[] }
export interface MenuVerifie {
  budget: BudgetMenu;
  /** Menu du Hub trouvé (sinon aucun plat à vérifier). */
  menuTrouve: boolean;
  prixHt: number;
  plafond: number;
  total: number;
  /** Coefficient des budgets (prix HT ÷ total des budgets). */
  coefficient: number | null;
  /** Le total des budgets dépasse le plafond matière. */
  budgetsTropHauts: boolean;
  temps: TempsVerifie[];
  /** Coût réel du menu : le plat le plus cher de chaque temps (null si un temps n'a aucun coût). */
  coutReel: number | null;
  coefficientReel: number | null;
}

const cle = (s: string): string => s.replace(/[Œœ]/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
/** Version de recette d'un plat Yokitup (MENU, LUNCH…). */
const versionDe = (recettes: readonly RecetteRatio[], plat: string, version: string): RecetteRatio | null =>
  recettes.find(r => r.plat === plat && r.version === version) ?? null;

/** Vérifie un menu : ses temps (budget, après perte, part) et, sous chaque temps, les plats du menu du Hub avec leur coût Yokitup. */
export function verifierMenu(b: BudgetMenu, menus: readonly Menu[], frs: readonly FicheRecette[], recettes: readonly RecetteRatio[],
  liens: ReadonlyMap<string, string>, r: Regles): MenuVerifie {
  const menu = menus.find(m => cle(m.nom) === cle(b.menuHub));
  const services = menu ? servicesAffiches(menu) : [];
  const platDeFiche = new Map([...liens].map(([plat, fr]) => [fr, plat]));
  const total = totalBudgets(b);
  const temps: TempsVerifie[] = b.temps.map((t, i) => {
    const plafond = apresPerte(t.budget, r);
    const service = services.find(s => cle(s.nom) === cle(t.nom));
    const plats = (service?.plats ?? []).map((p, k): PlatVerifie => {
      const base = { ancre: `ratio-${b.id}-${i}-${k}`, plat: null, recette: null, cout: null, pastille: null, ecart: null };
      if ('texte' in p) return { ...base, nom: p.texte, probleme: 'libre' };
      const fr = frs.find(f => f.id === p.frId);
      if (!fr) return { ...base, nom: '(fiche supprimée)', probleme: 'supprime' };
      const plat = platDeFiche.get(fr.id) ?? null;
      if (!plat) return { ...base, nom: fr.nom, probleme: 'nonRelie' };
      const recette = versionDe(recettes, plat, b.version);
      if (!recette) return { ...base, nom: fr.nom, plat, probleme: 'sansVersion' };
      if (recette.cout === null) return { ...base, nom: fr.nom, plat, recette, probleme: 'sansCout' };
      return { ...base, nom: fr.nom, plat, recette, probleme: null, cout: recette.cout, pastille: pastille(recette.cout, plafond), ecart: recette.cout - plafond };
    });
    return { ...t, apresPerte: plafond, part: total > 0 ? t.budget / total : 0, plats };
  });
  const parTemps = temps.map(t => Math.max(...t.plats.map(p => p.cout ?? -Infinity)));
  const coutReel = temps.length && parTemps.every(Number.isFinite) ? parTemps.reduce((a, c) => a + c, 0) : null;
  const plafond = plafondMatiere(b.prixTtc, r);
  return {
    budget: b, menuTrouve: !!menu, prixHt: prixHt(b.prixTtc, r), plafond, total,
    coefficient: coefficient(b.prixTtc, total, r), budgetsTropHauts: total > plafond + 0.005, temps,
    coutReel, coefficientReel: coutReel === null ? null : coefficient(b.prixTtc, coutReel, r),
  };
}

// ── Carte ──
const HORS_CARTE = new Set(['MENU', 'LUNCH', 'MENU ENFANT']);
const rangCarte = (v: string): number => (v === 'CARTE' ? 0 : v === '' ? 1 : 2);

/** Une recette par plat de la carte : étiquetée RECETTE CARTE (ou en version CARTE), hors versions Menu, Lunch et Menu enfant ;
 *  la version CARTE d'abord, puis sans version, puis la première des autres (1 PAX, AVEC PAIN…). */
export function recettesCarte(recettes: readonly RecetteRatio[]): RecetteRatio[] {
  const parPlat = new Map<string, RecetteRatio>();
  const candidates = recettes.filter(x => !HORS_CARTE.has(x.version) && (x.version === 'CARTE' || x.etiquettes.some(e => e.toUpperCase() === 'RECETTE CARTE')))
    .sort((a, b) => rangCarte(a.version) - rangCarte(b.version) || a.version.localeCompare(b.version));
  for (const x of candidates) if (!parPlat.has(x.plat)) parPlat.set(x.plat, x);
  return [...parPlat.values()].sort((a, b) => compareFr(a.plat, b.plat));
}

export interface LigneCarte {
  ancre: string;
  plat: string;
  recette: RecetteRatio;
  /** Fiche recette du Hub reliée (nom affiché en dessous), si elle existe. */
  fiche: string | null;
  cout: number | null;
  conseille: { brut: number; arrondi: number } | null;
  prixReel: number | null;
  coefficientReel: number | null;
  pastille: Pastille | null;
  /** Prix réel − prix conseillé (négatif = vendu sous le prix conseillé). */
  ecartPrix: number | null;
}

/** Ancre d'un plat de la carte (lettres et chiffres seulement). */
export const ancreCarte = (plat: string): string => 'ratio-carte-' + cle(plat).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function verifierCarte(recettes: readonly RecetteRatio[], prix: ReadonlyMap<string, number>, liens: ReadonlyMap<string, string>,
  frs: readonly FicheRecette[], r: Regles): LigneCarte[] {
  return recettesCarte(recettes).map(rec => {
    const cout = rec.cout, prixReel = prix.get(rec.plat) ?? null;
    const coef = cout !== null && prixReel !== null ? coefficient(prixReel, cout, r) : null;
    return {
      ancre: ancreCarte(rec.plat), plat: rec.plat, recette: rec,
      fiche: frs.find(f => f.id === liens.get(rec.plat))?.nom ?? null,
      cout, conseille: cout !== null ? prixConseille(cout, r) : null, prixReel, coefficientReel: coef,
      pastille: cout !== null && prixReel !== null ? pastille(cout, plafondMatiere(prixReel, r)) : null,
      ecartPrix: cout !== null && prixReel !== null ? prixReel - prixConseille(cout, r).arrondi : null,
    };
  });
}

/** Recettes MENU ou LUNCH de Yokitup qu'aucun temps des menus vérifiés n'utilise : à ranger (relier la fiche, l'ajouter au menu). */
export function recettesARanger(recettes: readonly RecetteRatio[], verifies: readonly MenuVerifie[], liens: ReadonlyMap<string, string>): { recette: RecetteRatio; relie: boolean }[] {
  const utilisees = new Set(verifies.flatMap(m => m.temps.flatMap(t => t.plats.map(p => p.recette?.id))).filter(Boolean));
  const versions = new Set(verifies.map(m => m.budget.version));
  return recettes.filter(x => versions.has(x.version) && !utilisees.has(x.id))
    .map(recette => ({ recette, relie: liens.has(recette.plat) }))
    .sort((a, b) => compareFr(a.recette.nom, b.recette.nom));
}

// ── Résumé des alertes ──
export interface Renvoi { ancre: string; nom: string; ou: string }
export interface Resume {
  horsBudget: Renvoi[];
  proches: Renvoi[];
  sansPrix: Renvoi[];
  aCorriger: Renvoi[];
  /** Menus dont le total des budgets dépasse le plafond matière. */
  budgetsTropHauts: string[];
}

export function resume(menus: readonly MenuVerifie[], carte: readonly LigneCarte[]): Resume {
  const r: Resume = { horsBudget: [], proches: [], sansPrix: [], aCorriger: [], budgetsTropHauts: menus.filter(m => m.budgetsTropHauts).map(m => m.budget.nom) };
  for (const m of menus) for (const t of m.temps) for (const p of t.plats) {
    const renvoi = { ancre: p.ancre, nom: p.nom, ou: `${m.budget.nom} · ${t.nom}` };
    if (p.pastille === 'rouge') r.horsBudget.push(renvoi);
    else if (p.pastille === 'ambre') r.proches.push(renvoi);
    if (p.probleme) r.aCorriger.push(renvoi);
  }
  for (const l of carte) {
    const renvoi = { ancre: l.ancre, nom: l.plat, ou: 'Carte' };
    if (l.pastille === 'rouge') r.horsBudget.push(renvoi);
    else if (l.pastille === 'ambre') r.proches.push(renvoi);
    if (l.cout === null) r.aCorriger.push(renvoi);
    else if (l.prixReel === null) r.sansPrix.push(renvoi);
  }
  return r;
}

// ── Affichage ──
const fmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 15.1 → « 15,10 € » */
export const euros = (n: number): string => `${fmt.format(n)} €`.replace(/[\u202f\u00a0]/g, ' ');
/** Écart signé : « +0,42 € », « −0,30 € ». */
export const ecartEuros = (n: number): string => (n > 0.004 ? '+' : n < -0.004 ? '−' : '') + euros(Math.abs(n));
/** 4.545 → « 4,55 » */
export const coef = (n: number): string => fmt.format(n);
/** 0.2667 → « 27 % » */
export const pourcent = (n: number): string => `${Math.round(n * 100)} %`;

/** Saisie d'un montant (« 17,5 », « 17.50 € ») → nombre positif, ou null si invalide. */
export function lireMontant(s: string): number | null {
  const t = s.replace(/€|\s/g, '').replace(',', '.');
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n < 100000 ? Math.round(n * 100) / 100 : null;
}
