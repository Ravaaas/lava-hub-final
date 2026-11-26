// Coût matière des recettes Yokitup, recalculé comme Yokitup le fait (règles pures, sans accès réseau).
// L'API Yokitup ne donne pas le coût d'une recette : on le refait à partir de ce qu'elle expose.
//   - produit acheté : `unit_cost` de /product_stocks (coût par unité de base : g, ml, pièce), sinon le prix fournisseur
//     (/supplier_products : `unit_price_excluding_tax` ÷ `product_unit_per_billing_packaging` emballages principaux) ;
//   - recette (et sous-recette) : somme de ses ingrédients (quantité convertie dans l'unité de base de l'ingrédient × son coût),
//     divisée par la taille de son emballage principal (une sous-recette se fait souvent par lots de plusieurs kg).
// Vérifié sur POISSON/BETTERAVE (CARTE) : 3,83 € comme dans Yokitup (TRUITE NET = lot de 500 g fait avec 1 kg de TRUITE à 16,90 €).
// Fichier importé aussi par l'app (app/src/domain/couts.test.ts) : aucune dépendance.

export type UniteBase = 'g' | 'ml' | 'ea' | 'cm';
export interface UniteYk { base: UniteBase | string; quantite: number }
export interface ProduitYk {
  id: string;
  nom: string;
  type: string;                 // « purchased », « recipe », « fee »
  base: string;                 // unité de base du produit
  principalUnite: string;       // id de l'unité de l'emballage principal
  principalQuantite: number;
  conversionUnite?: string | null;
  conversionQuantite?: number | null;
}
export interface LigneRecetteYk { recette: string; ingredient: string; quantite: number; unite: string }

export interface DonneesCouts {
  produits: ReadonlyMap<string, ProduitYk>;
  unites: ReadonlyMap<string, UniteYk>;
  /** id de recette → ses lignes d'ingrédients */
  lignes: ReadonlyMap<string, readonly LigneRecetteYk[]>;
  /** id de produit acheté → coût en € par unité de base (stock) */
  coutStock: ReadonlyMap<string, number>;
  /** id de produit acheté → coût en € par emballage principal (prix fournisseur, à défaut du stock) */
  prixFournisseur: ReadonlyMap<string, number>;
}

