// Fiche allergènes de la carte : tableau plats × allergènes, et comparaison avec la dernière fiche imprimée.
// Fichier PARTAGÉ : la fonction « allergenes-menus » l'utilise, et l'app l'importe (app/src/domain/allergenesMenus.ts),
// pour que l'écran et l'email disent exactement la même chose. Aucun import : il se déploie tel quel avec la fonction.
// ALLERGENES et STATUTS_FICHE sont comparés à ceux de l'app par app/src/domain/allergenesMenus.test.ts.

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

/** Ce qu'il faut d'une fiche recette : son nom (et son nom court), son statut et ses allergènes (calculés par la base). */
export interface FicheAllergenes { id: string; nom: string; nomCourt?: string; statut: string; allergenes: readonly string[] }

/** Nom écrit sur la fiche allergènes : le nom court (élément principal : BŒUF, BROCAMOLE…), sinon le premier élément du nom (avant la virgule). */
export function nomSurFiche(f: { nom: string; nomCourt?: string }): string {
  const court = (f.nomCourt ?? "").trim(), premier = (f.nom.split(",")[0] ?? "").trim();
  return court !== "" ? court : premier !== "" ? premier : f.nom.trim();
}

/** La fiche allergènes unique : tous les plats de la carte actuelle (même liste de statuts que l'app, STATUTS_CARTE). */
export const FICHE_CARTE = { id: "carte", nom: "La carte" };
export const STATUTS_FICHE: readonly string[] = ["partages", "carte", "lunch"];
/** Sections de la fiche, dans l'ordre du repas ; « Lunch » = plats servis seulement au Lunch (statut lunch), à la fin. */
export const SECTIONS: readonly string[] = ["Partages", "Entrées", "Plats", "Desserts", "Lunch"];

// ── Tableau de la fiche allergènes ──

/** Une ligne de la fiche : un plat, sa section, ses allergènes. `libre` = plat sans fiche (allergènes inconnus ; anciennes fiches imprimées). */
export interface LigneAllergenes { cle: string; temps: string; nom: string; allergenes: string[]; libre?: boolean }

const sansAccents = (t: string): string => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/œ/g, "oe").trim();
const trier = (l: readonly string[]): string[] => [...new Set(l)].sort((a, b) => a.localeCompare(b, "fr"));

/** Un menu tel qu'écrit (lava_config, ligne « menus ») ou lu par l'app : seuls le nom, les temps et l'id des fiches servent. */
export interface MenuTemps { nom: string; services: readonly { nom: string; plats: readonly unknown[] }[] }

/**
 * Section d'un temps numéroté (« Temps 2 ») : menu en 5 temps (ou plus) : Temps 1 et 2 = entrées, Temps 3 et 4 = plats, dernier temps = dessert ;
 * menu plus court (3 temps) : Temps 1 = entrée, dernier temps = dessert, entre les deux = plats.
 */
function sectionDuTempsNumerote(rang: number, nbTemps: number): string {
  if (rang === nbTemps - 1) return "Desserts";
  return rang === 0 || (rang === 1 && nbTemps >= 5) ? "Entrées" : "Plats";
}

/** Section d'un temps nommé : « Entrée », « Plat », « Dessert », « Partages ». */
function sectionDuTempsNomme(temps: string): string | null {
  const t = sansAccents(temps).replace(/s$/, "");
  return t === "partage" ? "Partages" : t === "entree" ? "Entrées" : t === "dessert" ? "Desserts" : t === "plat" ? "Plats" : null;
}

/**
 * Section de chaque plat (id de fiche recette), d'après les temps où il est servi dans les menus.
 * Les menus à temps numérotés (3 temps, 5 temps) l'emportent toujours : leur place dit si le plat est une entrée, un plat ou un dessert.
 * Sinon (Lunch, Carte du soir) : Partages, puis Entrées, puis Desserts l'emportent sur Plats (la Carte du soir range tout le salé en « Plat »).
 */
export function sectionsDesPlats(menus: readonly MenuTemps[]): Map<string, string> {
  const priorite = ["Partages", "Entrées", "Desserts", "Plats"];
  const numerotes = new Map<string, string>(), nommes = new Map<string, string>();
  const retenir = (r: Map<string, string>, id: string, sec: string) => {
    const avant = r.get(id);
    if (!avant || priorite.indexOf(sec) < priorite.indexOf(avant)) r.set(id, sec);
  };
  for (const m of menus) {
    m.services.forEach((s, rang) => {
      const numerote = /^temps \d+$/.test(sansAccents(s.nom));
      const sec = numerote ? sectionDuTempsNumerote(rang, m.services.length) : sectionDuTempsNomme(s.nom);
      if (!sec) return;
      for (const p of s.plats) {
        const id = texte(objet(p).frId);
        if (id) retenir(numerote ? numerotes : nommes, id, sec);
      }
    });
  }
  return new Map([...nommes, ...numerotes]);
}

/**
 * Lignes de la fiche allergènes de la carte, dans l'ordre du repas : Partages, Entrées, Plats, Desserts, puis Lunch ;
 * dans chaque section, par ordre alphabétique. Plat de statut Partages = Partages, de statut Lunch = Lunch ; sinon section tirée des menus
 * (absent des menus = Plats). Nom = nom court (nomSurFiche).
 */
export function ficheCarte(frs: readonly FicheAllergenes[], menus: readonly MenuTemps[]): LigneAllergenes[] {
  const sections = sectionsDesPlats(menus);
  const section = (f: FicheAllergenes) => (f.statut === "partages" ? "Partages" : f.statut === "lunch" ? "Lunch" : sections.get(f.id) ?? "Plats");
  return frs.filter((f) => STATUTS_FICHE.includes(f.statut))
    .map((f) => ({ cle: f.id, temps: section(f), nom: nomSurFiche(f), allergenes: trier(f.allergenes) }))
    .sort((a, b) => SECTIONS.indexOf(a.temps) - SECTIONS.indexOf(b.temps) || a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
}

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
  /** Plats ajoutés à la carte depuis l'impression. */
  ajoutes: LigneAllergenes[];
  /** Plats retirés de la carte depuis l'impression. */
  retires: LigneAllergenes[];
  /** Plats dont le nom a changé (la fiche imprimée porte l'ancien nom). */
  renommes: { avant: string; apres: string }[];
  /** Plats dont les allergènes ont changé. */
  changes: { nom: string; ajoutes: string[]; retires: string[] }[];
}

/** Ce qui a changé entre la fiche imprimée et la carte actuelle (plats repérés par leur fiche recette). */
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
    ...e.ajoutes.map((l) => `Plat ajouté à la carte : ${l.nom}${allerg(l)}`),
    ...e.retires.map((l) => `Plat retiré de la carte : ${l.nom}`),
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
