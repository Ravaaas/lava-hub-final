// Connexion Supabase Auth : un compte par personne (identifiant fabriqué par l'app, jamais affiché).
import { supabase } from '../lib/supabase';
import { prudent, OK, type Resultat } from './resultat';

export async function emailConnecte(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.email?.toLowerCase() ?? null;
  } catch { return null; }
}

export async function seConnecter(email: string, motDePasse: string): Promise<boolean> {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
    return !error;
  } catch { return false; }
}

export async function seDeconnecter(): Promise<void> {
  try { await supabase.auth.signOut(); } catch { /* déjà déconnecté ou hors ligne : l'écran revient quand même à l'accueil */ }
}

/** Change le mot de passe puis lève le marquage « mot de passe temporaire » dans la base. */
export const changerMotDePasse = (motDePasse: string): Promise<Resultat> =>
  prudent(async () => {
    const { error } = await supabase.auth.updateUser({ password: motDePasse });
    if (error) return { ok: false, message: error.message };
    await supabase.rpc('mdp_change');
    return OK;
  });
