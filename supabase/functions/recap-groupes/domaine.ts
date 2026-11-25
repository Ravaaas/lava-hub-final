// Fiche d'un groupe, telle que l'app la montre (onglet Groupes) : plats commandés, plats à adapter, personnes, règlement.
// Copie autonome des règles de l'app (app/src/domain/menus.ts, groupes.ts, allergenes.ts et lecture des tables dans app/src/db/) :
// la fonction se déploie à la main, elle ne peut pas importer le code de l'app. Un test de l'app
// (app/src/domain/recapGroupes.test.ts) compare les deux sur les mêmes données : en changer une, changer l'autre.
// Seule dépendance : la liste d'aliments `aliments.ts`, partagée avec l'app (Deno et Vitest lisent ce fichier).

import { familleDuMot, norm, REGLES_REGIMES, trouverPourRegime, trouverTerme } from "./aliments.ts";

// ── Lecture prudente des colonnes (valeur inattendue = valeur vide) ──
const texte = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const tableau = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objet = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const textes = (v: unknown): string[] => tableau(v).map(texte).filter(Boolean);

export const ALLERGENES = ["Gluten", "Crustacé", "Œuf", "Poisson", "Arachide", "Soja", "Lactose", "Fruit à coque", "Céleri", "Moutarde", "Sésame", "Sulfites", "Mollusque"];

/** « Gluten, Lactose » ou ["Gluten","Lactose"] : les deux formats existent en base. */
export function listeAllergenes(v: unknown): string[] {
  const brut = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(",") : [];
  return brut.map((s) => s.trim()).filter(Boolean);
}

/** « Gluten (2) » → nom « Gluten » et nombre de personnes (2). */
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

// ── Modèle ──
export type Plat = { frId: string } | { texte: string };
export type PlatCompte = Plat & { qte: number | null; remplace?: string; pour?: string[] };
export interface Niveau { nom: string; plats: PlatCompte[] }
export interface Profil { id?: string; nb: number; allergenes: string[]; regimes: string[] }
export interface Ingredient { nom: string; ficheId?: string }
export interface Fiche { id: string; nom: string; ingredients: Ingredient[] }
export type Element = { type: "fiche"; id: string } | { type: "libre"; texte: string };
export interface FicheRecette { id: string; nom: string; allergenes: string[]; elements: Element[] }
export interface Service { nom: string; plats: Plat[] }
export interface Menu { id: string; nom: string; services: Service[] }
export interface Groupe {
  id: string; statut: "confirme" | "brouillon"; nom: string; date: string; heure: string; pax: number; salle: string;
  menu_id: string | null; menu_nom: string | null; niveaux: Niveau[]; profils: Profil[];
  allergenes: string[]; regimes: string[]; effectifs: Record<string, number>;
  notes: string; boissons: string; reglement: string; referent: string;
}

// ── Lecture des tables ──
const lirePlat = (v: unknown): Plat | null => {
  const o = objet(v);
  if (texte(o.frId)) return { frId: texte(o.frId) };
  return texte(o.text) ? { texte: texte(o.text) } : null;
};
function lirePlatCompte(v: unknown): PlatCompte | null {
  const p = lirePlat(v);
  const { qte: q, remplace, pour } = objet(v);
  if (!p) return null;
  const lu: PlatCompte = { ...p, qte: typeof q === "number" && Number.isFinite(q) ? q : null };
  if (texte(remplace)) lu.remplace = texte(remplace);
  const ids = textes(pour);
  if (ids.length) lu.pour = ids;
  return lu;
}
const lireNiveau = (v: unknown): Niveau => ({ nom: texte(objet(v).nom), plats: tableau(objet(v).plats).map(lirePlatCompte).filter((p) => p !== null) });
function lireNiveaux(niveaux: unknown, platsSurMesure: unknown): Niveau[] {
  const n = tableau(niveaux).map(lireNiveau);
  if (n.length) return n;
  const plats = tableau(platsSurMesure).map(lirePlat).filter((p) => p !== null).map((p) => ({ ...p, qte: null }));
  return plats.length ? [{ nom: "", plats }] : [];
}
function lireProfil(v: unknown): Profil | null {
  const o = objet(v);
  const nb = typeof o.nb === "number" && Number.isInteger(o.nb) && o.nb > 0 ? o.nb : 1;
  const p: Profil = { nb, allergenes: textes(o.allergenes), regimes: textes(o.regimes) };
  if (texte(o.id)) p.id = texte(o.id);
  return p.allergenes.length || p.regimes.length ? p : null;
}
const profilsDepuisAnciens = (allergenes: readonly string[], regimes: readonly string[], effectifs: Readonly<Record<string, number>>): Profil[] => [
  ...allergenes.map((a) => ({ nb: effectifs[a] ?? 1, allergenes: [a], regimes: [] })),
  ...regimes.map((r) => ({ nb: effectifs[r] ?? 1, allergenes: [], regimes: [r] })),
];
/** Allergies et régimes du groupe et nombre de personnes concernées par chacun. */
export function resumeProfils(profils: readonly Profil[]): { allergenes: string[]; regimes: string[]; effectifs: Record<string, number> } {
  const effectifs: Record<string, number> = {};
  const allergenes: string[] = [], regimes: string[] = [];
  for (const p of profils) {
    for (const a of p.allergenes) { if (!(a in effectifs)) allergenes.push(a); effectifs[a] = (effectifs[a] ?? 0) + p.nb; }
    for (const r of p.regimes) { if (!(r in effectifs)) regimes.push(r); effectifs[r] = (effectifs[r] ?? 0) + p.nb; }
  }
  return { allergenes, regimes, effectifs };
}

