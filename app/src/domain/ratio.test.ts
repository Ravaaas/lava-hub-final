import { describe, expect, it } from 'vitest';
import { ACTION, ancreCarte, carteARelier, apresPerte, BUDGETS_DE_DEPART, coefficient, ecartEuros, euros, lireMontant, pastille, plafondMatiere, prixConseille, recettesARanger, recettesCarte,
  REGLES_DE_DEPART as R, resume, totalBudgets, verifierCarte, verifierMenu, type BudgetMenu, type RecetteRatio } from './ratio';
import type { FicheRecette, Menu } from './types';

const [soir5, soir3, midi] = BUDGETS_DE_DEPART as [BudgetMenu, BudgetMenu, BudgetMenu];
const rec = (id: string, plat: string, version: string, cout: number | null, etiquettes = [`RECETTE ${version || 'CARTE'}`]): RecetteRatio =>
  ({ id, nom: `${plat}${version ? ` (${version})` : ''}`, plat, version, etiquettes, cout, manquants: [] });
const fr = (id: string, nom: string) => ({ id, nom, statut: 'carte', allergenes: [], elements: [] }) as FicheRecette;

describe('fiche « Budgets matière par menu »', () => {
  it('plafond, total et coefficient des trois menus, comme sur la fiche', () => {
    expect(plafondMatiere(soir5.prixTtc, R)).toBeCloseTo(15.15, 2);
    expect(totalBudgets(soir5)).toBe(15);
    expect(coefficient(soir5.prixTtc, 15, R)).toBeCloseTo(4.55, 2);
    expect(plafondMatiere(soir3.prixTtc, R)).toBeCloseTo(9.9, 2);
    expect(totalBudgets(soir3)).toBe(9.5);
    expect(coefficient(soir3.prixTtc, 9.5, R)).toBeCloseTo(4.69, 2);
    expect(plafondMatiere(midi.prixTtc, R)).toBeCloseTo(5.86, 2);
    expect(totalBudgets(midi)).toBeCloseTo(5.8, 6);
    expect(coefficient(midi.prixTtc, 5.8, R)).toBeCloseTo(4.55, 2);
  });
  it('après perte de 5 % : 4,00 € → 3,80 €', () => { expect(apresPerte(4, R)).toBeCloseTo(3.8, 6); });
  it('pastilles : vert sous 90 % du plafond, ambre jusqu\'au plafond, rouge au-dessus', () => {
    expect(pastille(3.4, 3.8)).toBe('vert');
    expect(pastille(3.5, 3.8)).toBe('ambre');
    expect(pastille(3.8, 3.8)).toBe('ambre');
    expect(pastille(3.81, 3.8)).toBe('rouge');
  });
  it('prix conseillé à la carte : coût × 4,5 × 1,10 arrondi au demi-euro supérieur', () => {
    expect(prixConseille(3.83, R)).toEqual({ brut: 3.83 * 4.95, arrondi: 19 });
    expect(prixConseille(2, R).arrondi).toBe(10);   // 9,90 → 10
    expect(prixConseille(3.0303, R).arrondi).toBe(15);   // 15,00 tout juste : pas de demi-euro en plus
  });
});

