import type { jsPDF as JsPDF } from 'jspdf';
import type { Fiche, FicheRecette, Groupe, Menu } from '../domain/types';
import { menuDuGroupe, platAffiche, platsDuMenu, servicesAffiches } from '../domain/menus';
import { dateLongue } from '../domain/groupes';
import { heureFr } from '../domain/texte';
import { libelleEffectif } from '../domain/allergenes';
import { BORD_PASTILLE, BORDURE, GRIS_FONCE, NOIR, ROSE_ALT, ROSE_PASTILLE, ROUGE, dessinerPastilles, hauteurPastilles, type Couleur, type OutilsPdf } from './commun';

/** Menu : chaque plat sur trois niveaux (titre, éléments, allergènes en pastilles), lignes roses alternées. */
export function pdfMenu(o: OutilsPdf, m: Menu, frs: readonly FicheRecette[], fiches: readonly Fiche[]): JsPDF {
  const doc = o.nouveau();
  const pageW = 210, pageH = 297, mX = 20, mTop = 15, mBottom = 16;
  let y = mTop;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...NOIR);
  doc.text(m.nom.toUpperCase(), mX, y + 7);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...ROUGE);
  doc.text('Menu', mX, y + 13);
  y += 17;
  doc.setDrawColor(...ROUGE); doc.setLineWidth(0.6); doc.line(mX, y, pageW - mX, y);
  y += 11;

  const services = servicesAffiches(m).filter(s => s.plats.length);
  if (!services.length) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...GRIS_FONCE);
    doc.text("Ce menu n'a pas encore de plats.", mX, y + 4);
  }
  const w = pageW - 2 * mX, padY = 3.6;
  for (const s of services) {
    if (y > pageH - mBottom - 35) { doc.addPage(); y = mTop; }
    if (s.nom) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...ROUGE);
      doc.text(s.nom.toUpperCase(), mX, y);
      y += 1.5;
      doc.setDrawColor(237, 216, 216); doc.setLineWidth(0.2); doc.line(mX, y, pageW - mX, y);
      y += 3;
    }
    s.plats.forEach((p, i) => {
      const d = platAffiche(p, frs, fiches);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
      const nom = doc.splitTextToSize(d.nom.toUpperCase(), w) as string[];
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      const els = d.elements.length ? doc.splitTextToSize(d.elements.join(' · '), w) as string[] : [];
      const h = padY * 2 + nom.length * 4.6 + (els.length ? 1 + els.length * 3.9 : 0)
        + (d.allergenes.length ? (els.length ? 1.6 : 2.6) + hauteurPastilles(doc, d.allergenes, w, 6.5) : 0);
      if (y + h > pageH - mBottom) { doc.addPage(); y = mTop; }
      if (i % 2 === 0) { doc.setFillColor(...ROSE_ALT); doc.rect(mX - 2.8, y, w + 5.6, h, 'F'); }
      doc.setDrawColor(...BORDURE); doc.setLineWidth(0.1); doc.line(mX - 2.8, y + h, pageW - mX + 2.8, y + h);
      let yy = y + padY + 3.4;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...NOIR);
      doc.text(nom, mX, yy); yy += (nom.length - 1) * 4.6;
      if (els.length) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRIS_FONCE);
        doc.text(els, mX, yy + 4.6); yy += 1 + els.length * 3.9;
      }
      if (d.allergenes.length) dessinerPastilles(doc, d.allergenes, mX, yy + (els.length ? 1.6 : 2.6), w, 6.5, [255, 255, 255], BORD_PASTILLE, ROUGE);
      y += h;
    });
    y += 8;
  }
  return doc;
}


/** Un seul trait pour toute la fiche groupe : même épaisseur, même couleur (filets et cadres). */
const EPAISSEUR = 0.4;
const TEXTE_ALERTE: Couleur = [140, 48, 42];
const BLANC: Couleur = [255, 255, 255];
const RETRAIT = 4;      // texte à l'intérieur d'un cadre ou d'une ligne : toujours 4 mm du bord
const LIGNE = 11;       // pas d'une ligne d'allergie, de régime ou d'état vide (cadre de 9 mm + 2 mm)

/**
 * Fiche groupe, lisible d'un coup d'œil : date, arrivée et nombre en gros, puis menu,
 * allergies et régimes (un par ligne, avec le nombre de personnes), notes.
 */
