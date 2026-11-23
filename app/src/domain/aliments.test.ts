// Plats à adapter : régimes (végétarien, végétalien, sans viande, sans porc, sans alcool, halal) et mots généraux écrits à la main (fromage, viande…).
import { describe, expect, it } from 'vitest';
import { alertesMenu } from './menus';
import { familleDuMot, trouverPourRegime, trouverTerme, FAMILLES } from '../../../supabase/functions/recap-groupes/aliments';
import * as srv from '../../../supabase/functions/recap-groupes/domaine';
import type { Fiche, FicheRecette, Niveau, Profil } from './types';

const regime = (r: string, ...textes: string[]) => trouverPourRegime(r, textes)?.terme;

describe('régimes : aliments exclus repérés dans le nom, les éléments et les ingrédients', () => {
  it('végétarien : viandes, volailles, poissons, fruits de mer', () => {
    expect(regime('Végétarien', 'TARTARE DE VEAU, GARUM ANCHOIS, CACAHUÈTE')).toBe('veau');
    expect(regime('Végétarien', 'Magret de canard laqué')).toBe('canard');
    expect(regime('Végétarien', 'TRUITE DES PYRÉNÉES, BETTERAVE JAUNE')).toBe('truite');
    expect(regime('Végétarien', 'HUÎTRE, YUZUKOSHO, AIL DES OURS, SOBACHA')).toBe('huître');
    expect(regime('Végétarien', 'Saint-Jacques snackées')).toBe('saint-jacques');
    expect(regime('Végétarien', 'Cassolette de Saint Jacques')).toBe('saint-jacques');
    expect(regime('Végétarien', 'BŒUF AXURIA, PLEUROTES, OIGNON NOIR')).toBe('bœuf');
    expect(regime('Végétarien', 'Risotto de céleri, champignons, parmesan')).toBeUndefined();   // fromage et œuf permis
    expect(regime('Végétarien', 'Œuf parfait, velouté butternut')).toBeUndefined();
  });

  it('végétalien : en plus lait, fromage, œuf, miel, beurre, crème', () => {
    expect(regime('Végétalien', 'Œuf parfait')).toBe('œuf');
    expect(regime('Végétalien', 'Tarte au miel')).toBe('miel');
    expect(regime('Végétalien', 'CRÈME', 'CURRY')).toBe('crème');
    expect(regime('Végétalien', 'Fondue de comté')).toBe('comté');
    expect(regime('Végétalien', 'Mayonnaise maison')).toBe('mayonnaise');
    expect(regime('Végétalien', 'Veau')).toBe('veau');
    // lait et crème végétaux : pas du laitage
    expect(regime('Végétalien', 'RIZ AU LAIT COCO, SORBET ANANAS GINGEMBRE')).toBeUndefined();
    expect(regime('Végétalien', 'Lait d\'amande', 'Crème de coco', 'Beurre de cacahuète', 'Crème de marron')).toBeUndefined();
    expect(regime('Végétalien', 'Riz au lait')).toBe('lait');
  });

  it('sans viande, sans porc, sans alcool, halal', () => {
    expect(regime('Sans viande', 'Poulet rôti')).toBe('poulet');
    expect(regime('Sans viande', 'Saumon mi-cuit')).toBeUndefined();   // le poisson est permis
    expect(regime('Sans porc', 'Salade, lardons et jambon cru')).toBe('jambon');
    expect(regime('Sans porc', 'Poulet rôti')).toBeUndefined();
    expect(regime('Sans alcool', 'Sauce au vin blanc')).toBe('vin');
    expect(regime('Sans alcool', 'Vinaigrette au vinaigre de cidre')).toBe('cidre');   // cidre est un alcool ; vinaigre non
    expect(regime('Sans alcool', 'Vinaigre balsamique')).toBeUndefined();
    expect(regime('Halal', 'Pâtes au chorizo')).toBe('chorizo');
    expect(regime('Halal', 'Poulet au rhum')).toBe('rhum');
    expect(regime('Halal', 'Poulet rôti')).toBeUndefined();
    expect(regime('Casher', 'Jambon')).toBeUndefined();   // aucune détection pour le casher
  });

  it('allergènes déclarés sur la fiche du plat : végétarien et végétalien', () => {
    expect(trouverPourRegime('Végétarien', ['PLAT SANS DÉTAIL'], ['Poisson'])?.terme).toBe('Poisson');
    expect(trouverPourRegime('Végétarien', ['PLAT SANS DÉTAIL'], ['Lactose'])).toBeUndefined();
    expect(trouverPourRegime('Végétalien', ['PLAT SANS DÉTAIL'], ['Lactose'])?.terme).toBe('Lactose');
  });
});

