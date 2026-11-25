// Fiche allergènes de chaque menu (onglet Menus) et alerte « À réimprimer ».
// Les règles sont dans supabase/functions/allergenes-menus/regles.ts, partagé avec la fonction qui envoie l'email :
// l'écran et l'email disent la même chose.
import type { FicheRecette, Menu } from './types';
import { servicesAffiches } from './menus';
import { comparer, ecartVide, libellesEcart, lignesAllergenes, type Ecart, type LigneAllergenes } from '../../../supabase/functions/allergenes-menus/regles';

export { colonne, comparer, ecartVide, libellesEcart, lignesAllergenes, lireLignes, repartir, signatureEcart } from '../../../supabase/functions/allergenes-menus/regles';
export type { Ecart, LigneAllergenes } from '../../../supabase/functions/allergenes-menus/regles';

/** Dernière fiche allergènes imprimée d'un menu (table allergenes_imprimes). */
export interface FicheImprimee { menuId: string; menuNom: string; lignes: LigneAllergenes[]; imprimeLe: string; imprimePar: string }

/** Lignes de la fiche allergènes d'un menu, telles qu'affichées. */
export const lignesDuMenu = (m: Menu, frs: readonly FicheRecette[]): LigneAllergenes[] => lignesAllergenes(servicesAffiches(m), frs);

export interface EtatFiche {
  lignes: LigneAllergenes[];
  /** null : jamais imprimée depuis le Hub. */
  imprimee: FicheImprimee | null;
  /** Écart avec la fiche imprimée ; null si à jour ou jamais imprimée. */
  ecart: Ecart | null;
  /** Une phrase par changement (vide si à jour). */
  changements: string[];
}

export function etatFiche(m: Menu, frs: readonly FicheRecette[], imprimees: readonly FicheImprimee[]): EtatFiche {
  const lignes = lignesDuMenu(m, frs);
  const imprimee = imprimees.find(i => i.menuId === m.id) ?? null;
  if (!imprimee) return { lignes, imprimee, ecart: null, changements: [] };
  const e = comparer(imprimee.lignes, lignes);
  return ecartVide(e) ? { lignes, imprimee, ecart: null, changements: [] } : { lignes, imprimee, ecart: e, changements: libellesEcart(e) };
}

/** Lignes regroupées par temps, dans l'ordre (un temps sans plat n'apparaît pas). */
export function parTemps(lignes: readonly LigneAllergenes[]): { temps: string; lignes: LigneAllergenes[] }[] {
  const groupes: { temps: string; lignes: LigneAllergenes[] }[] = [];
  for (const l of lignes) {
    const g = groupes.find(x => x.temps === l.temps);
    if (g) g.lignes.push(l); else groupes.push({ temps: l.temps, lignes: [l] });
  }
  return groupes;
}
