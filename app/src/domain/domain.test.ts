import { describe, expect, it } from 'vitest';
import { avecEffectifs, listeAllergenes, separerEffectifs, union } from './allergenes';
import { identifiantPour, profilsClasses, verifierMotDePasse, postesProposes, etatMembre } from './equipe';
import { diffFiche, lireConditionnement, quantiteAffichee, quantitePour } from './fiches';
import { aPortionMenu, allergenesDesElements, diffFicheRecette, elementsResolus, grammageDe } from './fichesRecette';
import { lignesJournal, libelleJour } from './journal';
import { alertesGroupe, alertesMenu, allergieSaisie, estAllergieLibre, lierRemplacant, platsCommandes, resumeAlertes, niveauxAEnregistrer, niveauxDuGroupe, niveauxDuMenu, platsDuMenu, servicesAffiches, servicesAEnregistrer, totalNiveau } from './menus';
import { deplacer, zoneCadree, dejaCadree, CADRAGE_CENTRE } from './photo';
import { contactsUniques, csvContacts, erreurGroupe, profilsAEnregistrer, profilsDepuisAnciens, resumeProfils, euros, groupesEnConflit, groupesFiltres, libelleMontant, libelleReglement, lireMontant, lireReglement, montantSaisi } from './groupes';
import { normNom } from './texte';
import { cleProduit, erreurPerte, joursSemaine, lireQuantite, lundi, parCategorie, peutSupprimerPerte, quantiteFr, recapSemaine, type Perte, type ProduitPerso } from './pertesPerso';
import { scriptPrincipal } from './version';
import { comparer, grammageYk, libelleVersion, nbEcarts, normaliser, platsYokitup, portionDeVersion, proposerLiens, reprendreGrammages, ressemblance, trierRelies, compteRelies, versionDeReference, type RecetteYk } from './yokitup';
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
    const g = { profils: [{ nb: 2, allergenes: ['Gluten', 'Soja'], regimes: [] }], menu_id: 'm1', niveaux: [] } as unknown as Groupe;
    expect(alertesGroupe(g, menus, frs, [])).toEqual([{ plat: 'CASSOLETTE', allergenes: ['Gluten'], personnes: 2 }]);
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
    expect(erreurGroupe({ nom: 'X', date: '2026-10-01', pax: 12.5 })).toMatch(/entier/);
    expect(erreurGroupe({ nom: 'X', date: '2026-10-01', pax: 9999 })).toMatch(/entier/);
  });
  it('nombre de personnes par allergie : lu et réécrit sans perte', () => {
    const { noms, effectifs } = separerEffectifs(['Gluten (2)', 'Lactose']);
    expect(noms).toEqual(['Gluten', 'Lactose']);
    expect(effectifs).toEqual({ Gluten: 2 });
    expect(avecEffectifs(noms, effectifs)).toEqual(['Gluten (2)', 'Lactose']);
    expect(erreurGroupe({ nom: 'X', date: '2026-10-01', pax: 4, effectifs: { Gluten: 5 } })).toMatch(/entre 1 et 4/);
  });
  it('niveaux du groupe : les siens, sinon ceux du menu choisi ; ils alertent comme un menu', () => {
    const frs = [{ id: 'r1', nom: 'CASSOLETTE', allergenes: ['Gluten'], elements: [] }] as unknown as FicheRecette[];
    const menus: Menu[] = [{ id: 'm1', nom: 'Lunch', services: [{ nom: 'Entrée', plats: [{ frId: 'r1' }] }] }];
    const g = { menu_id: null, niveaux: [{ nom: 'Entrée', plats: [{ frId: 'r1', qte: 10 }, { texte: 'Pain maison', qte: null }] }], profils: [{ nb: 1, allergenes: ['Gluten'], regimes: [] }] } as unknown as Groupe;
    expect(niveauxDuGroupe(g, menus)).toBe(g.niveaux);
    expect(niveauxDuGroupe({ ...g, niveaux: [], menu_id: 'm1' }, menus)).toEqual([{ nom: 'Entrée', plats: [{ frId: 'r1', qte: null }] }]);
    expect(niveauxDuGroupe({ ...g, niveaux: [] }, menus)).toEqual([]);
    expect(alertesGroupe(g, [], frs, [])).toEqual([{ plat: 'CASSOLETTE', allergenes: ['Gluten'], personnes: 1 }]);
  });
  it('brouillon : seuls nom et date exigés, plats sans nombre masqués sur la fiche', () => {
    const base = { nom: 'Cocktail', date: '2026-12-01', pax: 0 };
    expect(erreurGroupe(base)).toMatch(/obligatoires/);
    expect(erreurGroupe(base, true)).toBeNull();
    expect(erreurGroupe({ ...base, nom: ' ' }, true)).toMatch(/Nom et date/);
    expect(erreurGroupe({ ...base, pax: -2 }, true)).toMatch(/entier entre 1 et/);
    // sans nombre de personnes : aucune comparaison, mais les nombres restent des entiers
    expect(erreurGroupe({ ...base, profils: [{ nb: 30, allergenes: ['Gluten'], regimes: [] }], niveaux: [{ nom: 'P', plats: [{ texte: 'A', qte: 40 }] }] }, true)).toBeNull();
    expect(erreurGroupe({ ...base, niveaux: [{ nom: 'P', plats: [{ texte: 'A', qte: 1.5 }] }] }, true)).toMatch(/Nombre de plats/);
    expect(erreurGroupe({ ...base, pax: 10, niveaux: [{ nom: 'P', plats: [{ texte: 'A', qte: 40 }] }] }, true)).toMatch(/entre 1 et 10/);
    expect(totalNiveau({ nom: 'P', plats: [{ texte: 'A', qte: 5 }] }, 0)).toEqual({ total: 5, ecart: 0 });
    const n = { nom: 'Plat', plats: [{ texte: 'A', qte: 8 }, { texte: 'B', qte: null }, { texte: 'C', qte: null, remplace: 'A' }] };
    expect(platsCommandes(n).map(p => ('texte' in p ? p.texte : ''))).toEqual(['A', 'C']);
    expect(platsCommandes({ nom: 'Plat', plats: [{ texte: 'A', qte: null }, { texte: 'B', qte: null }] })).toHaveLength(2);
    // un plat sans nombre n'est pas servi : il ne déclenche aucune alerte
    const frs = [{ id: 'b', nom: 'BŒUF', allergenes: ['Gluten'], elements: [] }] as unknown as FicheRecette[];
    const profils = [{ nb: 1, allergenes: ['Gluten'], regimes: [] }];
    expect(alertesMenu([{ nom: 'P', plats: [{ frId: 'b', qte: null }, { texte: 'Riz', qte: 5 }] }], profils, frs, [])).toEqual([]);
    expect(alertesMenu([{ nom: 'P', plats: [{ frId: 'b', qte: null }, { texte: 'Riz', qte: null }] }], profils, frs, [])).toHaveLength(1);
    const g = (id: string, statut: string) => ({ id, statut, date: '2026-12-01', heure: '19:00', salle: 'S' }) as unknown as Groupe;
    expect(groupesEnConflit({ date: '2026-12-01', heure: '19:30', salle: 'S' }, [g('1', 'brouillon')])).toEqual([]);
    expect(groupesEnConflit({ date: '2026-12-01', heure: '19:30', salle: 'S' }, [g('2', 'confirme')])).toHaveLength(1);
  });
  it('plat de remplacement : conflit adapté si le remplaçant couvre les personnes concernées', () => {
    const frs = [{ id: 'b', nom: 'BŒUF AXURIA', allergenes: ['Gluten'], elements: [] }, { id: 'd', nom: 'TARTE', allergenes: ['Gluten'], elements: [] }] as unknown as FicheRecette[];
    const profils = [{ nb: 2, allergenes: ['Gluten'], regimes: [] }];
    const niveaux = (qte: number | null) => [
      { nom: 'Temps 4', plats: [{ frId: 'b', qte: 9 }, { texte: 'Bœuf sans tempura', qte, remplace: 'b' }] },
      { nom: 'Dessert', plats: [{ frId: 'd', qte: null }] },
    ];
    const a = alertesMenu(niveaux(2), profils, frs, []);
    expect(a).toEqual([
      { plat: 'BŒUF AXURIA', allergenes: ['Gluten'], personnes: 2, remplacants: ['Bœuf sans tempura'], adapte: true },
      { plat: 'TARTE', allergenes: ['Gluten'], personnes: 2 },
    ]);
    expect(resumeAlertes(a)).toBe('Conflit : TARTE (Gluten)');
    expect(alertesMenu(niveaux(null), profils, frs, [])[0]?.adapte).toBe(true);
    expect(alertesMenu(niveaux(1), profils, frs, [])[0]?.adapte).toBe(false);
    expect(resumeAlertes(alertesMenu(niveaux(1), profils, frs, []))).toBe('Conflit : BŒUF AXURIA (Gluten) +1');
    // choix depuis l'encadré : un seul remplaçant à la fois, retirable
    const lie = lierRemplacant(niveaux(null), 'b', 'b');
    expect(lie[0]?.plats.map(p => p.remplace)).toEqual([undefined, undefined]);
    const base = [{ nom: 'T', plats: [{ frId: 'b', qte: 9 }, { texte: 'X', qte: 2 }, { texte: 'Y', qte: 1, remplace: 'b' }] }];
    expect(lierRemplacant(base, 'b', 'X')[0]?.plats.map(p => p.remplace)).toEqual([undefined, 'b', undefined]);
    expect(lierRemplacant(base, 'b', '')[0]?.plats.map(p => p.remplace)).toEqual([undefined, undefined, undefined]);
    // lien vers un plat retiré du niveau, ou vers lui-même : effacé à l'enregistrement
    const propres = niveauxAEnregistrer([{ nom: 'T', plats: [{ texte: 'A', qte: null, remplace: 'b' }, { texte: 'B', qte: null, remplace: 'B' }, { texte: 'C', qte: 1, remplace: 'A' }] }], frs);
    expect(propres).toEqual([{ nom: 'T', plats: [{ texte: 'A', qte: null }, { texte: 'B', qte: null }, { texte: 'C', qte: 1, remplace: 'A' }] }]);
  });
  it('allergies libres : saisie, recherche dans les ingrédients (fiches liées comprises), mot entier', () => {
    expect(allergieSaisie('  gluten ')).toBe('Gluten');
    expect(allergieSaisie('fruit a coque')).toBe('Fruit à coque');
    expect(allergieSaisie('kiwi  jaune')).toBe('Kiwi jaune');
    expect(estAllergieLibre('Kiwi')).toBe(true);
    expect(estAllergieLibre('celeri')).toBe(false);
    const fiches = [
      fiche('s', 'SALADE DE FRUITS', [], { ingredients: [{ nom: 'KIWIS GOLD', quantite: '2', unite: 'pc' }, { nom: 'Base', quantite: '1', unite: 'kg', ficheId: 'b' }] }),
      fiche('b', 'SIROP', [], { ingredients: [{ nom: 'Ail noir', quantite: '1', unite: 'g' }, { nom: 'Base', quantite: '1', unite: 'kg', ficheId: 's' }] }),
      fiche('c', 'CAILLE RÔTIE', ['Céleri'], { ingredients: [{ nom: 'Céleri', quantite: '1', unite: 'g' }] }),
    ];
    const frs = [
      { id: 'd', nom: 'DESSERT', allergenes: [], elements: [{ type: 'fiche', id: 's', grammage: '' }] },
      { id: 'v', nom: 'VOLAILLE', allergenes: ['Céleri'], elements: [{ type: 'fiche', id: 'c', grammage: '' }, { type: 'libre', texte: 'Purée de pomme de terre', grammage: '' }] },
    ] as unknown as FicheRecette[];
    const niveaux = [{ nom: 'Plat', plats: [{ frId: 'v', qte: null }, { texte: 'Tarte au kiwi', qte: null }] }, { nom: 'Dessert', plats: [{ frId: 'd', qte: null }] }];
    const profils = [{ nb: 1, allergenes: ['Kiwi'], regimes: [] }, { nb: 2, allergenes: ['Ail', 'Pomme de terre'], regimes: [] }];
    expect(alertesMenu(niveaux, profils, frs, fiches)).toEqual([
      { plat: 'VOLAILLE', allergenes: ['Pomme de terre'], personnes: 2, indices: { 'Pomme de terre': 'Purée de pomme de terre' } },
      { plat: 'Tarte au kiwi', allergenes: ['Kiwi'], personnes: 1 },
      { plat: 'DESSERT', allergenes: ['Kiwi', 'Ail'], personnes: 3, indices: { Kiwi: 'KIWIS GOLD', Ail: 'Ail noir' } },
    ]);
  });
  it('personnes à plusieurs allergies : lignes séparées, résumé, conflits expliqués', () => {
    const profils = [{ nb: 1, allergenes: ['Œuf', 'Moutarde'], regimes: [] }, { nb: 1, allergenes: ['Œuf'], regimes: ['Végétarien'] }, { nb: 2, allergenes: [], regimes: ['Halal'] }];
    expect(resumeProfils(profils)).toEqual({ allergenes: ['Œuf', 'Moutarde'], regimes: ['Végétarien', 'Halal'], effectifs: { Œuf: 2, Moutarde: 1, Végétarien: 1, Halal: 2 } });
    expect(profilsDepuisAnciens(['Gluten', 'Lactose'], ['Végétarien'], { Gluten: 2 })).toEqual([
      { nb: 2, allergenes: ['Gluten'], regimes: [] }, { nb: 1, allergenes: ['Lactose'], regimes: [] }, { nb: 1, allergenes: [], regimes: ['Végétarien'] }]);
    expect(profilsAEnregistrer([{ nb: 1, allergenes: [], regimes: [] }, ...profils])).toEqual(profils);
    const frs = [{ id: 'm', nom: 'MAYONNAISE', allergenes: ['Moutarde', 'Œuf'], elements: [] }, { id: 'o', nom: 'OMELETTE', allergenes: ['Œuf'], elements: [] }, { id: 'p', nom: 'PAIN', allergenes: ['Gluten'], elements: [] }] as unknown as FicheRecette[];
    const niveaux = [{ nom: 'Entrée', plats: [{ frId: 'm', qte: 4 }, { frId: 'o', qte: 2 }, { frId: 'p', qte: null }] }, { nom: 'Plat', plats: [{ frId: 'm', qte: null }] }];
    const a = alertesMenu(niveaux, profils, frs, []);
    expect(a).toEqual([{ plat: 'MAYONNAISE', allergenes: ['Moutarde', 'Œuf'], personnes: 2 }, { plat: 'OMELETTE', allergenes: ['Œuf'], personnes: 2 }]);
    expect(resumeAlertes(a)).toBe('Conflit : MAYONNAISE (Moutarde, Œuf) +1');
    expect(alertesMenu(niveaux, [{ nb: 3, allergenes: [], regimes: ['Halal'] }], frs, [])).toEqual([]);
    const base = { nom: 'X', date: '2026-10-01', pax: 3 };
    expect(erreurGroupe({ ...base, profils })).toMatch(/4 personnes déclarées pour 3/);
    expect(erreurGroupe({ ...base, profils: [{ nb: 1.5, allergenes: ['Œuf'], regimes: [] }] })).toMatch(/chaque ligne/);
    expect(erreurGroupe({ ...base, profils: profils.slice(0, 2) })).toBeNull();
  });
  it('règlement : valeur inconnue ou absente = rien reçu', () => {
    expect(lireReglement('acompte')).toBe('acompte');
    expect(lireReglement('payé')).toBe('aucun');
    expect(lireReglement(null)).toBe('aucun');
    expect(libelleReglement('empreinte')).toBe('Empreinte bancaire');
  });
  it('montant : saisie souple, lecture prudente, contrôle', () => {
    expect(montantSaisi('1 250,50 €')).toBe(1250.5);
    expect(montantSaisi('300')).toBe(300);
    expect(montantSaisi(' ')).toBeNull();
    expect(montantSaisi('trois cents')).toBeNaN();
    expect(montantSaisi('12,345')).toBeNaN();
    expect(lireMontant('450.00')).toBe(450);
    expect(lireMontant(-3)).toBeNull();
    expect(lireMontant(null)).toBeNull();
    expect(euros(1250).replace(/\s/g, ' ')).toBe('1 250 €');
    expect(euros(300.5).replace(/\s/g, ' ')).toBe('300,50 €');
    expect(libelleMontant('acompte')).toBe("Montant de l'acompte (€)");
    const base = { nom: 'X', date: '2026-10-01', pax: 4 };
    expect(erreurGroupe({ ...base, montant: NaN })).toMatch(/Montant/);
    expect(erreurGroupe({ ...base, montant: 300 })).toBeNull();
    expect(erreurGroupe({ ...base, email: 'claire@' })).toMatch(/Email du référent/);
    expect(erreurGroupe({ ...base, email: 'claire@exemple.fr' })).toBeNull();
  });
  it('contacts : un par email (sinon téléphone), le plus récent, et CSV pour Excel', () => {
    const c = (nom: string, email: string, telephone: string, groupe: string, date: string) => ({ groupe_id: groupe, nom, email, telephone, groupe, date_groupe: date });
    const u = contactsUniques([
      c('Claire', 'Claire@Exemple.fr', '', 'Dîner 2025', '2025-12-01'),
      c('Claire Dupont', 'claire@exemple.fr', '06 12 34 56 78', 'Séminaire', '2026-10-01'),
      c('Marc', '', '07 00 00 00 00', 'Anniversaire', '2026-05-01'),
      c('Sans coordonnées', '', '', 'Vide', '2026-06-01'),
    ]);
    expect(u).toEqual([
      { nom: 'Claire Dupont', email: 'claire@exemple.fr', telephone: '06 12 34 56 78', groupe: 'Séminaire', date: '2026-10-01', groupes: 2 },
      { nom: 'Marc', email: '', telephone: '07 00 00 00 00', groupe: 'Anniversaire', date: '2026-05-01', groupes: 1 },
    ]);
    const csv = csvContacts([...u, { nom: '=HYPERLINK("x")', email: 'a;b@c.fr', telephone: '+33 6 12', groupe: 'G', date: '', groupes: 1 }]);
    expect(csv.startsWith('\ufeffNom;Email;Téléphone;')).toBe(true);
    expect(csv).toContain('\r\nClaire Dupont;claire@exemple.fr;06 12 34 56 78;Séminaire;2026-10-01;2\r\n');
    expect(csv).toContain(`"'=HYPERLINK(""x"")";"a;b@c.fr";+33 6 12;G;;1`);
  });
  it('niveaux : copiés du menu (temps fixes compris), totaux et nettoyage', () => {
    const frs = [fr('r1', 'CASSOLETTE')];
    expect(niveauxDuMenu({ id: 'm', nom: '3 temps', services: [{ nom: 'Plat', plats: [{ frId: 'r1' }] }] }).map(n => n.nom)).toEqual(['Temps 1', 'Temps 2', 'Temps 3']);
    const n = { nom: 'Entrée', plats: [{ frId: 'r1', qte: 10 }, { frId: 'r2', qte: 2 }, { texte: 'Velouté', qte: 4 }, { texte: 'Pain', qte: null }] };
    expect(totalNiveau(n, 16)).toEqual({ total: 16, ecart: 0 });
    expect(totalNiveau(n, 18)).toEqual({ total: 16, ecart: -2 });
    expect(niveauxAEnregistrer([{ nom: ' Entrée ', plats: [{ frId: 'r1', qte: 3 }, { frId: 'disparu', qte: 1 }, { texte: ' Pain ', qte: null }, { texte: ' ', qte: 2 }] }, { nom: 'Dessert', plats: [{ texte: ' ', qte: null }] }], frs))
      .toEqual([{ nom: 'Entrée', plats: [{ frId: 'r1', qte: 3 }, { texte: 'Pain', qte: null }] }]);
    const plats = (qte: number) => [{ nom: 'Entrée', plats: [{ frId: 'r1', qte }] }];
    expect(erreurGroupe({ nom: 'X', date: '2026-10-01', pax: 4, niveaux: plats(5) })).toMatch(/plats : un entier entre 1 et 4/);
    expect(erreurGroupe({ nom: 'X', date: '2026-10-01', pax: 4, niveaux: plats(1.5) })).toMatch(/plats/);
    expect(erreurGroupe({ nom: 'X', date: '2026-10-01', pax: 4, niveaux: plats(4) })).toBeNull();
  });
  it('même jour : trié par heure', () => {
    const l = [{ ...g('b', '2026-10-01'), heure: '20:00' }, { ...g('a', '2026-10-01'), heure: '12:00' }];
    expect(groupesFiltres(l, 'avenir', '2026-09-30').map(x => x.id)).toEqual(['a', 'b']);
  });
  it('conflit : même jour, même salle, à moins de 2 h', () => {
    const o = { id: 'o', date: '2026-10-01', heure: '12:00', salle: 'Terrasse' } as Groupe;
    expect(groupesEnConflit({ date: '2026-10-01', heure: '13:30', salle: 'Terrasse' }, [o])).toHaveLength(1);
    expect(groupesEnConflit({ date: '2026-10-01', heure: '14:00', salle: 'Terrasse' }, [o])).toHaveLength(0);
    expect(groupesEnConflit({ date: '2026-10-01', heure: '12:30', salle: 'Salon Basalte' }, [o])).toHaveLength(0);
    expect(groupesEnConflit({ id: 'o', date: '2026-10-01', heure: '12:30', salle: 'Terrasse' }, [o])).toHaveLength(0);
  });
});

