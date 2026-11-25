import { describe, expect, it } from 'vitest';
import { comparer, ecartVide, etatFiche, libellesEcart, lireLignes, parTemps, repartir, sectionsDesPlats, signatureEcart, STATUTS_FICHE, type FicheImprimee } from './allergenesMenus';
import { ALLERGENES } from './allergenes';
import { STATUTS_CARTE } from './menus';
import type { FicheRecette, Menu } from './types';
import * as srv from '../../../supabase/functions/allergenes-menus/regles';

const fr = (id: string, nom: string, statut: string, allergenes: string[]) => ({ id, nom, allergenes, statut, elements: [] }) as unknown as FicheRecette;
const tarte = fr('t', 'TARTE AU CITRON', 'carte', ['Œuf', 'Gluten']), houmous = fr('h', 'HOUMOUS', 'partages', ['Sésame']);
const frs = [fr('b', 'BŒUF AXURIA', 'carte', ['Gluten', 'Lactose']), tarte, houmous, fr('l', 'SALADE', 'lunch', []), fr('x', 'ANCIEN', 'archive', ['Soja']), fr('o', 'BEST', 'bestof', [])];
const menus: Menu[] = [
  { id: 'm1', nom: 'Lunch', services: [{ nom: 'Entrée', plats: [{ frId: 'l' }] }, { nom: 'Plat', plats: [{ frId: 'b' }] }, { nom: 'Dessert', plats: [{ frId: 't' }] }] },
  { id: 'm2', nom: 'Carte du soir', services: [{ nom: 'Partages', plats: [{ frId: 'h' }] }, { nom: 'Plat', plats: [{ frId: 'b' }, { frId: 'l' }] }, { nom: 'Dessert', plats: [{ frId: 't' }] }] },
];
const imprimee = (lignes = etatFiche(frs, menus, []).lignes): FicheImprimee => ({ menuId: 'carte', menuNom: 'La carte', lignes, imprimeLe: '2026-11-25T10:00:00Z', imprimePar: 'Alexandre' });

