// Fiches des groupes envoyées chaque lundi : la fonction « recap-groupes » (supabase/functions/recap-groupes/domaine.ts) reprend les règles de l'app
// parce qu'elle se déploie à la main. Ces tests comparent les deux sur les mêmes données : si l'un change, l'autre doit suivre.
import { describe, expect, it } from 'vitest';
import { alertesMenu, niveauxDuGroupe, platsCommandes } from './menus';
import { dateLongue, resumeProfils } from './groupes';
import type { Fiche, FicheRecette, Groupe, Menu, Niveau, Profil } from './types';
import * as srv from '../../../supabase/functions/recap-groupes/domaine';

const frsLignes = [
  { id: 'b', nom: 'BŒUF AXURIA', allergenes: 'Gluten', sous_recettes: [{ id: 'f1', grammage: '' }, { text: 'Purée de pomme de terre', grammage: '' }] },
  { id: 'd', nom: 'DESSERT', allergenes: ['Lactose'], sous_recettes: [{ id: 's', grammage: '' }] },
  { id: 'v', nom: 'VOLAILLE', allergenes: 'Céleri, Gluten', sous_recettes: [] },
];
const fichesLignes = [
  { id: 'f1', nom: 'JUS CURRY', ingredients: [{ nom: 'CURRY VERT' }, { nom: 'Base', ficheId: 's' }] },
  { id: 's', nom: 'SIROP', ingredients: [{ nom: 'Kiwis gold' }, { nom: 'Ail noir' }] },
];
const appFrs = frsLignes.map(l => ({ id: l.id, nom: l.nom, statut: 'carte', allergenes: srv.listeAllergenes(l.allergenes), elements: l.sous_recettes.map(e => ('id' in e ? { type: 'fiche', id: e.id, grammage: '' } : { type: 'libre', texte: e.text, grammage: '' })) })) as unknown as FicheRecette[];
const appFiches = fichesLignes.map(l => ({ ...l, categorie: '', quantite_nette: '', conditionnement: [], allergenes: [], process: [] })) as unknown as Fiche[];
const srvFrs = frsLignes.map(srv.lireFicheRecette);
const srvFiches = fichesLignes.map(srv.lireFiche);

const niveaux: Niveau[] = [
  { nom: 'Plat', plats: [{ frId: 'b', qte: 9 }, { texte: 'Bœuf sans tempura', qte: 2, remplace: 'b', pour: ['a'] }, { frId: 'v', qte: null }, { texte: 'Tarte kiwi', qte: null }] },
  { nom: 'Dessert', plats: [{ frId: 'd', qte: 11 }] },
];
// les mêmes niveaux tels qu'écrits en base : un plat libre s'y appelle « text »
const niveauxBruts = niveaux.map(n => ({ nom: n.nom, plats: n.plats.map(({ texte, ...p }: Record<string, unknown>) => (texte === undefined ? p : { ...p, text: texte })) }));
const profils: Profil[] = [
  { id: 'a', nb: 1, allergenes: ['Gluten'], regimes: ['Végétalien'] },
  { id: 'b', nb: 2, allergenes: ['Kiwi', 'Ail', 'Pomme de terre'], regimes: [] },
  { id: 'c', nb: 1, allergenes: ['curry'], regimes: [] },
];

