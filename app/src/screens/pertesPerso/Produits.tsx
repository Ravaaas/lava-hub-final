import { useId, useState } from 'react';
import { UNITES_PRODUIT, cleProduit, decaler, parCategorie, type ProduitPerso, type UniteProduit } from '../../domain/pertesPerso';
import { enregistrerProduit, retirerProduit } from '../../db/pertesPerso';
import { useDonnees } from '../../etat/Donnees';
import { Choix } from '../../ui/Choix';
import { useConfirmer } from '../../ui/Confirmation';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';
import { aujourdhui } from '../../domain/groupes';
import { usePeriode } from './PertesPerso';
import { ProduitsTrouves } from './ProduitsTrouves';

const JOURS_RATTRAPAGE = 14;   // rattrapage : commentaires des 2 dernières semaines relus pour proposer les produits écrits à la main


/** Liste des produits du repas du personnel (admin). Retirer masque de la saisie sans effacer l'historique. */
export function Produits() {
  const { journal } = useDonnees();
  const notifier = useNotifier();
  const confirmer = useConfirmer();
  const id = { nom: useId(), cat: useId(), liste: useId() };
  const [nom, setNom] = useState('');
  const [unite, setUnite] = useState<UniteProduit>('kg');
  const [categorie, setCategorie] = useState('');
  // la liste des produits vient avec chaque période : les 14 derniers jours servent au rattrapage des commentaires
  const fin = aujourdhui();
  const { donnees: d, recharger } = usePeriode(decaler(fin, -(JOURS_RATTRAPAGE - 1)), fin);
  const produits = d?.produits ?? [];
  const actifs = produits.filter(p => p.actif);
  const retires = produits.filter(p => !p.actif);
  const categories = [...new Set(produits.map(p => p.categorie))];

  const ajouter = async () => {
    const n = nom.trim().toUpperCase().slice(0, 60);
    if (!n) { notifier('Indique le nom du produit', 'err'); return; }
    const cle = cleProduit(n);
    if (actifs.some(p => p.cle === cle)) { notifier('Ce produit est déjà dans la liste', 'err'); return; }
    const p: ProduitPerso = { cle, nom: n, unite, categorie: categorie.trim().slice(0, 40) || 'Autres', actif: true };
    const r = await enregistrerProduit(p);
    if (!r.ok) { notifier('Ajout impossible : ' + r.message, 'err'); return; }
    await journal('création produit repas perso', n);
    notifier('Produit ajouté', 'ok');
    setNom('');
    await recharger();
  };
  const retirer = async (p: ProduitPerso) => {
    if (!await confirmer(`Retirer « ${p.nom} » ? Il disparaît de la saisie ; les quantités déjà notées restent dans les récaps.`, 'Retirer')) return;
    const r = await retirerProduit(p.cle);
    if (!r.ok) { notifier('Retrait impossible : ' + r.message, 'err'); return; }
    await journal('suppression produit repas perso', p.nom);
    notifier('Produit retiré');
    await recharger();
  };
  const remettre = async (p: ProduitPerso) => {
    const r = await enregistrerProduit({ ...p, actif: true });
    if (!r.ok) { notifier('Impossible : ' + r.message, 'err'); return; }
    notifier('Produit remis dans la liste', 'ok');
    await recharger();
  };

  return (
    <>
      <div className="cs">
        <div className="cs-title">Ajouter un produit</div>
        <div className="cl pp-form">
          <div className="fg2"><label className="fl" htmlFor={id.nom}>Nom du produit</label>
            <input className="fi2" id={id.nom} maxLength={60} autoComplete="off" placeholder="ex : BLANC DE POULET" value={nom} onChange={e => { setNom(e.target.value); }} /></div>
          <div className="fr">
            <div className="fg2"><span className="fl">Unité</span>
              <Choix libelle="Unité du produit" options={UNITES_PRODUIT.map(u => ({ valeur: u, libelle: u }))} valeur={unite} onChange={setUnite} /></div>
            <div className="fg2"><label className="fl" htmlFor={id.cat}>Catégorie</label>
              <input className="fi2" id={id.cat} list={id.liste} maxLength={40} autoComplete="off" placeholder="ex : Viandes" value={categorie} onChange={e => { setCategorie(e.target.value); }} />
              <datalist id={id.liste}>{categories.map(c => <option key={c} value={c} />)}</datalist></div>
          </div>
          <button type="button" className="btn btn-p" onClick={() => void ajouter()}><Icone nom="plus" />Ajouter</button>
        </div>
      </div>
      {d && <ProduitsTrouves donnees={d} avecDate modifiable={() => true} recharger={recharger} />}
      {!d && <div className="ph-sub">Chargement…</div>}
      {parCategorie(actifs).map(([cat, liste]) => (
        <div key={cat} className="cl">
          <div className="fsect">{cat}</div>
          {liste.map(p => (
            <div key={p.cle} className="ci"><span className="ci-label">{p.nom} <span className="pp-u">({p.unite})</span></span>
              <button type="button" className="btn btn-d btn-sm" aria-label={`Retirer ${p.nom}`} onClick={() => void retirer(p)}>Retirer</button></div>
          ))}
        </div>
      ))}
      {retires.length > 0 && <div className="cl">
        <div className="fsect">Produits retirés</div>
        {retires.map(p => (
          <div key={p.cle} className="ci"><span className="ci-label" style={{ color: 'var(--ink2)' }}>{p.nom}</span>
            <button type="button" className="btn btn-g btn-sm" aria-label={`Remettre ${p.nom}`} onClick={() => void remettre(p)}>Remettre</button></div>
        ))}
      </div>}
    </>
  );
}
