import { useEffect, useState } from 'react';
import type { Fiche } from '../../domain/types';
import { aDesQuantitesNettes, fichesUtilisant, quantiteAffichee } from '../../domain/fiches';
import { fichesRecetteUtilisant } from '../../domain/fichesRecette';
import { creerFiche, supprimerFiche } from '../../db/fiches';
import { useDonnees } from '../../etat/Donnees';
import { useMoi } from '../../etat/Session';
import { PleinEcran } from '../../ui/Fenetre';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';
import { useConfirmer } from '../../ui/Confirmation';
import { ouvrirPdf } from '../../pdf/commun';
import { pdfFiche } from '../../pdf/fiche';

const Badge = ({ texte }: { texte: string }) => (
  <span style={{ display: 'inline-block', marginLeft: 6, fontSize: 11, background: '#FBE8E7', color: '#B5433C', padding: '2px 6px', borderRadius: 10, fontWeight: 700, letterSpacing: '0.06em', verticalAlign: 'middle', border: '1px solid #E8C4C2' }}>{texte}</span>
);

interface Props { fiche: Fiche; voisines: readonly Fiche[]; onOuvrir: (id: string) => void; onFermer: () => void; onModifier: () => void }

export function FicheDetail({ fiche: f, voisines, onOuvrir, onFermer, onModifier }: Props) {
  const { fiches, fichesRecette, recharger, journal, setSynchro } = useDonnees();
  const { admin } = useMoi();
  const notifier = useNotifier();
  const confirmer = useConfirmer();
  const [portions, setPortions] = useState('1');
  const [mode, setMode] = useState<'brut' | 'net'>('brut');
  const coef = parseFloat(portions) || 1;

  // Flèches gauche / droite : fiche précédente / suivante de la liste affichée.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || document.querySelector('.mo.open')) return;   // pas quand une fenêtre est ouverte par-dessus
      const tag = document.activeElement?.tagName.toLowerCase() ?? '';
      if (['input', 'textarea', 'select'].includes(tag)) return;
      const i = voisines.findIndex(x => x.id === f.id);
      const suivante = voisines[i + (e.key === 'ArrowLeft' ? -1 : 1)];
      if (i >= 0 && suivante) { e.preventDefault(); onOuvrir(suivante.id); }
    };
    document.addEventListener('keydown', surTouche);
    return () => { document.removeEventListener('keydown', surTouche); };
  }, [f.id, voisines, onOuvrir]);

  const imprimer = async () => { if (!await ouvrirPdf(o => pdfFiche(o, f, coef))) notifier('Erreur à la génération du PDF', 'err'); };

  const copier = async () => {
    onFermer();
    setSynchro(true);
    const r = await creerFiche({ ...f, nom: 'COPIE DE ' + f.nom });
    setSynchro(false);
    if (!r.ok) { notifier('Duplication impossible : ' + r.message, 'err'); return; }
    notifier('Recette dupliquée', 'ok');
    await recharger();
  };

  const supprimer = async () => {
    const dependantes = fichesUtilisant(fiches, f.id), frs = fichesRecetteUtilisant(fichesRecette, f.id);
    const notes = [
      dependantes.length ? `Elle est utilisée comme recette dans : ${dependantes.map(x => x.nom).join(', ')} (le lien sera retiré, l'ingrédient restera en texte simple).` : '',
      frs.length ? `Elle apparaît dans les fiches recette : ${frs.map(x => x.nom).join(', ')} (elle en disparaîtra).` : '',
    ].filter(Boolean);
    if (!await confirmer(notes.length ? `"${f.nom}" — ${notes.join(' ')} Continuer ?` : 'Supprimer cette fiche ?')) return;
    onFermer();
    setSynchro(true);
    const r = await supprimerFiche(f.id);
    setSynchro(false);
    if (!r.ok) { notifier('Suppression impossible : ' + r.message, 'err'); return; }
    await journal('suppression', f.nom);
    notifier('Fiche supprimée');
    await recharger();
  };

  return (
    <PleinEcran titre={f.nom} onRetour={onFermer} actions={<>
      <div className="coef"><span aria-hidden="true">×</span>
        <input type="number" min="0.1" step="0.1" value={portions} aria-label="Nombre de portions" onChange={e => { setPortions(e.target.value); }} /><span>portions</span>
      </div>
      {aDesQuantitesNettes(f) && (
        <div className="bn-toggle">
          <button type="button" className={`bn-btn${mode === 'brut' ? ' active' : ''}`} onClick={() => { setMode('brut'); }}>Brut</button>
          <button type="button" className={`bn-btn${mode === 'net' ? ' active' : ''}`} onClick={() => { setMode('net'); }}>Net</button>
        </div>
      )}
      {admin && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-g btn-sm" onClick={() => void imprimer()}><Icone nom="printer" />Imprimer</button>
          <button type="button" className="btn btn-g btn-sm" onClick={() => void copier()}>Copier</button>
          <button type="button" className="btn btn-g btn-sm" onClick={onModifier}>Modifier</button>
          <button type="button" className="btn btn-d btn-sm" onClick={() => void supprimer()}>Supprimer</button>
        </div>
      )}
    </>}>
      <div className="fdoc">
        <div className="fdoc-hdr"><div className="fdoc-nom">{f.nom}</div><div className="fdoc-sub">Fiche Technique</div></div>
        <div className="fdoc-body">
          <hr className="fdoc-sep" />
          <table className="fdoc-table">
            <thead><tr><th>Ingrédient</th><th style={{ textAlign: 'right' }}>Quantité</th></tr></thead>
            <tbody>
              {f.ingredients.map((i, n) => {
                const lien = i.ficheId && fiches.some(x => x.id === i.ficheId) ? i.ficheId : null;
                const badge = i.brut ? <Badge texte={mode === 'net' && i.quantite_net ? 'NET' : 'BRUT'} /> : null;
                return (
                  <tr key={n}>
                    {lien
                      ? <td style={{ cursor: 'pointer' }} role="link" tabIndex={0} onClick={() => { onOuvrir(lien); }} onKeyDown={e => { if (e.key === 'Enter') onOuvrir(lien); }}>
                          <span style={{ color: '#B5433C', textDecoration: 'underline', fontWeight: 600 }}>{i.nom.toUpperCase()}</span>{badge}</td>
                      : <td>{i.nom.toUpperCase()}{badge}</td>}
                    <td>{quantiteAffichee(i, coef, mode)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="fdoc-ptitle">Process</div>
          <div className="fdoc-steps">
            {f.process.map((s, n) => <div key={n} className="fdoc-step"><div className="fdoc-snum">{n + 1}</div><div className="fdoc-stxt">{s}</div></div>)}
          </div>
          <div className="fdoc-footer">
            <div><div className="fdoc-fl">Quantité nette</div><div className="fdoc-fv">{f.quantite_nette || '—'}</div></div>
            <div style={{ textAlign: 'right' }}><div className="fdoc-fl">Conditionnement</div>
              <div className="fdoc-fv">{f.conditionnement.length ? f.conditionnement.map((c, n) => <div key={n}>{c}</div>) : '—'}</div></div>
          </div>
        </div>
      </div>
    </PleinEcran>
  );
}
