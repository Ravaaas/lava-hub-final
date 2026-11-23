import type { Fiche, FicheRecette, Groupe, Menu, Niveau, Plat, PlatCompte, Profil, Service } from './types';
import { elementsResolus } from './fichesRecette';
import { ALLERGENES } from './allergenes';
import { familleDuMot, norm, REGLES_REGIMES, trouverPourRegime, trouverTerme } from '../../../supabase/functions/recap-groupes/aliments';

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

/** Clé d'un plat dans son niveau (lien « remplace ») : id de la fiche recette, ou texte du plat libre. */
export const clePlat = (p: Plat): string => ('frId' in p ? p.frId : p.texte);

/**
 * Lie un plat de remplacement au plat en conflit (même niveau) : le plat `remplacant` sert à la place de `conflit`,
 * et les autres liens vers `conflit` sont retirés. `remplacant` vide = plus aucun remplaçant.
 */
export function lierRemplacant(niveaux: readonly Niveau[], conflit: string, remplacant: string): Niveau[] {
  const n = niveaux.findIndex(x => x.plats.some(p => clePlat(p) === conflit));
  return niveaux.map((x, i) => (i !== n ? x : {
    ...x,
    plats: x.plats.map(p => (p.remplace === conflit ? sansRemplace(p) : p))
      .map(p => (remplacant && clePlat(p) === remplacant && remplacant !== conflit ? { ...p, remplace: conflit } : p)),
  }));
}

/** Plat sans lien « remplace » (lien vers un plat qui n'est plus dans le niveau). */
export const sansRemplace = (p: PlatCompte): PlatCompte => { const c = { ...p }; delete c.remplace; return c; };

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
  return { total, ecart: pax > 0 ? total - pax : 0 };   // brouillon sans nombre de personnes : pas d'écart
}

/**
 * Plats d'un niveau servis au groupe, tels que la fiche les montre : dès qu'un nombre est saisi dans le niveau, seuls les plats qui ont un nombre
 * (et les plats de remplacement, même sans nombre) ; un niveau sans aucun nombre montre tous ses plats.
 */
export const platsCommandes = (n: Niveau): PlatCompte[] =>
  n.plats.some(p => p.qte !== null) ? n.plats.filter(p => p.qte !== null || p.remplace !== undefined || (p.pour?.length ?? 0) > 0) : n.plats;

/** « Gluten · Moutarde » : les allergies puis les régimes d'une ligne de personnes. */
export const libelleProfil = (p: Profil): string => [...p.allergenes, ...p.regimes].join(' · ');

/** Lignes de personnes servies avec ce plat (écrites en face du plat sur la fiche). */
export const personnesDuPlat = (p: PlatCompte, profils: readonly Profil[]): Profil[] =>
  profils.filter(x => x.id !== undefined && p.pour?.includes(x.id));

/** Texte comparé sans accents ni majuscules (« Céleri » = « celeri », « œuf » = « oeuf »). */
const sansAccents = norm;

/** Allergie déclarée qui n'est pas un des allergènes réglementaires (Kiwi, Ail…), écrite à la main. */
export const estAllergieLibre = (a: string): boolean => !ALLERGENES.some(x => sansAccents(x) === sansAccents(a));

/** Allergie saisie à la main : l'allergène réglementaire s'il est écrit autrement (« gluten » → « Gluten »), sinon le texte nettoyé. */
export function allergieSaisie(t: string): string {
  const propre = t.replace(/\s+/g, ' ').trim();
  return ALLERGENES.find(x => sansAccents(x) === sansAccents(propre)) ?? (propre.charAt(0).toUpperCase() + propre.slice(1));
}

/** Ce qu'on sait d'un plat pour y chercher une allergie libre : son nom, ses éléments, et les ingrédients de ses fiches techniques (fiches liées comprises). */
function textesDuPlat(p: Plat, frs: readonly FicheRecette[], fiches: readonly Fiche[]): string[] {
  if ('texte' in p) return [p.texte];
  const fr = frs.find(f => f.id === p.frId);
  if (!fr) return [];
  const out = [fr.nom];
  const vues = new Set<string>();
  const parcourir = (f: Fiche) => {
    if (vues.has(f.id)) return;
    vues.add(f.id);
    out.push(f.nom);
    for (const i of f.ingredients) {
      const liee = i.ficheId ? fiches.find(x => x.id === i.ficheId) : undefined;
      if (liee) parcourir(liee); else out.push(i.nom);
    }
  };
  for (const e of elementsResolus(fr, fiches)) { if (e.fiche) parcourir(e.fiche); else out.push(e.nom); }
  return out;
}

/** Premier texte qui contient le mot (pluriel compris : « noisette » trouve « NOISETTES TORRÉFIÉES », mais « ail » ne trouve pas « caille »). */
function chercherMot(mot: string, textes: readonly string[]): string | undefined {
  const m = sansAccents(mot).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!m) return undefined;
  const re = new RegExp(`(^|[^a-z0-9])${m}(s|x)?($|[^a-z0-9])`);
  return textes.find(t => re.test(sansAccents(t)));
}

