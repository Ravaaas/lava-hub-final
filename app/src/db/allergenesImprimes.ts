// Table allergenes_imprimes : dernière fiche allergènes imprimée de chaque menu (liste plat → allergènes au moment de l'impression).
// Sert à afficher « À réimprimer » ; la fonction « allergenes-menus » la relit pour prévenir par email.
import { supabase } from '../lib/supabase';
import { lireLignes, type FicheImprimee, type LigneAllergenes } from '../domain/allergenesMenus';
import { texte, versJson } from './lecture';
import { prudent, verifier, type Resultat } from './resultat';

export async function chargerFichesImprimees(): Promise<FicheImprimee[]> {
  const { data, error } = await supabase.from('allergenes_imprimes').select('menu_id,menu_nom,lignes,imprime_le,imprime_par');
  if (error) throw new Error(error.message);
  return data.map(l => ({ menuId: texte(l.menu_id), menuNom: texte(l.menu_nom), lignes: lireLignes(l.lignes), imprimeLe: texte(l.imprime_le), imprimePar: texte(l.imprime_par) }));
}

/** Retient ce qui vient d'être imprimé (date et auteur remplis par la base) : l'alerte « À réimprimer » est soldée. */
export const enregistrerFicheImprimee = (menuId: string, menuNom: string, lignes: readonly LigneAllergenes[]): Promise<Resultat> =>
  prudent(async () => verifier(await supabase.from('allergenes_imprimes').upsert({ menu_id: menuId, menu_nom: menuNom, lignes: versJson(lignes) }).select('menu_id')));
