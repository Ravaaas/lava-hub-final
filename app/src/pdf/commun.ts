// Outils PDF (jsPDF + AutoTable) de l'export de fiches (Config), chargés au premier export. Les fiches affichées s'impriment, elles, par window.print().
// Un vrai PDF plutôt qu'une impression HTML : dimensions exactes en mm, rendu identique sur tous les appareils.
import type { jsPDF as JsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';

export type Couleur = [number, number, number];
export const ROUGE: Couleur = [181, 67, 60];
export const NOIR: Couleur = [34, 24, 24];
export const GRIS_FONCE: Couleur = [107, 92, 92];
export const ROSE_ALT: Couleur = [245, 236, 236];
export const BORDURE: Couleur = [224, 208, 208];

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
