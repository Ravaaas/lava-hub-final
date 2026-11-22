import type { Fiche, FicheRecette, Groupe, Menu, Niveau, Plat, Service } from './types';
import { elementsResolus } from './fichesRecette';

/** Menus à temps fixes : leurs temps sont imposés et ne se modifient pas. */
const MENUS_FIXES: Record<string, readonly string[]> = {
  'carte du soir': ['Partages', 'Plat', 'Dessert'],
  '3 temps': ['Temps 1', 'Temps 2', 'Temps 3'],
  '5 temps': ['Temps 1', 'Temps 2', 'Temps 3', 'Temps 4', 'Temps 5'],
};
export const tempsFixes = (nom: string): readonly string[] | undefined => MENUS_FIXES[nom.trim().toLowerCase()];

/** Menus créés en un clic quand il n'y en a aucun. */
export const MENUS_DE_DEPART: readonly { nom: string; temps: readonly string[] }[] = [
  { nom: 'Lunch', temps: ['Entrée', 'Plat', 'Dessert'] },
  { nom: 'Carte du soir', temps: ['Partages', 'Plat', 'Dessert'] },
  { nom: '3 temps', temps: ['Temps 1', 'Temps 2', 'Temps 3'] },
  { nom: '5 temps', temps: ['Temps 1', 'Temps 2', 'Temps 3', 'Temps 4', 'Temps 5'] },
];

/**
 * Temps d'un menu tels qu'affichés. Pour un menu à temps fixes enregistré avant :
 * un ancien temps qui porte déjà le bon nom garde sa place (« Plat » reste « Plat ») ;
 * les temps imposés sans correspondance reprennent les anciens temps restants, dans l'ordre (« Entrée » → « Temps 1 »).
 */
export function servicesAffiches(m: Menu): Service[] {
  const noms = tempsFixes(m.nom);
  if (!noms) return m.services;
  const reste = [...m.services];
  const cle = (s: Service) => s.nom.trim().toLowerCase();
  const trouves = noms.map(n => {
    const i = reste.findIndex(s => cle(s) === n.toLowerCase());
    return i < 0 ? null : (reste.splice(i, 1)[0] ?? null);
  });
  const fixes = trouves.map((s, i) => ({ plats: (s ?? reste.shift())?.plats ?? [], nom: noms[i] ?? '' }));
  return [...fixes, ...reste];
}

export interface PlatAffiche {
  nom: string;
  allergenes: string[];
  /** Descriptif : les éléments de la fiche recette (fiches liées et éléments libres). */
  elements: string[];
}

export function platAffiche(p: Plat, frs: readonly FicheRecette[], fiches: readonly Fiche[]): PlatAffiche {
  if ('texte' in p) return { nom: p.texte, allergenes: [], elements: [] };
  const fr = frs.find(f => f.id === p.frId);
  if (!fr) return { nom: '(fiche supprimée)', allergenes: [], elements: [] };
  return { nom: fr.nom, allergenes: fr.allergenes, elements: elementsResolus(fr, fiches).map(e => e.nom) };
}

export const platsDuMenu = (m: Menu, frs: readonly FicheRecette[], fiches: readonly Fiche[]): PlatAffiche[] =>
  servicesAffiches(m).flatMap(s => s.plats).map(p => platAffiche(p, frs, fiches));

/** Niveaux tirés d'un menu : ses temps et ses plats, sans quantités. */
export const niveauxDuMenu = (m: Menu): Niveau[] => servicesAffiches(m).map(s => ({ nom: s.nom, plats: s.plats.map(p => ({ ...p, qte: null })) }));

/** Niveaux d'un groupe : les siens, ou à défaut ceux du menu choisi (groupes enregistrés avant les niveaux). */
export function niveauxDuGroupe(g: Groupe, menus: readonly Menu[]): Niveau[] {
  if (g.niveaux.length) return g.niveaux;
  const m = menus.find(x => x.id === g.menu_id);
  return m ? niveauxDuMenu(m) : [];
}

/** Total commandé dans un niveau et écart avec le nombre de personnes (0 = juste ; positif = plats en trop). */
export function totalNiveau(n: Niveau, pax: number): { total: number; ecart: number } {
  const total = n.plats.reduce((t, p) => t + (p.qte ?? 0), 0);
  return { total, ecart: total - pax };
}

/** Plats du menu d'un groupe qui contiennent une allergie déclarée par le groupe. */
export function alertesGroupe(g: Groupe, menus: readonly Menu[], frs: readonly FicheRecette[], fiches: readonly Fiche[]): { plat: string; allergenes: string[] }[] {
  const declarees = new Set(g.allergenes);
  if (!declarees.size) return [];
  return niveauxDuGroupe(g, menus).flatMap(n => n.plats).map(p => platAffiche(p, frs, fiches))
    .map(p => ({ plat: p.nom, allergenes: p.allergenes.filter(a => declarees.has(a)) }))
    .filter(x => x.allergenes.length > 0);
}

/** Niveaux nettoyés avant enregistrement : plats vers des fiches supprimées et plats libres vides retirés, puis niveaux sans plat retirés. */
export function niveauxAEnregistrer(niveaux: readonly Niveau[], frs: readonly FicheRecette[]): Niveau[] {
  return niveaux
    .map(n => ({ nom: n.nom.trim(), plats: n.plats.filter(p => ('frId' in p ? frs.some(f => f.id === p.frId) : p.texte.trim() !== '')).map(p => ('texte' in p ? { ...p, texte: p.texte.trim() } : p)) }))
    .filter(n => n.plats.length);
}

/** Temps nettoyés avant enregistrement : noms rognés, plats vers des fiches supprimées retirés, temps vides sans nom retirés. */
export function servicesAEnregistrer(services: readonly Service[], frs: readonly FicheRecette[]): Service[] {
  return services
    .map(s => ({ nom: s.nom.trim(), plats: s.plats.filter(p => ('frId' in p ? frs.some(f => f.id === p.frId) : p.texte.trim() !== '')) }))
    .filter(s => s.nom || s.plats.length);
}
