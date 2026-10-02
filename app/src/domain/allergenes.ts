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

export type Effectifs = Readonly<Record<string, number>>;

/** « Gluten (2) » → nom « Gluten » et nombre de personnes concernées (2). Sans nombre : pas d'effectif. */
export function separerEffectifs(liste: readonly string[]): { noms: string[]; effectifs: Record<string, number> } {
  const noms: string[] = [];
  const effectifs: Record<string, number> = {};
  for (const s of liste) {
    const m = /^(.+?)\s*\((\d+)\)$/.exec(s);
    const nom = m?.[1] ?? s;
    noms.push(nom);
    if (m?.[2]) effectifs[nom] = Number(m[2]);
  }
  return { noms, effectifs };
}

/** Inverse de `separerEffectifs` : « Gluten (2) » pour l'enregistrement en base. */
export const avecEffectifs = (noms: readonly string[], effectifs: Effectifs): string[] =>
  noms.map(n => (effectifs[n] ? `${n} (${effectifs[n]})` : n));

/** Texte affiché dans un groupe : « Gluten × 2 » ; sans nombre saisi, au moins une personne : « Gluten × 1 ». */
export const libelleEffectif = (nom: string, effectifs: Effectifs): string => `${nom} × ${effectifs[nom] ?? 1}`;

/** Union triée (ordre alphabétique français) de plusieurs listes. */
export function union(listes: readonly (readonly string[])[]): string[] {
  return [...new Set(listes.flat())].sort((a, b) => a.localeCompare(b, 'fr'));
}
