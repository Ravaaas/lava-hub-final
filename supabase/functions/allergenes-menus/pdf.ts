// PDF A4 PAYSAGE de la fiche allergènes de la carte, joint à l'email : même dessin que la fiche imprimée de l'app
// (onglet Menus > Fiche allergènes > Imprimer, toujours en paysage) : marge haute de 4 cm, 14 mm sur les côtés, plats × 13 allergènes.
// Polices standard Helvetica : les caractères hors alphabet latin (émojis…) sont retirés.
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage, type RGB } from "npm:pdf-lib@1.17.1";
import { ALLERGENES, repartir, type LigneAllergenes } from "./regles.ts";

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const RED = hex("#B5433C"), INK = hex("#221818"), MUTE = hex("#6B5C5C"), LINE = hex("#E0D0D0"), FIN = hex("#EDD8D8"), ZEBRA = hex("#F5ECEC"), PIED = hex("#8A7A7A");

const MM = 72 / 25.4;
const W = 841.89, H = 595.28;            // A4 paysage
const ML = 14 * MM, MR = W - 14 * MM;      // marges latérales
const HAUT = H - 40 * MM;                  // marge haute de 4 cm
const BAS = 13 * MM + 8;                   // marge basse (pied de page dans la marge)
const COL = 10 * MM;                       // largeur d'une colonne d'allergène (le nom du plat garde ~14 cm : une ligne)
const XC = MR - ALLERGENES.length * COL;   // début des colonnes d'allergènes

/** Nom de fichier, ex. « LAVA FICHE ALLERGENES LA CARTE.pdf ». */
export function nomFicheAllergenes(menu: string): string {
  const propre = menu.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, " ").trim().toUpperCase().slice(0, 40);
  return `LAVA FICHE ALLERGENES${propre ? " " + propre : ""}.pdf`;
}

/** Groupes de lignes par temps, dans l'ordre. */
function parTemps(lignes: readonly LigneAllergenes[]): { temps: string; lignes: LigneAllergenes[] }[] {
  const g: { temps: string; lignes: LigneAllergenes[] }[] = [];
  for (const l of lignes) { const x = g.find((y) => y.temps === l.temps); if (x) x.lignes.push(l); else g.push({ temps: l.temps, lignes: [l] }); }
  return g;
}

