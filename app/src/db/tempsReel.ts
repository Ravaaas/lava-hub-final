import { supabase } from '../lib/supabase';

/** Prévient quand quelqu'un modifie fiches, fiches recette, groupes ou menus. Renvoie la fonction d'arrêt. */
export function surModification(rappel: () => void): () => void {
  const canal = (['fiches', 'fiches_recette', 'groupes', 'lava_config'] as const)
    .reduce((c, table) => c.on('postgres_changes', { event: '*', schema: 'public', table }, rappel), supabase.channel('lava'))
    .subscribe();
  return () => { void supabase.removeChannel(canal); };
}
