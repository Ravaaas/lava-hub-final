import { useRef, useState, type PointerEvent } from 'react';

/**
 * Réordonner une liste en faisant glisser la poignée d'une ligne (souris ou doigt).
 * `poignee(i)` se place sur la poignée ; `ligne(i)` sur chaque ligne ; `glisse` = index de la ligne déplacée.
 */
export function useReordonner<T>(liste: readonly T[], changer: (l: T[]) => void) {
  const lignes = useRef<(HTMLElement | null)[]>([]);
  const [glisse, setGlisse] = useState<number | null>(null);

  const deplacer = (e: PointerEvent) => {
    if (glisse === null) return;
    e.preventDefault();
    // nouvelle place : avant la première ligne dont le milieu est sous le doigt
    let cible = liste.length - 1;
    for (let i = 0; i < liste.length; i++) {
      const el = lignes.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { cible = i > glisse ? i - 1 : i; break; }
    }
    if (cible === glisse) return;
    const l = [...liste];
    const [x] = l.splice(glisse, 1);
    if (x === undefined) return;
    l.splice(cible, 0, x);
    changer(l);
    setGlisse(cible);
  };
  const finir = () => { setGlisse(null); };

  return {
    glisse,
    ligne: (i: number) => ({ ref: (el: HTMLElement | null) => { lignes.current[i] = el; } }),
    poignee: (i: number) => ({
      className: 'drag-handle',
      title: 'Déplacer',
      onPointerDown: (e: PointerEvent) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setGlisse(i); },
      onPointerMove: deplacer,
      onPointerUp: finir,
      onPointerCancel: finir,
    }),
  };
}