export async function ficheAllergenesPdf(menu: string, lignes: readonly LigneAllergenes[], edition: string, fichier: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const R = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
  // pdf-lib mesure avec crénage mais dessine sans : on mesure lettre par lettre
  for (const f of [R, B]) { const mesure = f.widthOfTextAtSize.bind(f); f.widthOfTextAtSize = (t: string, size: number) => { let w = 0; for (const c of t) w += mesure(c, size); return w; }; }
  const ok = new Set(R.getCharacterSet());
  const net = (t: unknown) => [...String(t ?? "").replace(/[‘’]/g, "'").replace(/[\r\t\n]/g, " ")].map((c) => (ok.has(c.codePointAt(0)!) ? c : "")).join("");
  doc.setTitle(fichier.replace(/\.pdf$/, ""));
  doc.setAuthor("LAVA Hub");

  let page: PDFPage = doc.addPage([W, H]);
  let y = HAUT;
  const texte = (t: string, x: number, yy: number, size: number, font: PDFFont = R, color: RGB = INK) => page.drawText(net(t), { x, y: yy, size, font, color });
  const espace = (t: string, x: number, yy: number, size: number, sp: number, color: RGB = RED) => {
    for (const c of net(t).toUpperCase()) { page.drawText(c, { x, y: yy, size, font: B, color }); x += B.widthOfTextAtSize(c, size) + sp; }
  };
  const trait = (yy: number, ep: number, color: RGB, x1 = ML, x2 = MR) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: ep, color });
  const couper = (t: string, max: number, size: number, f: PDFFont): string[] => {
    const lignes: string[] = [];
    let l = "";
    for (const mot of net(t).split(/ +/).filter(Boolean)) {
      const essai = l ? l + " " + mot : mot;
      if (l && f.widthOfTextAtSize(essai, size) > max) { lignes.push(l); l = mot; } else l = essai;
    }
    if (l) lignes.push(l);
    return lignes.length ? lignes : [""];
  };

  // ── En-tête ──
  y -= 8; espace("Fiche allergènes", ML, y, 7.5, 1.6);
  y -= 7;
  for (const l of couper(menu.toUpperCase(), MR - ML, 16, B)) { y -= 19; texte(l, ML, y, 16, B, INK); }
  y -= 15; texte(`${lignes.length} plat${lignes.length > 1 ? "s" : ""}  ·  Édition du ${edition}`, ML, y, 10, R, MUTE);
  y -= 7; trait(y, 1.6, RED); y -= 10;

  // ── Tableau : en-tête (noms d'allergènes à la verticale), répété en haut de chaque page ──
  const entete = () => {
    const h = 50;
    const haut = y;
    page.drawRectangle({ x: ML, y: haut - h, width: MR - ML, height: h, borderColor: LINE, borderWidth: 0.7, color: rgb(1, 1, 1) });
    texte("Plat", ML + 7, haut - h + 5, 8, B, RED);
    ALLERGENES.forEach((a, i) => {
      const x = XC + i * COL;
      page.drawLine({ start: { x, y: haut }, end: { x, y: haut - h }, thickness: 0.5, color: FIN });
      page.drawText(net(a), { x: x + COL / 2 + 2.6, y: haut - h + 5, size: 7.5, font: R, color: RED, rotate: degrees(90) });
    });
    y = haut - h;
  };
  const place = (h: number) => {
    if (y - h >= BAS) return;
    page = doc.addPage([W, H]);
    y = HAUT;
    entete();
  };
  entete();
  const TX = XC - ML - 10;
  for (const g of parTemps(lignes)) {
    if (g.temps) {
      place(13 + 14);
      page.drawRectangle({ x: ML, y: y - 13, width: MR - ML, height: 13, color: ZEBRA });
      espace(g.temps, ML + 7, y - 9.3, 7, 1.1);
      y -= 13;
      trait(y, 0.5, FIN);
    }
    for (const l of g.lignes) {
      const { colonnes, autres } = repartir(l.allergenes);
      const nom = couper(l.nom.toUpperCase(), TX, 8, B);
      const sous = [...(l.libre ? ["Plat libre : allergènes à vérifier"] : []), ...(autres.length ? [`Aussi : ${autres.join(", ")}`] : [])].flatMap((t) => couper(t, TX, 7, R));
      const h = Math.max(14, 4 + nom.length * 9.5 + sous.length * 8.5 + 1);
      place(h);
      const haut = y;
      let yy = haut - 2.5;
      nom.forEach((t) => { yy -= 9.5; texte(t, ML + 7, yy, 8, B, INK); });
      sous.forEach((t) => { yy -= 8.5; texte(t, ML + 7, yy, 7, R, MUTE); });
      ALLERGENES.forEach((a, i) => {
        const x = XC + i * COL;
        page.drawLine({ start: { x, y: haut }, end: { x, y: haut - h }, thickness: 0.5, color: FIN });
        if (colonnes.has(a)) page.drawCircle({ x: x + COL / 2, y: haut - h / 2, size: 2.6, color: RED });
      });
      page.drawLine({ start: { x: ML, y: haut }, end: { x: ML, y: haut - h }, thickness: 0.7, color: LINE });
      page.drawLine({ start: { x: MR, y: haut }, end: { x: MR, y: haut - h }, thickness: 0.7, color: LINE });
      y = haut - h;
      trait(y, 0.5, FIN);
    }
  }
  trait(y, 0.7, LINE);

  // ── Légende ──
  const legende = `= l'allergène est présent dans le plat (calculé depuis les fiches techniques).${lignes.some((l) => l.libre) ? " Les plats libres n'ont pas de fiche : leurs allergènes sont à vérifier à part." : ""}`;
  const ll = couper(legende, MR - ML - 10, 7.5, R);
  place(8 + ll.length * 9.5);
  y -= 10;
  page.drawCircle({ x: ML + 2.6, y: y + 2.6, size: 2.6, color: RED });
  ll.forEach((t, i) => { texte(t, ML + 9, y, 7.5, R, MUTE); if (i < ll.length - 1) y -= 9.5; });

  // ── Pied de page : numéro, comme la fiche imprimée ──
  const pages = doc.getPages();
  pages.forEach((pg, i) => { page = pg; const t = `${i + 1} / ${pages.length}`; texte(t, MR - R.widthOfTextAtSize(t, 7.5), 13 * MM - 4, 7.5, R, PIED); });
  return await doc.save();
}