describe('fiche allergènes de la carte', () => {
  it('tous les plats de la carte actuelle, dans l\'ordre du repas (Partages, Entrées, Plats, Desserts) puis par nom ; ni Best of ni archives', () => {
    const { lignes } = etatFiche(frs, menus, []);
    expect(lignes.map(l => [l.temps, l.nom, l.allergenes])).toEqual([
      ['Partages', 'HOUMOUS', ['Sésame']], ['Entrées', 'SALADE', []], ['Plats', 'BŒUF AXURIA', ['Gluten', 'Lactose']], ['Desserts', 'TARTE AU CITRON', ['Gluten', 'Œuf']],
    ]);
    expect(parTemps(lignes).map(g => [g.temps, g.lignes.length])).toEqual([['Partages', 1], ['Entrées', 1], ['Plats', 1], ['Desserts', 1]]);
  });

  it('jamais imprimée : pas d\'alerte ; imprimée et inchangée : à jour', () => {
    expect(etatFiche(frs, menus, [])).toMatchObject({ imprimee: null, ecart: null, changements: [] });
    expect(etatFiche(frs, menus, [imprimee()])).toMatchObject({ ecart: null, changements: [] });
  });

  it('allergène ajouté ou retiré sur un plat → à réimprimer, avec le détail', () => {
    const frs2 = [fr('b', 'BŒUF AXURIA', 'carte', ['Gluten', 'Moutarde']), ...frs.slice(1)];
    const e = etatFiche(frs2, menus, [imprimee()]);
    expect(e.ecart?.changes).toEqual([{ nom: 'BŒUF AXURIA', ajoutes: ['Moutarde'], retires: ['Lactose'] }]);
    expect(e.changements).toEqual(['BŒUF AXURIA : + Moutarde, − Lactose']);
  });

  it('plat mis à la carte, archivé ou renommé ; changement de section seul : rien à réimprimer', () => {
    const avant = etatFiche(frs, menus, []).lignes;
    const frs2 = [fr('b', 'BŒUF AXURIA', 'archive', []), fr('t', 'TARTE CITRON MERINGUÉE', 'carte', ['Œuf', 'Gluten']), houmous, fr('l', 'SALADE', 'lunch', []), fr('x', 'ANCIEN', 'carte', ['Soja'])];
    expect(libellesEcart(comparer(avant, etatFiche(frs2, menus, []).lignes))).toEqual([
      'Plat ajouté à la carte : ANCIEN (Soja)', 'Plat retiré de la carte : BŒUF AXURIA', 'Plat renommé : TARTE AU CITRON → TARTE CITRON MERINGUÉE',
    ]);
    const frs3 = frs.map(f => (f.id === 'l' ? fr('l', 'SALADE', 'carte', []) : f));
    expect(ecartVide(comparer(avant, etatFiche(frs3, menus, []).lignes))).toBe(true);
  });

  it('lignes relues depuis la base ; empreinte identique pour un même écart, différente sinon', () => {
    const avant = imprimee().lignes;
    expect(lireLignes(JSON.parse(JSON.stringify(avant)))).toEqual(avant);
    expect(lireLignes([{ cle: 'b', nom: 'X', allergenes: 'Lactose, Gluten' }, null, { nom: 'sans clé' }])).toEqual([{ cle: 'b', temps: '', nom: 'X', allergenes: ['Gluten', 'Lactose'] }]);
    const apres1 = etatFiche([fr('b', 'BŒUF AXURIA', 'carte', ['Gluten']), ...frs.slice(1)], menus, []).lignes;
    const apres2 = etatFiche([fr('b', 'BŒUF AXURIA', 'carte', ['Gluten', 'Soja']), ...frs.slice(1)], menus, []).lignes;
    expect(signatureEcart(comparer(avant, apres1))).toBe(signatureEcart(comparer(avant, [...apres1])));
    expect(signatureEcart(comparer(avant, apres1))).not.toBe(signatureEcart(comparer(avant, apres2)));
  });

  it('section tirée des menus : entrée l\'emporte sur plat ; Temps 1 = entrée, dernier temps = dessert ; absent des menus = plat', () => {
    const m: Menu[] = [
      { id: 'a', nom: 'Carte du soir', services: [{ nom: 'Plat', plats: [{ frId: 'tartare' }, { frId: 'huitre' }, { frId: 'boeuf' }] }, { nom: 'Desserts', plats: [{ frId: 'riz' }] }] },
      { id: 'b', nom: 'Lunch', services: [{ nom: 'Entrée', plats: [{ frId: 'tartare' }] }, { nom: 'Plat', plats: [{ texte: 'Pêche du jour' }] }] },
      { id: 'c', nom: '5 temps', services: [1, 2, 3, 4, 5].map(n => ({ nom: `Temps ${n}`, plats: n === 1 ? [{ frId: 'huitre' }] : n === 5 ? [{ frId: 'vanille' }] : [] })) },
    ];
    expect(Object.fromEntries(sectionsDesPlats(m))).toEqual({ tartare: 'Entrées', huitre: 'Entrées', boeuf: 'Plats', riz: 'Desserts', vanille: 'Desserts' });
    expect(etatFiche([fr('z', 'HORS MENU', 'carte', [])], m, []).lignes[0]?.temps).toBe('Plats');
  });

  it('colonnes : les 13 allergènes, écrits avec ou sans accent ou pluriel ; le reste à part', () => {
    const r = repartir(['Gluten', 'crustacés', 'OEUF', 'Fruits à coque', 'Kiwi']);
    expect([...r.colonnes]).toEqual(['Gluten', 'Crustacé', 'Œuf', 'Fruit à coque']);
    expect(r.autres).toEqual(['Kiwi']);
  });
});

describe('fonction « allergenes-menus » : mêmes règles que l\'app', () => {
  it('même liste d\'allergènes', () => { expect(srv.ALLERGENES).toEqual([...ALLERGENES]); });
  it('même carte actuelle (statuts Carte, Partages, Lunch)', () => { expect([...STATUTS_FICHE].sort()).toEqual([...STATUTS_CARTE].sort()); });
});
