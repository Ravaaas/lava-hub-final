import { describe, expect, it } from 'vitest';
import { comparer, ecartVide, etatFiche, libellesEcart, lireLignes, parTemps, repartir, signatureEcart, type FicheImprimee } from './allergenesMenus';
import { ALLERGENES } from './allergenes';
import { servicesAffiches } from './menus';
import { lireMenu } from '../db/config';
import type { FicheRecette, Menu } from './types';
import * as srv from '../../../supabase/functions/allergenes-menus/regles';

const fr = (id: string, nom: string, allergenes: string[]) => ({ id, nom, allergenes, statut: 'carte', elements: [] }) as unknown as FicheRecette;
const tarte = fr('t', 'TARTE AU CITRON', ['Œuf', 'Gluten']), houmous = fr('h', 'HOUMOUS', ['Sésame']);
const frs = [fr('b', 'BŒUF AXURIA', ['Gluten', 'Lactose']), tarte, houmous];
const menu: Menu = { id: 'm', nom: 'Carte du soir', services: [
  { nom: 'Partages', plats: [{ frId: 'h' }] },
  { nom: 'Plat', plats: [{ frId: 'b' }, { texte: 'Pêche du jour' }] },
  { nom: 'Dessert', plats: [{ frId: 't' }] },
] };
const imprimee = (lignes = etatFiche(menu, frs, []).lignes): FicheImprimee => ({ menuId: 'm', menuNom: 'Carte du soir', lignes, imprimeLe: '2026-11-25T10:00:00Z', imprimePar: 'Alexandre' });

describe('fiche allergènes d\'un menu', () => {
  it('une ligne par plat, dans l\'ordre des temps, allergènes triés ; plat libre signalé', () => {
    const { lignes } = etatFiche(menu, frs, []);
    expect(lignes.map(l => [l.temps, l.nom, l.allergenes])).toEqual([
      ['Partages', 'HOUMOUS', ['Sésame']], ['Plat', 'BŒUF AXURIA', ['Gluten', 'Lactose']], ['Plat', 'Pêche du jour', []], ['Dessert', 'TARTE AU CITRON', ['Gluten', 'Œuf']],
    ]);
    expect(lignes[2]?.libre).toBe(true);
    expect(parTemps(lignes).map(g => [g.temps, g.lignes.length])).toEqual([['Partages', 1], ['Plat', 2], ['Dessert', 1]]);
  });

  it('jamais imprimée : pas d\'alerte ; imprimée et inchangée : à jour', () => {
    expect(etatFiche(menu, frs, [])).toMatchObject({ imprimee: null, ecart: null, changements: [] });
    expect(etatFiche(menu, frs, [imprimee()])).toMatchObject({ ecart: null, changements: [] });
  });

  it('allergène ajouté ou retiré sur un plat → à réimprimer, avec le détail', () => {
    const frs2 = [fr('b', 'BŒUF AXURIA', ['Gluten', 'Moutarde']), tarte, houmous];
    const e = etatFiche(menu, frs2, [imprimee()]);
    expect(e.ecart?.changes).toEqual([{ nom: 'BŒUF AXURIA', ajoutes: ['Moutarde'], retires: ['Lactose'] }]);
    expect(e.changements).toEqual(['BŒUF AXURIA : + Moutarde, − Lactose']);
  });

  it('plat ajouté, retiré ou renommé', () => {
    const avant = etatFiche(menu, frs, []).lignes;
    const menu2: Menu = { ...menu, services: [{ nom: 'Partages', plats: [] }, { nom: 'Plat', plats: [{ frId: 'b' }, { frId: 'x' }] }, { nom: 'Dessert', plats: [{ frId: 't' }] }] };
    const frs2 = [...frs.slice(0, 1), fr('t', 'TARTE CITRON MERINGUÉE', ['Œuf', 'Gluten']), fr('x', 'VOLAILLE', [])];
    const e = comparer(avant, etatFiche(menu2, frs2, []).lignes);
    expect(libellesEcart(e)).toEqual([
      'Plat ajouté : VOLAILLE (aucun allergène)', 'Plat retiré : HOUMOUS', 'Plat retiré : Pêche du jour', 'Plat renommé : TARTE AU CITRON → TARTE CITRON MERINGUÉE',
    ]);
  });

  it('un plat qui change seulement de temps ne demande pas de réimprimer', () => {
    const menu2: Menu = { ...menu, services: [{ nom: 'Partages', plats: [{ frId: 'h' }, { frId: 'b' }] }, { nom: 'Plat', plats: [{ texte: 'Pêche du jour' }] }, { nom: 'Dessert', plats: [{ frId: 't' }] }] };
    expect(ecartVide(comparer(etatFiche(menu, frs, []).lignes, etatFiche(menu2, frs, []).lignes))).toBe(true);
  });

  it('lignes relues depuis la base ; empreinte identique pour un même écart, différente sinon', () => {
    const avant = imprimee().lignes;
    expect(lireLignes(JSON.parse(JSON.stringify(avant)))).toEqual(avant);
    expect(lireLignes([{ cle: 'b', nom: 'X', allergenes: 'Lactose, Gluten' }, null, { nom: 'sans clé' }])).toEqual([{ cle: 'b', temps: '', nom: 'X', allergenes: ['Gluten', 'Lactose'] }]);
    const apres1 = etatFiche(menu, [fr('b', 'BŒUF AXURIA', ['Gluten']), tarte, houmous], []).lignes;
    const apres2 = etatFiche(menu, [fr('b', 'BŒUF AXURIA', ['Gluten', 'Soja']), tarte, houmous], []).lignes;
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
  it('mêmes temps affichés et même lecture des menus', () => {
    const bruts = [
      { id: 'a', nom: '3 temps', services: [{ nom: 'Entrée', plats: [{ frId: 'h' }] }, { nom: 'Plat', plats: [{ frId: 'b' }] }, { nom: 'Dessert', plats: [{ text: 'Glace' }] }] },
      { id: 'b', nom: 'Carte du soir', services: [{ nom: 'Dessert', plats: [{ frId: 't' }] }, { nom: 'Plat', plats: [] }] },
      { id: 'c', nom: 'Lunch', plats: [{ frId: 'b' }] },
    ];
    for (const b of bruts) {
      expect(srv.lireMenu(b)).toEqual(lireMenu(b));
      expect(srv.servicesAffiches(srv.lireMenu(b))).toEqual(servicesAffiches(lireMenu(b)));
      expect(srv.ficheAllergenes(srv.lireMenu(b), frs)).toEqual(etatFiche(lireMenu(b), frs, []).lignes);
    }
  });
});
