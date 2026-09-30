// Petites règles de texte partagées.

/** « Crème Brûlée » → « CREME BRULEE » : comparaison sans accents ni casse (doublons de fiches). */
export function normNom(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
}

/** « Zoé Lefèvre » → « zoe.lefevre » */
export function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
}

export const pluriel = (n: number, mot: string, motPluriel = mot + 's'): string => `${n} ${n === 1 ? mot : motPluriel}`;

/** Comparaison alphabétique française, sans tenir compte de la casse ni des accents. */
export const compareFr = (a: string, b: string): number => a.localeCompare(b, 'fr', { sensitivity: 'base' });

/** Contient, sans tenir compte de la casse (recherches). */
export const contient = (texte: string, q: string): boolean => texte.toLowerCase().includes(q.trim().toLowerCase());

/** « 14:05 » → « 14h05 » (toute heure au milieu d'un texte). */
export const heureFr = (s: string): string => s.replace(/\b(\d{1,2}):(\d{2})\b/g, '$1h$2');
