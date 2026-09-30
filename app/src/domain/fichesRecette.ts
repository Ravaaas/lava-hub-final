import type { Element, Fiche, FicheRecette, StatutFR } from './types';
import { union } from './allergenes';

export const STATUTS: readonly { valeur: StatutFR; libelle: string; adminSeulement?: true }[] = [
  { valeur: 'carte', libelle: 'Carte du soir' },
  { valeur: 'partages', libelle: 'Partages' },
  { valeur: 'lunch', libelle: 'Lunch' },
  { valeur: 'bestof', libelle: 'Best of', adminSeulement: true },
  { valeur: 'archive', libelle: 'Archive', adminSeulement: true },
];
export const libelleStatut = (s: StatutFR): string => STATUTS.find(x => x.valeur === s)?.libelle ?? s;
export const estStatut = (s: unknown): s is StatutFR => STATUTS.some(x => x.valeur === s);

/** Élément résolu : la fiche technique liée (si elle existe encore) ou le texte libre. */
export type ElementResolu = { element: Element; fiche: Fiche | null; nom: string };

/** Éléments à afficher : ceux qui pointent vers une fiche supprimée ou un texte vide sont écartés. */
export function elementsResolus(fr: FicheRecette, fiches: readonly Fiche[]): ElementResolu[] {
  const out: ElementResolu[] = [];
  for (const e of fr.elements) {
    if (e.type === 'fiche') {
      const f = fiches.find(x => x.id === e.id);
      if (f) out.push({ element: e, fiche: f, nom: f.nom });
    } else if (e.texte.trim()) out.push({ element: e, fiche: null, nom: e.texte });
  }
  return out;
}

/** Allergènes d'une fiche recette en cours d'édition : union de ceux des fiches liées (la base fait le même calcul). */
export function allergenesDesElements(elements: readonly Element[], fiches: readonly Fiche[]): string[] {
  return union(elements.flatMap(e => {
    if (e.type !== 'fiche') return [];
    const f = fiches.find(x => x.id === e.id);
    return f ? [f.allergenes] : [];
  }));
}

/** Fiches recette qui utilisent la fiche technique `id`. */
export const fichesRecetteUtilisant = (frs: readonly FicheRecette[], id: string): FicheRecette[] =>
  frs.filter(fr => fr.elements.some(e => e.type === 'fiche' && e.id === id));

export function diffFicheRecette(avant: FicheRecette, apres: Pick<FicheRecette, 'nom' | 'statut' | 'elements'>, fiches: readonly Fiche[]): string[] {
  const c: string[] = [];
  if (avant.nom !== apres.nom) c.push(`Nom : ${avant.nom || '—'} → ${apres.nom || '—'}`);
  if (avant.statut !== apres.statut) c.push(`Statut : ${libelleStatut(avant.statut)} → ${libelleStatut(apres.statut)}`);
  const cle = (e: Element) => (e.type === 'fiche' ? e.id : e.texte);
  const nom = (e: Element) => (e.type === 'fiche' ? fiches.find(f => f.id === e.id)?.nom ?? 'élément lié' : e.texte);
  const anciens = new Map(avant.elements.map(e => [cle(e), e]));
  const nouveaux = new Map(apres.elements.map(e => [cle(e), e]));
  for (const [k, n] of nouveaux) {
    const a = anciens.get(k);
    if (!a) c.push(`+ ${nom(n)}`);
    else if (a.grammage !== n.grammage) c.push(`${nom(n)} : ${a.grammage || '—'} → ${n.grammage || '—'}`);
  }
  for (const [k, a] of anciens) if (!nouveaux.has(k)) c.push(`− ${nom(a)}`);
  return c;
}