describe('fiche groupe du lundi : mêmes règles que l\'app', () => {
  it('plats à adapter : allergènes, allergies libres cherchées dans les ingrédients, remplaçants', () => {
    expect(srv.alertesMenu(niveaux as never, profils, srvFrs, srvFiches)).toEqual(alertesMenu(niveaux, profils, appFrs, appFiches));
    expect(srv.alertesMenu(niveaux as never, profils, srvFrs, srvFiches).length).toBeGreaterThanOrEqual(2);   // le test compare bien quelque chose
    expect(srv.alertesMenu(niveaux as never, [{ nb: 1, allergenes: [], regimes: ['Halal'] }], srvFrs, srvFiches)).toEqual([]);
  });

  it('plats servis : seuls les plats avec un nombre dès qu\'un nombre est saisi', () => {
    for (const n of niveaux) expect(srv.platsCommandes(n as never)).toEqual(platsCommandes(n));
    expect(srv.platsCommandes(niveaux[0] as never).map(p => ('texte' in p ? p.texte : p.frId))).toEqual(['b', 'Bœuf sans tempura']);
  });

  it('date longue en français, sans dépendre de la langue du serveur', () => {
    for (const d of ['2026-12-01', '2026-11-29', '2027-01-04', '2026-08-15']) expect(srv.dateLongue(d)).toBe(dateLongue(d));
    expect(srv.heureFr('19:15')).toBe('19h15');
  });

  it('niveaux d\'un groupe sans niveaux : ceux du menu choisi, temps fixes remis dans l\'ordre', () => {
    const brut = { id: 'm5', nom: '5 temps', services: [{ nom: 'Entrée', plats: [{ frId: 'b' }] }, { nom: 'Temps 3', plats: [{ text: 'X' }] }, { nom: 'Plat', plats: [{ frId: 'v' }] }] };
    const appMenu: Menu = { id: 'm5', nom: '5 temps', services: [{ nom: 'Entrée', plats: [{ frId: 'b' }] }, { nom: 'Temps 3', plats: [{ texte: 'X' }] }, { nom: 'Plat', plats: [{ frId: 'v' }] }] };
    const attendu = niveauxDuGroupe({ menu_id: 'm5', niveaux: [] } as unknown as Groupe, [appMenu]);
    const recu = srv.niveauxDuGroupe({ menu_id: 'm5', niveaux: [] } as never, [srv.lireMenu(brut)]);
    expect(attendu).toHaveLength(5);
    expect(recu.map(n => n.nom)).toEqual(attendu.map(n => n.nom));
    expect(recu.map(n => n.plats.length)).toEqual(attendu.map(n => n.plats.length));
  });

  it('lecture d\'une ligne de la table groupes : profils, anciennes colonnes texte, niveaux', () => {
    const neuf = srv.lireGroupe({ id: 'g', nom: 'X', date: '2026-12-01', pax: 11, statut: 'brouillon', profils, niveaux: niveauxBruts, reglement: 'acompte' });
    expect(neuf.statut).toBe('brouillon');
    expect(neuf.profils.map(p => p.id)).toEqual(['a', 'b', 'c']);
    expect(neuf.niveaux).toEqual(niveaux);
    expect(srv.resumeProfils(profils)).toEqual(resumeProfils(profils));
    const ancien = srv.lireGroupe({ id: 'g', nom: 'X', date: '2026-12-01', pax: 8, allergenes: 'Gluten (2), Lactose', regimes: 'Végétarien', plats_sur_mesure: [{ frId: 'b' }, { text: 'Pain' }] });
    expect(ancien.statut).toBe('confirme');
    expect(ancien.profils).toEqual([
      { id: 'p1', nb: 2, allergenes: ['Gluten'], regimes: [] }, { id: 'p2', nb: 1, allergenes: ['Lactose'], regimes: [] }, { id: 'p3', nb: 1, allergenes: [], regimes: ['Végétarien'] }]);
    expect(ancien.niveaux).toEqual([{ nom: '', plats: [{ frId: 'b', qte: null }, { texte: 'Pain', qte: null }] }]);
  });

  it('fiche à dessiner : en-tête, plats numérotés, quantités, remplacement, personnes, restrictions, règlement', () => {
    const g = srv.lireGroupe({ id: 'g', nom: 'Élitiste', date: '2026-12-01', heure: '19:15', pax: 11, salle: 'Salon Basalte', menu_nom: '5 temps', profils, niveaux: niveauxBruts,
      referent: 'Elodie', reglement: 'empreinte', boissons: 'Eau', notes: 'RAS' });
    const f = srv.construireFiche(g, [], srvFrs, srvFiches);
    expect(f.cles).toEqual(['mardi 1 décembre 2026', '19h15', '11 personnes', 'Salon Basalte', 'Menu 5 temps']);
    expect(f.niveaux.map(n => n.nom)).toEqual(['Plat', 'Dessert']);
    expect(f.niveaux[0]?.total).toBe('11 / 11 pers.');
    expect(f.niveaux[0]?.plats.map(p => p.nom)).toEqual(['BŒUF AXURIA', 'Bœuf sans tempura']);
    expect(f.niveaux[0]?.plats.map(p => p.numero)).toEqual(['9', '2']);
    expect(f.niveaux[0]?.plats[1]).toMatchObject({ remplace: 'BŒUF AXURIA', pour: ['Gluten · Végétalien · 1 pers.'] });
    expect(f.niveaux[0]?.plats[0]?.risques).toEqual(['Gluten × 1']);
    // 4 personnes concernées (gluten, pomme de terre, curry) : le remplaçant prévu pour 2 ne suffit pas
    expect(f.alertes.find(a => a.plat === 'BŒUF AXURIA')).toMatchObject({ adapte: false, texte: expect.stringContaining('Bœuf sans tempura : pas assez pour 4 pers.') as unknown });
    // une seule personne concernée : adapté
    const adapte = srv.construireFiche({ ...g, profils: [profils[0] as Profil] }, [], srvFrs, srvFiches);
    expect(adapte.alertes.find(a => a.plat === 'BŒUF AXURIA')).toMatchObject({ adapte: true, texte: ' — Gluten, Végétalien (bœuf) · 1 pers. → remplacé par Bœuf sans tempura' });
    expect(f.restrictions).toHaveLength(3);
    expect(f).toMatchObject({ referent: 'Elodie', reglement: 'Empreinte bancaire', boissons: 'Eau', notes: 'RAS' });
    // sans nombres : plats numérotés d'un niveau à l'autre ; sans plats : message
    const sans = srv.construireFiche(srv.lireGroupe({ id: 'g', nom: 'Y', date: '2026-12-02', pax: 4, niveaux: [{ nom: 'A', plats: [{ text: 'P1' }, { text: 'P2' }] }, { nom: 'B', plats: [{ text: 'P3' }] }] }), [], srvFrs, srvFiches);
    expect(sans.niveaux.flatMap(n => n.plats.map(p => p.numero))).toEqual(['1', '2', '3']);
    expect(srv.construireFiche(srv.lireGroupe({ id: 'g', nom: 'Z', date: '2026-12-02', pax: 4 }), [], srvFrs, srvFiches).vide).toBe('Menu sur mesure — voir les notes.');
  });

  it('semaine : lundi → dimanche', () => {
    expect(srv.lundiDe('2026-11-23')).toBe('2026-11-23');   // lundi
    expect(srv.lundiDe('2026-11-25')).toBe('2026-11-23');
    expect(srv.lundiDe('2026-11-29')).toBe('2026-11-23');   // dimanche
    expect(srv.lundiDe('2026-11-30')).toBe('2026-11-30');
    expect(srv.addDays('2026-11-23', 6)).toBe('2026-11-29');
    expect(srv.addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(srv.jourDeSemaine('2026-11-23')).toBe(1);
  });
});
