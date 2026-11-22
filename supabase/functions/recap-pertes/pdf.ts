// PDF A4 du récap Pertes & Perso, joint à l'email (même présentation que la feuille imprimée de l'app).
// Polices standard Helvetica : les caractères hors alphabet latin (émojis…) sont retirés.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "npm:pdf-lib@1.17.1";

export interface DonneesPdf {
  jours: string[];                       // 7 dates AAAA-MM-JJ, lundi → dimanche
  valides: string[];                     // dates validées
  lignes: { nom: string; unite: string; cat: string; q: number[] }[];
  pertes: { date: string; produit: string; par: string; quantite: number; unite: string; raison: string; precision: string }[];
  commentaires: { date: string; nom: string; texte: string }[];
}

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const court = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const num = (v: number) => String(Math.round(v * 1000) / 1000).replace(".", ",");
const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const RED = hex("#B5433C"), INK = hex("#1D1D1F"), MUTE = hex("#6E6E73"), PALE = hex("#A1A1A6"), GREY = hex("#ABABAB"),
  LINE = hex("#E6E0E0"), GREEN = hex("#2E7D4F"), AMBER = hex("#A0700A"), WARN_BG = hex("#FFF0E0"), WARN = hex("#8A3800");

/** Nom de fichier, ex. « LAVA PERTES PERSO 09-11-26 AU 15-11-26.pdf ». */
export const nomPdf = (jours: string[]) => {
  const f = (d: string) => `${d.slice(8)}-${d.slice(5, 7)}-${d.slice(2, 4)}`;
  return `LAVA PERTES PERSO ${f(jours[0])} AU ${f(jours[6])}.pdf`;
};

