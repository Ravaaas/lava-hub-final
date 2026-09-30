// Lecture prudente des colonnes jsonb : la base contient des formats historiques (anciens menus, allergènes
// en texte ou en tableau…). Tout passe par ces fonctions : une valeur inattendue devient une valeur vide,
// jamais une erreur au milieu d'un écran.
import type { Json } from './database.types';

export const texte = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
export const tableau = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const objet = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const textes = (v: unknown): string[] => tableau(v).map(texte).filter(Boolean);

/** Tableau JSON stocké dans une colonne texte ('["a","b"]'). Un texte non JSON devient une seule ligne. */
export function tableauTexte(v: string | null): string[] {
  if (!v) return [];
  try { return textes(JSON.parse(v)); } catch { return [v]; }
}

/** Pour enregistrer un objet de l'app dans une colonne jsonb. */
export const versJson = (v: unknown): Json => JSON.parse(JSON.stringify(v)) as Json;
