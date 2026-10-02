import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useEchap } from './Fenetre';
import { Icone } from './Icone';

export type OptionSelecteur = { valeur: string; libelle: string };

/** Choix dans une liste (à la place du menu déroulant du navigateur) : liste flottante sur ordinateur, feuille en bas sur téléphone,
 *  recherche au-delà de 8 options. `vide` = texte gris du choix vide, proposé en tête de liste. */
export function Selecteur({ id, libelle, options, valeur, onChange, vide, className = '', style }: {
  id?: string; libelle?: string; options: readonly OptionSelecteur[]; valeur: string; onChange: (v: string) => void;
  vide?: string | undefined; className?: string; style?: CSSProperties;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [filtre, setFiltre] = useState('');
  const [pos, setPos] = useState<CSSProperties>({});
  const racine = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const liste = vide !== undefined ? [{ valeur: '', libelle: vide }, ...options] : options;
  const choisi = liste.find(o => o.valeur === valeur);
  const f = filtre.trim().toLowerCase();
  const visibles = f ? liste.filter(o => o.libelle.toLowerCase().includes(f)) : liste;

  const fermer = (rendreFocus = true) => { setOuvert(false); setFiltre(''); if (rendreFocus) bouton.current?.focus(); };
  useEchap(fermer, ouvert);
  useEffect(() => {
    if (!ouvert) return;
    const pop = racine.current?.querySelector<HTMLElement>('.sel-cherche') ?? racine.current?.querySelector<HTMLElement>('[aria-selected=true]');
    pop?.focus({ preventScroll: true });
    const dehors = (e: Event) => { if (!racine.current?.contains(e.target as Node)) fermer(false); };
    const ordinateur = !matchMedia('(max-width: 600px)').matches;   // sur téléphone, la feuille ne bouge pas avec la page
    document.addEventListener('pointerdown', dehors);
    if (ordinateur) window.addEventListener('scroll', dehors, true);
    return () => { document.removeEventListener('pointerdown', dehors); window.removeEventListener('scroll', dehors, true); };
  }, [ouvert]);

  const ouvrir = () => {
    const r = bouton.current?.getBoundingClientRect();
    if (!r) return;
    const largeur = Math.max(r.width, 220), enBas = innerHeight - r.bottom > 320 || r.top < innerHeight - r.bottom;
    setPos({ left: Math.max(8, Math.min(r.left, innerWidth - largeur - 8)), width: largeur, ...(enBas ? { top: r.bottom + 6 } : { bottom: innerHeight - r.top + 6 }) });
    setOuvert(true);
  };
  const choisir = (v: string) => { onChange(v); fermer(); };
  const fleches = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && visibles[0]) { e.preventDefault(); choisir(visibles[0].valeur); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const l = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.sel-opt')];
    const i = l.findIndex(b => b === document.activeElement);
    l[Math.max(0, Math.min(l.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  };

  return (
    <div className={`sel ${className}`} ref={racine} style={style}>
      <button ref={bouton} id={id} type="button" className="fsel sel-btn" aria-label={id ? undefined : libelle}
        aria-haspopup="listbox" aria-expanded={ouvert} onClick={() => { if (ouvert) fermer(); else ouvrir(); }}>
        <span className={!valeur && vide !== undefined ? 'sel-val sel-vide' : 'sel-val'}>{choisi?.libelle ?? valeur}</span>
      </button>
      {ouvert && <>
        <div className="sel-voile" onClick={() => { fermer(); }} />
        <div className="sel-pop" style={pos} role="listbox" aria-label={libelle} onKeyDown={fleches}>
          {liste.length > 8 && <input className="fi2 sel-cherche" type="search" placeholder="Rechercher…" aria-label="Rechercher dans la liste" value={filtre} onChange={e => { setFiltre(e.target.value); }} />}
          <div className="sel-liste">
            {visibles.map(o => (
              <button key={o.valeur} type="button" role="option" aria-selected={o.valeur === valeur} className={`sel-opt${o.valeur === '' && vide !== undefined ? ' sel-vide' : ''}`}
                onClick={() => { choisir(o.valeur); }}>
                <span>{o.libelle}</span>{o.valeur === valeur && <Icone nom="check" taille={16} />}
              </button>
            ))}
            {!visibles.length && <div className="sel-rien">Aucun résultat</div>}
          </div>
        </div>
      </>}
    </div>
  );
}

/** Liste de textes → options (libellé = valeur), avec la valeur actuelle en tête si elle n'y est plus. */
export const enOptions = (l: readonly string[], actuelle = ''): OptionSelecteur[] =>
  (actuelle && !l.includes(actuelle) ? [actuelle, ...l] : l).map(v => ({ valeur: v, libelle: v }));
