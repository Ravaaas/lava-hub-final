// Sauvegardes automatiques (chaque nuit à 3 h par la base, 14 gardées, sans les photos).
import { supabase } from '../lib/supabase';
import { OK, prudent, type Resultat } from './resultat';

export async function listerSauvegardes(): Promise<{ id: number; creeLe: string }[]> {
  const { data, error } = await supabase.from('sauvegardes').select('id,cree_le').order('cree_le', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(s => ({ id: s.id, creeLe: s.cree_le }));
}

export async function contenuSauvegarde(id: number): Promise<{ creeLe: string; contenu: unknown } | null> {
  const { data } = await supabase.from('sauvegardes').select('cree_le,contenu').eq('id', id).maybeSingle();
  return data ? { creeLe: data.cree_le, contenu: data.contenu } : null;
}

export const sauvegarderMaintenant = (): Promise<Resultat> =>
  prudent(async () => {
    const { error } = await supabase.rpc('sauvegarder_maintenant');
    return error ? { ok: false, message: error.message } : OK;
  });
