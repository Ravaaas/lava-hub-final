// Pertes & Perso : repas du personnel (quantités utilisées par jour) et pertes diverses.
// Règles pures, sans base ni écran (testées dans domain.test.ts).

export const UNITES_PRODUIT = ['kg', 'L', 'pièce'] as const;
export const UNITES_PERTE = ['kg', 'L', 'pièce', 'portion'] as const;
export const RAISONS = ['DLC dépassée', 'Non conforme', 'Abîmé / cassé', 'Erreur de préparation', 'Retour client', 'Autre'] as const;
export type UniteProduit = typeof UNITES_PRODUIT[number];
export type UnitePerte = typeof UNITES_PERTE[number];
export type Raison = typeof RAISONS[number];

export interface ProduitPerso { cle: string; nom: string; unite: UniteProduit; categorie: string; actif: boolean }
export interface SaisiePerso { date: string; cle: string; quantite: number; par: string; email: string }
export interface CommentairePerso { date: string; email: string; nom: string; texte: string; heure: string }
export interface ValidationPerso { date: string; le: string; par: string }
export interface Perte { id: string; date: string; produit: string; quantite: number; unite: UnitePerte; raison: Raison; precision: string; par: string; email: string; heure: string }

/** « Sauté de dinde » → « saute_de_dinde » (identifiant stable d'un produit, comme dans l'ancien Google Sheet). */
export function cleProduit(nom: string): string {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'produit';
}

/** Saisie d'une quantité : « 1,5 » → 1.5 ; vide → null ; invalide (lettres, négatif, ≥ max) → NaN. */
export function lireQuantite(s: string, max = 1000): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 && v < max ? v : NaN;
}

/** 1.5 → « 1,5 » ; arrondi au gramme. */
export const quantiteFr = (v: number | null | undefined): string => (v == null ? '' : String(Math.round(v * 1000) / 1000).replace('.', ','));

/** Produits actifs groupés par catégorie, dans l'ordre d'apparition des catégories. */
export function parCategorie<T extends { categorie: string }>(produits: readonly T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const p of produits) m.set(p.categorie || 'Autres', [...(m.get(p.categorie || 'Autres') ?? []), p]);
  return [...m];
}

// ── Dates (format AAAA-MM-JJ, heure de Paris) ──
const enDate = (d: string) => { const [a, m, j] = d.split('-').map(Number); return new Date(a ?? 0, (m ?? 1) - 1, j ?? 1, 12); };
const versTexte = (x: Date) => x.toLocaleDateString('sv-SE');
export const decaler = (d: string, n: number): string => { const x = enDate(d); x.setDate(x.getDate() + n); return versTexte(x); };
/** Lundi de la semaine d'une date. */
export const lundi = (d: string): string => decaler(d, -((enDate(d).getDay() + 6) % 7));
/** Les 7 jours (lundi → dimanche) de la semaine commençant `l`. */
export const joursSemaine = (l: string): string[] => Array.from({ length: 7 }, (_, i) => decaler(l, i));
export const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;
/** « lundi 3 novembre » */
export const jourLong = (d: string): string => enDate(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
/** « 03/11 » */
export const jourCourt = (d: string): string => { const [, m, j] = d.split('-'); return `${j}/${m}`; };

/** Tableau de la semaine : une ligne par produit utilisé (quantité par jour + total), dans l'ordre de la liste. */
export interface LigneRecap { cle: string; nom: string; unite: string; categorie: string; parJour: number[]; total: number }
export function recapSemaine(l: string, saisies: readonly SaisiePerso[], produits: readonly ProduitPerso[]): LigneRecap[] {
  const jours = joursSemaine(l);
  const lignes = new Map<string, LigneRecap>();
  const connu = new Map(produits.map(p => [p.cle, p]));
  for (const s of saisies) {
    const i = jours.indexOf(s.date);
    if (i < 0 || !(s.quantite > 0)) continue;
    const p = connu.get(s.cle);
    const ligne = lignes.get(s.cle) ?? { cle: s.cle, nom: p?.nom ?? s.cle, unite: p?.unite ?? '', categorie: p?.categorie ?? 'Produits retirés', parJour: [0, 0, 0, 0, 0, 0, 0], total: 0 };
    ligne.parJour[i] = (ligne.parJour[i] ?? 0) + s.quantite;
    ligne.total += s.quantite;
    lignes.set(s.cle, ligne);
  }
  const ordre = new Map(produits.map((p, i) => [p.cle, i]));
  return [...lignes.values()].sort((a, b) => (ordre.get(a.cle) ?? 1e9) - (ordre.get(b.cle) ?? 1e9));
}

/** Message d'erreur d'une perte avant envoi, ou '' si elle est complète. */
export function erreurPerte(p: { produit: string; quantite: number | null; raison: string; precision: string }): string {
  if (!p.produit.trim()) return 'Indique le produit ou la recette.';
  if (p.quantite === null || Number.isNaN(p.quantite) || p.quantite <= 0) return 'Indique la quantité perdue.';
  if (!(RAISONS as readonly string[]).includes(p.raison)) return 'Choisis une raison.';
  if (p.raison === 'Autre' && !p.precision.trim()) return 'Précise la raison.';
  return '';
}

/** Une perte se supprime par la personne qui l'a saisie, ou par l'admin. */
export const peutSupprimerPerte = (p: Perte, email: string, admin: boolean): boolean => admin || p.email === email;