const frs = [fr('boeuf', 'BŒUF AXURIA'), fr('mangue', 'MANGUE COCO'), fr('huitre', 'HUÎTRE'), fr('veau', 'TARTARE DE VEAU'), fr('seul', 'PLAT NON RELIÉ')];
const liens = new Map([['BŒUF/PLEUROTE', 'boeuf'], ['MANGUE/MACIS', 'mangue'], ['HUITRES', 'huitre'], ['VEAU', 'veau']]);
const recettes = [
  rec('b1', 'BŒUF/PLEUROTE', 'CARTE', 5.38), rec('b2', 'BŒUF/PLEUROTE', 'MENU', 3.94),
  rec('m1', 'MANGUE/MACIS', 'CARTE', 1.39), rec('m2', 'MANGUE/MACIS', 'MENU', 1.47),
  rec('h1', 'HUITRES', 'CARTE', 3.45), rec('h2', 'HUITRES', 'MENU', 1.3),
  rec('v1', 'VEAU', 'LUNCH', null),
  rec('n1', 'NOUVEAU', 'MENU', 2), rec('c1', 'CHEVRE', 'AVEC PAIN', 2, ['RECETTE CARTE', 'RECETTE MENU']), rec('c2', 'CHEVRE', 'SANS PAIN', 1.5, ['RECETTE CARTE']),
  rec('e1', 'POISSON', 'MENU ENFANT', 1, ['RECETTE CARTE']), rec('f1', 'FLATBREAD', '', 1.51, ['RECETTE CARTE']),
];
const menus: Menu[] = [
  { id: 'm5', nom: '5 temps', services: [{ nom: 'Temps 1', plats: [{ frId: 'huitre' }] }, { nom: 'Temps 2', plats: [{ texte: 'Pain maison' }] }, { nom: 'Temps 3', plats: [{ frId: 'boeuf' }, { frId: 'seul' }] },
    { nom: 'Temps 4', plats: [] }, { nom: 'Temps 5', plats: [{ frId: 'mangue' }] }] },
  { id: 'm3', nom: '3 temps', services: [{ nom: 'Temps 1', plats: [] }, { nom: 'Temps 2', plats: [{ frId: 'boeuf' }] }, { nom: 'Temps 3', plats: [{ frId: 'mangue' }] }] },
  { id: 'l', nom: 'Lunch', services: [{ nom: 'Partages', plats: [{ frId: 'huitre' }] }, { nom: 'Entrée', plats: [{ frId: 'veau' }] }, { nom: 'Plat', plats: [{ frId: 'boeuf' }] }, { nom: 'Dessert', plats: [] }] },
];

