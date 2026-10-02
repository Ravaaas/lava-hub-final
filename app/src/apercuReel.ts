// Aperçu « vraie base » (npm run apercu) : connexion d'office avec les identifiants de .env.local (jamais dans Git).
// Chargé seulement dans ce mode ; absent de la version compilée.
import { supabase } from './lib/supabase';

export async function preparer(): Promise<void> {
  if ((await supabase.auth.getSession()).data.session) return;
  const email = String(import.meta.env['VITE_LAVA_EMAIL'] ?? '');
  const motDePasse = String(import.meta.env['VITE_LAVA_MDP'] ?? '');
  if (!email || !motDePasse) { console.warn('Aperçu réel : renseigne VITE_LAVA_EMAIL et VITE_LAVA_MDP dans .env.local (modèle : .env.local.exemple).'); return; }
  const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
  if (error) console.warn('Aperçu réel : connexion refusée (' + error.message + ')');
}
