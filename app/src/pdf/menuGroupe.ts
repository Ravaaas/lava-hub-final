import type { jsPDF as JsPDF } from 'jspdf';
import type { Fiche, FicheRecette, Groupe, Menu } from '../domain/types';
import { alertesGroupe, platAffiche, platsDuMenu, servicesAffiches } from '../domain/menus';
import { dateLongue } from '../domain/groupes';
import { heureFr } from '../domain/texte';
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


const FOND_ALERTE: Couleur = [251, 237, 236];
const TEXTE_ALERTE: Couleur = [140, 48, 42];

/**
 * Fiche groupe, lisible d'un coup d'œil : date, arrivée et nombre en gros, puis menu choisi,
 * allergies et régimes (un par ligne, avec le nombre de personnes), notes.
 */
export function pdfGroupe(o: OutilsPdf, g: Groupe, menus: readonly Menu[], frs: readonly FicheRecette[], fiches: readonly Fiche[]): JsPDF {
  const doc = o.nouveau();
  const mX = 20, W = 170, BAS = 282;
  let y = 18;
  const place = (h: number) => { if (y + h > BAS) { doc.addPage(); y = 18; } };
  const texte = (txt: string, x: number, yy: number, taille: number, gras: boolean, couleur: Couleur, opts?: { align?: 'right' | 'center' }) => {
    doc.setFont('helvetica', gras ? 'bold' : 'normal'); doc.setFontSize(taille); doc.setTextColor(...couleur);
    doc.text(txt, x, yy, opts);
  };
  const titre = (txt: string) => {
    place(20);
    y += 7;
    texte(txt, mX, y, 11, true, ROUGE);
    doc.setDrawColor(...ROUGE); doc.setLineWidth(0.4); doc.line(mX, y + 1.8, mX + W, y + 1.8);
    y += 8;
  };
  /** Une ligne par élément : nom à gauche en gros, nombre de personnes à droite. */
  const lignes = (noms: readonly string[]) => {
    for (const n of noms) {
      place(11);
      doc.setFillColor(...ROSE_PASTILLE); doc.setDrawColor(...BORD_PASTILLE); doc.setLineWidth(0.2);
      doc.roundedRect(mX, y, W, 9, 2, 2, 'FD');
      texte(n, mX + 4, y + 6.3, 13, true, NOIR);
      const nb = g.effectifs[n];
      if (nb) texte(`${nb} ${nb === 1 ? 'personne' : 'personnes'}`, mX + W - 4, y + 6.3, 13, true, ROUGE, { align: 'right' });
      y += 11;
    }
  };
  const vide = (txt: string) => { place(8); texte(txt, mX + 2, y + 3, 12, false, GRIS_FONCE); y += 9; };

  // En-tête
  texte('FICHE GROUPE', mX, y, 10, true, ROUGE);
  y += 9;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(24);
  for (const l of doc.splitTextToSize(g.nom.toUpperCase(), W) as string[]) { texte(l, mX, y, 24, true, NOIR); y += 10; }
  doc.setDrawColor(...ROUGE); doc.setLineWidth(0.8); doc.line(mX, y - 4, mX + W, y - 4);
  y += 2;

  // Trois cases : date, arrivée des clients, nombre de personnes
  const cases: { etiquette: string; valeur: string; taille: number; largeur: number }[] = [
    { etiquette: 'DATE', valeur: dateLongue(g.date), taille: 13, largeur: 84 },
    { etiquette: 'ARRIVÉE DES CLIENTS', valeur: g.heure ? heureFr(g.heure) : '—', taille: 24, largeur: 44 },
    { etiquette: 'PERSONNES', valeur: String(g.pax), taille: 24, largeur: 36 },
  ];
  let x = mX;
  for (const c of cases) {
    doc.setFillColor(...ROSE_ALT); doc.setDrawColor(...BORDURE); doc.setLineWidth(0.2);
    doc.roundedRect(x, y, c.largeur, 24, 2.5, 2.5, 'FD');
    texte(c.etiquette, x + 4, y + 6.5, 7.5, true, GRIS_FONCE);
    const v = doc.splitTextToSize(c.valeur, c.largeur - 8) as string[];
    texte(v.join(' '), x + 4, y + 17.5, c.taille, true, NOIR);
    x += c.largeur + 3;
  }
  y += 28;

  // Plats du menu qui contiennent une allergie du groupe
  const alertes = alertesGroupe(g, menus, frs, fiches);
  if (alertes.length) {
    const h = 10 + alertes.length * 7;
    place(h + 4);
    doc.setFillColor(...FOND_ALERTE); doc.setDrawColor(...TEXTE_ALERTE); doc.setLineWidth(0.5);
    doc.roundedRect(mX, y, W, h, 2.5, 2.5, 'FD');
    texte('ATTENTION — plats du menu en conflit avec les allergies', mX + 4, y + 7, 11, true, TEXTE_ALERTE);
    alertes.forEach((a, i) => { texte(`${a.plat} : ${a.allergenes.join(', ')}`, mX + 4, y + 14.5 + i * 7, 11, false, TEXTE_ALERTE); });
    y += h + 4;
  }

  // Menu choisi
  const m = menus.find(x2 => x2.id === g.menu_id);
  titre('MENU CHOISI' + (m ? ' — ' + m.nom.toUpperCase() : ''));
  const plats = m ? platsDuMenu(m, frs, fiches) : [];
  if (!plats.length) vide(m ? "Ce menu n'a pas encore de plats." : 'Menu sur mesure — voir les notes.');
  plats.forEach((p, i) => {
    place(14);
    texte(`${i + 1}.`, mX + 2, y + 4, 13, true, ROUGE);
    texte(p.nom, mX + 11, y + 4, 13, false, NOIR);
    y += 7;
    if (p.allergenes.length) { place(8); texte('Contient : ' + p.allergenes.join(', '), mX + 11, y + 1, 9.5, false, GRIS_FONCE); y += 6; }
    y += 1.5;
  });

  // Allergies et régimes
  titre('ALLERGIES');
  if (g.allergenes.length) lignes(g.allergenes); else vide('Aucune allergie déclarée');
  titre('RÉGIMES ALIMENTAIRES');
  if (g.regimes.length) lignes(g.regimes); else vide('Aucun régime particulier');

  // Notes : la case reste assez grande pour écrire à la main
  titre('NOTES');
  const notes = g.notes ? doc.splitTextToSize(g.notes, W - 8) as string[] : [];
  const h = Math.max(38, notes.length * 6 + 8);
  place(Math.min(h, 60));
  doc.setDrawColor(...BORDURE); doc.setLineWidth(0.3);
  doc.roundedRect(mX, y, W, h, 2.5, 2.5, 'D');
  notes.forEach((l, i) => { texte(l, mX + 4, y + 8 + i * 6, 11.5, false, NOIR); });
  y += h + 4;

  // Pied discret
  const pied = [g.salle && `Salle : ${g.salle}`, g.source && `Reçu par : ${g.source}`].filter(Boolean).join('   ·   ');
  if (pied) { place(8); texte(pied, mX, y + 2, 9, false, GRIS_FONCE); }
  return doc;
}
