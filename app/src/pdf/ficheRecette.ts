import type { jsPDF as JsPDF } from 'jspdf';
import type { Fiche, FicheRecette } from '../domain/types';
import { elementsResolus } from '../domain/fichesRecette';
import { BORD_PASTILLE, BORDURE, GRIS_FONCE, NOIR, ROSE_ALT, ROSE_PASTILLE, ROUGE, dessinerPastilles, hauteurPastilles, type OutilsPdf } from './commun';

/**
 * Fiche recette : en-tête (nom, allergènes, photo) puis une carte par élément, en grille de 2 colonnes.
 * Tient toujours en 2 pages A4 (recto-verso) : la photo puis l'échelle des cartes sont réduites si besoin.
 */
export function pdfFicheRecette(o: OutilsPdf, fr: FicheRecette, photo: string | null, fiches: readonly Fiche[]): JsPDF {
  const doc = o.nouveau();
  const pageW = 210, pageH = 297, mX = 18, mTop = 14, mBottom = 14;
  const usableH = pageH - mTop - mBottom;

  // Verrou dur : jamais de 3e page, même si l'estimation ci-dessous se trompait sur un cas extrême.
  let pagesUsed = 1;
  const origAddPage = doc.addPage.bind(doc);
  doc.addPage = ((...args: Parameters<JsPDF['addPage']>) => {
    if (pagesUsed >= 2) return doc;
    pagesUsed++;
    return origAddPage(...args);
  });

  const entrees = elementsResolus(fr, fiches);
  const gutter = 8, colW = (pageW - 2 * mX - gutter) / 2, qtyColW = 20;
  const colX = [mX, mX + colW + gutter] as const;

  function hauteurCarte(f: Fiche | null, scale: number): number {
    const nameColW = colW - qtyColW - 5;
    const fs = 7.5 * scale, lineH = fs * 0.3527 * 1.15, pad = 2.8 * scale;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(fs);
    let h = (9 + 6) * scale;
    if (f?.allergenes.length) h += 2 * scale + hauteurPastilles(doc, f.allergenes, colW - 13, Math.max(4.5, 5.2 * scale)) + 3 * scale;
    for (const i of f?.ingredients ?? []) h += (doc.splitTextToSize(i.nom.toUpperCase(), nameColW) as string[]).length * lineH + pad;
    if (f?.process.length) {
      h += 7 * scale;
      const stepTextW = colW - Math.max(6, 8 * scale) - 5 * scale;
      for (const s of f.process) h += (doc.splitTextToSize(s, stepTextW) as string[]).length * lineH + pad;
    }
    return h + 8 * scale;
  }
  const ecartCartes = (scale: number) => Math.max(2, 5 * scale);
  const hauteurTotale = (scale: number) => entrees.reduce((t, e) => t + hauteurCarte(e.fiche, scale) + ecartCartes(scale), 0);
  function hauteurEntete(photoMaxH: number): number {
    let h = 15;
    if (fr.allergenes.length) h += hauteurPastilles(doc, fr.allergenes, pageW - 2 * mX, 7) + 9;
    if (photo && photoMaxH > 0) {
      try {
        const p = doc.getImageProperties(photo);
        h += Math.min((pageW - 2 * mX) * p.height / p.width, photoMaxH) + 4;
      } catch { /* image illisible : pas de photo */ }
    }
    return h + 6;
  }

  // Mise en page qui tient en 2 pages (2 colonnes × 2 pages) : photo réduite d'abord, puis échelle des cartes.
  const sectionH = entrees.length ? 10.5 : 0;
  const total1 = hauteurTotale(1);
  let photoMaxH = 70, headerH = hauteurEntete(photoMaxH);
  let budget = 0.9 * (2 * (usableH - headerH - sectionH) + 2 * usableH);
  if (photo && total1 > budget) {
    for (const c of [55, 42, 30, 18, 0]) {
      headerH = hauteurEntete(c);
      budget = 0.9 * (2 * (usableH - headerH - sectionH) + 2 * usableH);
      photoMaxH = c;
      if (total1 <= budget) break;
    }
  }
  let scale = 1;
  if (total1 > budget) {
    scale = Math.max(0.15, budget / total1);
    for (let i = 0; i < 8; i++) {
      const t2 = hauteurTotale(scale);
      if (t2 <= budget || scale <= 0.15) break;
      scale = Math.max(0.15, scale * (budget / t2) * 0.97);
    }
  }

  // ── En-tête ──
  let y = mTop;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...NOIR);
  doc.text(fr.nom.toUpperCase(), mX, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...ROUGE);
  doc.text('Fiche Recette', mX, y + 11.5);
  y += 15;
  if (fr.allergenes.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...ROUGE);
    doc.text('ALLERGÈNES', mX, y + 2.2);
    y = dessinerPastilles(doc, fr.allergenes, mX, y + 5, pageW - 2 * mX, 7, ROSE_PASTILLE, BORD_PASTILLE, ROUGE) + 4;
  }
  if (photo && photoMaxH > 0) {
    try {
      const format = (/^data:image\/(png|jpe?g|webp)/i.exec(photo)?.[1] ?? 'jpeg').toUpperCase().replace('JPG', 'JPEG');
      const p = doc.getImageProperties(photo);
      const maxW = pageW - 2 * mX;
      let iw = maxW, ih = iw * p.height / p.width;
      if (ih > photoMaxH) { ih = photoMaxH; iw = ih * p.width / p.height; }
      doc.addImage(photo, format, mX + (maxW - iw) / 2, y, iw, ih, undefined, 'FAST');
      y += ih + 4;
    } catch { /* image illisible : pas de photo */ }
  }
  doc.setDrawColor(...ROUGE); doc.setLineWidth(0.6); doc.line(mX, y, pageW - mX, y);
  y += 6;
  if (entrees.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NOIR);
    doc.text('Éléments', mX, y);
    y += 5;
    doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5); doc.setTextColor(...GRIS_FONCE);
    doc.text("Numérotées selon l'ordre de dressage", mX, y);
    y += 5.5;
  }

  // ── Grille : chaque carte va dans la colonne la moins remplie ; page suivante (2 au plus) quand les deux sont pleines ──
  let colY = [y, y];
  const colBottom = pageH - mBottom;
  function placer(h: number): 0 | 1 {
    let c: 0 | 1 = (colY[0] ?? 0) <= (colY[1] ?? 0) ? 0 : 1;
    if ((colY[c] ?? 0) + h > colBottom) {
      c = c === 0 ? 1 : 0;
      if ((colY[c] ?? 0) + h > colBottom) {
        const avant = pagesUsed;
        doc.addPage();
        if (pagesUsed > avant) colY = [mTop, mTop];
        c = (colY[0] ?? 0) <= (colY[1] ?? 0) ? 0 : 1;
      }
    }
    return c;
  }

  entrees.forEach(({ fiche: f, element, nom }, idx) => {
    const c = placer(hauteurCarte(f, scale));
    const x0 = colX[c];
    let yy = colY[c] ?? 0;
    const allerg = f?.allergenes ?? [];
    const badgeRowH = Math.max(5.5, 8 * scale);
    const chipRowH = allerg.length ? 2 * scale + hauteurPastilles(doc, allerg, colW - 13, Math.max(4.5, 5.2 * scale)) + 3 * scale : 0;
    const headH = badgeRowH + chipRowH, cardR = 2.2;
    const cardTop = yy, badgeR = Math.max(1.8, 3 * scale), bcx = x0 + 5, bcy = yy + badgeRowH / 2;
    doc.setFillColor(251, 243, 241);
    doc.roundedRect(x0, yy, colW, headH, cardR, cardR, 'F');
    doc.rect(x0, yy + headH - cardR, colW, cardR, 'F');
    doc.setFillColor(...ROUGE);
    doc.circle(bcx, bcy, badgeR, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(Math.max(6, 8.5 * scale)); doc.setTextColor(255, 255, 255);
    doc.text(String(idx + 1), bcx, bcy + 1.1, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(Math.max(6.5, 9.5 * scale)); doc.setTextColor(...NOIR);
    doc.text(nom.toUpperCase(), x0 + 11, bcy + 1.1);
    if (element.grammage) {
      const gfs = Math.max(6, 7.5 * scale);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(gfs);
      const gw = doc.getTextWidth(element.grammage) + 4.8 * scale, gh = Math.max(4.2, 5.6 * scale);
      const gx = x0 + colW - 3 - gw, gy = bcy - gh / 2;
      doc.setFillColor(255, 255, 255); doc.setDrawColor(...BORDURE); doc.setLineWidth(0.2);
      doc.roundedRect(gx, gy, gw, gh, gh / 2, gh / 2, 'FD');
      doc.setTextColor(...GRIS_FONCE);
      doc.text(element.grammage, gx + gw / 2, bcy + gfs * 0.13, { align: 'center' });
    }
    if (allerg.length) dessinerPastilles(doc, allerg, x0 + 11, yy + badgeRowH + 2 * scale, colW - 13, Math.max(4.5, 5.2 * scale), ROSE_PASTILLE, BORD_PASTILLE, ROUGE);
    const aDuContenu = !!f && (f.ingredients.length > 0 || f.process.length > 0);
    yy += headH + (aDuContenu ? Math.max(0.8, 1.6 * scale) : 0);

    if (f) {
      // Filet de sécurité : on ne passe jamais à AutoTable plus de lignes que la place restante n'en garantit
      // (sa pagination interne désynchroniserait les colonnes).
      const nameColW = colW - qtyColW - 5;
      const fs = 7.5 * scale, lineH = fs * 0.3527 * 1.15, pad = 2.8 * scale;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(fs);
      const combienTiennent = (items: readonly string[], dispo: number, largeur: number) => {
        let h = 0, n = 0;
        for (; n < items.length; n++) {
          const rh = (doc.splitTextToSize(items[n] ?? '', largeur) as string[]).length * lineH + pad;
          if (h + rh > dispo) break;
          h += rh;
        }
        return n;
      };

      if (f.ingredients.length && colBottom - yy > lineH + pad) {
        const n = combienTiennent(f.ingredients.map(i => i.nom.toUpperCase()), colBottom - yy, nameColW);
        const rows: (string | { content: string; colSpan: number; styles: object })[][] = f.ingredients.slice(0, n).map(i => [
          i.nom.toUpperCase(),
          i.unite === 'pm' ? 'pm' : i.quantite ? `${i.quantite} ${i.unite}` : '—',
        ]);
        if (n < f.ingredients.length) rows.push([{ content: `+ ${f.ingredients.length - n} ingrédient(s) supplémentaire(s)`, colSpan: 2, styles: { fontStyle: 'italic', textColor: GRIS_FONCE, halign: 'center' } }]);
        yy = o.tableau(doc, {
          startY: yy,
          head: [['Ingrédient', 'Quantité']],
          body: rows,
          theme: 'plain',
          margin: { left: x0, right: pageW - (x0 + colW), bottom: mBottom },
          styles: { font: 'helvetica', fontSize: 7.5 * scale, textColor: NOIR, lineColor: BORDURE, lineWidth: { bottom: 0.1 }, cellPadding: { top: 1.4 * scale, bottom: 1.4 * scale, left: 2 * scale, right: 2 * scale } },
          headStyles: { textColor: ROUGE, fontStyle: 'bold', fontSize: 6.8 * scale, fillColor: [255, 255, 255], lineWidth: { bottom: 0.2 }, halign: 'left' },
          columnStyles: { 1: { halign: 'right', textColor: GRIS_FONCE, cellWidth: qtyColW } },
          alternateRowStyles: { fillColor: ROSE_ALT },
          didParseCell: d => { if (d.section === 'head' && d.column.index === 1) d.cell.styles.halign = 'right'; },
        });
      }

      if (f.process.length && colBottom - yy > 6 * scale + lineH + pad) {
        yy += 3 * scale;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(Math.max(5, 6.5 * scale)); doc.setTextColor(...ROUGE);
        doc.text('PROCESS', x0 + 2, yy);
        yy += 1.2 * scale;
        doc.setDrawColor(237, 216, 216); doc.setLineWidth(0.2);
        doc.line(x0 + 2, yy, x0 + colW - 2, yy);
        yy += 3 * scale;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(fs);
        const stepBadgeW = Math.max(6, 8 * scale);
        const stepTextX = x0 + stepBadgeW + 2.5 * scale, stepTextW = colW - stepBadgeW - 5 * scale;
        if (colBottom - yy > lineH + pad) {
          const n = combienTiennent(f.process, colBottom - yy, stepTextW);
          f.process.slice(0, n).forEach((s, i) => {
            const lignes = doc.splitTextToSize(s, stepTextW) as string[];
            const rh = lignes.length * lineH + pad;
            const stepFs = Math.max(5, 6.5 * scale);
            if (i % 2 === 0) { doc.setFillColor(...ROSE_ALT); doc.rect(x0, yy, colW, rh, 'F'); }
            doc.setFillColor(...ROUGE);
            doc.rect(x0, yy, stepBadgeW, rh, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(stepFs); doc.setTextColor(255, 255, 255);
            doc.text(String(i + 1), x0 + stepBadgeW / 2, yy + rh / 2 + stepFs * 0.13, { align: 'center' });
            doc.setFont('helvetica', 'normal'); doc.setFontSize(fs); doc.setTextColor(...NOIR);
            let ty = yy + pad / 2 + lineH * 0.78;
            for (const l of lignes) { doc.text(l, stepTextX, ty); ty += lineH; }
            if (i < n - 1) { doc.setDrawColor(...BORDURE); doc.setLineWidth(0.1); doc.line(x0, yy + rh, x0 + colW, yy + rh); }
            yy += rh;
          });
          if (n < f.process.length) {
            yy += 1 * scale;
            doc.setFont('helvetica', 'italic'); doc.setFontSize(Math.max(5, 6 * scale)); doc.setTextColor(...GRIS_FONCE);
            doc.text(`+ ${f.process.length - n} étape(s) supplémentaire(s)`, x0 + colW / 2, yy + lineH * 0.78, { align: 'center' });
            yy += lineH + pad;
          }
        }
      }
    }
    if (aDuContenu) yy += Math.max(0.8, 1.6 * scale);
    doc.setDrawColor(...BORDURE); doc.setLineWidth(0.25);
    doc.roundedRect(x0, cardTop, colW, yy - cardTop, cardR, cardR, 'S');
    colY[c] = yy + ecartCartes(scale);
  });
  return doc;
}
