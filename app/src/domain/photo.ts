// Cadrage des photos de fiches recette : toujours enregistrées au format 16/10 (comme leur affichage).
export const RATIO_PHOTO = 1.6;
export const LARGEUR_MAX_PHOTO = 1200;

export interface Cadrage {
  /** Centre du cadrage en % de la marge disponible (0 = bord gauche/haut, 100 = bord droit/bas). */
  x: number;
  y: number;
  /** Zoom (1 = cadre le plus grand possible). */
  zoom: number;
}
export const CADRAGE_CENTRE: Cadrage = { x: 50, y: 50, zoom: 1 };

/** Zone de l'image source gardée pour un cadrage : [x, y, largeur, hauteur] en pixels source. */
export function zoneCadree(largeur: number, hauteur: number, c: Cadrage): [number, number, number, number] {
  let l = largeur, h = hauteur;
  if (largeur / hauteur > RATIO_PHOTO) l = hauteur * RATIO_PHOTO; else h = largeur / RATIO_PHOTO;
  l /= c.zoom; h /= c.zoom;
  return [(largeur - l) * c.x / 100, (hauteur - h) * c.y / 100, l, h];
}

/** Déplacement du cadrage quand on fait glisser l'aperçu de (dx, dy) pixels écran. */
export function deplacer(depart: Cadrage, dx: number, dy: number, largeur: number, hauteur: number, largeurApercu: number): Cadrage {
  const [, , l, h] = zoneCadree(largeur, hauteur, depart);
  const k = l / largeurApercu;   // pixels source par pixel écran
  const margeX = largeur - l, margeY = hauteur - h;
  const borne = (v: number) => Math.min(100, Math.max(0, v));
  return {
    ...depart,
    x: margeX > 1 ? borne(depart.x - dx * k / margeX * 100) : depart.x,
    y: margeY > 1 ? borne(depart.y - dy * k / margeY * 100) : depart.y,
  };
}

/** Une image déjà au format et sans zoom n'est pas recompressée. */
export const dejaCadree = (largeur: number, hauteur: number, c: Cadrage): boolean =>
  Math.abs(largeur / hauteur - RATIO_PHOTO) < 0.01 && c.zoom === 1;
