// Les 14 allergènes réglementaires regroupés en 13 (liste fixe de l'app) et les régimes des groupes.
export const ALLERGENES = ['Gluten', 'Crustacé', 'Œuf', 'Poisson', 'Arachide', 'Soja', 'Lactose', 'Fruit à coque', 'Céleri', 'Moutarde', 'Sésame', 'Sulfites', 'Mollusque'] as const;
export const REGIMES = ['Végétarien', 'Végétalien', 'Sans porc', 'Halal', 'Casher', 'Sans alcool'] as const;

/**
 * Lit une liste d'allergènes dans ses deux formats en base : « Gluten, Lactose » ou ["Gluten","Lactose"].
 * Toute autre valeur (null, nombre…) donne une liste vide.
 */
export function listeAllergenes(v: unknown): string[] {
  const brut = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',') : [];
  return brut.map(s => s.trim()).filter(Boolean);
}

/** Format d'enregistrement : « Céleri, Lactose ». */
export const joindre = (l: readonly string[]): string => l.join(', ');

/** Union triée (ordre alphabétique français) de plusieurs listes. */
export function union(listes: readonly (readonly string[])[]): string[] {
  return [...new Set(listes.flat())].sort((a, b) => a.localeCompare(b, 'fr'));
}
