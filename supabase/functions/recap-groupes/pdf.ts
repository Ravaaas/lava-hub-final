// PDF A4 de la fiche d'un groupe, joint à l'email : même contenu et même dessin que la fiche imprimée de l'app (onglet Groupes > Imprimer),
// avec la même marge haute de 4 cm (papier à en-tête) et les mêmes marges de 14 mm sur les côtés.
// Polices standard Helvetica : les caractères hors alphabet latin (émojis…) sont retirés.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "npm:pdf-lib@1.17.1";
import type { FicheGroupe } from "./domaine.ts";

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const RED = hex("#B5433C"), INK = hex("#221818"), MUTE = hex("#6B5C5C"), LINE = hex("#E3CFCF"), ZEBRA = hex("#F5ECEC"), WHITE = hex("#FFFFFF"),
  ROW = hex("#E0D0D0"), BOX_BG = hex("#FBEFEE"), BOX_OK_BG = hex("#F6F3F3"), BOX_OK = hex("#CFC6C6"), ECART = hex("#B42318"),
  ROSE = hex("#F6E2E0"), ROSE_TX = hex("#9B342E"), GRIS = hex("#EEEBEB"), GRIS_TX = hex("#3A3333"), PIED = hex("#8A7A7A");

const MM = 72 / 25.4;
const W = 595.28, H = 841.89;
const ML = 14 * MM, MR = W - 14 * MM;      // marges latérales
const HAUT = H - 40 * MM;                  // marge haute de 4 cm
const BAS = 13 * MM + 8;                   // marge basse (pied de page dans la marge)

/** Nom de fichier, ex. « LAVA FICHE GROUPE 01-12-26 ELITISTE.pdf ». */
export function nomFiche(date: string, nom: string): string {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const jour = d ? `${d[3]}-${d[2]}-${(d[1] ?? "").slice(2)}` : date;
  const propre = nom.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, " ").trim().toUpperCase().slice(0, 40);
  return `LAVA FICHE GROUPE ${jour}${propre ? " " + propre : ""}.pdf`;
}

/** Un mot, la police qui le dessine, et s'il est précédé d'une espace. */
type Mot = { t: string; f: PDFFont; sp?: boolean };

