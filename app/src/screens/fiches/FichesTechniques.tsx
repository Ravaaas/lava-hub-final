import { useState } from 'react';
import { useDonnees } from '../../etat/Donnees';
import { useMoi } from '../../etat/Session';
import { contient, pluriel } from '../../domain/texte';
import type { Fiche } from '../../domain/types';
import { Icone } from '../../ui/Icone';
import { Vide } from '../../ui/Puces';
import { Selecteur, enOptions } from '../../ui/Selecteur';
import { FicheDetail } from './FicheDetail';
import { FicheFormulaire } from './FicheFormulaire';

/** Recherche par nom de fiche ou par ingrédient, filtre par catégorie. */
export function fichesFiltrees(fiches: readonly Fiche[], q: string, categorie: string): Fiche[] {
  return fiches.filter(f => (!q || contient(f.nom, q) || f.ingredients.some(i => contient(i.nom, q))) && (!categorie || f.categorie === categorie));
}

export function FichesTechniques() {
  const { fiches, reglages, pret } = useDonnees();
  const { admin } = useMoi();
  const [q, setQ] = useState('');
  const [categorie, setCategorie] = useState('');
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [edition, setEdition] = useState<{ fiche: Fiche | null } | null>(null);

  const liste = fichesFiltrees(fiches, q, categorie);
  const tot = fiches.length;
  const sousTitre = !pret ? 'Chargement…' : tot === 0 ? 'Aucune fiche' : pluriel(tot, 'fiche') + (liste.length !== tot ? ` · ${pluriel(liste.length, 'résultat')}` : '');
  const detail = ouverte ? fiches.find(f => f.id === ouverte) : undefined;

  return (
    <>
      <div className="ph">
        <div><div className="ph-title">Fiche Technique</div><div className="ph-sub">{sousTitre}</div></div>
        <div className="ph-actions">
          {admin && <button type="button" className="btn btn-p" onClick={() => { setEdition({ fiche: null }); }}><Icone nom="plus" />Nouvelle fiche</button>}
        </div>
      </div>
      <div className="sb">
        <div className="si-wrap">
          <Icone nom="search" />
          <input className="si" type="text" placeholder="Rechercher…" value={q} onChange={e => { setQ(e.target.value); }} />
        </div>
        <Selecteur className="sel-filtre" libelle="Catégorie" options={[{ valeur: '', libelle: 'Toutes les catégories' }, ...enOptions(reglages.categories)]} valeur={categorie} onChange={setCategorie} />
      </div>
      <div className="fg">
        {!pret ? <div className="es" style={{ gridColumn: '1/-1' }}><div className="spinner" /></div>
          : tot === 0 ? <Vide icone="file" titre="Aucune fiche" texte="Crée ta première fiche" />
          : liste.length === 0 ? <Vide icone="search" titre="Aucun résultat" texte="Essaie un autre terme" />
          : liste.map(f => (
            <div key={f.id} className="fc" role="button" tabIndex={0} onClick={() => { setOuverte(f.id); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOuverte(f.id); } }}>
              <div className="fc-top"><div className="fc-name">{f.nom}</div><div className="fc-cat">{f.categorie || 'Sans catégorie'}</div></div>
            </div>
          ))}
      </div>
      {detail && (
        <FicheDetail key={detail.id} fiche={detail} voisines={liste} onOuvrir={setOuverte} onFermer={() => { setOuverte(null); }}
          onModifier={() => { setEdition({ fiche: detail }); }} />
      )}
      {edition && <FicheFormulaire fiche={edition.fiche} onFermer={() => { setEdition(null); }} />}
    </>
  );
}
