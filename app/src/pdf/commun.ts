// Outils communs des PDF (jsPDF + AutoTable), chargés seulement au premier export ou à la première impression.
// Un vrai PDF plutôt qu'une impression HTML : dimensions exactes en mm, rendu identique sur tous les appareils.
import type { jsPDF as JsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';

export type Couleur = [number, number, number];
export const ROUGE: Couleur = [181, 67, 60];
export const NOIR: Couleur = [34, 24, 24];
export const GRIS_FONCE: Couleur = [107, 92, 92];
export const ROSE_ALT: Couleur = [245, 236, 236];
export const BORDURE: Couleur = [224, 208, 208];
export const ROSE_PASTILLE: Couleur = [251, 237, 236];
export const BORD_PASTILLE: Couleur = [237, 216, 216];

export interface OutilsPdf {
  nouveau: () => JsPDF;
  tableau: (doc: JsPDF, options: UserOptions) => number;   // renvoie le bas du tableau (finalY)
}

let chargement: Promise<OutilsPdf> | null = null;
export function outilsPdf(): Promise<OutilsPdf> {
  chargement ??= Promise.all([import('jspdf'), import('jspdf-autotable')])
    .then(([{ jsPDF }, { autoTable }]): OutilsPdf => ({
      nouveau: () => new jsPDF({ unit: 'mm', format: 'a4' }),
      tableau: (doc, options) => {
        autoTable(doc, options);
        return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
      },
    }))
    .catch((e: unknown) => { chargement = null; throw e; });
  return chargement;
}

/**
 * Ouvre le PDF dans un nouvel onglet. L'onglet est ouvert tout de suite, au clic :
 * sinon le bloqueur de fenêtres le refuse après le chargement asynchrone.
 */
export async function ouvrirPdf(construire: (o: OutilsPdf) => JsPDF | Promise<JsPDF>): Promise<boolean> {
  const onglet = window.open('', '_blank');
  try {
    const url = String((await construire(await outilsPdf())).output('bloburl'));
    if (onglet) onglet.location.href = url; else window.open(url, '_blank');
    return true;
  } catch {
    onglet?.close();
    return false;
  }
}

// ── Pastilles d'allergènes ──
const PAD_X = 2.2, ECART = 1.8;
const hauteurPastille = (taille: number) => taille * 0.3527 * 1.5 + 1.6;

export function hauteurPastilles(doc: JsPDF, pastilles: readonly string[], largeurMax: number, taille: number): number {
  if (!pastilles.length) return 0;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(taille);
  let lignes = 1, x = 0;
  for (const c of pastilles) {
    const l = doc.getTextWidth(c) + PAD_X * 2;
    if (x > 0 && x + ECART + l > largeurMax) { lignes++; x = l; } else x += (x > 0 ? ECART : 0) + l;
  }
  return lignes * (hauteurPastille(taille) + 1.2) - 1.2;
}

/** Dessine les pastilles à partir de (x0, y0) ; renvoie le bas de la dernière ligne. */
export function dessinerPastilles(doc: JsPDF, pastilles: readonly string[], x0: number, y0: number, largeurMax: number, taille: number, fond: Couleur, bord: Couleur, texte: Couleur): number {
  if (!pastilles.length) return y0;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(taille);
  const h = hauteurPastille(taille);
  let x = x0, y = y0;
  for (const c of pastilles) {
    const l = doc.getTextWidth(c) + PAD_X * 2;
    if (x > x0 && x + l > x0 + largeurMax) { x = x0; y += h + 1.2; }
    doc.setFillColor(...fond); doc.setDrawColor(...bord); doc.setLineWidth(0.15);
    doc.roundedRect(x, y, l, h, h / 2, h / 2, 'FD');
    doc.setTextColor(...texte);
    doc.text(c, x + PAD_X, y + h / 2 + taille * 0.13);
    x += l + ECART;
  }
  return y + h;
}
