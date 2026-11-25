// Fiche allergènes des menus : tableau plats × allergènes, et comparaison avec la dernière fiche imprimée.
// Fichier PARTAGÉ : la fonction « allergenes-menus » l'utilise, et l'app l'importe (app/src/domain/allergenesMenus.ts),
// pour que l'écran et l'email disent exactement la même chose. Aucun import : il se déploie tel quel avec la fonction.
// Les copies de servicesAffiches, lireMenu et ALLERGENES sont comparées à celles de l'app par app/src/domain/allergenesMenus.test.ts.

// ── Lecture prudente (valeur inattendue → valeur vide) ──
const texte = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const tableau = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objet = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Les 14 allergènes réglementaires regroupés en 13 (même liste que l'app) : une colonne chacun. */
export const ALLERGENES = ["Gluten", "Crustacé", "Œuf", "Poisson", "Arachide", "Soja", "Lactose", "Fruit à coque", "Céleri", "Moutarde", "Sésame", "Sulfites", "Mollusque"];

/** « Gluten, Lactose » ou ["Gluten","Lactose"] : les deux formats existent en base. */
export function listeAllergenes(v: unknown): string[] {
  const brut = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(",") : [];
  return brut.map((s) => s.trim()).filter(Boolean);
}

export type Plat = { frId: string } | { texte: string };
export interface Service { nom: string; plats: Plat[] }
export interface Menu { id: string; nom: string; services: Service[] }
/** Ce qu'il faut d'une fiche recette : son nom et ses allergènes (calculés par la base). */
export interface FicheAllergenes { id: string; nom: string; allergenes: readonly string[] }

const lirePlat = (v: unknown): Plat | null => {
  const o = objet(v);
  if (texte(o.frId)) return { frId: texte(o.frId) };
  return texte(o.text) ? { texte: texte(o.text) } : null;
};
const lireService = (v: unknown): Service => ({ nom: texte(objet(v).nom), plats: tableau(objet(v).plats).map(lirePlat).filter((p) => p !== null) });
/** Un menu tel qu'écrit dans lava_config (ligne « menus ») ; anciens menus = liste plate de plats. */
export function lireMenu(v: unknown): Menu {
  const o = objet(v);
  const services = Array.isArray(o.services) ? o.services.map(lireService) : [{ nom: "", plats: tableau(o.plats).map(lirePlat).filter((p) => p !== null) }];
  return { id: texte(o.id), nom: texte(o.nom), services };
}

// Menus à temps fixes (app/src/domain/menus.ts)
const MENUS_FIXES: Record<string, readonly string[]> = {
  "carte du soir": ["Partages", "Plat", "Dessert"],
  "3 temps": ["Temps 1", "Temps 2", "Temps 3"],
  "5 temps": ["Temps 1", "Temps 2", "Temps 3", "Temps 4", "Temps 5"],
};
/** Temps d'un menu tels qu'affichés (copie de la règle de l'app). */
export function servicesAffiches(m: Menu): Service[] {
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

// ── Tableau de la fiche allergènes ──

/** Une ligne de la fiche : un plat du menu, son temps, ses allergènes. `libre` = plat écrit à la main, sans fiche (allergènes inconnus). */
export interface LigneAllergenes { cle: string; temps: string; nom: string; allergenes: string[]; libre?: boolean }

const sansAccents = (t: string): string => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/œ/g, "oe").trim();
const trier = (l: readonly string[]): string[] => [...new Set(l)].sort((a, b) => a.localeCompare(b, "fr"));

/**
 * Lignes de la fiche allergènes d'un menu (temps déjà mis dans l'ordre affiché) : un plat par ligne, dans l'ordre du menu.
 * Un plat présent deux fois n'a qu'une ligne (la première). Fiche supprimée : « (fiche supprimée) », sans allergènes.
 */
export function lignesAllergenes(services: readonly Service[], frs: readonly FicheAllergenes[]): LigneAllergenes[] {
  const vus = new Set<string>();
  const lignes: LigneAllergenes[] = [];
  for (const s of services) {
    for (const p of s.plats) {
      const cle = "frId" in p ? p.frId : "texte:" + p.texte.trim().toLowerCase();
      if (vus.has(cle)) continue;
      vus.add(cle);
      if ("texte" in p) { lignes.push({ cle, temps: s.nom, nom: p.texte.trim(), allergenes: [], libre: true }); continue; }
      const fr = frs.find((f) => f.id === p.frId);
      lignes.push({ cle, temps: s.nom, nom: fr ? fr.nom : "(fiche supprimée)", allergenes: fr ? trier(fr.allergenes) : [] });
    }
  }
  return lignes;
}

/** Fiche allergènes d'un menu tel qu'enregistré. */
export const ficheAllergenes = (m: Menu, frs: readonly FicheAllergenes[]): LigneAllergenes[] => lignesAllergenes(servicesAffiches(m), frs);

/** Colonne de l'allergène (une des 13), ou null s'il n'est pas dans la liste (écrit autrement : il va dans « Autres »). */
export function colonne(allergene: string): string | null {
  const sing = (t: string) => sansAccents(t).replace(/s\b/g, "");   // « Fruits à coque » = « Fruit à coque »
  return ALLERGENES.find((a) => sing(a) === sing(allergene)) ?? null;
}
/** Allergènes d'une ligne rangés : ceux des 13 colonnes, et les autres (écrits à part sous le nom du plat). */
export function repartir(allergenes: readonly string[]): { colonnes: Set<string>; autres: string[] } {
  const colonnes = new Set<string>(), autres: string[] = [];
  for (const a of allergenes) { const c = colonne(a); if (c) colonnes.add(c); else autres.push(a); }
  return { colonnes, autres };
}

/** Lignes enregistrées au moment de l'impression (table allergenes_imprimes, colonne lignes). */
export const lireLignes = (v: unknown): LigneAllergenes[] => tableau(v).map((x) => {
  const o = objet(x);
  const l: LigneAllergenes = { cle: texte(o.cle), temps: texte(o.temps), nom: texte(o.nom), allergenes: trier(listeAllergenes(o.allergenes)) };
  if (o.libre === true) l.libre = true;
  return l;
}).filter((l) => l.cle);

// ── Comparaison avec la fiche imprimée ──

export interface Ecart {
  /** Plats ajoutés au menu depuis l'impression. */
  ajoutes: LigneAllergenes[];
  /** Plats retirés du menu depuis l'impression. */
  retires: LigneAllergenes[];
  /** Plats dont le nom a changé (la fiche imprimée porte l'ancien nom). */
  renommes: { avant: string; apres: string }[];
  /** Plats dont les allergènes ont changé. */
  changes: { nom: string; ajoutes: string[]; retires: string[] }[];
}

/** Ce qui a changé entre la fiche imprimée et le menu actuel (plats repérés par leur fiche recette, ou le texte d'un plat libre). */
export function comparer(imprime: readonly LigneAllergenes[], actuel: readonly LigneAllergenes[]): Ecart {
  const avant = new Map(imprime.map((l) => [l.cle, l]));
  const apres = new Map(actuel.map((l) => [l.cle, l]));
  const e: Ecart = { ajoutes: [], retires: [], renommes: [], changes: [] };
  for (const l of actuel) {
    const a = avant.get(l.cle);
    if (!a) { e.ajoutes.push(l); continue; }
    if (a.nom !== l.nom) e.renommes.push({ avant: a.nom, apres: l.nom });
    const plus = l.allergenes.filter((x) => !a.allergenes.includes(x)), moins = a.allergenes.filter((x) => !l.allergenes.includes(x));
    if (plus.length || moins.length) e.changes.push({ nom: l.nom, ajoutes: plus, retires: moins });
  }
  for (const a of imprime) if (!apres.has(a.cle)) e.retires.push(a);
  return e;
}

export const ecartVide = (e: Ecart): boolean => !e.ajoutes.length && !e.retires.length && !e.renommes.length && !e.changes.length;

/** Une phrase par changement, pour l'écran et l'email. */
export function libellesEcart(e: Ecart): string[] {
  const allerg = (l: LigneAllergenes) => (l.libre ? " (plat libre : allergènes non renseignés)" : l.allergenes.length ? ` (${l.allergenes.join(", ")})` : " (aucun allergène)");
  return [
    ...e.changes.map((c) => `${c.nom} : ${[...c.ajoutes.map((a) => `+ ${a}`), ...c.retires.map((a) => `− ${a}`)].join(", ")}`),
    ...e.ajoutes.map((l) => `Plat ajouté : ${l.nom}${allerg(l)}`),
    ...e.retires.map((l) => `Plat retiré : ${l.nom}`),
    ...e.renommes.map((r) => `Plat renommé : ${r.avant} → ${r.apres}`),
  ];
}

/** Empreinte stable d'un écart : deux écarts identiques ont la même ; sert à ne prévenir qu'une fois par changement. */
export const signatureEcart = (e: Ecart): string => JSON.stringify([
  e.ajoutes.map((l) => [l.cle, l.nom, l.allergenes]).sort(),
  e.retires.map((l) => l.cle).sort(),
  e.renommes.map((r) => [r.avant, r.apres]).sort(),
  e.changes.map((c) => [c.nom, c.ajoutes, c.retires]).sort(),
]);
