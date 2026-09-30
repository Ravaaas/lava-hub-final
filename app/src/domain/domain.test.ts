import { describe, expect, it } from 'vitest';
import { listeAllergenes, union } from './allergenes';
import { identifiantPour, profilsClasses, verifierMotDePasse, postesProposes, etatMembre } from './equipe';
import { diffFiche, lireConditionnement, quantiteAffichee, quantitePour } from './fiches';
import { allergenesDesElements, diffFicheRecette, elementsResolus } from './fichesRecette';
import { lignesJournal, libelleJour } from './journal';
import { alertesGroupe, platsDuMenu, servicesAffiches, servicesAEnregistrer } from './menus';
import { deplacer, zoneCadree, dejaCadree, CADRAGE_CENTRE } from './photo';
import { erreurGroupe, groupesFiltres } from './groupes';
import { normNom } from './texte';
import type { Fiche, FicheRecette, Groupe, Membre, Menu, ProfilConnexion } from './types';

const fiche = (id: string, nom: string, allergenes: string[] = [], extra: Partial<Fiche> = {}): Fiche =>
  ({ id, nom, categorie: '', quantite_nette: '', conditionnement: [], allergenes, ingredients: [], process: [], ...extra });
const fr = (id: string, nom: string, extra: Partial<FicheRecette> = {}): FicheRecette =>
  ({ id, nom, statut: 'carte', allergenes: [], elements: [], ...extra });

describe('allergènes', () => {
  it('lit les deux formats de la base', () => {
    expect(listeAllergenes('Gluten, Lactose ')).toEqual(['Gluten', 'Lactose']);
    expect(listeAllergenes(['Lactose', ' Soja'])).toEqual(['Lactose', 'Soja']);
    expect(listeAllergenes(null)).toEqual([]);
    expect(listeAllergenes('')).toEqual([]);
  });
  it('union triée sans doublon', () => {
    expect(union([['Lactose', 'Céleri'], ['Céleri', 'Gluten']])).toEqual(['Céleri', 'Gluten', 'Lactose']);
  });
});

describe('équipe', () => {
  it('fabrique un identifiant sans accents, distinct des homonymes', () => {
    expect(identifiantPour('Zoé', 'Lefèvre', [])).toBe('zoe.lefevre@lava-hub.local');
    expect(identifiantPour('Julie', 'Martin', ['julie.martin@lava-hub.local'])).toBe('julie.martin2@lava-hub.local');
    expect(identifiantPour('Julie', 'Martin', ['julie.martin@lava-hub.local', 'julie.martin2@lava-hub.local'])).toBe('julie.martin3@lava-hub.local');
    expect(identifiantPour('!!', '', [])).toBe('');
  });
  it('classe les profils : Admin, puis hiérarchie, postes inconnus en dernier, puis par nom', () => {
    const p = (prenom: string, nom: string, poste: string): ProfilConnexion => ({ email: prenom, prenom, nom, poste, equipe: 'cuisine', premiereConnexion: false });
    const l = profilsClasses([p('Inès', 'Zola', 'Commis'), p('Hugo', 'Petit', 'Chef'), p('Marc', 'Blanc', 'Plongeur'), p('Alex', 'Ravasio', 'Admin'), p('Ana', 'Abel', 'Commis')], 'cuisine');
    expect(l.map(x => x.prenom)).toEqual(['Alex', 'Hugo', 'Ana', 'Inès', 'Marc']);
  });
  it('garde un ancien poste absent de la liste', () => {
    expect(postesProposes('salle', 'Sommelier')[0]).toBe('Sommelier');
    expect(postesProposes('salle', 'Directeur')).not.toContain('Chef');
  });
  it('mot de passe : 8 caractères et identiques', () => {
    expect(verifierMotDePasse('court', 'court')).toMatch(/8 caractères/);
    expect(verifierMotDePasse('assez-long', 'autre-chose')).toMatch(/différents/);
    expect(verifierMotDePasse('assez-long', 'assez-long')).toBeNull();
  });
  it('état affiché', () => {
    const m: Membre = { email: 'a', prenom: 'A', nom: 'B', poste: '', equipe: 'salle', role: 'salle', actif: true, compte_cree: false, doit_changer_mdp: false };
    expect(etatMembre(m)).toBe('Pas encore connecté');
    expect(etatMembre({ ...m, actif: false })).toBe('Désactivé');
    expect(etatMembre({ ...m, compte_cree: true })).toBe('');
  });
});