/**
 * Plat à adapter : allergies déclarées qu'il contient et nombre de personnes concernées (au moins une de leurs allergies).
 * `indices` : pour une allergie libre, où elle a été trouvée (ingrédient ou élément), quand ce n'est pas le nom du plat.
 * `remplacants` : plats du même niveau prévus à sa place ; `adapte` : ils couvrent les personnes concernées
 * (nombre non précisé = couvert ; sinon leur total doit atteindre le nombre de personnes concernées).
 */
export interface Alerte { plat: string; allergenes: string[]; personnes: number; indices?: Record<string, string>; remplacants?: string[]; adapte?: boolean }

/** Allergies, mots libres et régimes que ce plat contredit, où ils ont été trouvés, et les lignes de personnes concernées. */
function contredit(p: Plat, allergenes: readonly string[], profils: readonly Profil[], regimes: readonly string[], libres: readonly string[], frs: readonly FicheRecette[], fiches: readonly Fiche[]) {
  const indices: Record<string, string> = {};
  if (libres.length || regimes.length) {
    const textes = textesDuPlat(p, frs, fiches);
    for (const a of libres) {
      const famille = familleDuMot(a);
      if (famille) { const t = trouverTerme(famille.termes, textes, famille.sans); if (t) indices[a] = t.terme; }
      else { const t = chercherMot(a, textes); if (t !== undefined) indices[a] = t; }
    }
    for (const r of regimes) { const t = trouverPourRegime(r, textes, allergenes); if (t) indices[r] = t.terme; }
  }
  const contenus = [...allergenes, ...Object.keys(indices)];
  const touches = profils.filter(x => [...x.allergenes, ...x.regimes].some(a => contenus.includes(a)));
  return { indices, contenus, touches };
}

/** Régimes suivis (avec une règle) et allergies libres (hors des 13 allergènes) de ces personnes. */
const exigences = (profils: readonly Profil[]) => ({
  regimes: [...new Set(profils.flatMap(p => p.regimes))].filter(r => r in REGLES_REGIMES),
  libres: [...new Set(profils.flatMap(p => p.allergenes).filter(estAllergieLibre))],
});

/**
 * Plats qui contiennent une allergie déclarée ou un aliment exclu par un régime, chacun une fois, avec les personnes concernées.
 * Allergènes réglementaires : ceux du plat. Allergies libres (Kiwi, Fromage…) : cherchées dans le nom, les éléments et les ingrédients du plat,
 * un mot général (viande, fromage, fruits de mer…) trouvant tous ses aliments. Régimes : voir `REGLES_REGIMES` (supabase/functions/recap-groupes/aliments.ts).
 */
export function alertesMenu(niveaux: readonly Niveau[], profils: readonly Profil[], frs: readonly FicheRecette[], fiches: readonly Fiche[]): Alerte[] {
  const { regimes, libres } = exigences(profils);
  if (!profils.some(p => p.allergenes.length) && !regimes.length) return [];
  const vus = new Set<string>();
  return niveaux.flatMap(platsCommandes).flatMap(p => {
    const d = platAffiche(p, frs, fiches);
    if (vus.has(d.nom)) return [];
    vus.add(d.nom);
    const { indices, contenus, touches } = contredit(p, d.allergenes, profils, regimes, libres, frs, fiches);
    if (!touches.length) return [];
    const allergenes = contenus.filter(a => touches.some(x => x.allergenes.includes(a) || x.regimes.includes(a)));
    const visibles = Object.fromEntries(Object.entries(indices).filter(([, t]) => sansAccents(t) !== sansAccents(d.nom)));
    const personnes = touches.reduce((t, x) => t + x.nb, 0);
    const cle = clePlat(p);
    const remplacants = niveaux.flatMap(n => (n.plats.some(q => clePlat(q) === cle) ? n.plats.filter(q => q.remplace === cle && clePlat(q) !== cle) : []));
    const comptes = remplacants.map(q => q.qte);
    const adapte = remplacants.length > 0 && (comptes.includes(null) || comptes.reduce<number>((t, q) => t + (q ?? 0), 0) >= personnes);
    return [{
      plat: d.nom, allergenes, personnes,
      ...(Object.keys(visibles).length ? { indices: visibles } : {}),
      ...(remplacants.length ? { remplacants: remplacants.map(q => platAffiche(q, frs, fiches).nom), adapte } : {}),
    }];
  });
}

/** Plat proposé à la place d'un plat en conflit, et d'où il vient : autre plat du niveau, plat du même temps d'un menu, fiche recette. */
export interface Proposition { plat: Plat; nom: string; origine: 'niveau' | 'menu' | 'fiches' }

/**
 * Alternatives au plat en conflit du niveau `iNiveau` : des plats qui ne contredisent AUCUNE restriction des personnes concernées
 * (régimes, allergies, mots libres), au plus `max`. On cherche d'abord les autres plats du niveau, puis les plats du même temps dans les menus
 * (le menu choisi en premier ; le temps se reconnaît à son nom : « Entrée »), puis toutes les fiches recette non archivées.
 */
