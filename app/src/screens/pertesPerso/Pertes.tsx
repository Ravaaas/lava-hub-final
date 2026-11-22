import { useId, useState } from 'react';
import { RAISONS, UNITES_PERTE, erreurPerte, lireQuantite, peutSupprimerPerte, quantiteFr, type Raison, type UnitePerte } from '../../domain/pertesPerso';
import { ajouterPerte, supprimerPerte } from '../../db/pertesPerso';
import { useDonnees } from '../../etat/Donnees';
import { useMoi } from '../../etat/Session';
import { Choix } from '../../ui/Choix';
import { useConfirmer } from '../../ui/Confirmation';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';
import { Selecteur, enOptions } from '../../ui/Selecteur';
import { BarreJour, usePeriode } from './PertesPerso';

/** Pertes diverses du jour : jamais verrouillées ; chacun supprime les siennes, l'admin toutes. */
export function Pertes({ jour, setJour }: { jour: string; setJour: (d: string) => void }) {
  const { moi, admin } = useMoi();
  const { fichesRecette } = useDonnees();
  const notifier = useNotifier();
  const confirmer = useConfirmer();
  const id = { produit: useId(), quantite: useId(), raison: useId(), precision: useId(), liste: useId() };
  const [produit, setProduit] = useState('');
  const [quantite, setQuantite] = useState('');
  const [unite, setUnite] = useState<UnitePerte>('kg');
  const [raison, setRaison] = useState('');
  const [precision, setPrecision] = useState('');
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);
  const { donnees: d, erreur, recharger } = usePeriode(jour, jour, () => occupe);

  const pertes = (d?.pertes ?? []).filter(p => p.date === jour);
  const suggestions = [...new Set([...(d?.produits ?? []).filter(p => p.actif).map(p => p.nom), ...fichesRecette.filter(f => f.statut !== 'archive').map(f => f.nom)])];

  const choisirProduit = (v: string) => {
    setProduit(v);
    const p = d?.produits.find(x => x.nom === v.trim().toUpperCase());
    if (p) setUnite(p.unite);
  };

  const ajouter = async () => {
    const q = lireQuantite(quantite, 10000);
    const err = erreurPerte({ produit, quantite: q, raison, precision });
    setMessage(err);
    if (err || q === null) return;
    setOccupe(true);
    try {
      const r = await ajouterPerte({ date: jour, produit, quantite: q, unite, raison: raison as Raison, precision, par: moi.prenom, email: moi.email });
      if (!r.ok) { setMessage('Non enregistrée : ' + r.message); return; }
      notifier('Perte enregistrée', 'ok');
      setProduit(''); setQuantite(''); setRaison(''); setPrecision('');
      await recharger();
    } finally { setOccupe(false); }
  };

  const supprimer = async (pid: string, libelle: string) => {
    if (!await confirmer(`Supprimer cette perte ? ${libelle}`)) return;
    const r = await supprimerPerte(pid);
    if (!r.ok) { notifier('Suppression impossible : ' + r.message, 'err'); return; }
    notifier('Perte supprimée');
    await recharger();
  };

  return (
    <>
      <BarreJour jour={jour} setJour={setJour} />
      {erreur && <div className="pp-statut pp-err">Impossible de charger : {erreur}</div>}
      <div className="cs">
        <div className="cs-title">Déclarer une perte</div>
        <div className="cl pp-form">
          <div className="fg2"><label className="fl" htmlFor={id.produit}>Produit ou recette</label>
            <input className="fi2" id={id.produit} list={id.liste} maxLength={80} autoComplete="off" placeholder="ex : SAUMON, SAUCE VIERGE…" value={produit} onChange={e => { choisirProduit(e.target.value); }} />
            <datalist id={id.liste}>{suggestions.map(s => <option key={s} value={s} />)}</datalist></div>
          <div className="fr">
            <div className="fg2"><label className="fl" htmlFor={id.quantite}>Quantité perdue</label>
              <input className="fi2" id={id.quantite} inputMode="decimal" autoComplete="off" placeholder="0" value={quantite} onChange={e => { setQuantite(e.target.value); }} /></div>
            <div className="fg2"><span className="fl">Unité</span>
              <Choix libelle="Unité" options={UNITES_PERTE.map(u => ({ valeur: u, libelle: u }))} valeur={unite} onChange={setUnite} /></div>
          </div>
          <div className="fg2"><label className="fl" htmlFor={id.raison}>Raison</label>
            <Selecteur id={id.raison} libelle="Raison" options={enOptions(RAISONS)} valeur={raison} onChange={setRaison} vide="Choisir une raison" /></div>
          <div className="fg2"><label className="fl" htmlFor={id.precision}>Précision{raison === 'Autre' ? ' *' : ''}</label>
            <input className="fi2" id={id.precision} maxLength={300} autoComplete="off" placeholder={raison === 'Autre' ? 'Explique la raison' : 'Facultatif — ex : livraison du matin'} value={precision} onChange={e => { setPrecision(e.target.value); }} /></div>
          {message && <div className="pp-message" role="alert">{message}</div>}
          <button type="button" className="btn btn-p" disabled={occupe} onClick={() => void ajouter()}><Icone nom="plus" />Ajouter la perte</button>
        </div>
      </div>
      <div className="cs">
        <div className="cs-title">Pertes du jour</div>
        <div className="cl">
          {!d && !erreur && <div className="ci-label">Chargement…</div>}
          {d && !pertes.length && <div className="ci-label">Aucune perte déclarée ce jour-là.</div>}
          {pertes.map(p => (
            <div key={p.id} className="ci pp-perte">
              <div className="pp-nom"><span className="ci-label"><strong>{p.produit}</strong></span>
                <span><span className="tag">{p.raison}</span>{p.precision && <span className="pp-precision">{p.precision}</span>}</span>
                <small>{p.par}{p.heure ? ' · ' + p.heure : ''}</small></div>
              <div className="pp-qte"><strong>{quantiteFr(p.quantite)} {p.unite}</strong>
                {peutSupprimerPerte(p, moi.email, admin) && <button type="button" className="btn-rm" aria-label={`Supprimer la perte ${p.produit}`}
                  onClick={() => void supprimer(p.id, `${p.produit} · ${quantiteFr(p.quantite)} ${p.unite} · ${p.raison}`)}><Icone nom="x" /></button>}</div>
            </div>
          ))}
        </div>
        <div className="ph-sub">Les pertes ne sont jamais verrouillées. Chacun peut supprimer celles qu'il a saisies.</div>
      </div>
    </>
  );
}
