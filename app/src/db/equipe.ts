// Comptes et équipe : table membres, fonction de la base profils_connexion(), Edge Function « equipe ».
import { supabase } from '../lib/supabase';
import type { Membre, ProfilConnexion } from '../domain/types';
import { OK, prudent, verifier, type Resultat } from './resultat';

/** Liste publique de l'écran de connexion (seule fonction lisible sans être connecté). null = indisponible. */
export async function profilsConnexion(): Promise<ProfilConnexion[] | null> {
  try {
    const { data, error } = await supabase.rpc('profils_connexion');
    if (error) return null;
    return data.map(p => ({ email: p.email, prenom: p.prenom, nom: p.nom, poste: p.poste, equipe: p.equipe, premiereConnexion: p.statut === 'ouvert' }));
  } catch { return null; }
}

export async function membreParEmail(email: string): Promise<Membre | null> {
  try {
    const { data } = await supabase.from('membres').select('*').eq('email', email).maybeSingle();
    return data;
  } catch { return null; }
}

export async function chargerMembres(): Promise<Membre[]> {
  const { data, error } = await supabase.from('membres').select('*');
  if (error) throw new Error(error.message);
  return data;
}

export type SaisieMembre = Pick<Membre, 'prenom' | 'nom' | 'poste' | 'equipe' | 'role'>;

export const ajouterMembre = (email: string, m: SaisieMembre): Promise<Resultat> =>
  prudent(async () => {
    const res = await supabase.from('membres').insert({ email, ...m, actif: true, compte_cree: false }).select('email');
    if (res.error?.code === '23505') return { ok: false, message: 'Ce membre existe déjà' };
    return verifier(res);
  });

export const modifierMembre = (email: string, patch: Partial<SaisieMembre & { actif: boolean }>): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('membres').update(patch).eq('email', email).select('email')));

/** Pour un profil qui n'a jamais eu de compte de connexion : la ligne suffit. */
export const retirerLigneMembre = (email: string): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('membres').delete().eq('email', email).select('email')));

/**
 * Edge Function « equipe » (clé service_role côté serveur uniquement) :
 * activer (premier mot de passe), reinitialiser, supprimer (compte de connexion + ligne).
 */
export async function fonctionEquipe(corps: { action: 'activer'; email: string; password: string } | { action: 'reinitialiser' | 'supprimer'; email: string }): Promise<Resultat> {
  try {
    const res: { data: { ok: boolean; message?: string } | null; error: unknown } = await supabase.functions.invoke<{ ok: boolean; message?: string }>('equipe', { body: corps });
    const data = res.data;
    if (res.error || !data) return { ok: false, message: 'La fonction "equipe" est absente ou en erreur — vois avec l\'administrateur' };
    return data.ok ? OK : { ok: false, message: data.message ?? 'Refusé' };
  } catch { return { ok: false, message: 'La fonction "equipe" est indisponible' }; }
}