/** Ligne de la table `groupes` → groupe, comme l'app la lit. */
export function lireGroupe(l: Record<string, unknown>): Groupe {
  const lus = tableau(l.profils).map(lireProfil).filter((p) => p !== null);
  const al = separerEffectifs(listeAllergenes(l.allergenes));
  const re = separerEffectifs(listeAllergenes(l.regimes));
  const profils = (lus.length ? lus : profilsDepuisAnciens(al.noms, re.noms, { ...al.effectifs, ...re.effectifs })).map((p, i) => (p.id ? p : { ...p, id: `p${i + 1}` }));
  return {
    id: texte(l.id), statut: l.statut === "brouillon" ? "brouillon" : "confirme", nom: texte(l.nom), date: texte(l.date), heure: texte(l.heure),
    pax: typeof l.pax === "number" ? l.pax : Number(l.pax) || 0, salle: texte(l.salle),
    menu_id: texte(l.menu_id) || null, menu_nom: texte(l.menu_nom) || null,
    niveaux: lireNiveaux(l.niveaux, l.plats_sur_mesure), profils, ...resumeProfils(profils),
    notes: texte(l.notes), boissons: texte(l.boissons), reglement: texte(l.reglement), referent: texte(l.referent),
  };
}
const lireIngredient = (v: unknown): Ingredient => {
  const o = objet(v);
  const i: Ingredient = { nom: texte(o.nom) };
  if (texte(o.ficheId)) i.ficheId = texte(o.ficheId);
  return i;
};
export const lireFiche = (l: Record<string, unknown>): Fiche => ({ id: texte(l.id), nom: texte(l.nom), ingredients: tableau(l.ingredients).map(lireIngredient) });
function lireElement(v: unknown): Element {
  if (typeof v === "string") return { type: "fiche", id: v };
  const o = objet(v);
  return texte(o.id) ? { type: "fiche", id: texte(o.id) } : { type: "libre", texte: texte(o.text) };
}
export const lireFicheRecette = (l: Record<string, unknown>): FicheRecette => ({
  id: texte(l.id), nom: texte(l.nom), allergenes: listeAllergenes(l.allergenes), elements: tableau(l.sous_recettes).map(lireElement),
});
const lireService = (v: unknown): Service => ({ nom: texte(objet(v).nom), plats: tableau(objet(v).plats).map(lirePlat).filter((p) => p !== null) });
export function lireMenu(v: unknown): Menu {
  const o = objet(v);
  const services = Array.isArray(o.services) ? o.services.map(lireService) : [{ nom: "", plats: tableau(o.plats).map(lirePlat).filter((p) => p !== null) }];
  return { id: texte(o.id), nom: texte(o.nom), services };
}

