import type { ContactGroupe, Groupe, Niveau, Profil, Reglement } from './types';

/** États du paiement, du moins au plus avancé. */
export const REGLEMENTS: readonly { valeur: Reglement; libelle: string }[] = [
  { valeur: 'aucun', libelle: 'Rien reçu' },
  { valeur: 'empreinte', libelle: 'Empreinte bancaire' },
  { valeur: 'acompte', libelle: 'Acompte versé' },
  { valeur: 'regle', libelle: 'Réglé en totalité' },
];
/** Valeur lue en base ; inconnue ou absente = rien reçu. */
export const lireReglement = (v: unknown): Reglement => REGLEMENTS.find(r => r.valeur === v)?.valeur ?? 'aucun';
export const libelleReglement = (r: Reglement): string => REGLEMENTS.find(x => x.valeur === r)?.libelle ?? '';

/** Libellé du champ montant selon l'état du paiement (aucun montant quand rien n'est reçu). */
export function libelleMontant(r: Reglement): string {
  return r === 'empreinte' ? "Montant de l'empreinte (€)" : r === 'acompte' ? "Montant de l'acompte (€)" : r === 'regle' ? 'Montant réglé (€)' : '';
}
/** Montant lu en base (nombre, ou texte pour une colonne numeric) ; illisible ou négatif = non précisé. */
export function lireMontant(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}
/** Montant saisi : « 1 250,50 » ou « 1250.5 » ; vide = null ; illisible = NaN (refusé par erreurGroupe). */
export function montantSaisi(t: string): number | null {
  const v = t.replace(/[\s\u00a0€]/g, '').replace(',', '.');
  return v ? (/^\d+(\.\d{1,2})?$/.test(v) ? Number(v) : NaN) : null;
}
/** « 1 250 € », « 300,50 € » */
export const euros = (n: number): string =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });

export const MONTANT_MAX = 1_000_000;
/** Adresse email plausible (un @, un point dans le domaine, pas d'espace). */
export const emailValide = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** Anciens groupes (sans profils) : une ligne par allergie et par régime, avec son nombre de personnes (1 par défaut). */
export const profilsDepuisAnciens = (allergenes: readonly string[], regimes: readonly string[], effectifs: Readonly<Record<string, number>>): Profil[] => [
  ...allergenes.map(a => ({ nb: effectifs[a] ?? 1, allergenes: [a], regimes: [] })),
  ...regimes.map(r => ({ nb: effectifs[r] ?? 1, allergenes: [], regimes: [r] })),
];

/** Résumé : allergies et régimes du groupe (ordre d'apparition) et nombre total de personnes concernées par chacun. */
export function resumeProfils(profils: readonly Profil[]): { allergenes: string[]; regimes: string[]; effectifs: Record<string, number> } {
  const effectifs: Record<string, number> = {};
  const allergenes: string[] = [], regimes: string[] = [];
  for (const p of profils) {
    for (const a of p.allergenes) { if (!(a in effectifs)) allergenes.push(a); effectifs[a] = (effectifs[a] ?? 0) + p.nb; }
    for (const r of p.regimes) { if (!(r in effectifs)) regimes.push(r); effectifs[r] = (effectifs[r] ?? 0) + p.nb; }
  }
  return { allergenes, regimes, effectifs };
}

