import { describe, expect, it } from 'vitest';
import { comparer, ecartVide, etatFiche, libellesEcart, lireLignes, parTemps, repartir, SECTIONS_CARTE, signatureEcart, type FicheImprimee } from './allergenesMenus';
import { ALLERGENES } from './allergenes';
import { STATUTS_CARTE } from './menus';
import type { FicheRecette } from './types';
import * as srv from '../../../supabase/functions/allergenes-menus/regles';

const fr = (id: string, nom: string, statut: string, allergenes: string[]) => ({ id, nom, allergenes, statut, elements: [] }) as unknown as FicheRecette;
const tarte = fr('t', 'TARTE AU CITRON', 'carte', ['Œuf', 'Gluten']), houmous = fr('h', 'HOUMOUS', 'partages', ['Sésame']);
const frs = [fr('b', 'BŒUF AXURIA', 'carte', ['Gluten', 'Lactose']), tarte, houmous, fr('l', 'SALADE', 'lunch', []), fr('x', 'ANCIEN', 'archive', ['Soja']), fr('o', 'BEST', 'bestof', [])];
const imprimee = (lignes = etatFiche(frs, []).lignes): FicheImprimee => ({ menuId: 'carte', menuNom: 'La carte', lignes, imprimeLe: '2026-11-25T10:00:00Z', imprimePar: 'Alexandre' });

describe('fiche allergènes de la carte', () => {
  it('tous les plats de la carte actuelle, par section (Partages, Carte du soir, Lunch) puis par nom ; ni Best of ni archives', () => {
    const { lignes } = etatFiche(frs, []);
    expect(lignes.map(l => [l.temps, l.nom, l.allergenes])).toEqual([
      ['Partages', 'HOUMOUS', ['Sésame']], ['Carte du soir', 'BŒUF AXURIA', ['Gluten', 'Lactose']], ['Carte du soir', 'TARTE AU CITRON', ['Gluten', 'Œuf']], ['Lunch', 'SALADE', []],
    ]);
    expect(parTemps(lignes).map(g => [g.temps, g.lignes.length])).toEqual([['Partages', 1], ['Carte du soir', 2], ['Lunch', 1]]);
  });

  it('jamais imprimée : pas d\'alerte ; imprimée et inchangée : à jour', () => {
    expect(etatFiche(frs, [])).toMatchObject({ imprimee: null, ecart: null, changements: [] });
    expect(etatFiche(frs, [imprimee()])).toMatchObject({ ecart: null, changements: [] });
  });

  it('allergène ajouté ou retiré sur un plat → à réimprimer, avec le détail', () => {
    const frs2 = [fr('b', 'BŒUF AXURIA', 'carte', ['Gluten', 'Moutarde']), ...frs.slice(1)];
    const e = etatFiche(frs2, [imprimee()]);
    expect(e.ecart?.changes).toEqual([{ nom: 'BŒUF AXURIA', ajoutes: ['Moutarde'], retires: ['Lactose'] }]);
    expect(e.changements).toEqual(['BŒUF AXURIA : + Moutarde, − Lactose']);
  });

  it('plat mis à la carte, archivé ou renommé ; changement de section seul : rien à réimprimer', () => {
    const avant = etatFiche(frs, []).lignes;
    const frs2 = [fr('b', 'BŒUF AXURIA', 'archive', []), fr('t', 'TARTE CITRON MERINGUÉE', 'carte', ['Œuf', 'Gluten']), houmous, fr('l', 'SALADE', 'lunch', []), fr('x', 'ANCIEN', 'carte', ['Soja'])];
    expect(libellesEcart(comparer(avant, etatFiche(frs2, []).lignes))).toEqual([
      'Plat ajouté à la carte : ANCIEN (Soja)', 'Plat retiré de la carte : BŒUF AXURIA', 'Plat renommé : TARTE AU CITRON → TARTE CITRON MERINGUÉE',
    ]);
    const frs3 = frs.map(f => (f.id === 'l' ? fr('l', 'SALADE', 'carte', []) : f));
    expect(ecartVide(comparer(avant, etatFiche(frs3, []).lignes))).toBe(true);
  });

  it('lignes relues depuis la base ; empreinte identique pour un même écart, différente sinon', () => {
    const avant = imprimee().lignes;
    expect(lireLignes(JSON.parse(JSON.stringify(avant)))).toEqual(avant);
    expect(lireLignes([{ cle: 'b', nom: 'X', allergenes: 'Lactose, Gluten' }, null, { nom: 'sans clé' }])).toEqual([{ cle: 'b', temps: '', nom: 'X', allergenes: ['Gluten', 'Lactose'] }]);
    const apres1 = etatFiche([fr('b', 'BŒUF AXURIA', 'carte', ['Gluten']), ...frs.slice(1)], []).lignes;
    const apres2 = etatFiche([fr('b', 'BŒUF AXURIA', 'carte', ['Gluten', 'Soja']), ...frs.slice(1)], []).lignes;
    expect(signatureEcart(comparer(avant, apres1))).toBe(signatureEcart(comparer(avant, [...apres1])));
    expect(signatureEcart(comparer(avant, apres1))).not.toBe(signatureEcart(comparer(avant, apres2)));
  });

  it('colonnes : les 13 allergènes, écrits avec ou sans accent ou pluriel ; le reste à part', () => {
    const r = repartir(['Gluten', 'crustacés', 'OEUF', 'Fruits à coque', 'Kiwi']);
    expect([...r.colonnes]).toEqual(['Gluten', 'Crustacé', 'Œuf', 'Fruit à coque']);
    expect(r.autres).toEqual(['Kiwi']);
  });
});

describe('fonction « allergenes-menus » : mêmes règles que l\'app', () => {
  it('même liste d\'allergènes', () => { expect(srv.ALLERGENES).toEqual([...ALLERGENES]); });
  it('même carte actuelle (statuts Carte, Partages, Lunch)', () => { expect(SECTIONS_CARTE.map(s => s.statut).sort()).toEqual([...STATUTS_CARTE].sort()); });
});
