import { supabase } from '../lib/supabase';
import type { Element, FicheRecette } from '../domain/types';
import { joindre, listeAllergenes } from '../domain/allergenes';
import { estStatut } from '../domain/fichesRecette';
import { objet, tableau, texte, versJson } from './lecture';
import { prudent, verifier, type Resultat } from './resultat';

// Éléments en base : "id" (très ancien), {id, grammage} ou {text, grammage}.
export function lireElement(v: unknown): Element {
  if (typeof v === 'string') return { type: 'fiche', id: v, grammage: '' };
  const o = objet(v);
  const grammage = texte(o.grammage);
  return texte(o.id) ? { type: 'fiche', id: texte(o.id), grammage } : { type: 'libre', texte: texte(o.text), grammage };
}
const ecrireElement = (e: Element) => (e.type === 'fiche' ? { id: e.id, grammage: e.grammage } : { text: e.texte, grammage: e.grammage });

// La photo (base64, lourde) n'est pas chargée avec la liste : voir chargerPhoto.
const COLONNES = 'id,nom,statut,allergenes,sous_recettes';

export async function chargerFichesRecette(): Promise<FicheRecette[]> {
  const { data, error } = await supabase.from('fiches_recette').select(COLONNES).order('nom');
  if (error) throw new Error(error.message);
  return data.map(l => ({
    id: l.id,
    nom: l.nom,
    statut: estStatut(l.statut) ? l.statut : 'carte',
    allergenes: listeAllergenes(l.allergenes),
    elements: tableau(l.sous_recettes).map(lireElement),
  }));
}

export async function chargerPhoto(id: string): Promise<string | null> {
  const { data } = await supabase.from('fiches_recette').select('photo').eq('id', id).maybeSingle();
  return data?.photo ?? null;
}

export interface SaisieFicheRecette {
  nom: string;
  statut: FicheRecette['statut'];
  elements: Element[];
  photo: string | null;
  /** Indicatif : la base recalcule les allergènes depuis les fiches liées. */
  allergenes: string[];
}

const versLigne = (f: SaisieFicheRecette) => ({
  nom: f.nom,
  statut: f.statut,
  photo: f.photo,
  allergenes: joindre(f.allergenes),
  sous_recettes: versJson(f.elements.map(ecrireElement)),
});

export const creerFicheRecette = (f: SaisieFicheRecette): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('fiches_recette').insert(versLigne(f)).select('id')));

export const modifierFicheRecette = (id: string, f: SaisieFicheRecette): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('fiches_recette').update(versLigne(f)).eq('id', id).select('id')));

export const supprimerFicheRecette = (id: string): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('fiches_recette').delete().eq('id', id).select('id')));

export const remplacerPhoto = (id: string, photo: string): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('fiches_recette').update({ photo }).eq('id', id).select('id')));

export async function idsFichesRecette(): Promise<string[]> {
  const { data } = await supabase.from('fiches_recette').select('id');
  return (data ?? []).map(l => l.id);
}

/** Toutes les fiches recette, photos comprises (sauvegarde complète). */
export async function toutesLesFichesRecette(): Promise<unknown[]> {
  const { data, error } = await supabase.from('fiches_recette').select('*');
  if (error) throw new Error(error.message);
  return data;
}