describe('vérification des menus', () => {
  const v5 = verifierMenu(soir5, menus, frs, recettes, liens, R);
  it('temps : budget, après perte et part du budget', () => {
    expect(v5.menuTrouve).toBe(true);
    expect(v5.temps.map(t => t.nom)).toEqual(['Temps 1', 'Temps 2', 'Temps 3', 'Temps 4', 'Temps 5']);
    expect(v5.temps[1]?.apresPerte).toBeCloseTo(3.8, 6);
    expect(v5.temps[0]?.part).toBeCloseTo(0.1, 6);
    expect(v5.budgetsTropHauts).toBe(false);
  });
  it('plat comparé au budget après perte de son temps, version MENU de Yokitup', () => {
    const huitre = v5.temps[0]?.plats[0];   // 1,30 € pour 1,425 € → ambre (au-dessus de 90 %)
    expect(huitre).toMatchObject({ nom: 'HUÎTRE', plat: 'HUITRES', cout: 1.3, pastille: 'ambre', probleme: null });
    expect(huitre?.ecart).toBeCloseTo(1.3 - 1.425, 6);
    expect(v5.temps[2]?.plats[0]).toMatchObject({ cout: 3.94, pastille: 'rouge' });   // 3,94 > 3,80
    expect(v5.temps[4]?.plats[0]).toMatchObject({ cout: 1.47, pastille: 'rouge' });   // 1,47 > 1,425
  });
  it('plats impossibles à vérifier : plat libre, non relié, sans version, sans coût, avec l\'action à faire', () => {
    expect(v5.temps[1]?.plats[0]?.probleme).toBe('libre');
    expect(v5.temps[2]?.plats[1]?.probleme).toBe('nonRelie');
    expect(ACTION.nonRelie('MENU')).toMatch(/Config > Yokitup/);
    const vm = verifierMenu(midi, menus, frs, recettes, liens, R);
    expect(vm.temps.map(t => t.nom)).toEqual(['Entrée', 'Plat', 'Dessert']);   // Partages : pas de budget au midi
    expect(vm.temps[0]?.plats[0]?.probleme).toBe('sansCout');
    expect(vm.temps[1]?.plats[0]?.probleme).toBe('sansVersion');
    expect(ACTION.sansVersion('LUNCH')).toBe('Pas de version LUNCH dans Yokitup : la créer dans Yokitup');
  });
  it('un même plat dans le 3 et le 5 temps est vérifié avec chaque budget', () => {
    const v3 = verifierMenu(soir3, menus, frs, recettes, liens, R);
    expect(v3.temps[1]?.plats[0]).toMatchObject({ nom: 'BŒUF AXURIA', pastille: 'vert' });   // 3,94 sous 5,225 × 90 %
    expect(v5.temps[2]?.plats[0]?.pastille).toBe('rouge');
  });
  it('coût réel du menu : le plat le plus cher de chaque temps, seulement si chaque temps a un coût', () => {
    expect(v5.coutReel).toBeNull();
    const v3 = verifierMenu(soir3, [{ id: 'x', nom: '3 temps', services: [{ nom: 'Temps 1', plats: [{ frId: 'huitre' }] }, { nom: 'Temps 2', plats: [{ frId: 'boeuf' }] }, { nom: 'Temps 3', plats: [{ frId: 'mangue' }] }] }], frs, recettes, liens, R);
    expect(v3.coutReel).toBeCloseTo(1.3 + 3.94 + 1.47, 6);
    expect(v3.coefficientReel).toBeCloseTo((49 / 1.1) / 6.71, 6);
  });
  it('menu du Hub absent, budgets au-dessus du plafond', () => {
    const v = verifierMenu({ ...soir3, temps: [{ nom: 'Temps 1', budget: 12 }] }, [], frs, recettes, liens, R);
    expect(v.menuTrouve).toBe(false);
    expect(v.budgetsTropHauts).toBe(true);
  });
  it('recettes MENU de Yokitup qu\'aucun temps n\'utilise : à ranger', () => {
    const verifies = BUDGETS_DE_DEPART.map(b => verifierMenu(b, menus, frs, recettes, liens, R));
    expect(recettesARanger(recettes, verifies, liens).map(x => [x.recette.id, x.relie])).toEqual([['n1', false]])   // la version LUNCH du veau est au midi, même sans coût;
  });
});

