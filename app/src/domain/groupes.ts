import type { Groupe } from './types';

export const SALLES = ['Salle principale', 'Salon Basalte', 'Terrasse', 'Privatisation'] as const;
export const SOURCES = ['Email', 'Téléphone', 'Zenchef', 'Autre'] as const;

/** Date du jour au format AAAA-MM-JJ (heure locale). */
export const aujourdhui = (): string => new Date().toLocaleDateString('sv-SE');

/** Groupes à venir (dont aujourd'hui), du plus proche au plus lointain ; passés, du plus récent au plus ancien. */
export function groupesFiltres(groupes: readonly Groupe[], quand: 'avenir' | 'passes', jour = aujourdhui()): Groupe[] {
  const tries = [...groupes].sort((a, b) => a.date.localeCompare(b.date));
  return quand === 'avenir' ? tries.filter(g => g.date >= jour) : tries.filter(g => g.date < jour).reverse();
}

/** « mer. 30 septembre » */
export function dateCourte(d: string): string {
  const x = new Date(d + 'T00:00:00');
  return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });
}

/** Contrôle de la saisie ; null si tout est bon. */
export function erreurGroupe(g: { nom: string; date: string; pax: number }): string | null {
  return !g.nom.trim() || !g.date || !(g.pax > 0) ? 'Nom, date et nombre de personnes obligatoires' : null;
}