export interface CoutRecette {
  /** Coût en € HT d'un emballage principal (une portion pour un plat), arrondi au centime près ; null si rien n'est chiffrable. */
  cout: number | null;
  /** Ingrédients sans coût connu (pas de prix, unité impossible à convertir…) : le coût est alors incomplet. */
  manquants: string[];
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

/** Taille de l'emballage principal dans l'unité de base du produit (ex. lot de 500 g → 500 ; 1 kg → 1000). */
export function taillePrincipale(p: ProduitYk, unites: ReadonlyMap<string, UniteYk>): number | null {
  const u = unites.get(p.principalUnite);
  if (!u) return null;
  const t = num(p.principalQuantite) * u.quantite;
  return t > 0 ? t : null;
}

/** Quantité d'une ligne de recette convertie dans l'unité de base de l'ingrédient, via l'emballage de conversion si les unités diffèrent
 *  (ex. 10 ml d'un produit compté en g). null si la conversion est impossible. */
export function quantiteEnBase(q: number, uniteId: string, p: ProduitYk, unites: ReadonlyMap<string, UniteYk>): number | null {
  const u = unites.get(uniteId);
  if (!u || !Number.isFinite(q)) return null;
  const brut = q * u.quantite;
  if (u.base === p.base) return brut;
  const principal = taillePrincipale(p, unites);
  const cu = p.conversionUnite ? unites.get(p.conversionUnite) : undefined;
  const conv = cu && p.conversionQuantite ? num(p.conversionQuantite) * cu.quantite : NaN;
  if (!principal || !cu || cu.base !== u.base || !(conv > 0)) return null;
  return (brut / conv) * principal;
}

/** Calcule le coût de recettes Yokitup. Les sous-recettes sont calculées une fois chacune ; une boucle (recette qui se contient) est ignorée. */
export function calculateurCouts(d: DonneesCouts): (recetteId: string) => CoutRecette {
  const memo = new Map<string, { parBase: number | null; manquants: string[] }>();
  const enCours = new Set<string>();

  /** Coût d'un produit par unité de base, et ce qui manque pour le chiffrer. */
  function parBase(id: string): { parBase: number | null; manquants: string[] } {
    const deja = memo.get(id);
    if (deja) return deja;
    const p = d.produits.get(id);
    let r: { parBase: number | null; manquants: string[] };
    if (!p) r = { parBase: null, manquants: ['(produit inconnu)'] };
    else if (p.type === 'recipe') {
      if (enCours.has(id)) return { parBase: null, manquants: [p.nom] };
      enCours.add(id);
      const t = taillePrincipale(p, d.unites);
      const c = coutLignes(id);
      enCours.delete(id);
      r = { parBase: c.total !== null && t ? c.total / t : null, manquants: c.manquants };
    } else {
      const stock = d.coutStock.get(id);
      const t = taillePrincipale(p, d.unites);
      const fournisseur = d.prixFournisseur.get(id);
      const v = stock !== undefined && stock > 0 ? stock : fournisseur !== undefined && t ? fournisseur / t : null;
      r = { parBase: v, manquants: v === null ? [p.nom] : [] };
    }
    memo.set(id, r);
    return r;
  }

  /** Total des lignes d'une recette (pour son emballage principal). */
  function coutLignes(recetteId: string): { total: number | null; manquants: string[] } {
    const lignes = d.lignes.get(recetteId) ?? [];
    let total = 0, chiffre = false;
    const manquants: string[] = [];
    for (const l of lignes) {
      const p = d.produits.get(l.ingredient);
      const c = parBase(l.ingredient);
      const q = p ? quantiteEnBase(l.quantite, l.unite, p, d.unites) : null;
      if (c.parBase === null || q === null) manquants.push(p?.nom ?? '(produit inconnu)');
      else { total += q * c.parBase; chiffre = true; }
      if (c.parBase !== null) manquants.push(...c.manquants);
    }
    return { total: chiffre ? total : null, manquants: [...new Set(manquants)] };
  }

  return (recetteId: string): CoutRecette => {
    const c = coutLignes(recetteId);
    return { cout: c.total === null ? null : Math.round(c.total * 10000) / 10000, manquants: c.manquants };
  };
}

// ── Lecture des réponses de l'API Yokitup ──
// Montants : chaînes en unité mineure de la devise (centimes : « 123 » = 1,23 €), jusqu'à 5 décimales (doc « Money »).
export const MONTANT_EN_EUROS = 100;
type Ligne = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export function lireProduit(p: Ligne): ProduitYk {
  return {
    id: s(p.id), nom: s(p.name), type: s(p.type), base: s(p.base_unit),
    principalUnite: s(p.main_packaging_measurement_unit_id), principalQuantite: num(p.main_packaging_quantity),
    conversionUnite: s(p.conversion_packaging_measurement_unit_id) || null,
    conversionQuantite: p.conversion_packaging_quantity == null ? null : num(p.conversion_packaging_quantity),
  };
}
export const lireUnite = (u: Ligne): UniteYk => ({ base: s(u.base_unit), quantite: num(u.base_quantity) || 1 });
export const lireLigneRecette = (i: Ligne): LigneRecetteYk =>
  ({ recette: s(i.recipe_product_id), ingredient: s(i.ingredient_product_id), quantite: num(i.quantity), unite: s(i.measurement_unit_id) });

/** Coût par unité de base de chaque produit suivi en stock (moyenne des sites s'il y en a plusieurs ; un coût nul est ignoré). */
export function coutsDesStocks(stocks: readonly Ligne[]): Map<string, number> {
  const somme = new Map<string, { t: number; n: number }>();
  for (const x of stocks) {
    const v = num(x.unit_cost) / MONTANT_EN_EUROS;
    if (!(v > 0)) continue;
    const id = s(x.product_id), a = somme.get(id) ?? { t: 0, n: 0 };
    somme.set(id, { t: a.t + v, n: a.n + 1 });
  }
  return new Map([...somme].map(([id, a]) => [id, a.t / a.n]));
}

/** Prix fournisseur par emballage principal de chaque produit (le moins cher des fournisseurs actifs). */
export function prixDesFournisseurs(lignes: readonly Ligne[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const x of lignes) {
    if (s(x.status) && s(x.status) !== 'active') continue;
    const prix = num(x.unit_price_excluding_tax) / MONTANT_EN_EUROS, par = num(x.product_unit_per_billing_packaging) || 1;
    const v = prix / par, id = s(x.product_id);
    if (!id || !(v > 0)) continue;
    const a = out.get(id);
    if (a === undefined || v < a) out.set(id, v);
  }
  return out;
}

export function lignesParRecette(lignes: readonly LigneRecetteYk[]): Map<string, LigneRecetteYk[]> {
  const m = new Map<string, LigneRecetteYk[]>();
  for (const l of lignes) m.set(l.recette, [...(m.get(l.recette) ?? []), l]);
  return m;
}