describe('vérification de la carte', () => {
  it('une recette par plat : CARTE d\'abord, sans version, puis autre version ; ni MENU, ni LUNCH, ni MENU ENFANT', () => {
    expect(recettesCarte(recettes).map(r => r.id)).toEqual(['b1', 'c1', 'f1', 'h1', 'm1']);
  });
  it('seulement la carte actuelle : plat relié à une fiche Carte, Partages ou Lunch ; non reliés à relier ; Best of écarté', () => {
    const avecBestOf = [...frs.filter(f => f.id !== 'huitre'), { ...fr('huitre', 'HUÎTRE'), statut: 'bestof' as const }];
    expect(verifierCarte(recettes, new Map(), liens, avecBestOf, R).map(l => l.plat)).toEqual(['BŒUF/PLEUROTE', 'MANGUE/MACIS']);
    expect(carteARelier(recettes, liens).map(x => x.plat)).toEqual(['CHEVRE', 'FLATBREAD']);
  });
  it('prix conseillé, prix réel, coefficient réel et pastille', () => {
    const carte = verifierCarte(recettes, new Map([['BŒUF/PLEUROTE', 24], ['HUITRES', 17.5]]), liens, frs, R);
    const boeuf = carte.find(l => l.plat === 'BŒUF/PLEUROTE');
    expect(boeuf).toMatchObject({ fiche: 'BŒUF AXURIA', prixReel: 24, pastille: 'rouge' });   // 21,82 € HT ÷ 5,38 = 4,06 < 4,5
    expect(boeuf?.coefficientReel).toBeCloseTo(24 / 1.1 / 5.38, 6);
    expect(boeuf?.conseille?.arrondi).toBe(27);   // 5,38 × 4,95 = 26,63 → 27
    expect(boeuf?.ecartPrix).toBe(-3);
    expect(carte.find(l => l.plat === 'HUITRES')).toMatchObject({ pastille: 'ambre', prixReel: 17.5 });   // coefficient 4,61 : à peine au-dessus de 4,5
    expect(carte.find(l => l.plat === 'MANGUE/MACIS')).toMatchObject({ prixReel: null, pastille: null, coefficientReel: null });
    expect(ancreCarte('BŒUF/PLEUROTE')).toBe('ratio-carte-boeuf-pleurote');
    expect(ancreCarte('ST JACK/CHOU FLEUR/ KUMQUAT')).toBe('ratio-carte-st-jack-chou-fleur-kumquat');
  });
  it('résumé : seuls un menu entier ou un plat de la carte sont hors budget, un plat de menu seul non', () => {
    const verifies = BUDGETS_DE_DEPART.map(b => verifierMenu(b, menus, frs, recettes, liens, R));
    const carte = verifierCarte(recettes, new Map([['BŒUF/PLEUROTE', 20]]), liens, frs, R);
    const r = resume(verifies, carte);
    // Bœuf (5 temps) et Mangue dépassent leur temps, mais aucun menu entier n'est chiffré : seul le plat de la carte compte
    expect(r.horsBudget.map(x => `${x.nom} · ${x.ou}`)).toEqual(['BŒUF AXURIA · carte · coef. 3,38']);
    expect(r.proches).toEqual([]);
    expect(r.sansPrix.map(x => x.nom)).toEqual(['HUÎTRE', 'MANGUE COCO']);
    expect(r.aCorriger.map(x => x.nom)).toEqual(['Pain maison', 'PLAT NON RELIÉ', 'TARTARE DE VEAU', 'BŒUF AXURIA']);
  });
  it('menu entier : coût réel comparé au total des budgets après perte', () => {
    const complet: Menu[] = [{ id: 'x', nom: '3 temps', services: [{ nom: 'Temps 1', plats: [{ frId: 'huitre' }] }, { nom: 'Temps 2', plats: [{ frId: 'boeuf' }] }, { nom: 'Temps 3', plats: [{ frId: 'mangue' }] }] }];
    const large = verifierMenu(soir3, complet, frs, recettes, liens, R);   // 6,71 € pour 9,03 €
    expect(large).toMatchObject({ ancre: 'ratio-soir3', pastille: 'vert' });
    expect(large.totalApresPerte).toBeCloseTo(9.025, 6);
    const serre = verifierMenu({ ...soir3, temps: [{ nom: 'Temps 1', budget: 1.4 }, { nom: 'Temps 2', budget: 4 }, { nom: 'Temps 3', budget: 1.5 }] }, complet, frs, recettes, liens, R);
    expect(serre.pastille).toBe('rouge');   // 6,71 € pour 6,9 × 0,95 = 6,555 € après perte
    const r = resume([serre], []);
    expect(r.horsBudget.map(x => `${x.nom} · ${x.ou}`)).toEqual([`Menu soir 3 temps · ${ecartEuros(6.71 - 6.9 * 0.95)}`]);
    expect(r.horsBudget[0]?.menu).toBe(true);
  });
});

describe('affichage et saisie', () => {
  it('euros, écarts signés, montants saisis', () => {
    expect(euros(15.1)).toBe('15,10 €');
    expect(ecartEuros(0.42)).toBe('+0,42 €');
    expect(ecartEuros(-0.3)).toBe('−0,30 €');
    expect(lireMontant('17,5')).toBe(17.5);
    expect(lireMontant(' 24 € ')).toBe(24);
    expect(lireMontant('abc')).toBeNull();
    expect(lireMontant('0')).toBeNull();
  });
});
