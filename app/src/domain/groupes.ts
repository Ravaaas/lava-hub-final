import type { Groupe } from './types';

export const SALLES = ['Salle principale', 'Salon Basalte', 'Privatisation'] as const;

/** Date du jour au format AAAA-MM-JJ (heure locale). */
export const aujourdhui = (): string => new Date().toLocaleDateString('sv-SE');

/** Groupes à venir (dont aujourd'hui), du plus proche au plus lointain ; passés, du plus récent au plus ancien. */
export function groupesFiltres(groupes: readonly Groupe[], quand: 'avenir' | 'passes', jour = aujourdhui()): Groupe[] {
  const tries = [...groupes].sort((a, b) => (a.date + (a.heure || '')).localeCompare(b.date + (b.heure || '')));
  return quand === 'avenir' ? tries.filter(g => g.date >= jour) : tries.filter(g => g.date < jour).reverse();
}

/** « mer. 30 septembre » */
export function dateCourte(d: string): string {
  const x = new Date(d + 'T00:00:00');
  return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', ...(x.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
}

/** « mercredi 30 septembre 2026 » */
export function dateLongue(d: string): string {
  const x = new Date(d + 'T00:00:00');
  return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export const PAX_MAX = 500;

/** Contrôle de la saisie ; null si tout est bon. */
export function erreurGroupe(g: { nom: string; date: string; pax: number; effectifs?: Record<string, number> }): string | null {
  if (!g.nom.trim() || !g.date || !(g.pax > 0)) return 'Nom, date et nombre de personnes obligatoires';
  if (Object.values(g.effectifs ?? {}).some(n => !Number.isInteger(n) || n < 1 || n > g.pax)) return `Allergies et régimes : un nombre entier de personnes entre 1 et ${g.pax}`;
  return Number.isInteger(g.pax) && g.pax <= PAX_MAX ? null : `Nombre de personnes : un entier entre 1 et ${PAX_MAX}`;
}

const minutes = (h: string): number => { const [a = 0, b = 0] = h.split(':').map(Number); return a * 60 + b; };

/** Autres groupes le même jour, dans la même salle, à moins de 2 h (heures connues des deux côtés). */
export function groupesEnConflit(g: { id?: string | undefined; date: string; heure: string; salle: string }, autres: readonly Groupe[]): Groupe[] {
  if (!g.heure) return [];
  return autres.filter(o => o.id !== g.id && o.date === g.date && o.salle === g.salle && !!o.heure && Math.abs(minutes(o.heure) - minutes(g.heure)) < 120);
}