export function pdfGroupe(o: OutilsPdf, g: Groupe, menus: readonly Menu[], frs: readonly FicheRecette[], fiches: readonly Fiche[]): JsPDF {
  const doc = o.nouveau();
  const mX = 20, W = 170, BAS = 282;
  let y = 18;
  const place = (h: number) => { if (y + h > BAS) { doc.addPage(); y = 18; } };
  const trait = (fond: Couleur) => { doc.setFillColor(...fond); doc.setDrawColor(...ROUGE); doc.setLineWidth(EPAISSEUR); };
  const texte = (txt: string, x: number, yy: number, taille: number, gras: boolean, couleur: Couleur, opts?: { align?: 'right' | 'center' }) => {
    doc.setFont('helvetica', gras ? 'bold' : 'normal'); doc.setFontSize(taille); doc.setTextColor(...couleur);
    doc.text(txt, x, yy, opts);
  };
  const filet = (yy: number) => { trait(BLANC); doc.line(mX, yy, mX + W, yy); };
  const titre = (txt: string) => {
    place(24);
    y += 9;
    texte(txt, mX, y, 11, true, ROUGE);
    filet(y + 2);
    y += 8;
  };
  /** Une ligne par élément : nom à gauche en gros, nombre de personnes à droite. */
  const lignes = (noms: readonly string[]) => {
    for (const n of noms) {
      place(LIGNE);
      trait(ROSE_PASTILLE); doc.roundedRect(mX, y, W, 9, 2, 2, 'FD');
      texte(n, mX + RETRAIT, y + 6.3, 13, true, NOIR);
      const nb = g.effectifs[n] ?? 1;   // sans nombre saisi : au moins une personne
      if (nb) texte(`${nb} ${nb === 1 ? 'personne' : 'personnes'}`, mX + W - RETRAIT, y + 6.3, 13, true, ROUGE, { align: 'right' });
      y += LIGNE;
    }
  };
  /** État vide : même ligne que les autres, pour que la page garde le même rythme avec ou sans allergie. */
  const vide = (txt: string) => {
    place(LIGNE);
    trait(BLANC); doc.roundedRect(mX, y, W, 9, 2, 2, 'FD');
    texte(txt, mX + RETRAIT, y + 6.3, 12, false, GRIS_FONCE);
    y += LIGNE;
  };

  // En-tête
  texte('FICHE GROUPE', mX, y, 10, true, ROUGE);
  y += 9;
  for (const l of doc.splitTextToSize(g.nom.toUpperCase(), W) as string[]) { texte(l, mX, y, 24, true, NOIR); y += 10; }
  filet(y - 4);
  y += 4;

  // Trois cases : date, arrivée des clients, nombre de personnes
  const cases: { etiquette: string; valeur: string; taille: number; largeur: number }[] = [
    { etiquette: 'DATE', valeur: dateLongue(g.date), taille: 13, largeur: 84 },
    { etiquette: 'ARRIVÉE DES CLIENTS', valeur: g.heure ? heureFr(g.heure) : '—', taille: 24, largeur: 44 },
    { etiquette: 'PERSONNES', valeur: String(g.pax), taille: 24, largeur: 36 },
  ];
  let x = mX;
  for (const c of cases) {
    trait(ROSE_ALT); doc.roundedRect(x, y, c.largeur, 24, 2.5, 2.5, 'FD');
    texte(c.etiquette, x + RETRAIT, y + 6.5, 7.5, true, GRIS_FONCE);
    texte((doc.splitTextToSize(c.valeur, c.largeur - 2 * RETRAIT) as string[]).join(' '), x + RETRAIT, y + 17.5, c.taille, true, NOIR);
    x += c.largeur + 3;
  }
  y += 24;

  // Menu : un plat par ligne ; seules les allergies du groupe qui le concernent, avec le nombre de personnes (× 2)
  const m = menuDuGroupe(g, menus);
  titre('MENU' + (m?.id ? ' — ' + m.nom.toUpperCase() : ''));
  const plats = m ? platsDuMenu(m, frs, fiches) : [];
  if (!plats.length) vide(m ? "Ce menu n'a pas encore de plats." : 'Menu sur mesure — voir les notes.');
  plats.forEach((p, i) => {
    const concernees = p.allergenes.filter(a => g.allergenes.includes(a));
    place(concernees.length ? 17 : 10);
    texte(`${i + 1}.`, mX + RETRAIT, y + 4, 13, true, ROUGE);
    texte(p.nom, mX + 13, y + 4, 13, false, NOIR);
    y += 8;
    if (concernees.length) { texte(concernees.map(a => libelleEffectif(a, g.effectifs)).join('   ·   '), mX + 13, y + 0.5, 11, true, TEXTE_ALERTE); y += 7; }
    y += 1;
  });

  // Allergies et régimes
  titre('ALLERGIES');
  if (g.allergenes.length) lignes(g.allergenes); else vide('Aucune allergie déclarée');
  titre('RÉGIMES ALIMENTAIRES');
  if (g.regimes.length) lignes(g.regimes); else vide('Aucun régime particulier');

  // Notes : la case reste assez grande pour écrire à la main
  titre('NOTES');
  const notes = g.notes ? doc.splitTextToSize(g.notes, W - 2 * RETRAIT) as string[] : [];
  const h = Math.max(38, notes.length * 6 + 8);
  place(Math.min(h, 60));
  trait(BLANC); doc.roundedRect(mX, y, W, h, 2.5, 2.5, 'FD');
  notes.forEach((l, k) => { texte(l, mX + RETRAIT, y + 8 + k * 6, 11.5, false, NOIR); });
  y += h + 5;

  // Pied discret
  if (g.salle) { place(8); texte(`Salle : ${g.salle}`, mX, y, 9, false, GRIS_FONCE); }
  return doc;
}
