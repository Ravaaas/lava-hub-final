import { useState } from 'react';
import type { FicheRecette, StatutFR } from '../../domain/types';
import { STATUTS } from '../../domain/fichesRecette';
import { contient, pluriel } from '../../domain/texte';
import { useDonnees } from '../../etat/Donnees';
import { useMoi } from '../../etat/Session';
import { Icone } from '../../ui/Icone';
import { EtiquettesCompactes, Vide } from '../../ui/Puces';
import { FRDetail } from './FRDetail';
import { FRFormulaire } from './FRFormulaire';

export function FichesRecette() {
  const { fichesRecette, pret } = useDonnees();
  const { admin } = useMoi();
  const [statut, setStatut] = useState<StatutFR>('carte');
  const [q, setQ] = useState('');
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [edition, setEdition] = useState<{ fr: FicheRecette | null } | null>(null);

  const duStatut = fichesRecette.filter(f => f.statut === statut);
  const liste = duStatut.filter(f => !q || contient(f.nom, q));
  const tot = duStatut.length;
  const detail = ouverte ? fichesRecette.find(f => f.id === ouverte) : undefined;

  return (
    <>
      <div className="ph">
        <div><div className="ph-title">Fiche Recette</div>
          <div className="ph-sub">{!pret ? 'Chargement…' : tot === 0 ? 'Aucune fiche' : pluriel(tot, 'fiche') + (liste.length !== tot ? ` · ${pluriel(liste.length, 'résultat')}` : '')}</div></div>
        <div className="ph-actions">
          {admin && <button type="button" className="btn btn-p" onClick={() => { setEdition({ fr: null }); }}><Icone nom="plus" />Nouvelle fiche recette</button>}
        </div>
      </div>
      <div className="log-filters" role="tablist">
        {STATUTS.filter(s => admin || !s.adminSeulement).map(s => (
          <button key={s.valeur} type="button" role="tab" aria-selected={statut === s.valeur} className={`log-filter${statut === s.valeur ? ' active' : ''}`} onClick={() => { setStatut(s.valeur); }}>{s.libelle}</button>
        ))}
      </div>
      <div className="sb">
        <div className="si-wrap"><Icone nom="search" />
          <input className="si" type="text" placeholder="Rechercher…" value={q} onChange={e => { setQ(e.target.value); }} /></div>
      </div>
      <div className="fg">
        {!pret ? <div className="es" style={{ gridColumn: '1/-1' }}><div className="spinner" /></div>
          : tot === 0 ? <Vide icone="book" titre="Aucune fiche recette" texte="Aucune fiche dans cette catégorie" />
          : liste.length === 0 ? <Vide icone="search" titre="Aucun résultat" texte="Essaie un autre terme" />
          : liste.map(f => (
            <div key={f.id} className="fc" role="button" tabIndex={0} onClick={() => { setOuverte(f.id); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOuverte(f.id); } }}>
              <div className="fc-top"><div className="fc-name">{f.nom}</div><div className="fc-cat">{pluriel(f.elements.length, 'élément')}</div></div>
              <EtiquettesCompactes liste={f.allergenes} />
            </div>
          ))}
      </div>
      {detail && <FRDetail fr={detail} onFermer={() => { setOuverte(null); }} onModifier={() => { setEdition({ fr: detail }); }} />}
      {edition && <FRFormulaire fr={edition.fr} statutParDefaut={statut} onFermer={() => { setEdition(null); }} />}
    </>
  );
}
