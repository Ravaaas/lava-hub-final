import { useEffect, useId, useState } from 'react';
import type { Element, FicheRecette, StatutFR } from '../../domain/types';
import { STATUTS, allergenesDesElements, diffFicheRecette, estStatut } from '../../domain/fichesRecette';
import { contient } from '../../domain/texte';
import { creerFicheRecette, modifierFicheRecette } from '../../db/fichesRecette';
import { useDonnees } from '../../etat/Donnees';
import { Fenetre } from '../../ui/Fenetre';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';
import { useReordonner } from '../../ui/useReordonner';
import { Cadreur } from './Cadreur';

type Ligne = Element & { cle: number };
let compteur = 0;

export function FRFormulaire({ fr, statutParDefaut, onFermer }: { fr: FicheRecette | null; statutParDefaut: StatutFR; onFermer: () => void }) {
  const { fiches, photo, chargerPhotoDe, oublierPhoto, recharger, journal, setSynchro } = useDonnees();
  const notifier = useNotifier();
  const ids = { nom: useId(), statut: useId() };
  const [nom, setNom] = useState(fr?.nom ?? '');
  const [statut, setStatut] = useState<StatutFR>(fr?.statut ?? statutParDefaut);
  const [lignes, setLignes] = useState<Ligne[]>(() => (fr?.elements ?? []).map(e => ({ ...e, cle: ++compteur })));
  const [recherche, setRecherche] = useState('');
  const [libre, setLibre] = useState('');
  const [occupe, setOccupe] = useState(false);
  // Photo existante : il faut l'avoir chargée avant d'enregistrer, sinon elle serait effacée.
  const photoEnBase = fr ? photo(fr.id) : null;
  const [nouvellePhoto, setNouvellePhoto] = useState<string | null | undefined>(undefined);
  useEffect(() => { if (fr && photoEnBase === undefined) void chargerPhotoDe(fr.id); }, [fr, photoEnBase, chargerPhotoDe]);
  const photoPrete = photoEnBase !== undefined;
  const ordre = useReordonner(lignes, setLignes);

  const elements: Element[] = lignes.map(l => (l.type === 'fiche' ? { type: 'fiche', id: l.id, grammage: l.grammage } : { type: 'libre', texte: l.texte, grammage: l.grammage }));
  const allergenes = allergenesDesElements(elements, fiches);
  const disponibles = fiches.filter(f => !lignes.some(l => l.type === 'fiche' && l.id === f.id) && (!recherche || contient(f.nom, recherche)))
    .sort((a, b) => a.nom.localeCompare(b.nom));
  const changer = (c: number, p: { grammage?: string; texte?: string }) => { setLignes(l => l.map(x => (x.cle === c ? { ...x, ...p } : x))); };
  const ajouterLibre = () => {
    const t = libre.trim();
    if (!t) return;
    setLignes(l => [...l, { type: 'libre', texte: t, grammage: '', cle: ++compteur }]);
    setLibre('');
  };

  const enregistrer = async () => {
    const n = nom.trim();
    if (!n) { notifier('Le nom est obligatoire', 'err'); return; }
    const propres = elements.map(e => (e.type === 'fiche' ? { ...e, grammage: e.grammage.trim() } : { ...e, texte: e.texte.trim(), grammage: e.grammage.trim() }))
      .filter(e => e.type === 'fiche' || e.texte);
    const saisie = { nom: n, statut, elements: propres, photo: nouvellePhoto === undefined ? photoEnBase ?? null : nouvellePhoto, allergenes };
    setOccupe(true); setSynchro(true);
    try {
      const r = fr ? await modifierFicheRecette(fr.id, saisie) : await creerFicheRecette(saisie);
      if (!r.ok) { notifier('Erreur : ' + r.message, 'err'); return; }
      await journal(fr ? 'modification fiche recette' : 'création fiche recette', n, fr ? diffFicheRecette(fr, saisie, fiches) : []);
      notifier(fr ? 'Fiche recette modifiée' : 'Fiche recette enregistrée', 'ok');
      if (fr) oublierPhoto(fr.id);
      onFermer();
      await recharger();
    } finally { setOccupe(false); setSynchro(false); }
  };

  return (
    <Fenetre titre={fr ? `Modifier — ${fr.nom}` : 'Nouvelle fiche recette'} onFermer={onFermer}
      pied={<>
        <button type="button" className="btn btn-g" onClick={onFermer}>Annuler</button>
        <button type="button" className="btn btn-p" disabled={occupe || !photoPrete} onClick={() => void enregistrer()}>Enregistrer</button>
      </>}>
      <div className="fg2"><label className="fl" htmlFor={ids.nom}>Nom du plat *</label>
        <input className="fi2" id={ids.nom} type="text" placeholder="ex: Cassolette de Saint-Jacques" value={nom} onChange={e => { setNom(e.target.value); }} /></div>
      <div className="fg2"><label className="fl" htmlFor={ids.statut}>Statut</label>
        <select className="fsel" id={ids.statut} value={statut} onChange={e => { if (estStatut(e.target.value)) setStatut(e.target.value); }}>
          {STATUTS.map(s => <option key={s.valeur} value={s.valeur}>{s.libelle}</option>)}
        </select></div>
      <div className="fg2"><span className="fl">Photo</span>
        {photoPrete ? <Cadreur initiale={photoEnBase ?? null} onChange={setNouvellePhoto} /> : <div className="spinner" style={{ margin: 0 }} />}
      </div>
      <div className="fg2"><span className="fl">Allergènes <span style={{ fontWeight: 400, color: 'var(--gt)', fontSize: '0.875rem' }}>(auto, d'après les recettes liées)</span></span>
        <div className="fi2" style={{ minHeight: '2.3rem', display: 'flex', alignItems: 'center', color: 'var(--noir)' }}>{allergenes.length ? allergenes.join(', ') : '—'}</div></div>

      <div className="fsect">Recettes principales</div>
      <div className="si-wrap" style={{ marginBottom: '0.6rem' }}>
        <input className="si" style={{ paddingLeft: '0.85rem' }} type="text" placeholder="Rechercher une fiche technique…" value={recherche} onChange={e => { setRecherche(e.target.value); }} />
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.75rem' }}>
        {disponibles.length === 0 && <div className="ci-label" style={{ color: 'var(--gt)' }}>Aucune fiche technique disponible</div>}
        {disponibles.map(f => (
          <div key={f.id} className="ci"><span className="ci-label">{f.nom}</span>
            <button type="button" className="btn btn-o btn-sm" onClick={() => { setLignes(l => [...l, { type: 'fiche', id: f.id, grammage: '', cle: ++compteur }]); }}><Icone nom="plus" />Ajouter</button>
          </div>
        ))}
      </div>

      <div className="fsect">Sélection (ordre de dressage)</div>
      <div className="il">
        {lignes.map((l, i) => (
          <div key={l.cle} {...ordre.ligne(i)} className={`ir${ordre.glisse === i ? ' dragging' : ''}`} style={{ gridTemplateColumns: '20px 1fr 110px 36px' }}>
            <div {...ordre.poignee(i)}><Icone nom="grip" /></div>
            {l.type === 'fiche'
              ? <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--noir)' }}>{fiches.find(f => f.id === l.id)?.nom ?? '(fiche supprimée)'}</div>
              : <input className="fi2" type="text" placeholder="Élément libre" style={{ padding: '0.3rem 0.5rem', fontSize: '0.875rem', fontWeight: 500 }} value={l.texte} onChange={e => { changer(l.cle, { texte: e.target.value }); }} />}
            <input className="fi2" type="text" placeholder="Grammage" style={{ padding: '0.3rem 0.5rem', fontSize: '0.875rem' }} value={l.grammage} onChange={e => { changer(l.cle, { grammage: e.target.value }); }} />
            <button type="button" className="btn-rm" aria-label="Retirer" onClick={() => { setLignes(x => x.filter(y => y.cle !== l.cle)); }}><Icone nom="x" /></button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
        <input className="fi2" type="text" placeholder="Élément libre (ex: sésame noir en topping)" style={{ flex: 1 }} value={libre}
          onChange={e => { setLibre(e.target.value); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterLibre(); } }} />
        <button type="button" className="btn btn-o btn-sm" onClick={ajouterLibre}><Icone nom="plus" />Ajouter</button>
      </div>
    </Fenetre>
  );
}