export function propositionsPour(
  niveaux: readonly Niveau[], iNiveau: number, conflit: PlatCompte, profils: readonly Profil[],
  frs: readonly FicheRecette[], fiches: readonly Fiche[], menus: readonly Menu[], menuId: string | null, max = 4,
): Proposition[] {
  const niveau = niveaux[iNiveau];
  if (!niveau) return [];
  const tous = exigences(profils);
  const concernes = contredit(conflit, platAffiche(conflit, frs, fiches).allergenes, profils, tous.regimes, tous.libres, frs, fiches).touches;
  if (!concernes.length) return [];
  const ex = exigences(concernes);
  const compatible = (p: Plat) => contredit(p, platAffiche(p, frs, fiches).allergenes, concernes, ex.regimes, ex.libres, frs, fiches).touches.length === 0;
  const vues = new Set<string>([clePlat(conflit)]);
  const out: Proposition[] = [];
  const essayer = (p: Plat, origine: Proposition['origine']) => {
    if (out.length >= max) return;
    const cle = clePlat(p);
    if (vues.has(cle)) return;
    vues.add(cle);
    const { nom } = platAffiche(p, frs, fiches);
    const supprime = 'frId' in p && !frs.some(f => f.id === p.frId);   // plat d'un menu dont la fiche n'existe plus
    if (nom.trim() && !supprime && compatible(p)) out.push({ plat: p, nom, origine });
  };
  for (const q of niveau.plats) if (q.remplace === undefined) essayer('frId' in q ? { frId: q.frId } : { texte: q.texte }, 'niveau');
  const temps = sansAccents(niveau.nom);
  if (temps) {
    for (const m of [...menus.filter(x => x.id === menuId), ...menus.filter(x => x.id !== menuId)]) {
      for (const sv of servicesAffiches(m)) if (sansAccents(sv.nom) === temps) for (const p of sv.plats) essayer(p, 'menu');
    }
  }
  for (const f of frs.filter(x => x.statut !== 'archive').sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))) essayer({ frId: f.id }, 'fiches');
  return out;
}

/** Plats du menu d'un groupe qui contiennent une allergie déclarée par le groupe. */
export const alertesGroupe = (g: Groupe, menus: readonly Menu[], frs: readonly FicheRecette[], fiches: readonly Fiche[]): Alerte[] =>
  alertesMenu(niveauxDuGroupe(g, menus), g.profils, frs, fiches);

/** « Conflit : CASSOLETTE (Moutarde) +1 » pour la carte d'un groupe ; les plats déjà adaptés n'y figurent pas. */
export const resumeAlertes = (toutes: readonly Alerte[]): string => {
  const a = toutes.filter(x => !x.adapte);
  return a[0] ? `Conflit : ${a[0].plat} (${a[0].allergenes.join(', ')})${a.length > 1 ? ` +${a.length - 1}` : ''}` : '';
};

/** Personnes liées au plat : celles qui n'existent plus (`profils` connus) sont retirées. */
function pourNettoye(p: PlatCompte, profils: readonly Profil[]): PlatCompte {
  if (!p.pour) return p;
  const c = { ...p };
  const ids = p.pour.filter(i => profils.some(x => x.id === i));
  if (ids.length) c.pour = ids; else delete c.pour;
  return c;
}

/**
 * Niveaux nettoyés avant enregistrement : plats vers des fiches supprimées et plats libres vides retirés, puis niveaux sans plat retirés ;
 * lien « remplace » retiré s'il ne désigne plus un autre plat du niveau ; personnes liées retirées si leur ligne n'existe plus (`profils` donnés).
 */
export function niveauxAEnregistrer(niveaux: readonly Niveau[], frs: readonly FicheRecette[], profils?: readonly Profil[]): Niveau[] {
  return niveaux
    .map(n => ({ nom: n.nom.trim(), plats: n.plats.filter(p => ('frId' in p ? frs.some(f => f.id === p.frId) : p.texte.trim() !== '')).map(p => ('texte' in p ? { ...p, texte: p.texte.trim() } : p)) }))
    .map(n => ({ ...n, plats: n.plats.map(p => (p.remplace === undefined || (p.remplace !== clePlat(p) && n.plats.some(q => clePlat(q) === p.remplace)) ? p : sansRemplace(p))) }))
    .map(n => (profils ? { ...n, plats: n.plats.map(p => pourNettoye(p, profils)) } : n))
    .filter(n => n.plats.length);
}

/** Temps nettoyés avant enregistrement : noms rognés, plats vers des fiches supprimées retirés, temps vides sans nom retirés. */
export function servicesAEnregistrer(services: readonly Service[], frs: readonly FicheRecette[]): Service[] {
  return services
    .map(s => ({ nom: s.nom.trim(), plats: s.plats.filter(p => ('frId' in p ? frs.some(f => f.id === p.frId) : p.texte.trim() !== '')) }))
    .filter(s => s.nom || s.plats.length);
}