describe('version publiée', () => {
  it('lit le fichier de code principal de la page compilée', () => {
    const html = '<link rel="modulepreload" href="./assets/react-1.js">\n  <script type="module" crossorigin src="./assets/index-ktgIBNVO.js"></script>';
    expect(scriptPrincipal(html)).toBe('./assets/index-ktgIBNVO.js');
    expect(scriptPrincipal('<html>page d\'erreur</html>')).toBeNull();
  });
});

describe('pertes & perso', () => {
  it('clé de produit identique à l\'ancien Google Sheet', () => {
    expect(cleProduit('SAUTÉ DE DINDE')).toBe('saute_de_dinde');
    expect(cleProduit('CHOU-FLEUR')).toBe('chou_fleur');
    expect(cleProduit('  ')).toBe('produit');
  });
  it('lit les quantités à la française', () => {
    expect(lireQuantite('1,5')).toBe(1.5);
    expect(lireQuantite(' ')).toBeNull();
    expect(lireQuantite('abc')).toBeNaN();
    expect(lireQuantite('-2')).toBeNaN();
    expect(lireQuantite('1000')).toBeNaN();
    expect(quantiteFr(0.1 + 0.2)).toBe('0,3');
  });
  it('semaine du lundi au dimanche', () => {
    expect(lundi('2026-11-22')).toBe('2026-11-16');   // dimanche
    expect(lundi('2026-11-16')).toBe('2026-11-16');
    expect(joursSemaine('2026-10-26')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });
  it('récap : totaux par produit dans l\'ordre de la liste, produits retirés compris', () => {
    const produits: ProduitPerso[] = [
      { cle: 'riz', nom: 'RIZ', unite: 'kg', categorie: 'Épicerie', actif: true },
      { cle: 'lait', nom: 'LAIT', unite: 'L', categorie: 'Crèmerie', actif: true },
    ];
    const s = (date: string, cle: string, quantite: number) => ({ date, cle, quantite, par: 'Inès', email: 'i' });
    const r = recapSemaine('2026-11-16', [s('2026-11-17', 'lait', 1), s('2026-11-16', 'riz', 2), s('2026-11-22', 'riz', 0.5), s('2026-11-23', 'riz', 9), s('2026-11-18', 'vieux', 3), s('2026-11-18', 'lait', 0)], produits);
    expect(r.map(l => [l.cle, l.total])).toEqual([['riz', 2.5], ['lait', 1], ['vieux', 3]]);
    expect(r[0]?.parJour).toEqual([2, 0, 0, 0, 0, 0, 0.5]);
    expect(r[2]?.categorie).toBe('Produits retirés');
  });
  it('groupe par catégorie dans l\'ordre d\'apparition', () => {
    expect(parCategorie([{ categorie: 'B' }, { categorie: 'A' }, { categorie: 'B' }]).map(([c, l]) => [c, l.length])).toEqual([['B', 2], ['A', 1]]);
  });
  it('perte complète avant envoi', () => {
    const ok = { produit: 'SAUMON', quantite: 1, raison: 'DLC dépassée', precision: '' };
    expect(erreurPerte(ok)).toBe('');
    expect(erreurPerte({ ...ok, produit: ' ' })).toMatch(/produit/);
    expect(erreurPerte({ ...ok, quantite: null })).toMatch(/quantité/);
    expect(erreurPerte({ ...ok, quantite: 0 })).toMatch(/quantité/);
    expect(erreurPerte({ ...ok, raison: '' })).toMatch(/raison/);
    expect(erreurPerte({ ...ok, raison: 'Autre' })).toBe('Précise la raison.');
  });
  it('suppression d\'une perte : son auteur ou l\'admin', () => {
    const p = { email: 'ines@lava-hub.local' } as Perte;
    expect(peutSupprimerPerte(p, 'ines@lava-hub.local', false)).toBe(true);
    expect(peutSupprimerPerte(p, 'hugo@lava-hub.local', false)).toBe(false);
    expect(peutSupprimerPerte(p, 'hugo@lava-hub.local', true)).toBe(true);
  });
});

describe('yokitup', () => {
  const ing = (id: string, nom: string, quantite: string, unite = 'g') => ({ id, nom, quantite, unite, sousRecette: false, allergenes: [], traces: [] });
  const rec = (id: string, nom: string, ingredients: RecetteYk['ingredients']): RecetteYk => {
    const m = /^(.*?)\s*\(([^)]*)\)$/.exec(nom);
    return { id, nom, plat: m?.[1]?.trim() ?? nom, version: m?.[2] ?? '', etiquettes: [], ingredients };
  };
  const fiches = [fiche('jus', 'JUS DE BOEUF AU CURRY VERT'), fiche('cond', 'CONDIMENT CHAMPIGNON'), fiche('satay', 'RAGOÛT DE POIS CHICHE AU SATAY')];
  const boeuf = fr('b', 'BŒUF AXURIA, PLEUROTES, OIGNON NOIR, JUS CURRY VERT', { elements: [
    { type: 'libre', texte: 'FAUX FILET DE BŒUF AXURIA', grammage: '90G' }, { type: 'libre', texte: 'PLEUROTES', grammage: '100G' },
    { type: 'fiche', id: 'jus', grammage: '10G' }, { type: 'fiche', id: 'cond', grammage: '' }] });
  const carte = rec('y1', 'BŒUF/PLEUROTE/JUS CURRY VERT (CARTE)', [ing('a', 'FAUX FILET NET', '90'), ing('b', 'CHAMPIGNON - PLEUROTE', '100'),
    ing('c', 'JUS DE BŒUF AU CURRY VERT', '10'), ing('d', 'CONDIMENT CHAMPIGNON', '6'), ing('e', 'SAUCE TARTARE', '8'), ing('f', 'SEL FIN', '1')]);
  const menu = rec('y2', 'BŒUF/PLEUROTE/JUS CURRY VERT (MENU)', [ing('a', 'FAUX FILET NET', '60'), ing('b', 'CHAMPIGNON - PLEUROTE', '70'), ing('c', 'JUS DE BŒUF AU CURRY VERT', '10')]);

  it('regroupe Carte, Menu et Lunch sous un même plat, Carte en premier', () => {
    const p = platsYokitup([menu, carte, rec('y3', 'CHEESECAKE (LUNCH)', [])]);
    expect(p.map(x => x.plat)).toEqual(['BŒUF/PLEUROTE/JUS CURRY VERT', 'CHEESECAKE']);
    const boeufYk = p[0];
    expect(boeufYk?.versions.map(v => v.version)).toEqual(['CARTE', 'MENU']);
    if (boeufYk) expect(versionDeReference(boeufYk).version).toBe('CARTE');
    expect(libelleVersion('MENU ENFANT')).toBe('Menu enfant');
  });
  it('compare les noms sans accents, casse ni abréviations', () => {
    expect(normaliser('Bœuf, pleurotes')).toBe('BOEUF PLEUROTES');
    expect(ressemblance('JUS DE BOEUF AU CURRY VERT', 'JUS DE BŒUF AU CURRY VERT')).toBe(1);
    expect(ressemblance('ST JACK/CHOU FLEUR/ KUMQUAT', 'SAINT-JACQUES, CHOU-FLEUR, PONZU')).toBeGreaterThan(0.5);
    expect(ressemblance('CHEESECAKE', 'SAINT-JACQUES')).toBe(0);
  });
  it('propose une fiche par plat, une seule fois, sans les archives ni les liens existants', () => {
    const plats = platsYokitup([carte, menu, rec('c1', 'CANARD/PATATE DOUCE CURRY/POIS CHICHE/SATAY (CARTE)', [ing('s', 'RAGOÛT POIS CHICHES SATAY', '1', 'pièce')])]);
    const magret = fr('m', 'MAGRET DE CANARD, PURÉE PATATE DOUCE, POIS CHICHE AU SATAY', { elements: [{ type: 'fiche', id: 'satay', grammage: '50G' }] });
    const vieux = fr('v', 'BŒUF AXURIA ANCIEN', { statut: 'archive' });
    const p = proposerLiens(plats, [boeuf, magret, vieux], fiches, new Map());
    expect(p.map(x => [x.plat, x.fiche.id])).toEqual(expect.arrayContaining([['BŒUF/PLEUROTE/JUS CURRY VERT', 'b'], ['CANARD/PATATE DOUCE CURRY/POIS CHICHE/SATAY', 'm']]));
    expect(p).toHaveLength(2);
    expect(proposerLiens(plats, [boeuf, magret], fiches, new Map([['BŒUF/PLEUROTE/JUS CURRY VERT', 'b']])).map(x => x.plat)).toEqual(['CANARD/PATATE DOUCE CURRY/POIS CHICHE/SATAY']);
  });
  it('compare les grammages élément par élément', () => {
    const l = comparer(boeuf, carte, fiches);
    const etat = (nom: string) => l.find(x => x.nom === nom)?.etat;
    expect(etat('FAUX FILET DE BŒUF AXURIA')).toBe('identique');
    expect(etat('PLEUROTES')).toBe('identique');
    expect(etat('JUS DE BOEUF AU CURRY VERT')).toBe('identique');
    expect(etat('CONDIMENT CHAMPIGNON')).toBe('vide');
    expect(etat('SAUCE TARTARE')).toBe('seulementYokitup');
    expect(etat('SEL FIN')).toBe('assaisonnement');
    expect(nbEcarts(l)).toBe(2);
  });
  it('Yokitup Menu : comparé à la portion Menu et repris dans la portion Menu, la Carte ne change pas', () => {
    expect([portionDeVersion('MENU'), portionDeVersion('CARTE'), portionDeVersion('LUNCH'), portionDeVersion('MENU ENFANT')]).toEqual(['menu', 'carte', 'carte', null]);
    const l = comparer(boeuf, menu, fiches);
    expect(l.slice(0, 3).map(x => [x.grammageHub, x.etat])).toEqual([['90G', 'different'], ['100G', 'different'], ['10G', 'identique']]);
    const el = reprendreGrammages(boeuf, l, 'menu');
    expect(el.map(e => e.grammage)).toEqual(['90G', '100G', '10G', '']);
    expect(el.map(e => e.grammageMenu)).toEqual(['60G', '70G', undefined, undefined]);
    expect(el).toHaveLength(boeuf.elements.length);
    const deux = { ...boeuf, elements: el };
    expect(diffFicheRecette(boeuf, deux, fiches)).toEqual(['FAUX FILET DE BŒUF AXURIA (Menu) : — → 60G', 'PLEUROTES (Menu) : — → 70G']);
    expect(aPortionMenu(deux)).toBe(true);
    expect(el.map(e => grammageDe(e, 'menu'))).toEqual(['60G', '70G', '10G', '']);
    expect(nbEcarts(comparer(deux, menu, fiches).slice(0, 3))).toBe(0);
    expect(nbEcarts(comparer(deux, carte, fiches).slice(0, 3))).toBe(0);
    // Yokitup Menu redevenu égal à la Carte : la portion Menu de l'élément disparaît.
    const egal = rec('y4', 'BŒUF/PLEUROTE/JUS CURRY VERT (MENU)', [ing('a', 'FAUX FILET NET', '90')]);
    expect(reprendreGrammages(deux, comparer(deux, egal, fiches), 'menu')[0]).toEqual({ type: 'libre', texte: 'FAUX FILET DE BŒUF AXURIA', grammage: '90G' });
    expect(grammageYk({ quantite: '0.5', unite: 'g' })).toBe('0,5G');
    expect(grammageYk({ quantite: '3', unite: 'pièce' })).toBe('3PCE');
    expect(grammageYk({ quantite: '2', unite: 'mL' })).toBe('2ML');
  });
  it('nom seulement proche : signalé, jamais repris', () => {
    const riz = fr('r', 'RIZ AU LAIT COCO', { elements: [{ type: 'libre', texte: 'RIZ AU LAIT COCO', grammage: '70g' }, { type: 'libre', texte: 'NOUGATINE COCO', grammage: '10g' }] });
    const r = rec('x', 'RIZ AU LAIT COCO/SORBET (LUNCH)', [ing('a', 'RIZ AU LAIT COCO', '125'), ing('b', 'NOIX DE COCO RAPÉE', '3')]);
    const l = comparer(riz, r, []);
    expect(l[1]?.approx).toBe(true);
    expect(reprendreGrammages(riz, l, 'carte').map(e => e.grammage)).toEqual(['125G', '10g']);
  });
  it('unités différentes : signalées, jamais reprises', () => {
    const plat = fr('p', 'POIS', { elements: [{ type: 'fiche', id: 'satay', grammage: '50G' }] });
    const r = rec('x', 'POIS (CARTE)', [ing('s', 'RAGOÛT DE POIS CHICHE AU SATAY', '1', 'pièce')]);
    const l = comparer(plat, r, fiches);
    expect(l[0]?.etat).toBe('unites');
    expect(reprendreGrammages(plat, l, 'carte')[0]?.grammage).toBe('50G');
  });

  it('liste « Reliés » : tri par état (écarts d\'abord, identiques d\'abord) ou par nom', () => {
    const liste = [
      { nom: 'TARTE', ecarts: 1 }, { nom: 'ANCIENNE', ecarts: null }, { nom: 'CASSOLETTE', ecarts: 0 },
      { nom: 'BŒUF', ecarts: 4 }, { nom: 'AGNEAU', ecarts: 0 }, { nom: 'DAURADE', ecarts: 1 },
    ];
    const noms = (t: 'ecarts' | 'identiques' | 'nom') => trierRelies(liste, t).map(x => x.nom);
    expect(noms('ecarts')).toEqual(['BŒUF', 'DAURADE', 'TARTE', 'AGNEAU', 'CASSOLETTE', 'ANCIENNE']);
    expect(noms('identiques')).toEqual(['AGNEAU', 'CASSOLETTE', 'DAURADE', 'TARTE', 'BŒUF', 'ANCIENNE']);
    expect(noms('nom')).toEqual(['AGNEAU', 'ANCIENNE', 'BŒUF', 'CASSOLETTE', 'DAURADE', 'TARTE']);
    expect(liste[0]?.nom).toBe('TARTE');   // la liste d'origine n'est pas modifiée
    expect(compteRelies(liste)).toEqual({ ecarts: 3, identiques: 2 });
  });
});
