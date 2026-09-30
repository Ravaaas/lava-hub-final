import { LARGEUR_MAX_PHOTO, RATIO_PHOTO, dejaCadree, zoneCadree, type Cadrage } from '../domain/photo';

export function chargerImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => { ok(img); };
    img.onerror = () => { ko(new Error('image illisible')); };
    img.src = src;
  });
}

function toile(largeur: number, hauteur: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.round(largeur); c.height = Math.round(hauteur);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas indisponible');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);   // fond blanc sous les images transparentes
  return [c, ctx];
}

/** Réduit une photo (1200 px au plus) et la recompresse en JPEG : ~100 Ko au lieu de plusieurs Mo. */
export async function reduireImage(src: string): Promise<string> {
  const img = await chargerImage(src);
  const k = Math.min(1, LARGEUR_MAX_PHOTO / Math.max(img.width, img.height));
  const [c, ctx] = toile(img.width * k, img.height * k);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

/** Dessine la zone cadrée dans `c` (aperçu ou image finale), sur `largeurMax` pixels au plus. */
export function dessinerCadrage(c: HTMLCanvasElement, img: HTMLImageElement, cadrage: Cadrage, largeurMax: number): void {
  const [sx, sy, l, h] = zoneCadree(img.width, img.height, cadrage);
  c.width = Math.round(Math.min(largeurMax, l)); c.height = Math.round(c.width / RATIO_PHOTO);
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, sx, sy, l, h, 0, 0, c.width, c.height);
}

/** Photo à enregistrer : toujours en 16/10 ; une image déjà au format n'est pas recompressée. */
export function photoCadree(img: HTMLImageElement, cadrage: Cadrage): string {
  if (dejaCadree(img.width, img.height, cadrage)) return img.src;
  const c = document.createElement('canvas');
  dessinerCadrage(c, img, cadrage, LARGEUR_MAX_PHOTO);
  return c.toDataURL('image/jpeg', 0.8);
}

/** Fichier téléchargé par le navigateur (sauvegardes JSON). */
export function telecharger(nom: string, contenu: unknown): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(contenu)], { type: 'application/json' }));
  a.download = nom;
  a.click();
  window.setTimeout(() => { URL.revokeObjectURL(a.href); }, 1000);
}
