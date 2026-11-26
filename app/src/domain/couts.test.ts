import { describe, expect, it } from 'vitest';
import { calculateurCouts, coutsDesStocks, lignesParRecette, lireLigneRecette, lireProduit, lireUnite, prixDesFournisseurs, quantiteEnBase, type ProduitYk, type UniteYk } from '../../../supabase/functions/yokitup/couts';

// Unités Yokitup (base_unit, base_quantity)
const unites = new Map<string, UniteYk>([['g', { base: 'g', quantite: 1 }], ['kg', { base: 'g', quantite: 1000 }], ['ml', { base: 'ml', quantite: 1 }],
  ['L', { base: 'ml', quantite: 1000 }], ['pce', { base: 'ea', quantite: 1 }]]);
const produit = (id: string, nom: string, type: string, base: string, principalUnite: string, principalQuantite: number, conv?: [string, number]): ProduitYk =>
  ({ id, nom, type, base, principalUnite, principalQuantite, conversionUnite: conv?.[0] ?? null, conversionQuantite: conv?.[1] ?? null });

// Données réelles de Yokitup (POISSON/BETTERAVE (CARTE), 3,83 € dans Yokitup) : TRUITE NET est un lot de 500 g fait d'1 kg de TRUITE à 16,90 €/kg.
const produits = new Map([
  produit('plat', 'POISSON/BETTERAVE (CARTE)', 'recipe', 'ea', 'pce', 1),
  produit('truiteNet', 'TRUITE NET', 'recipe', 'g', 'g', 500),
  produit('truite', 'TRUITE', 'purchased', 'g', 'kg', 1),
  produit('huile', 'HUILE PIMENTON', 'purchased', 'ml', 'L', 1),
  produit('beurre', 'BEURRE', 'purchased', 'g', 'kg', 1, ['ml', 1100]),
  produit('sansPrix', 'CITRON CAVIAR NET', 'purchased', 'g', 'kg', 1),
].map(p => [p.id, p]));
const lignes = lignesParRecette([
  { recette: 'plat', ingredient: 'truiteNet', quantite: 80, unite: 'g' },
  { recette: 'plat', ingredient: 'huile', quantite: 3, unite: 'ml' },
  { recette: 'truiteNet', ingredient: 'truite', quantite: 1, unite: 'kg' },
]);

describe('coût des recettes Yokitup', () => {
  it('recette et sous-recette en lot : 80 g de TRUITE NET = 2,704 €, comme Yokitup', () => {
    const calcul = calculateurCouts({ produits, unites, lignes, coutStock: new Map([['truite', 0.0169], ['huile', 0.002848]]), prixFournisseur: new Map() });
    const r = calcul('plat');
    expect(r.manquants).toEqual([]);
    expect(r.cout).toBeCloseTo(2.704 + 3 * 0.002848, 4);
  });
  it('sans stock suivi : prix fournisseur par emballage principal', () => {
    const calcul = calculateurCouts({ produits, unites, lignes, coutStock: new Map([['huile', 0.002848]]), prixFournisseur: new Map([['truite', 16.9]]) });
    expect(calcul('plat').cout).toBeCloseTo(2.7125, 4);
  });
  it('ingrédient sans prix : coût partiel et ingrédient signalé ; rien de chiffrable : null', () => {
    const l2 = lignesParRecette([...(lignes.get('plat') ?? []), { recette: 'plat', ingredient: 'sansPrix', quantite: 2, unite: 'g' }, ...(lignes.get('truiteNet') ?? [])]);
    const calcul = calculateurCouts({ produits, unites, lignes: l2, coutStock: new Map([['truite', 0.0169], ['huile', 0.002848]]), prixFournisseur: new Map() });
    expect(calcul('plat').manquants).toEqual(['CITRON CAVIAR NET']);
    const vide = calculateurCouts({ produits, unites, lignes, coutStock: new Map(), prixFournisseur: new Map() });
    expect(vide('plat').cout).toBeNull();
    expect(vide('plat').manquants).toContain('HUILE PIMENTON');
  });
  it('unités différentes : conversion par l\'emballage de conversion (1 kg de beurre = 1 100 ml)', () => {
    const beurre = produits.get('beurre') as ProduitYk;
    expect(quantiteEnBase(11, 'ml', beurre, unites)).toBeCloseTo(10, 6);
    expect(quantiteEnBase(2, 'pce', beurre, unites)).toBeNull();
    expect(quantiteEnBase(0.5, 'kg', beurre, unites)).toBe(500);
  });
  it('une recette qui se contient elle-même ne bloque pas le calcul', () => {
    const boucle = lignesParRecette([{ recette: 'truiteNet', ingredient: 'truiteNet', quantite: 10, unite: 'g' }, { recette: 'plat', ingredient: 'truiteNet', quantite: 10, unite: 'g' }]);
    const calcul = calculateurCouts({ produits, unites, lignes: boucle, coutStock: new Map(), prixFournisseur: new Map() });
    expect(calcul('plat').cout).toBeNull();
  });
  it('lecture des réponses de l\'API : montants en centimes, coût nul ignoré, fournisseur le moins cher', () => {
    expect(coutsDesStocks([{ product_id: 'truite', unit_cost: '1.69' }, { product_id: 'x', unit_cost: '0' }])).toEqual(new Map([['truite', 0.0169]]));
    expect(coutsDesStocks([{ product_id: 'a', unit_cost: '2' }, { product_id: 'a', unit_cost: '4' }]).get('a')).toBeCloseTo(0.03, 6);
    expect(prixDesFournisseurs([
      { product_id: 'truite', unit_price_excluding_tax: '1690', product_unit_per_billing_packaging: '1', status: 'active' },
      { product_id: 'truite', unit_price_excluding_tax: '3000', product_unit_per_billing_packaging: '2', status: 'active' },
      { product_id: 'truite', unit_price_excluding_tax: '100', product_unit_per_billing_packaging: '1', status: 'inactive' },
    ]).get('truite')).toBeCloseTo(15, 6);
    expect(lireProduit({ id: 'p', name: 'TRUITE', type: 'purchased', base_unit: 'g', main_packaging_measurement_unit_id: 'kg', main_packaging_quantity: '1', conversion_packaging_measurement_unit_id: null }))
      .toEqual({ id: 'p', nom: 'TRUITE', type: 'purchased', base: 'g', principalUnite: 'kg', principalQuantite: 1, conversionUnite: null, conversionQuantite: null });
    expect(lireUnite({ base_unit: 'g', base_quantity: '1000' })).toEqual({ base: 'g', quantite: 1000 });
    expect(lireLigneRecette({ recipe_product_id: 'r', ingredient_product_id: 'i', quantity: '2.5', measurement_unit_id: 'g' })).toEqual({ recette: 'r', ingredient: 'i', quantite: 2.5, unite: 'g' });
  });
});