describe('mots généraux écrits à la main', () => {
  it('la famille désignée par un mot, au singulier ou au pluriel', () => {
    expect(familleDuMot('Fromages')).toBe(FAMILLES.fromage);
    expect(familleDuMot(' fruits de mer ')).toBe(FAMILLES['fruits de mer']);
    expect(familleDuMot('Viande')).toBe(FAMILLES.viande);
    expect(familleDuMot('Produits laitiers')).toBe(FAMILLES.laitage);
    expect(familleDuMot('Kiwi')).toBeUndefined();
  });
  it('un mot général trouve ses aliments', () => {
    const cherche = (mot: string, ...t: string[]) => { const f = familleDuMot(mot); return f && trouverTerme(f.termes, t, f.sans)?.terme; };
    expect(cherche('Fromage', 'Tarte fine au Brie et noix')).toBe('brie');
    expect(cherche('Fromage', 'Crème de coco')).toBeUndefined();
    expect(cherche('Fruits de mer', 'Linguine, palourdes, ail')).toBe('palourde');
    expect(cherche('Viande', 'Daube de joue')).toBe('daube');
    expect(cherche('Alcool', 'Poires pochées au vin')).toBe('vin');
    expect(cherche('Fruits rouges', 'Pavlova fraises et framboises')).toBe('fraise');
    expect(cherche('Champignons', 'Fricassée de girolles')).toBe('girolle');
    expect(cherche('Viande', 'Champignons pied de mouton')).toBeUndefined();
  });
});

describe('plats à adapter avec régimes et mots généraux', () => {
  const frs = [
    { id: 'a', nom: 'TARTARE DE VEAU, GARUM ANCHOIS, CACAHUÈTE', allergenes: ['Poisson', 'Arachide'], elements: [] },
    { id: 'b', nom: 'BETTERAVE, OIGNON, CACAHUÈTE, CAFÉ, ORANGE', allergenes: [], elements: [] },
    { id: 'c', nom: 'VANILLE, COCO, MANGUE, PATATE DOUCE, MACIS', allergenes: ['Lactose'], elements: [{ type: 'fiche', id: 'g' }] },
  ] as unknown as FicheRecette[];
  const fiches = [{ id: 'g', nom: 'CHOCOLAT IVOIRE', ingredients: [{ nom: 'CRÈME' }, { nom: 'Fromage frais' }] }] as unknown as Fiche[];
  const niveaux: Niveau[] = [{ nom: 'Entrée', plats: [{ frId: 'a', qte: 5 }, { frId: 'b', qte: 5 }] }, { nom: 'Dessert', plats: [{ frId: 'c', qte: 10 }] }];
  const profils: Profil[] = [
    { id: '1', nb: 1, allergenes: [], regimes: ['Végétarien'] },
    { id: '2', nb: 2, allergenes: ['Fromage'], regimes: ['Sans porc'] },
    { id: '3', nb: 1, allergenes: ['Cacahuète'], regimes: [] },
  ];
  const brutes = [
    { id: 'a', nom: frs[0]?.nom, allergenes: 'Poisson, Arachide', sous_recettes: [] },
    { id: 'b', nom: frs[1]?.nom, allergenes: '', sous_recettes: [] },
    { id: 'c', nom: frs[2]?.nom, allergenes: 'Lactose', sous_recettes: [{ id: 'g' }] },
  ];

  it('une personne qui ne mange pas de viande : les plats avec viande ou poisson sont à adapter', () => {
    const a = alertesMenu(niveaux, profils, frs, fiches);
    expect(a.map(x => x.plat)).toEqual(['TARTARE DE VEAU, GARUM ANCHOIS, CACAHUÈTE', 'BETTERAVE, OIGNON, CACAHUÈTE, CAFÉ, ORANGE', 'VANILLE, COCO, MANGUE, PATATE DOUCE, MACIS']);
    expect(a[0]).toMatchObject({ allergenes: ['Cacahuète', 'Végétarien'], personnes: 2 });
    expect(a[0]?.indices).toMatchObject({ Végétarien: 'Poisson' });   // allergène déclaré sur la fiche du plat
    expect(a[1]).toMatchObject({ allergenes: ['Cacahuète'], personnes: 1 });   // « Cacahuète » écrit à la main
    expect(a[2]).toMatchObject({ allergenes: ['Fromage'], personnes: 2, indices: { Fromage: 'fromage' } });   // fromage frais dans un élément du plat
  });

  it('un seul régime sans allergie : les plats concernés sont signalés', () => {
    const solo = alertesMenu([{ nom: 'Plat', plats: [{ texte: 'Magret de canard', qte: 4 }, { texte: 'Risotto aux cèpes', qte: 6 }] }], [{ nb: 1, allergenes: [], regimes: ['Végétalien'] }], [], []);
    expect(solo).toEqual([{ plat: 'Magret de canard', allergenes: ['Végétalien'], personnes: 1, indices: { Végétalien: 'canard' } }]);
    expect(alertesMenu(niveaux, [{ nb: 1, allergenes: [], regimes: ['Casher'] }], frs, fiches)).toEqual([]);
  });

  it('même résultat dans la fonction d\'envoi du lundi', () => {
    const srvFrs = brutes.map(l => srv.lireFicheRecette(l as Record<string, unknown>));
    const srvFiches = [srv.lireFiche({ id: 'g', nom: 'CHOCOLAT IVOIRE', ingredients: [{ nom: 'CRÈME' }, { nom: 'Fromage frais' }] })];
    expect(srv.alertesMenu(niveaux as never, profils, srvFrs, srvFiches)).toEqual(alertesMenu(niveaux, profils, frs, fiches));
  });
});
