import { supabase } from '../lib/supabase';
import type { EvenementJournal } from '../domain/types';
import { texte, textes, versJson } from './lecture';

/** Une ligne par événement. Le journal ne doit jamais bloquer une action : une erreur ici est ignorée. */
export async function journaliser(action: string, ficheNom: string, par: string, detail: readonly string[] = []): Promise<void> {
  try {
    await supabase.from('audit_log').insert({ ts: Date.now(), action, fiche_nom: ficheNom || null, profil: par, detail: detail.length ? versJson(detail) : null });
  } catch { /* journal indisponible */ }
}

export async function chargerJournal(): Promise<EvenementJournal[]> {
  const { data, error } = await supabase.from('audit_log').select('ts,action,fiche_nom,detail,profil').order('ts', { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return data.map(e => ({
    ts: new Date(e.ts).getTime(),
    action: e.action,
    ficheNom: e.fiche_nom ?? '',
    par: e.profil ?? '',
    detail: Array.isArray(e.detail) ? textes(e.detail) : texte(e.detail) ? [texte(e.detail)] : [],
  }));
}
