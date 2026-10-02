import type { jsPDF as JsPDF } from 'jspdf';
import type { Fiche, FicheRecette, Menu } from '../domain/types';
import { platAffiche, servicesAffiches } from '../domain/menus';
import { BORD_PASTILLE, BORDURE, GRIS_FONCE, NOIR, ROSE_ALT, ROUGE, dessinerPastilles, hauteurPastilles, type OutilsPdf } from './commun';

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

