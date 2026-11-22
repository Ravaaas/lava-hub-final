import { useCallback, useEffect, useRef, useState } from 'react';
import { aujourdhui } from '../../domain/groupes';
import { decaler, jourLong } from '../../domain/pertesPerso';
import { chargerPeriode, surModificationPerso, type Periode } from '../../db/pertesPerso';
import { useMoi } from '../../etat/Session';
import { fenetreOuverte } from '../../ui/Fenetre';
import { Icone } from '../../ui/Icone';
import { RepasPerso } from './RepasPerso';
import { Pertes } from './Pertes';
import { Recap } from './Recap';
import { Produits } from './Produits';

type Vue = 'perso' | 'pertes' | 'recap' | 'produits';

/** Onglet « Pertes & Perso » (cuisine + admin) : repas du personnel, pertes diverses, récap de la semaine, liste des produits. */
export function PertesPerso() {
  const { admin } = useMoi();
  const [vue, setVue] = useState<Vue>('perso');
  const [jour, setJour] = useState(aujourdhui());
  const vues: [Vue, string][] = [['perso', 'Repas perso'], ['pertes', 'Pertes'], ['recap', 'Récap'], ...(admin ? [['produits', 'Produits'] as [Vue, string]] : [])];

  return (
    <>
      <div className="ph"><div><div className="ph-title">Pertes &amp; Perso</div>
        <div className="ph-sub">Repas du personnel et pertes diverses, signés à ton nom</div></div></div>
      <div className="log-filters pp-onglets" role="tablist">
        {vues.map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={vue === v} className={`log-filter${vue === v ? ' active' : ''}`} onClick={() => { setVue(v); }}>{l}</button>
        ))}
      </div>
      {vue === 'perso' && <RepasPerso jour={jour} setJour={setJour} />}
      {vue === 'pertes' && <Pertes jour={jour} setJour={setJour} />}
      {vue === 'recap' && <Recap jour={jour} onOuvrirJour={d => { setJour(d); setVue('perso'); }} />}
      {vue === 'produits' && admin && <Produits />}
    </>
  );
}

/** Données des jours `du` → `au`, rechargées en direct quand quelqu'un d'autre saisit (sauf pendant une saisie). */
export function usePeriode(du: string, au: string, enCours: () => boolean = () => false) {
  const [donnees, setDonnees] = useState<Periode | null>(null);
  const [erreur, setErreur] = useState('');
  const derniere = useRef(0);
  const occupe = useRef(enCours);
  useEffect(() => { occupe.current = enCours; });

  const recharger = useCallback(async () => {
    const n = ++derniere.current;
    try {
      const d = await chargerPeriode(du, au);
      if (n === derniere.current) { setDonnees(d); setErreur(''); }
    } catch (e) {
      if (n === derniere.current) setErreur((e as Error).message || 'erreur réseau');
    }
  }, [du, au]);

  // Lecture de la base (système externe) à chaque changement de période.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDonnees(null); void recharger(); }, [recharger]);

  useEffect(() => {
    let minuterie: number | undefined;
    const plusTard = (ms: number) => {
      window.clearTimeout(minuterie);
      minuterie = window.setTimeout(() => { if (occupe.current() || fenetreOuverte()) plusTard(4000); else void recharger(); }, ms);
    };
    const arreter = surModificationPerso(() => { plusTard(1200); });
    const surVisibilite = () => { if (!document.hidden) plusTard(300); };
    document.addEventListener('visibilitychange', surVisibilite);
    return () => { arreter(); window.clearTimeout(minuterie); document.removeEventListener('visibilitychange', surVisibilite); };
  }, [recharger]);

  return { donnees, erreur, recharger };
}

/** Jour précédent / suivant (jamais au-delà d'aujourd'hui) et choix d'une date. */
export function BarreJour({ jour, setJour }: { jour: string; setJour: (d: string) => void }) {
  const max = aujourdhui();
  return (
    <div className="pp-jour">
      <button type="button" className="btn btn-g pp-fleche" aria-label="Jour précédent" onClick={() => { setJour(decaler(jour, -1)); }}><Icone nom="chevron-left" /></button>
      <div className="pp-jour-txt">
        <strong>{jour === max ? `Aujourd'hui · ${jourLong(jour)}` : jourLong(jour)}</strong>
        <input type="date" aria-label="Choisir une date" value={jour} max={max} onChange={e => { if (e.target.value) setJour(e.target.value > max ? max : e.target.value); }} />
      </div>
      <button type="button" className="btn btn-g pp-fleche" aria-label="Jour suivant" disabled={jour >= max} onClick={() => { setJour(decaler(jour, 1)); }}><Icone nom="chevron-right" /></button>
    </div>
  );
}
