import type { jsPDF as JsPDF } from 'jspdf';
import type { Fiche } from '../domain/types';
import { quantitePour } from '../domain/fiches';
import { BORDURE, GRIS_FONCE, NOIR, ROSE_ALT, ROUGE, type OutilsPdf } from './commun';

/** Ajoute une fiche technique au document (page courante). Une quantité nette, quand elle existe, est imprimée sous la brute. */
export function ajouterFiche(o: OutilsPdf, doc: JsPDF, f: Fiche, coef = 1): void {
  const pageW = 210, pageH = 297, mX = 20, mTop = 15, mBottom = 16, footerH = 14;
  let y = mTop;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...NOIR);
  doc.text(f.nom.toUpperCase(), mX, y + 7);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...ROUGE);
  doc.text('Fiche Technique', mX, y + 13);
  y += 17;
  doc.setDrawColor(...ROUGE); doc.setLineWidth(0.6); doc.line(mX, y, pageW - mX, y);
  y += 6;

  const rows = f.ingredients.map(i => {
    const aNet = !!(i.brut && i.quantite_net);
    let qte: string;
    if (i.unite === 'pm') qte = 'pm';
    else if (aNet) qte = `${i.quantite ? `${quantitePour(i.quantite, coef)} ${i.unite}` : '—'}\nnet : ${quantitePour(i.quantite_net ?? '', coef)} ${i.unite}`;
    else {
      qte = i.quantite ? `${quantitePour(i.quantite, coef)} ${i.unite}` : '—';
    }
    return [i.nom.toUpperCase() + (i.brut ? '  [BRUT]' : ''), qte];
  });

  y = o.tableau(doc, {
    startY: y,
    head: [['Ingrédient', 'Quantité']],
    body: rows,
    theme: 'plain',
    margin: { left: mX, right: mX, bottom: mBottom + footerH },
    styles: { font: 'helvetica', fontSize: 9, textColor: NOIR, lineColor: BORDURE, lineWidth: { bottom: 0.1 }, cellPadding: { top: 2.2, bottom: 2.2, left: 2.8, right: 2.8 } },
    headStyles: { textColor: ROUGE, fontStyle: 'bold', fontSize: 7.5, fillColor: [255, 255, 255], lineWidth: { bottom: 0.25 }, halign: 'left' },
    columnStyles: { 1: { halign: 'right', textColor: GRIS_FONCE } },
    alternateRowStyles: { fillColor: ROSE_ALT },
    didParseCell: d => { if (d.section === 'head' && d.column.index === 1) d.cell.styles.halign = 'right'; },
  }) + 7;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...ROUGE);
  doc.text('PROCESS', mX, y);
  y += 1.5;
  doc.setDrawColor(237, 216, 216); doc.setLineWidth(0.2); doc.line(mX, y, pageW - mX, y);
  y += 3;

  if (f.process.length) {
    o.tableau(doc, {
      startY: y,
      body: f.process.map((s, i) => [String(i + 1), s]),
      theme: 'plain',
      margin: { left: mX, right: mX, bottom: mBottom + footerH },
      styles: { font: 'helvetica', fontSize: 9, textColor: NOIR, lineColor: BORDURE, lineWidth: { bottom: 0.1 }, cellPadding: { top: 3, bottom: 3, left: 2.8, right: 2.8 }, valign: 'top' },
      columnStyles: { 0: { cellWidth: 9, halign: 'center', fontStyle: 'bold', textColor: [255, 255, 255] }, 1: { cellWidth: 'auto' } },
      alternateRowStyles: { fillColor: ROSE_ALT },
      didParseCell: d => { if (d.column.index === 0) d.cell.styles.fillColor = ROUGE; },
    });
  }

  doc.setPage(doc.getNumberOfPages());
  const fy = pageH - mBottom - footerH + 5;
  doc.setDrawColor(...BORDURE); doc.setLineWidth(0.15); doc.line(mX, fy - 4, pageW - mX, fy - 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...ROUGE);
  doc.text('Quantité nette', mX, fy);
  doc.text('Conditionnement', pageW - mX, fy, { align: 'right' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...NOIR);
  doc.text(f.quantite_nette || '—', mX, fy + 6);
  doc.text(f.conditionnement.length ? f.conditionnement.join(' / ') : '—', pageW - mX, fy + 6, { align: 'right' });
}

export function pdfFiche(o: OutilsPdf, f: Fiche, coef = 1): JsPDF {
  const doc = o.nouveau();
  ajouterFiche(o, doc, f, coef);
  return doc;
}

/** Plusieurs fiches, une par page (export depuis Config). */
export function pdfFiches(o: OutilsPdf, fiches: readonly Fiche[]): JsPDF {
  const doc = o.nouveau();
  fiches.forEach((f, i) => { if (i > 0) doc.addPage(); ajouterFiche(o, doc, f); });
  return doc;
}