/** Lignes sans allergie ni régime écartées avant enregistrement. */
export const profilsAEnregistrer = (profils: readonly Profil[]): Profil[] => profils.filter(p => p.allergenes.length || p.regimes.length);

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
export function erreurGroupe(g: { nom: string; date: string; pax: number; effectifs?: Record<string, number>; profils?: readonly Profil[]; niveaux?: readonly Niveau[]; montant?: number | null; email?: string }): string | null {
  if (!g.nom.trim() || !g.date || !(g.pax > 0)) return 'Nom, date et nombre de personnes obligatoires';
  if (!Number.isInteger(g.pax) || g.pax > PAX_MAX) return `Nombre de personnes : un entier entre 1 et ${PAX_MAX}`;
  const profils = g.profils ?? [];
  if (profils.some(p => !Number.isInteger(p.nb) || p.nb < 1)) return 'Allergies et régimes : un nombre entier de personnes sur chaque ligne';
  const declares = profils.reduce((t, p) => t + p.nb, 0);
  if (declares > g.pax) return `Allergies et régimes : ${declares} personnes déclarées pour ${g.pax}`;
  if (Object.values(g.effectifs ?? {}).some(n => !Number.isInteger(n) || n < 1 || n > g.pax)) return `Allergies et régimes : un nombre entier de personnes entre 1 et ${g.pax}`;
  // nombre de chaque plat : facultatif ; s'il est donné, entier, au moins 1 et pas plus que le groupe
  const qtes = (g.niveaux ?? []).flatMap(n => n.plats).map(p => p.qte).filter(q => q !== null);
  if (qtes.some(q => !Number.isInteger(q) || q < 1 || q > g.pax)) return `Nombre de plats : un entier entre 1 et ${g.pax}`;
  if (g.montant != null && !(Number.isFinite(g.montant) && g.montant >= 0 && g.montant <= MONTANT_MAX)) return 'Montant : un nombre en euros, par exemple 300 ou 1250,50';
  if (g.email && !emailValide(g.email)) return 'Email du référent : adresse invalide (ex: nom@exemple.fr)';
  return null;
}

/** Une personne de la base de contacts : coordonnées les plus récentes, dernier groupe et nombre de groupes. */
export interface ContactUnique { nom: string; email: string; telephone: string; groupe: string; date: string; groupes: number }

/**
 * Base de contacts : un contact par email (sinon par téléphone), le plus récent d'abord.
 * Les fiches sans email ni téléphone sont ignorées ; un champ vide est complété par une fiche plus ancienne.
 */
export function contactsUniques(contacts: readonly ContactGroupe[]): ContactUnique[] {
  const cle = (c: ContactGroupe) => c.email.trim().toLowerCase() || c.telephone.replace(/[^\d+]/g, '');
  const parCle = new Map<string, ContactUnique>();
  const recents = [...contacts].sort((a, b) => (b.date_groupe ?? '').localeCompare(a.date_groupe ?? ''));
  for (const c of recents) {
    const k = cle(c);
    if (!k) continue;
    const u = parCle.get(k);
    if (!u) { parCle.set(k, { nom: c.nom.trim(), email: c.email.trim(), telephone: c.telephone.trim(), groupe: c.groupe, date: c.date_groupe ?? '', groupes: 1 }); continue; }
    u.groupes += 1;
    u.nom ||= c.nom.trim(); u.email ||= c.email.trim(); u.telephone ||= c.telephone.trim();
  }
  return [...parCle.values()];
}

// Une cellule qui commence par = + - @ serait lue comme une formule par Excel : on la protège (sauf un numéro de téléphone).
const cellule = (v: string | number): string => {
  let t = String(v);
  if (/^[=+\-@\t\r]/.test(t) && !/^\+?[\d\s.()-]+$/.test(t)) t = "'" + t;
  return /[;"\n\r]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
};

/** Fichier CSV (séparateur « ; », ouvert directement par Excel en français, importable dans un outil d'emailing). */
export function csvContacts(liste: readonly ContactUnique[]): string {
  const lignes = [['Nom', 'Email', 'Téléphone', 'Dernier groupe', 'Date du dernier groupe', 'Nombre de groupes'],
    ...liste.map(c => [c.nom, c.email, c.telephone, c.groupe, c.date, c.groupes])];
  return '\ufeff' + lignes.map(l => l.map(cellule).join(';')).join('\r\n') + '\r\n';
}

const minutes = (h: string): number => { const [a = 0, b = 0] = h.split(':').map(Number); return a * 60 + b; };

/** Autres groupes le même jour, dans la même salle, à moins de 2 h (heures connues des deux côtés). */
export function groupesEnConflit(g: { id?: string | undefined; date: string; heure: string; salle: string }, autres: readonly Groupe[]): Groupe[] {
  if (!g.heure) return [];
  return autres.filter(o => o.id !== g.id && o.date === g.date && o.salle === g.salle && !!o.heure && Math.abs(minutes(o.heure) - minutes(g.heure)) < 120);
}