describe('fiches techniques', () => {
  it('multiplie les quantités au format français', () => {
    expect(quantitePour('500', 2)).toBe('1000');
    expect(quantitePour('1,5', 3)).toBe('4,5');
    expect(quantitePour('0.333', 1)).toBe('0,33');
    expect(quantitePour('une pincée', 2)).toBe('une pincée');
  });
  it('quantité brute ou nette', () => {
    const i = { nom: 'CAROTTE', quantite: '1000', unite: 'g', brut: true, quantite_net: '800' };
    expect(quantiteAffichee(i, 1, 'brut')).toBe('1000 g');
    expect(quantiteAffichee(i, 2, 'net')).toBe('1600 g');
    expect(quantiteAffichee({ ...i, unite: 'pm' }, 1, 'brut')).toBe('pm');
    expect(quantiteAffichee({ nom: 'SEL', quantite: '', unite: 'g' }, 1, 'brut')).toBe('—');
  });
  it('lit un conditionnement', () => {
    expect(lireConditionnement('Sac sous vide — 850 g')).toEqual({ type: 'Sac sous vide', quantite: '850 g' });
    expect(lireConditionnement('Bocal maison')).toEqual({ type: '', quantite: 'Bocal maison' });
  });
  it('décrit les changements pour le journal', () => {
    const avant = fiche('f1', 'VELOUTÉ', ['Lactose'], { quantite_nette: '2 kg', ingredients: [{ nom: 'CRÈME', quantite: '400', unite: 'g' }, { nom: 'SEL', quantite: '5', unite: 'g' }], process: ['a'] });
    const d = diffFiche(avant, { ...avant, quantite_nette: '3 kg', ingredients: [{ nom: 'Crème', quantite: '500', unite: 'g' }, { nom: 'POIVRE', quantite: '1', unite: 'g' }], process: ['a', 'b'] });
    expect(d).toEqual(['Quantité nette : 2 kg → 3 kg', 'Crème : 400 g → 500 g', '+ POIVRE', '− SEL', 'Process : 1 → 2 étape(s)']);
    expect(diffFiche(avant, { ...avant })).toEqual([]);
  });
  it('compare les noms sans accents ni casse', () => {
    expect(normNom('velouté curry ')).toBe(normNom('VELOUTE CURRY'));
  });
});

describe('fiches recette', () => {
  const fiches = [fiche('f1', 'VELOUTÉ', ['Lactose', 'Céleri']), fiche('f2', 'CROUSTILLANT', ['Gluten'])];
  it('calcule les allergènes depuis les fiches liées', () => {
    expect(allergenesDesElements([{ type: 'fiche', id: 'f1', grammage: '' }, { type: 'libre', texte: 'câpres', grammage: '' }, { type: 'fiche', id: 'f2', grammage: '' }], fiches))
      .toEqual(['Céleri', 'Gluten', 'Lactose']);
  });
  it('écarte les liens cassés et les éléments vides', () => {
    const r = fr('r1', 'X', { elements: [{ type: 'fiche', id: 'supprimee', grammage: '' }, { type: 'libre', texte: ' ', grammage: '' }, { type: 'fiche', id: 'f2', grammage: '20g' }] });
    expect(elementsResolus(r, fiches).map(e => e.nom)).toEqual(['CROUSTILLANT']);
  });
  it('décrit les changements', () => {
    const avant = fr('r1', 'A', { elements: [{ type: 'fiche', id: 'f1', grammage: '80g' }] });
    expect(diffFicheRecette(avant, { nom: 'B', statut: 'partages', elements: [{ type: 'fiche', id: 'f1', grammage: '60g' }, { type: 'libre', texte: 'câpres', grammage: '' }] }, fiches))
      .toEqual(['Nom : A → B', 'Statut : Carte du soir → Partages', 'VELOUTÉ : 80g → 60g', '+ câpres']);
  });
});

describe('menus', () => {
  const frs = [fr('r1', 'CASSOLETTE', { allergenes: ['Gluten', 'Céleri'], elements: [{ type: 'libre', texte: 'Herbes', grammage: '' }] }), fr('r2', 'TARTE')];
  const noms = (m: Menu) => servicesAffiches(m).map(s => `${s.nom}:${s.plats.map(p => ('frId' in p ? p.frId : p.texte)).join('+')}`);
  it('Carte du soir d\'avant (Plat, Dessert) : chaque plat reste dans son temps', () => {
    expect(noms({ id: 'm', nom: 'Carte du soir', services: [{ nom: 'Plat', plats: [{ frId: 'r1' }] }, { nom: 'Dessert', plats: [{ frId: 'r2' }] }] }))
      .toEqual(['Partages:', 'Plat:r1', 'Dessert:r2']);
  });
  it('3 temps d\'avant (Entrée, Plat, Dessert) : repris dans l\'ordre en Temps 1, 2, 3', () => {
    expect(noms({ id: 'm', nom: '3 temps', services: [{ nom: 'Entrée', plats: [] }, { nom: 'Plat', plats: [{ frId: 'r1' }] }, { nom: 'Dessert', plats: [] }] }))
      .toEqual(['Temps 1:', 'Temps 2:r1', 'Temps 3:']);
  });
  it('menu libre inchangé', () => {
    const m = { id: 'm', nom: 'Lunch', services: [{ nom: 'Entrée', plats: [] }] };
    expect(servicesAffiches(m)).toBe(m.services);
  });
  it('plat : nom, allergènes, éléments ; plat supprimé signalé', () => {
    const p = platsDuMenu({ id: 'm', nom: 'X', services: [{ nom: '', plats: [{ frId: 'r1' }, { frId: 'disparu' }, { texte: 'Café' }] }] }, frs, []);
    expect(p).toEqual([{ nom: 'CASSOLETTE', allergenes: ['Gluten', 'Céleri'], elements: ['Herbes'] }, { nom: '(fiche supprimée)', allergenes: [], elements: [] }, { nom: 'Café', allergenes: [], elements: [] }]);
  });
  it('alerte un groupe allergique à un plat de son menu', () => {
    const menus: Menu[] = [{ id: 'm1', nom: 'Carte du soir', services: [{ nom: 'Plat', plats: [{ frId: 'r1' }, { frId: 'r2' }] }] }];
    const g = { allergenes: ['Gluten', 'Soja'], menu_id: 'm1' } as Groupe;
    expect(alertesGroupe(g, menus, frs, [])).toEqual([{ plat: 'CASSOLETTE', allergenes: ['Gluten'] }]);
    expect(alertesGroupe({ ...g, menu_id: null }, menus, frs, [])).toEqual([]);
  });
  it('nettoie avant enregistrement', () => {
    expect(servicesAEnregistrer([{ nom: ' Plat ', plats: [{ frId: 'r1' }, { frId: 'disparu' }, { texte: ' ' }] }, { nom: '', plats: [] }], frs))
      .toEqual([{ nom: 'Plat', plats: [{ frId: 'r1' }] }]);
  });
});