// ── Menus et niveaux (app/src/domain/menus.ts) ──
const MENUS_FIXES: Record<string, readonly string[]> = {
  "carte du soir": ["Partages", "Plat", "Dessert"],
  "3 temps": ["Temps 1", "Temps 2", "Temps 3"],
  "5 temps": ["Temps 1", "Temps 2", "Temps 3", "Temps 4", "Temps 5"],
};
function servicesAffiches(m: Menu): Service[] {
  const noms = MENUS_FIXES[m.nom.trim().toLowerCase()];
  if (!noms) return m.services;
  const reste = [...m.services];
  const cle = (s: Service) => s.nom.trim().toLowerCase();
  const trouves = noms.map((n) => {
    const i = reste.findIndex((s) => cle(s) === n.toLowerCase());
    return i < 0 ? null : (reste.splice(i, 1)[0] ?? null);
  });
  const fixes = trouves.map((s, i) => ({ plats: (s ?? reste.shift())?.plats ?? [], nom: noms[i] ?? "" }));
  return [...fixes, ...reste];
}
const niveauxDuMenu = (m: Menu): Niveau[] => servicesAffiches(m).map((s) => ({ nom: s.nom, plats: s.plats.map((p) => ({ ...p, qte: null })) }));
/** Niveaux d'un groupe : les siens, ou à défaut ceux du menu choisi. */
export function niveauxDuGroupe(g: Groupe, menus: readonly Menu[]): Niveau[] {
  if (g.niveaux.length) return g.niveaux;
  const m = menus.find((x) => x.id === g.menu_id);
  return m ? niveauxDuMenu(m) : [];
}
export function totalNiveau(n: Niveau, pax: number): { total: number; ecart: number } {
  const total = n.plats.reduce((t, p) => t + (p.qte ?? 0), 0);
  return { total, ecart: pax > 0 ? total - pax : 0 };
}
export const clePlat = (p: Plat): string => ("frId" in p ? p.frId : p.texte);
/** Plats servis, tels que la fiche les montre : dès qu'un nombre est saisi dans le niveau, ceux qui ont un nombre, un remplacement ou des personnes. */
export const platsCommandes = (n: Niveau): PlatCompte[] =>
  n.plats.some((p) => p.qte !== null) ? n.plats.filter((p) => p.qte !== null || p.remplace !== undefined || (p.pour?.length ?? 0) > 0) : n.plats;
export const libelleProfil = (p: Profil): string => [...p.allergenes, ...p.regimes].join(" · ");
export const personnesDuPlat = (p: PlatCompte, profils: readonly Profil[]): Profil[] => profils.filter((x) => x.id !== undefined && p.pour?.includes(x.id));

function elementsResolus(fr: FicheRecette, fiches: readonly Fiche[]): { fiche: Fiche | null; nom: string }[] {
  const out: { fiche: Fiche | null; nom: string }[] = [];
  for (const e of fr.elements) {
    if (e.type === "fiche") {
      const f = fiches.find((x) => x.id === e.id);
      if (f) out.push({ fiche: f, nom: f.nom });
    } else if (e.texte.trim()) out.push({ fiche: null, nom: e.texte });
  }
  return out;
}
export function platAffiche(p: Plat, frs: readonly FicheRecette[]): { nom: string; allergenes: string[] } {
  if ("texte" in p) return { nom: p.texte, allergenes: [] };
  const fr = frs.find((f) => f.id === p.frId);
  return fr ? { nom: fr.nom, allergenes: fr.allergenes } : { nom: "(fiche supprimée)", allergenes: [] };
}

// ── Allergies et plats à adapter ──
const sansAccents = norm;
export const estAllergieLibre = (a: string): boolean => !ALLERGENES.some((x) => sansAccents(x) === sansAccents(a));
function textesDuPlat(p: Plat, frs: readonly FicheRecette[], fiches: readonly Fiche[]): string[] {
  if ("texte" in p) return [p.texte];
  const fr = frs.find((f) => f.id === p.frId);
  if (!fr) return [];
  const out = [fr.nom];
  const vues = new Set<string>();
  const parcourir = (f: Fiche) => {
    if (vues.has(f.id)) return;
    vues.add(f.id);
    out.push(f.nom);
    for (const i of f.ingredients) {
      const liee = i.ficheId ? fiches.find((x) => x.id === i.ficheId) : undefined;
      if (liee) parcourir(liee); else out.push(i.nom);
    }
  };
  for (const e of elementsResolus(fr, fiches)) { if (e.fiche) parcourir(e.fiche); else out.push(e.nom); }
  return out;
}
function chercherMot(mot: string, textes: readonly string[]): string | undefined {
  const m = sansAccents(mot).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!m) return undefined;
  const re = new RegExp(`(^|[^a-z0-9])${m}(s|x)?($|[^a-z0-9])`);
  return textes.find((t) => re.test(sansAccents(t)));
}
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
  const touches = profils.filter((x) => [...x.allergenes, ...x.regimes].some((a) => contenus.includes(a)));
  return { indices, contenus, touches };
}

