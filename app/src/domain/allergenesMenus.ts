// Fiche allergènes unique de la carte (onglet Menus > Fiche allergènes) et alerte « À réimprimer ».
// Les règles sont dans supabase/functions/allergenes-menus/regles.ts, partagé avec la fonction qui envoie l'email :
// l'écran et l'email disent la même chose.
import type { FicheRecette } from './types';
import { comparer, ecartVide, FICHE_CARTE, ficheCarte, libellesEcart, type Ecart, type LigneAllergenes } from '../../../supabase/functions/allergenes-menus/regles';

export { colonne, comparer, ecartVide, FICHE_CARTE, ficheCarte, libellesEcart, lireLignes, repartir, SECTIONS_CARTE, signatureEcart } from '../../../supabase/functions/allergenes-menus/regles';
export type { Ecart, LigneAllergenes } from '../../../supabase/functions/allergenes-menus/regles';

/** Dernière fiche allergènes imprimée (table allergenes_imprimes ; la carte a la clé « carte »). */
export interface FicheImprimee { menuId: string; menuNom: string; lignes: LigneAllergenes[]; imprimeLe: string; imprimePar: string }

export interface EtatFiche {
  lignes: LigneAllergenes[];
  /** null : jamais imprimée depuis le Hub. */
  imprimee: FicheImprimee | null;
  /** Écart avec la fiche imprimée ; null si à jour ou jamais imprimée. */
  ecart: Ecart | null;
  /** Une phrase par changement (vide si à jour). */
  changements: string[];
}

/** État de la fiche allergènes de la carte : ses lignes actuelles et ce qui a changé depuis la dernière impression. */
export function etatFiche(frs: readonly FicheRecette[], imprimees: readonly FicheImprimee[]): EtatFiche {
  const lignes = ficheCarte(frs);
  const imprimee = imprimees.find(i => i.menuId === FICHE_CARTE.id) ?? null;
  if (!imprimee) return { lignes, imprimee, ecart: null, changements: [] };
  const e = comparer(imprimee.lignes, lignes);
  return ecartVide(e) ? { lignes, imprimee, ecart: null, changements: [] } : { lignes, imprimee, ecart: e, changements: libellesEcart(e) };
}

/** Lignes regroupées par section, dans l'ordre (une section sans plat n'apparaît pas). */
export function parTemps(lignes: readonly LigneAllergenes[]): { temps: string; lignes: LigneAllergenes[] }[] {
  const groupes: { temps: string; lignes: LigneAllergenes[] }[] = [];
  for (const l of lignes) {
    const g = groupes.find(x => x.temps === l.temps);
    if (g) g.lignes.push(l); else groupes.push({ temps: l.temps, lignes: [l] });
  }
  return groupes;
}