export async function recapPdf(d: DonneesPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const R = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
  const ok = new Set(R.getCharacterSet());
  const net = (t: unknown) => [...String(t ?? "").replace(/[‘’]/g, "'").replace(/[\r\t]/g, " ")].map((c) => (c === "\n" || ok.has(c.codePointAt(0)!) ? c : "")).join("").replace(/ +$/gm, "");
  doc.setTitle(nomPdf(d.jours).replace(/\.pdf$/, ""));
  doc.setAuthor("LAVA Hub");

  const W = 595.28, H = 841.89, G = 40, D = W - G, BAS = 52;
  const periode = `${court(d.jours[0])} au ${court(d.jours[6])}`;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - 50;

  const texte = (t: string, x: number, yy: number, size: number, font: PDFFont = R, color: RGB = INK) => page.drawText(net(t), { x, y: yy, size, font, color });
  const larg = (t: string, size: number, font: PDFFont = R) => font.widthOfTextAtSize(net(t), size);
  const droite = (t: string, x: number, yy: number, size: number, font: PDFFont = R, color: RGB = INK) => texte(t, x - larg(t, size, font), yy, size, font, color);
  const centre = (t: string, x: number, yy: number, size: number, font: PDFFont = R, color: RGB = INK) => texte(t, x - larg(t, size, font) / 2, yy, size, font, color);
  /** Petites capitales espacées (titres de catégorie, « L A V A »). */
  const espace = (t: string, x: number, yy: number, size: number, sp: number, color: RGB = RED) => {
    for (const c of net(t).toUpperCase()) { page.drawText(c, { x, y: yy, size, font: B, color }); x += B.widthOfTextAtSize(c, size) + sp; }
  };
  const trait = (yy: number, ep = 0.5, color: RGB = LINE, x1 = G, x2 = D) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: ep, color });
  const couper = (t: string, max: number, size: number, font: PDFFont = R): string[] => {
    const out: string[] = [];
    for (const par of net(t).split("\n")) {
      let l = "";
      for (const m of par.split(/ +/)) {
        const essai = l ? l + " " + m : m;
        if (font.widthOfTextAtSize(essai, size) <= max || !l) l = essai; else { out.push(l); l = m; }
      }
      out.push(l);
    }
    return out;
  };
  const raccourcir = (t: string, max: number, size: number, font: PDFFont = R) => {
    let s = net(t);
    if (font.widthOfTextAtSize(s, size) <= max) return s;
    while (s && font.widthOfTextAtSize(s + "…", size) > max) s = s.slice(0, -1);
    return s + "…";
  };
  let entete: (() => void) | null = null;   // en-tête de tableau répété en haut de page
  const place = (h: number) => {
    if (y - h >= BAS) return;
    page = doc.addPage([W, H]);
    y = H - 46;
    entete?.();
  };
  const section = (t: string) => { entete = null; place(46); y -= 26; texte(t, G, y, 13, B); y -= 12; };

  // ── En-tête ──
  espace("LAVA", G + 2, y, 8, 2.6);
  y -= 24; texte("PERTES & PERSO", G, y, 20, B, GREY);
  y -= 15; texte(`Semaine du ${periode}`, G, y, 9.5, R, MUTE);

  // ── Chiffres clés ──
  const nbValides = d.jours.filter((j) => d.valides.includes(j)).length;
  const cles: [string, string, RGB][] = [
    [`${nbValides}/7`, "jours validés", nbValides === 7 ? GREEN : AMBER],
    [String(d.lignes.length), d.lignes.length > 1 ? "produits utilisés" : "produit utilisé", INK],
    [String(d.pertes.length), d.pertes.length > 1 ? "pertes déclarées" : "perte déclarée", RED],
  ];
  y -= 52;
  cles.forEach(([v, l, c], i) => { const x = G + (D - G) * (i * 2 + 1) / 6; centre(v, x, y, 17, B, c); centre(l, x, y - 13, 8, R, INK); });
  y -= 22;

  const manquants = d.jours.filter((j) => !d.valides.includes(j));
  if (manquants.length) {
    const msg = `Journées non validées : ${manquants.map((j) => JOURS[d.jours.indexOf(j)] + " " + court(j)).join(", ")}. Leurs quantités peuvent encore changer.`;
    const ls = couper(msg, D - G - 20, 9);
    y -= 14 + ls.length * 12;
    page.drawRectangle({ x: G, y, width: D - G, height: 10 + ls.length * 12, color: WARN_BG });
    ls.forEach((l, i) => texte(l, G + 10, y + ls.length * 12 - 6 - i * 12, 9, R, WARN));
  }

  // ── Repas perso ──
  section("Repas perso — quantités utilisées");
  const XP = G + 4, XT = D - 4, X0 = 318, PAS = (XT - 44 - X0) / 6;   // colonnes : produit, 7 jours, total
  const cx = (i: number) => X0 + i * PAS;
  if (!d.lignes.length) { place(16); y -= 14; texte("Aucune quantité saisie cette semaine.", G, y, 9.5, R, MUTE); }
  else {
    entete = () => {
      y -= 10;
      texte("PRODUIT", XP, y - 6, 7, B);
      d.jours.forEach((j, i) => { centre(JOURS[i].toUpperCase(), cx(i), y, 7, B); centre(j.slice(8), cx(i), y - 8, 7, B); });
      droite("TOTAL", XT, y - 6, 7, B, RED);
      y -= 15; trait(y, 1.6, INK);
    };
    place(80); entete();
    let cat = "";
    for (const x of d.lignes) {
      if (x.cat !== cat) {
        place(44);
        y -= 17; espace(x.cat, XP, y, 7, 1.1); y -= 3;
        cat = x.cat;
      }
      place(19);
      y -= 13;
      const unite = x.unite ? ` (${x.unite})` : "";
      const nom = raccourcir(x.nom.toUpperCase(), X0 - XP - 22 - larg(unite, 7), 9.5);
      texte(nom, XP, y, 9.5);
      if (unite) texte(unite, XP + larg(nom, 9.5) + 1.5, y, 7, R, INK);
      x.q.forEach((q, i) => centre(q ? num(q) : "–", cx(i), y, 9, R, q ? INK : PALE));
      droite(num(x.q.reduce((a, b) => a + b, 0)), XT, y, 9, B, RED);
      y -= 6; trait(y);
    }
  }

  // ── Pertes diverses ──
  section("Pertes diverses");
  const XJ = XP, XN = G + 90, XQ = 380, XR = 386;
  if (!d.pertes.length) { place(16); y -= 14; texte("Aucune perte déclarée cette semaine.", G, y, 9.5, R, MUTE); }
  else {
    entete = () => {
      y -= 6;
      texte("JOUR", XJ, y, 7, B); texte("PRODUIT / RECETTE", XN, y, 7, B); droite("QUANTITÉ", XQ, y, 7, B); texte("RAISON", XR, y, 7, B);
      y -= 7; trait(y, 1.6, INK);
    };
    place(60); entete();
    for (const p of d.pertes) {
      const prec = p.precision ? couper(p.precision, XT - XR, 7.5) : [];
      const prod = raccourcir(p.produit, XQ - XN - 70 - larg(" · " + p.par, 7.5), 9.5, B);
      const h = 22 + Math.max(0, prec.length - 1) * 9;
      place(h);
      y -= 15;
      texte(`${JOURS[d.jours.indexOf(p.date)] ?? ""} ${p.date.slice(8)}`, XJ, y, 9.5);
      texte(prod, XN, y, 9.5, B);
      texte(" · " + p.par, XN + larg(prod, 9.5, B), y, 7.5, R, MUTE);
      const u = " " + p.unite, q = num(Number(p.quantite));
      texte(u, XQ - larg(u, 9.5), y, 9.5);
      droite(q, XQ - larg(u, 9.5), y, 9.5, B);
      texte(p.raison, XR, y + (prec.length ? 3 : 0), 9.5, B, AMBER);
      prec.forEach((l, i) => texte(l, XR, y - 6 - i * 9, 7.5, R, MUTE));
      y -= h - 15; trait(y);
    }
  }

  // ── Commentaires ──
  if (d.commentaires.length) {
    section("Commentaires de l'équipe");
    for (const c of d.commentaires) {
      const ls = couper(c.texte.replace(/\s*\n\s*/g, " "), D - G - 16, 9.5);   // sur une ligne, comme l'ancien PDF
      const tete = `${JOURS[d.jours.indexOf(c.date)] ?? ""} ${court(c.date)} · ${c.nom}`;
      let premier = true, i = 0;
      while (i < ls.length || premier) {
        place(premier ? 34 : 18);
        const haut = y - 6;
        if (premier) { y -= 15; texte(tete, G + 12, y, 7.5, B); y -= 3; }
        while (i < ls.length && y - 13 >= BAS) { y -= 12.5; texte(ls[i], G + 12, y, 9.5); i++; }
        page.drawRectangle({ x: G, y: y - 4, width: 2.2, height: haut - y + 4, color: RED });
        premier = false;
        y -= 6;
        if (i < ls.length) place(1000);   // suite sur la page suivante
      }
    }
  }

  // ── Pied de page ──
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    page = pg;
    texte(`LAVA · Pertes & Perso · semaine du ${periode}`, G, 30, 7, R, MUTE);
    if (pages.length > 1) droite(`${i + 1}/${pages.length}`, D, 30, 7, R, MUTE);
  });
  return await doc.save();
}