export async function fichePdf(g: FicheGroupe, fichier: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const R = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
  // pdf-lib mesure avec crénage mais dessine sans : on mesure lettre par lettre pour que les mots ne se chevauchent pas
  for (const f of [R, B]) { const mesure = f.widthOfTextAtSize.bind(f); f.widthOfTextAtSize = (t: string, size: number) => { let w = 0; for (const c of t) w += mesure(c, size); return w; }; }
  const ok = new Set(R.getCharacterSet());
  const net = (t: unknown) => [...String(t ?? "").replace(/[‘’]/g, "'").replace(/→/g, "»").replace(/[\r\t]/g, " ")]
    .map((c) => (c === "\n" || ok.has(c.codePointAt(0)!) ? c : "")).join("").replace(/ +$/gm, "");
  doc.setTitle(fichier.replace(/\.pdf$/, ""));
  doc.setAuthor("LAVA Hub");

  let page: PDFPage = doc.addPage([W, H]);
  let y = HAUT;

  const larg = (t: string, size: number, font: PDFFont = R) => font.widthOfTextAtSize(net(t), size);
  const texte = (t: string, x: number, yy: number, size: number, font: PDFFont = R, color: RGB = INK) => page.drawText(net(t), { x, y: yy, size, font, color });
  const droite = (t: string, x: number, yy: number, size: number, font: PDFFont = R, color: RGB = INK) => texte(t, x - larg(t, size, font), yy, size, font, color);
  /** Petites capitales espacées (titres). */
  const espace = (t: string, x: number, yy: number, size: number, sp: number, color: RGB = RED) => {
    for (const c of net(t).toUpperCase()) { page.drawText(c, { x, y: yy, size, font: B, color }); x += B.widthOfTextAtSize(c, size) + sp; }
  };
  const trait = (yy: number, ep: number, color: RGB, x1 = ML, x2 = MR) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: ep, color });
  const arrondi = (x: number, haut: number, w: number, h: number, r: number, fond: RGB | null, bord: RGB | null, ep = 0.7) => {
    const p = `M ${r},0 H ${w - r} A ${r},${r} 0 0 1 ${w},${r} V ${h - r} A ${r},${r} 0 0 1 ${w - r},${h} H ${r} A ${r},${r} 0 0 1 0,${h - r} V ${r} A ${r},${r} 0 0 1 ${r},0 Z`;
    page.drawSvgPath(p, { x, y: haut, ...(fond ? { color: fond } : {}), ...(bord ? { borderColor: bord, borderWidth: ep } : {}) });
  };
  /** Découpe un texte en lignes de mots (chacun avec sa police), sans dépasser `max`. */
  const couper = (mots: Mot[], max: number, size: number): Mot[][] => {
    const lignes: Mot[][] = [[]];
    let w = 0;
    for (const m of mots) {
      for (const [i, piece] of net(m.t).split("\n").entries()) {
        if (i > 0) { lignes.push([]); w = 0; }
        for (const mot of piece.split(/ +/).filter(Boolean)) {
          const lw = m.f.widthOfTextAtSize(mot, size), sp = w > 0 ? m.f.widthOfTextAtSize(" ", size) : 0;
          if (w > 0 && w + sp + lw > max) { lignes.push([]); w = 0; }
          const l = lignes[lignes.length - 1]!;
          l.push({ t: mot, f: m.f, sp: w > 0 });
          w += (w > 0 ? sp : 0) + lw;
        }
      }
    }
    return lignes;
  };
  const dessinerLigne = (l: Mot[], x: number, yy: number, size: number, color: RGB) => {
    for (const m of l) {
      if (m.sp) x += m.f.widthOfTextAtSize(" ", size);
      page.drawText(m.t, { x, y: yy, size, font: m.f, color });
      x += m.f.widthOfTextAtSize(m.t, size);
    }
  };
  const simple = (t: string, f: PDFFont = R): Mot[] => [{ t, f }];

  const place = (h: number) => {
    if (y - h >= BAS) return;
    page = doc.addPage([W, H]);
    y = HAUT;
  };
  const titre = (t: string) => { place(34); y -= 18; espace(t, ML, y, 8, 1.4); y -= 5; trait(y, 0.7, LINE); y -= 3; };

  // ── En-tête ──
  y -= 8; espace("Fiche groupe", ML, y, 7.5, 1.6);
  y -= 7;
  for (const l of couper(simple(g.nom.toUpperCase(), B), MR - ML, 16)) { y -= 19; dessinerLigne(l, ML, y, 16, INK); }
  const cles = couper(simple(g.cles.join("  ·  ")), MR - ML, 10);
  y -= 2;
  for (const l of cles) { y -= 13; dessinerLigne(l, ML, y, 10, MUTE); }
  y -= 7; trait(y, 1.6, RED); y -= 8;

  // ── Plats à adapter ──
  if (g.alertes.length) {
    const tous = g.alertes.every((a) => a.adapte);
    const lignes = g.alertes.map((a) => ({ a, l: couper([{ t: a.plat, f: B }, { t: a.texte, f: R }], MR - ML - 22, 9) }));
    const hauteur = 14 + 12 + lignes.reduce((t, x) => t + x.l.length * 11.5, 0) + 3;
    place(hauteur + 4);
    arrondi(ML, y, MR - ML, hauteur, 5, tous ? BOX_OK_BG : BOX_BG, tous ? BOX_OK : RED, 1);
    let yy = y - 14;
    espace(tous ? "Plats adaptés" : "Plats à adapter", ML + 10, yy, 7.5, 1.2, tous ? MUTE : RED);
    yy -= 3;
    for (const { a, l } of lignes) for (const ligne of l) { yy -= 11.5; dessinerLigne(ligne, ML + 10, yy, 9, a.adapte ? MUTE : INK); }
    y -= hauteur + 9;
  }

  // ── Menu ──
  if (!g.niveaux.length && g.vide) { titre("Menu"); y -= 12; texte(g.vide, ML, y, 9, R, MUTE); y -= 4; }
  const XN = ML + 10 * MM, XT = XN + 2.5 * MM, TX = MR - XT - 2.5 * MM;   // colonne des nombres, texte
  for (const n of g.niveaux) {
    // titre du niveau + total, gardés avec la première ligne
    place(34 + 20);
    y -= 18; espace(n.nom, ML, y, 8, 1.4);
    if (n.total) droite(n.total.toUpperCase(), MR, y, 7.5, B, n.ecart ? ECART : MUTE);
    y -= 5; trait(y, 0.7, LINE); y -= 4;
    n.plats.forEach((p, i) => {
      const nom = couper([{ t: p.nom, f: R }], TX, 9);
      let rempl = "";
      const derniere = nom[nom.length - 1] ?? [];
      const wDerniere = derniere.reduce((t, m) => t + (m.sp ? R.widthOfTextAtSize(" ", 9) : 0) + m.f.widthOfTextAtSize(m.t, 9), 0);
      const suffixe = p.remplace ? ` · à la place de ${p.remplace}` : "";
      const inline = !!suffixe && wDerniere + R.widthOfTextAtSize(net(suffixe), 8) <= TX;
      const apres = !!suffixe && !inline ? couper([{ t: `à la place de ${p.remplace}`, f: R }], TX, 8) : [];
      rempl = inline ? suffixe : "";
      const pastilles = [...p.pour.map((t) => ({ t, pour: true })), ...p.risques.map((t) => ({ t, pour: false }))];
      const h = Math.max(17, 3 + nom.length * 11.5 + apres.length * 10 + (pastilles.length ? 14 : 0) + 3);
      place(h);
      const haut = y;
      page.drawRectangle({ x: XT, y: haut - h, width: MR - XT, height: h, color: i % 2 === 0 ? ZEBRA : WHITE });
      page.drawRectangle({ x: ML, y: haut - h, width: XN - ML, height: h, color: RED });
      const num = net(p.numero);
      const taille = num.length > 3 ? 8 : 10;
      page.drawText(num, { x: ML + (XN - ML - B.widthOfTextAtSize(num, taille)) / 2, y: haut - h / 2 - taille * 0.35, size: taille, font: B, color: WHITE });
      let yy = haut - 3;
      nom.forEach((l, k) => { yy -= 11.5; dessinerLigne(l, XT, yy, 9, INK); if (k === nom.length - 1 && rempl) texte(rempl, XT + wDerniere, yy, 8, R, MUTE); });
      apres.forEach((l) => { yy -= 10; dessinerLigne(l, XT, yy, 8, MUTE); });
      if (pastilles.length) {
        yy -= 14;
        let x = XT;
        if (p.pour.length) { espace("Pour", x, yy + 1, 6.5, 0.8, MUTE); x += larg("POUR", 6.5, B) + 4 * 0.8 + 5; }
        for (const t of pastilles) {
          const w = larg(t.t, 7.5, B) + 11;
          if (x + w > MR - 4) break;
          arrondi(x, yy + 10, w, 11.5, 5.7, WHITE, t.pour ? RED : hex("#EDD8D8"), 0.7);
          texte(t.t, x + 5.5, yy + 1.8, 7.5, B, t.pour ? ROSE_TX : RED);
          x += w + 4;
        }
      }
      y = haut - h;
      trait(y, 0.5, ROW, XT, MR);
    });
    y -= 2;
  }

  // ── Boissons ──
  if (g.boissons) {
    titre("Boissons précommandées");
    for (const l of couper(simple(g.boissons), MR - ML, 9.5)) { place(14); y -= 12.5; dessinerLigne(l, ML, y, 9.5, INK); }
    y -= 2;
  }

  // ── Restrictions : une ligne par personne (ou personnes identiques) ──
  titre("Restrictions");
  if (!g.restrictions.length) { y -= 12; texte("Aucune allergie ni régime déclaré", ML, y, 9, R, MUTE); y -= 2; }
  for (const r of g.restrictions) {
    place(20);
    y -= 16;
    espace(`${r.nb} pers.`, ML, y, 7, 0.9);
    let x = ML + 19 * MM;
    for (const [t, regime] of [...r.allergenes.map((t) => [t, false] as const), ...r.regimes.map((t) => [t, true] as const)]) {
      const w = larg(t, 8, R) + 12;
      if (x + w > MR) { y -= 15; place(16); x = ML + 19 * MM; }
      arrondi(x, y + 11, w, 14, 7, regime ? GRIS : ROSE, null);
      texte(t, x + 6, y + 2.3, 8, R, regime ? GRIS_TX : ROSE_TX);
      x += w + 4;
    }
    y -= 2;
  }

  // ── Référent et règlement ──
  titre(g.referent ? "Référent et règlement" : "Règlement");
  place(16); y -= 13;
  let x = ML;
  if (g.referent) {
    espace("Référent", x, y, 7, 0.9); x += larg("RÉFÉRENT", 7, B) + 8 * 0.9 + 8;
    texte(g.referent, x, y, 9.5, B, INK); x += larg(g.referent, 9.5, B) + 28;
    espace("Règlement", x, y, 7, 0.9); x += larg("RÈGLEMENT", 7, B) + 9 * 0.9 + 8;
  }
  texte(g.reglement, x, y, 9.5, B, INK);
  y -= 2;

  // ── Notes ──
  if (g.notes) {
    titre("Notes");
    for (const l of couper(simple(g.notes), MR - ML, 9.5)) { place(14); y -= 13; dessinerLigne(l, ML, y, 9.5, INK); }
  }

  // ── Pied de page : numéro, comme la fiche imprimée ──
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    page = pg;
    droite(`${i + 1} / ${pages.length}`, MR, 13 * MM - 4, 7.5, R, PIED);
  });
  return await doc.save();
}