/** Régimes suivis (avec une règle) et allergies libres (hors des 13 allergènes) de ces personnes. */
const exigences = (profils: readonly Profil[]) => ({
  regimes: [...new Set(profils.flatMap((p) => p.regimes))].filter((r) => r in REGLES_REGIMES),
  libres: [...new Set(profils.flatMap((p) => p.allergenes).filter(estAllergieLibre))],
});

export function alertesMenu(niveaux: readonly Niveau[], profils: readonly Profil[], frs: readonly FicheRecette[], fiches: readonly Fiche[]): Alerte[] {
  const { regimes, libres } = exigences(profils);
  if (!profils.some((p) => p.allergenes.length) && !regimes.length) return [];
  const vus = new Set<string>();
  return niveaux.flatMap(platsCommandes).flatMap((p) => {
    const d = platAffiche(p, frs);
    if (vus.has(d.nom)) return [];
    vus.add(d.nom);
    const { indices, contenus, touches } = contredit(p, d.allergenes, profils, regimes, libres, frs, fiches);
    if (!touches.length) return [];
    const allergenes = contenus.filter((a) => touches.some((x) => x.allergenes.includes(a) || x.regimes.includes(a)));
    const visibles = Object.fromEntries(Object.entries(indices).filter(([, t]) => sansAccents(t) !== sansAccents(d.nom)));
    const personnes = touches.reduce((t, x) => t + x.nb, 0);
    const cle = clePlat(p);
    const remplacants = niveaux.flatMap((n) => (n.plats.some((q) => clePlat(q) === cle) ? n.plats.filter((q) => q.remplace === cle && clePlat(q) !== cle) : []));
    const comptes = remplacants.map((q) => q.qte);
    const adapte = remplacants.length > 0 && (comptes.includes(null) || comptes.reduce<number>((t, q) => t + (q ?? 0), 0) >= personnes);
    return [{
      plat: d.nom, allergenes, personnes,
      ...(Object.keys(visibles).length ? { indices: visibles } : {}),
      ...(remplacants.length ? { remplacants: remplacants.map((q) => platAffiche(q, frs).nom), adapte } : {}),
    }];
  });
}

/** Pour qui est servi un plat de remplacement : « 1 sans viande », « 2 gluten · végétarien, 1 curry » ; vide si le plat remplacé ne contredit plus personne. */
export function restrictionsServies(remplace: Plat, profils: readonly Profil[], frs: readonly FicheRecette[], fiches: readonly Fiche[]): string {
  const { regimes, libres } = exigences(profils);
  const { contenus, touches } = contredit(remplace, platAffiche(remplace, frs).allergenes, profils, regimes, libres, frs, fiches);
  return touches.map((x) => `${x.nb} ${[...x.allergenes, ...x.regimes].filter((a) => contenus.includes(a)).join(" · ").toLowerCase()}`).join(", ");
}

// ── Fiche à dessiner (même contenu que la fiche de l'app) ──
export interface PlatFiche { numero: string; nom: string; remplace: string; pour: string[]; risques: string[] }
export interface NiveauFiche { nom: string; total: string; ecart: boolean; plats: PlatFiche[] }
export interface FicheGroupe {
  nom: string; cles: string[];
  alertes: { plat: string; texte: string; adapte: boolean }[];
  niveaux: NiveauFiche[]; vide: string;
  boissons: string;
  restrictions: { nb: number; allergenes: string[]; regimes: string[] }[];
  referent: string; reglement: string; notes: string;
}

const REGLEMENTS: Record<string, string> = { aucun: "Rien reçu", empreinte: "Empreinte bancaire", acompte: "Acompte versé", regle: "Réglé en totalité" };
const JOURS_LONGS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
/** « lundi 1 décembre 2026 » (sans dépendre des données de langue du serveur). */
export function dateLongue(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return d;
  const x = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return `${JOURS_LONGS[x.getUTCDay()]} ${Number(m[3])} ${MOIS[Number(m[2]) - 1]} ${m[1]}`;
}
export const heureFr = (s: string): string => s.replace(/\b(\d{1,2}):(\d{2})\b/g, "$1h$2");
const pluriel = (n: number, mot: string): string => `${n} ${n === 1 ? mot : mot + "s"}`;

