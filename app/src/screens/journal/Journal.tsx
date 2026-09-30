import { useEffect, useState } from 'react';
import type { EvenementJournal } from '../../domain/types';
import { heure, libelleJour, lignesJournal, natureAction, type LigneJournal } from '../../domain/journal';
import { MISES_A_JOUR } from '../../domain/misesAJour';
import { chargerJournal } from '../../db/journal';

type Filtre = 'tout' | 'app' | 'data';

/** Journal : mises à jour de l'application et modifications des données, du plus récent au plus ancien, par jour. */
export function Journal() {
  const [evenements, setEvenements] = useState<EvenementJournal[] | null>(null);
  const [filtre, setFiltre] = useState<Filtre>('tout');
  useEffect(() => { chargerJournal().then(setEvenements, () => { setEvenements([]); }); }, []);

  const lignes = evenements ? lignesJournal(filtre === 'data' ? [] : MISES_A_JOUR, filtre === 'app' ? [] : evenements) : [];
  let jourPrecedent = '';
  const avecJours: ({ jour: string } | LigneJournal)[] = [];
  for (const l of lignes) {
    const d = new Date(l.ts);
    const jour = Number.isNaN(d.getTime()) ? '' : libelleJour(d);
    if (jour && jour !== jourPrecedent) { avecJours.push({ jour }); jourPrecedent = jour; }
    avecJours.push(l);
  }

  return (
    <>
      <div className="ph"><div><div className="ph-title">Journal</div><div className="ph-sub">Mises à jour de l'application et modifications de fiches, dans l'ordre</div></div></div>
      <div className="log-filters" role="tablist">
        {([['tout', 'Tout'], ['app', 'Mises à jour app'], ['data', 'Modifications']] as const).map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={filtre === v} className={`log-filter${filtre === v ? ' active' : ''}`} onClick={() => { setFiltre(v); }}>{l}</button>
        ))}
      </div>
      <div>
        {!evenements && <div className="ph-sub" style={{ padding: '8px 0' }}>Chargement…</div>}
        {evenements && !lignes.length && <div className="ci-label" style={{ color: 'var(--gt)' }}>Aucun événement.</div>}
        {avecJours.map((l, i) => {
          if ('jour' in l) return <div key={i} className="log-day">{l.jour}</div>;
          if (l.type === 'app') return (
            <div key={i} className="log-app">
              <div className="log-app-titre">{l.titre}</div>
              {l.desc && <div className="log-app-desc">{l.desc}</div>}
              <div className="log-app-time">{heure(l.ts)}</div>
            </div>
          );
          const n = natureAction(l.action);
          return (
            <div key={i} className="log-row-wrap">
              <div className="log-row">
                <span className="log-time">{l.nombre > 1 ? `${heure(l.tsDebut)}–${heure(l.ts)}` : heure(l.ts)}</span>
                <span className="log-action" style={{ color: n.couleur }}><span className="log-dot" style={{ background: n.couleur }} />{n.libelle}{l.nombre > 1 ? ` ×${l.nombre}` : ''}</span>
                <span className="log-name">{l.ficheNom}</span>
                {l.par && <span className="log-time" style={{ marginLeft: 'auto' }}>{l.par}</span>}
              </div>
              {l.detail.length > 0 && <div className="log-detail">{l.detail.join(' · ')}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
