import { describe, expect, it } from 'vitest';
import { lireMenu } from './config';
import { lireFiche } from './fiches';
import { lireElement } from './fichesRecette';
import { tableauTexte } from './lecture';

// Formats historiques réellement présents dans la base : ils doivent être lus sans erreur.
describe('lecture des données de la base', () => {
  it('fiche : allergènes en tableau, conditionnement JSON, ingrédient lié et brut/net', () => {
    const f = lireFiche({
      id: 'f3', nom: 'GANACHE', categorie: null, quantite_nette: null, conditionnement: '["Sac sous vide — 850 g"]', allergenes: ['Lactose', 'Soja'],
      ingredients: [{ nom: 'CROUSTILLANT', quantite: '400', unite: 'g', ficheId: 'f2' }, { nom: 'CAROTTE', quantite: '1000', unite: 'g', brut: true, quantite_net: '800' }, 'déchet', null],
      process: ['Fondre', 3, null], modifie_par: null, modifie_le: null,
    });
    expect(f.allergenes).toEqual(['Lactose', 'Soja']);
    expect(f.conditionnement).toEqual(['Sac sous vide — 850 g']);
    expect(f.categorie).toBe('');
    expect(f.ingredients[0]).toEqual({ nom: 'CROUSTILLANT', quantite: '400', unite: 'g', ficheId: 'f2' });
    expect(f.ingredients[1]).toEqual({ nom: 'CAROTTE', quantite: '1000', unite: 'g', brut: true, quantite_net: '800' });
    expect(f.ingredients[2]).toEqual({ nom: '', quantite: '', unite: 'g' });
    expect(f.process).toEqual(['Fondre', '3']);
  });
  it('conditionnement en texte simple (ancien format)', () => {
    expect(tableauTexte('Bocal')).toEqual(['Bocal']);
    expect(tableauTexte(null)).toEqual([]);
  });
  it('éléments de fiche recette : identifiant seul, lien, élément libre', () => {
    expect(lireElement('f1')).toEqual({ type: 'fiche', id: 'f1', grammage: '' });
    expect(lireElement({ id: 'f2', grammage: '20g' })).toEqual({ type: 'fiche', id: 'f2', grammage: '20g' });
    expect(lireElement({ text: 'Herbes', grammage: '' })).toEqual({ type: 'libre', texte: 'Herbes', grammage: '' });
  });
  it('ancien menu (liste plate de plats) : un seul temps sans nom', () => {
    expect(lireMenu({ id: 'm', nom: 'Vieux', plats: [{ frId: 'r1' }, { text: 'Café' }, {}] }))
      .toEqual({ id: 'm', nom: 'Vieux', services: [{ nom: '', plats: [{ frId: 'r1' }, { texte: 'Café' }] }] });
  });
  it('menu actuel', () => {
    expect(lireMenu({ id: 'm', nom: '3 temps', services: [{ nom: 'Temps 1', plats: [{ frId: 'r1' }] }] }).services[0])
      .toEqual({ nom: 'Temps 1', plats: [{ frId: 'r1' }] });
  });
});