/** Ce que montre la fiche imprimée d'un groupe : mêmes règles que l'écran Groupes de l'app. */
export function construireFiche(g: Groupe, menus: readonly Menu[], frs: readonly FicheRecette[], fiches: readonly Fiche[]): FicheGroupe {
  const m = menus.find((x) => x.id === g.menu_id);
  const nomMenu = m?.nom ?? g.menu_nom ?? "";
  const niveaux = niveauxDuGroupe(g, menus).filter((n) => n.plats.length);
  const avecQte = niveaux.some((n) => n.plats.some((p) => p.qte !== null));
  const debuts = niveaux.map((_, i) => niveaux.slice(0, i).reduce((t, n) => t + n.plats.length, 0));
  // seuls les plats pas encore adaptés : un plat adapté est signalé sur sa ligne (« 1 sans viande »)
  const alertes = alertesMenu(niveauxDuGroupe(g, menus), g.profils, frs, fiches).filter((a) => !a.adapte).map((a) => ({
    plat: a.plat,
    texte: ` — ${a.allergenes.map((x) => (a.indices?.[x] ? `${x} (${a.indices[x]})` : x)).join(", ")} · ${a.personnes} pers.` +
      (a.remplacants ? (a.adapte ? ` → remplacé par ${a.remplacants.join(", ")}` : ` → ${a.remplacants.join(", ")} : pas assez pour ${a.personnes} pers.`) : ""),
    adapte: a.adapte === true,
  }));
  return {
    nom: g.nom,
    cles: [dateLongue(g.date), heureFr(g.heure), g.pax > 0 ? pluriel(g.pax, "personne") : "", g.salle, nomMenu ? `Menu ${nomMenu}` : niveaux.length ? "Menu sur mesure" : ""].filter(Boolean),
    alertes,
    niveaux: niveaux.map((n, i) => {
      const { total, ecart } = totalNiveau(n, g.pax);
      return {
        nom: n.nom || "Menu",
        total: total > 0 ? `${total}${g.pax > 0 ? ` / ${g.pax}` : ""} pers.${ecart < 0 ? ` · il manque ${-ecart}` : ecart > 0 ? ` · ${ecart} de trop` : ""}` : "",
        ecart: ecart !== 0,
        plats: platsCommandes(n).map((p, k) => {
          const d = platAffiche(p, frs);
          // plat de remplacement : « 1 sans viande » (qui le mange) ; à défaut, le plat qu'il remplace
          const remplacePlat = p.remplace === undefined ? undefined : n.plats.find((q) => clePlat(q) === p.remplace);
          const remplace = remplacePlat ? restrictionsServies(remplacePlat, g.profils, frs, fiches) || `à la place de ${platAffiche(remplacePlat, frs).nom}` : "";
          return {
            numero: avecQte ? (p.qte === null ? "–" : String(p.qte)) : String((debuts[i] ?? 0) + k + 1),
            nom: d.nom, remplace,
            pour: personnesDuPlat(p, g.profils).map((x) => `${libelleProfil(x)} · ${x.nb} pers.`),
            risques: d.allergenes.filter((a) => g.allergenes.includes(a)).map((a) => `${a} × ${g.effectifs[a] ?? 1}`),
          };
        }),
      };
    }),
    vide: niveaux.length ? "" : m ? "Ce menu n'a pas encore de plats." : "Menu sur mesure — voir les notes.",
    boissons: g.boissons,
    restrictions: g.profils.map((p) => ({ nb: p.nb, allergenes: p.allergenes, regimes: p.regimes })),
    referent: g.referent,
    reglement: REGLEMENTS[g.reglement] ?? "",
    notes: g.notes,
  };
}

// ── Semaine ──
export const addDays = (d: string, n: number): string => {
  const [a, m, j] = d.split("-").map(Number);
  return new Date(Date.UTC(a ?? 0, (m ?? 1) - 1, (j ?? 1) + n, 12)).toISOString().slice(0, 10);
};
/** 0 = dimanche … 6 = samedi */
export const jourDeSemaine = (d: string): number => new Date(d + "T12:00:00Z").getUTCDay();
/** Lundi de la semaine qui contient ce jour. */
export const lundiDe = (d: string): string => addDays(d, -((jourDeSemaine(d) + 6) % 7));
