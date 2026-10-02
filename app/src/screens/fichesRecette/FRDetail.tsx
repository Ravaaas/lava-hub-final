import { useEffect } from 'react';
import type { FicheRecette } from '../../domain/types';
import { elementsResolus, libelleStatut } from '../../domain/fichesRecette';
import { supprimerFicheRecette } from '../../db/fichesRecette';
import { useDonnees } from '../../etat/Donnees';
import { useMoi } from '../../etat/Session';
import { PleinEcran } from '../../ui/Fenetre';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';
import { useConfirmer } from '../../ui/Confirmation';
import { Etiquettes } from '../../ui/Puces';
import { ouvrirPdf } from '../../pdf/commun';
import { pdfFicheRecette } from '../../pdf/ficheRecette';

export function FRDetail({ fr, onFermer, onModifier }: { fr: FicheRecette; onFermer: () => void; onModifier: () => void }) {
  const { fiches, photo, chargerPhotoDe, recharger, journal, setSynchro } = useDonnees();
  const { admin } = useMoi();
  const notifier = useNotifier();
  const confirmer = useConfirmer();
  const image = photo(fr.id);

  useEffect(() => { if (image === undefined) void chargerPhotoDe(fr.id); }, [fr.id, image, chargerPhotoDe]);

  const imprimer = async () => {
    const p = image === undefined ? await chargerPhotoDe(fr.id) : image;
    if (!await ouvrirPdf(o => pdfFicheRecette(o, fr, p, fiches))) notifier('Erreur à la génération du PDF', 'err');
  };
  const supprimer = async () => {
    if (!await confirmer('Supprimer cette fiche recette ?')) return;
    onFermer();
    setSynchro(true);
    const r = await supprimerFicheRecette(fr.id);
    setSynchro(false);
    if (!r.ok) { notifier('Suppression impossible : ' + r.message, 'err'); return; }
    await journal('suppression fiche recette', fr.nom);
    notifier('Fiche recette supprimée');
    await recharger();
  };

  const entrees = elementsResolus(fr, fiches);
  return (
    <PleinEcran titre={fr.nom} onRetour={onFermer} actions={admin && (
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-g btn-sm" onClick={() => void imprimer()}><Icone nom="printer" />Imprimer</button>
        <button type="button" className="btn btn-g btn-sm" onClick={onModifier}>Modifier</button>
        <button type="button" className="btn btn-d btn-sm" onClick={() => void supprimer()}>Supprimer</button>
      </div>
    )}>
      <div className="fdoc">
        <div className="fdoc-hdr">
          <div className="fdoc-sur">Fiche recette</div>
          <div className="fdoc-nom">{fr.nom}</div>
          <div className="fdoc-cles"><span>{libelleStatut(fr.statut)}</span></div>
          {fr.allergenes.length > 0 && <div className="fr-allerg-sub"><span className="fr-allerg-sub-lbl">Allergènes</span><Etiquettes liste={fr.allergenes} /></div>}
          {image && (
            // Cadre 16/10 : la photo entière, les bords comblés par une version floutée d'elle-même.
            <div style={{ position: 'relative', overflow: 'hidden', aspectRatio: '16/10', maxHeight: 340, width: '100%', borderRadius: 12, marginTop: '1.25rem' }}>
              <img src={image} alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(24px) brightness(.85)', transform: 'scale(1.1)' }} />
              <img src={image} alt={`Photo : ${fr.nom}`} style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          )}
        </div>
        <div className="fdoc-body">
          <hr className="fdoc-sep" />
          {entrees.length > 0 && <div className="fr-sr-title">Éléments</div>}
          <div className="fr-sr-list">
            {entrees.length === 0 && <div className="ci-label" style={{ color: 'var(--gt)' }}>Aucun élément lié</div>}
            {entrees.map(({ fiche: f, element, nom }, n) => (
              <div key={n} className="fr-sr-card">
                <div className="fr-sr-head">
                  <span className="fr-sr-badge">{n + 1}</span><span className="fr-sr-name">{nom}</span>
                  {element.grammage && <span className="fr-sr-gram">{element.grammage}</span>}
                  {f && f.allergenes.length > 0 && <div className="fr-sr-allerg"><Etiquettes liste={f.allergenes} /></div>}
                </div>
                {f && <>
                  <table className="fdoc-table">
                    <thead><tr><th>Ingrédient</th><th style={{ textAlign: 'right' }}>Quantité</th></tr></thead>
                    <tbody>{f.ingredients.map((i, k) => <tr key={k}><td>{i.nom.toUpperCase()}</td><td>{i.unite === 'pm' ? 'pm' : i.quantite ? `${i.quantite} ${i.unite}` : '—'}</td></tr>)}</tbody>
                  </table>
                  {f.process.length > 0 && <>
                    <div className="fdoc-ptitle" style={{ margin: '1rem 1rem 0.5rem' }}>Process</div>
                    <div className="fdoc-steps">{f.process.map((s, k) => <div key={k} className="fdoc-step"><div className="fdoc-snum">{k + 1}</div><div className="fdoc-stxt">{s}</div></div>)}</div>
                  </>}
                </>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </PleinEcran>
  );
}
