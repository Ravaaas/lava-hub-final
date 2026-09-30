import { supabase } from '../lib/supabase';
import type { Database } from './database.types';
import type { Fiche, Ingredient } from '../domain/types';
import { joindre, listeAllergenes } from '../domain/allergenes';
import { objet, tableau, tableauTexte, texte, textes, versJson } from './lecture';
import { prudent, verifier, type Resultat } from './resultat';

type Ligne = Database['public']['Tables']['fiches']['Row'];

function lireIngredient(v: unknown): Ingredient {
  const o = objet(v);
  const i: Ingredient = { nom: texte(o.nom), quantite: texte(o.quantite), unite: texte(o.unite) || 'g' };
  if (texte(o.ficheId)) i.ficheId = texte(o.ficheId);
  if (o.brut === true) { i.brut = true; if (texte(o.quantite_net)) i.quantite_net = texte(o.quantite_net); }
  return i;
}

export const lireFiche = (l: Ligne): Fiche => ({
  id: l.id,
  nom: l.nom,
  categorie: l.categorie ?? '',
  quantite_nette: l.quantite_nette ?? '',
  conditionnement: tableauTexte(l.conditionnement),
  allergenes: listeAllergenes(l.allergenes),
  ingredients: tableau(l.ingredients).map(lireIngredient),
  process: textes(l.process),
});

const versLigne = (f: Omit<Fiche, 'id'>) => ({
  nom: f.nom,
  categorie: f.categorie,
  quantite_nette: f.quantite_nette,
  conditionnement: JSON.stringify(f.conditionnement),
  allergenes: joindre(f.allergenes),
  ingredients: versJson(f.ingredients),
  process: versJson(f.process),
});

export async function chargerFiches(): Promise<Fiche[]> {
  const { data, error } = await supabase.from('fiches').select('*').order('nom');
  if (error) throw new Error(error.message);
  return data.map(lireFiche);
}

export const creerFiche = (f: Omit<Fiche, 'id'>): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('fiches').insert(versLigne(f)).select('id')));

export const modifierFiche = (id: string, f: Omit<Fiche, 'id'>): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('fiches').update(versLigne(f)).eq('id', id).select('id')));

/** Les liens des autres fiches vers celle-ci sont retirés par la base (déclencheur). */
export const supprimerFiche = (id: string): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('fiches').delete().eq('id', id).select('id')));
