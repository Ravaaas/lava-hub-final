import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icone } from './Icone';

// Pile des fenêtres ouvertes : Échap ne ferme que celle du dessus.
const pile: symbol[] = [];
export const fenetreOuverte = (): boolean => pile.length > 0;

/** Échap ferme le calque du dessus (fenêtre, sinon fiche plein écran) ; `actif` = false le désactive. */
export function useEchap(fermer: () => void, actif = true) {
  const rappel = useRef(fermer);
  useEffect(() => { rappel.current = fermer; });
  useEffect(() => {
    if (!actif) return;
    const moi = Symbol('calque');
    pile.push(moi);
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || pile[pile.length - 1] !== moi) return;
      e.preventDefault();
      rappel.current();
    };
    document.addEventListener('keydown', surTouche);
    return () => { document.removeEventListener('keydown', surTouche); pile.splice(pile.indexOf(moi), 1); };
  }, [actif]);
}

interface Props {
  titre: string;
  /** Absent : la fenêtre ne peut pas être fermée (mot de passe imposé). */
  onFermer?: () => void;
  pied?: ReactNode;
  largeur?: number;
  children: ReactNode;
}

export function Fenetre({ titre, onFermer, pied, largeur, children }: Props) {
  const idTitre = useId();
  useEchap(() => onFermer?.(), !!onFermer);
  return (
    <div className="mo open">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={idTitre} style={largeur ? { maxWidth: largeur } : undefined}>
        <div className="m-head">
          <div className="m-title" id={idTitre}>{titre}</div>
          {onFermer && <button type="button" className="m-close" aria-label="Fermer" onClick={onFermer}><Icone nom="x" taille={18} /></button>}
        </div>
        <div className="m-body">{children}</div>
        {pied && <div className="m-foot">{pied}</div>}
      </div>
    </div>
  );
}

/** Page plein écran (fiche détaillée) : barre de navigation avec Retour, puis le document. */
export function PleinEcran({ titre, onRetour, actions, children }: { titre: string; onRetour: () => void; actions?: ReactNode; children: ReactNode }) {
  useEchap(onRetour);
  return (
    <div className="fd open" data-plein-ecran="">
      <div className="fd-nav">
        <button type="button" className="btn-back" onClick={onRetour}><Icone nom="chevron-left" />Retour</button>
        <div className="fd-crumb">{titre}</div>
        {actions}
      </div>
      <div className="fd-content">{children}</div>
    </div>
  );
}