describe('journal', () => {
  it('fusionne les modifications rapprochées, garde l\'ordre', () => {
    const t = Date.UTC(2026, 8, 30, 12);
    const e = (ts: number, action = 'modification', ficheNom = 'VELOUTÉ', detail: string[] = []) => ({ ts, action, ficheNom, par: 'Alex', detail });
    const l = lignesJournal([{ date: '2026-09-01', titre: 'Maj', desc: '' }], [e(t, 'modification', 'VELOUTÉ', ['a']), e(t - 60e3, 'modification', 'VELOUTÉ', ['b']), e(t - 3600e3), e(t - 30e3, 'suppression')]);
    expect(l.map(x => (x.type === 'app' ? 'app' : `${x.action}×${x.nombre}`))).toEqual(['modification×1', 'suppression×1', 'modification×1', 'modification×1', 'app']);
    const l2 = lignesJournal([], [e(t, 'modification', 'V', ['a']), e(t - 60e3, 'modification', 'V', ['b'])]);
    expect(l2).toHaveLength(1);
    expect(l2[0]).toMatchObject({ nombre: 2, detail: ['a', 'b'] });
  });
  it('libellés des jours', () => {
    const now = new Date(2026, 8, 30, 10);
    expect(libelleJour(new Date(2026, 8, 30, 1), now)).toBe("Aujourd'hui");
    expect(libelleJour(new Date(2026, 8, 29, 23), now)).toBe('Hier');
  });
});

describe('photo', () => {
  it('portrait : garde la plus grande zone 16/10, centrée', () => {
    expect(zoneCadree(600, 900, CADRAGE_CENTRE)).toEqual([0, 262.5, 600, 375]);
  });
  it('zoom ×2 et cadrage en haut', () => {
    expect(zoneCadree(600, 900, { x: 50, y: 0, zoom: 2 })).toEqual([150, 0, 300, 187.5]);
  });
  it('glisser vers le haut descend le cadrage, borné', () => {
    expect(deplacer(CADRAGE_CENTRE, 0, -10000, 600, 900, 300).y).toBe(100);
    expect(deplacer(CADRAGE_CENTRE, 500, 0, 600, 900, 300).x).toBe(50);   // pas de marge horizontale
  });
  it('image déjà au format : pas recompressée', () => {
    expect(dejaCadree(1600, 1000, CADRAGE_CENTRE)).toBe(true);
    expect(dejaCadree(1600, 1000, { ...CADRAGE_CENTRE, zoom: 1.5 })).toBe(false);
  });
});

describe('groupes', () => {
  const g = (id: string, date: string) => ({ id, date } as Groupe);
  it('à venir (dont aujourd\'hui) puis passés du plus récent', () => {
    const l = [g('a', '2026-10-05'), g('b', '2026-09-30'), g('c', '2026-09-01'), g('d', '2026-09-20')];
    expect(groupesFiltres(l, 'avenir', '2026-09-30').map(x => x.id)).toEqual(['b', 'a']);
    expect(groupesFiltres(l, 'passes', '2026-09-30').map(x => x.id)).toEqual(['d', 'c']);
  });
  it('champs obligatoires', () => {
    expect(erreurGroupe({ nom: 'X', date: '2026-10-01', pax: 0 })).toMatch(/obligatoires/);
    expect(erreurGroupe({ nom: 'X', date: '2026-10-01', pax: 4 })).toBeNull();
  });
});
