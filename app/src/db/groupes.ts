import { supabase } from '../lib/supabase';
import type { Groupe } from '../domain/types';
import { joindre, listeAllergenes } from '../domain/allergenes';
import { prudent, verifier, type Resultat } from './resultat';

export async function chargerGroupes(): Promise<Groupe[]> {
  const { data, error } = await supabase.from('groupes').select('*').order('date');
  if (error) throw new Error(error.message);
  return data.map(l => ({
    id: l.id,
    nom: l.nom,
    date: l.date,
    heure: l.heure ?? '',
    pax: l.pax,
    salle: l.salle ?? '',
    source: l.source ?? '',
    menu_id: l.menu_id,
    menu_nom: l.menu_nom,
    allergenes: listeAllergenes(l.allergenes),
    regimes: listeAllergenes(l.regimes),
    notes: l.notes ?? '',
  }));
}

const versLigne = (g: Omit<Groupe, 'id'>) => ({ ...g, allergenes: joindre(g.allergenes), regimes: joindre(g.regimes) });

export const creerGroupe = (g: Omit<Groupe, 'id'>): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('groupes').insert(versLigne(g)).select('id')));

export const modifierGroupe = (id: string, g: Omit<Groupe, 'id'>): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('groupes').update(versLigne(g)).eq('id', id).select('id')));

export const supprimerGroupe = (id: string): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('groupes').delete().eq('id', id).select('id')));
