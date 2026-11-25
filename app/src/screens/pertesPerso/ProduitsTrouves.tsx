import { useId, useState } from 'react';
import { jourLong, propositionsDesCommentaires, quantiteFr, type PropositionPerso } from '../../domain/pertesPerso';
import { pluriel } from '../../domain/texte';
import { enregistrerProduit, enregistrerQuantites, type Periode } from '../../db/pertesPerso';
import { useDonnees } from '../../etat/Donnees';
import { useMoi } from '../../etat/Session';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';
import { Selecteur } from '../../ui/Selecteur';

// Propositions écartées : gardées dans ce navigateur (identifiants « date|clé »), sans rien écrire dans la base.
const CLE_IGNORES = 'lava_perso_ignores';
const lireIgnores = (): Set<string> => {
  try { const v: unknown = JSON.parse(localStorage.getItem(CLE_IGNORES) ?? '[]'); return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []); }
  catch { return new Set(); }
};
const garderIgnores = (s: Set<string>) => {
  try { localStorage.setItem(CLE_IGNORES, JSON.stringify([...s].slice(-500))); } catch { /* stockage indisponible */ }
};

/** Encadré « Produits trouvés dans les commentaires » : chaque produit écrit avec une quantité dans un commentaire est proposé ;
 *  « Ajouter » crée la case si elle manque (admin) et reporte la quantité du jour, « Ignorer » écarte la proposition.
 *  Rien n'est enregistré sans ce clic. `modifiable(date)` : la saisie de ce jour est ouverte pour moi. */
export function ProduitsTrouves({ donnees, modifiable, avecDate = false, recharger }: {
  donnees: Periode; modifiable: (date: string) => boolean; avecDate?: boolean; recharger: () => Promise<void>;
}) {
  const { moi, admin } = useMoi();
  const { journal } = useDonnees();
  const notifier = useNotifier();
  const idTitre = useId();
  const [ignores, setIgnores] = useState(lireIgnores);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState('');
  const propositions = propositionsDesCommentaires(donnees.commentaires, donnees.produits, donnees.saisies, ignores);
  if (!propositions.length) return null;
  const valides = new Set(donnees.validations.map(v => v.date));
  const listeCategories = [...new Set([...donnees.produits.map(p => p.categorie), ...propositions.map(p => p.categorie), 'Autres'])].sort((a, b) => a.localeCompare(b, 'fr'));

  const ignorer = (p: PropositionPerso) => {
    const s = new Set(ignores).add(p.id);
    garderIgnores(s);
    setIgnores(s);
  };
  const ajouter = async (p: PropositionPerso) => {
    setEnCours(p.id);
    try {
      if (!p.produit || !p.produit.actif) {
        const categorie = categories[p.id] ?? p.categorie;
        const r = await enregistrerProduit(p.produit ? { ...p.produit, actif: true } : { cle: p.cle, nom: p.nom, unite: p.unite, categorie, actif: true });
        if (!r.ok) { notifier('Ajout impossible : ' + r.message, 'err'); return; }
        await journal(p.produit ? 'remise produit repas perso' : 'création produit repas perso', `${p.nom} (trouvé dans le commentaire de ${p.auteur})`);
      }
      const r = await enregistrerQuantites(p.date, [[p.cle, p.quantite]], moi);
      if (!r.ok) { notifier('Quantité non enregistrée : ' + r.message, 'err'); return; }
      notifier(`${p.nom} : ${quantiteFr(p.quantite)} ${p.unite} ajouté${p.produit?.actif ? '' : ' à la liste'}`, 'ok');
      await recharger();
    } finally { setEnCours(''); }
  };

  return (
    <section className="cl pp-trouves" aria-labelledby={idTitre}>
      <div className="fsect" id={idTitre}>Produits trouvés dans les commentaires</div>
      <div className="ci pp-trouves-aide">
        {pluriel(propositions.length, 'produit écrit', 'produits écrits')} avec une quantité. Vérifie avant d'ajouter : le texte peut être mal lu.
        {' '}Un produit ajouté devient une case de la liste pour les jours suivants.
      </div>
      {propositions.map(p => {
        const nouveau = !p.produit || !p.produit.actif;
        const ouvert = modifiable(p.date);
        const raison = p.conflit || (!ouvert ? 'Journée validée : seul un admin peut corriger.' : nouveau && !admin ? 'Pas encore dans la liste : un admin peut l\'ajouter.' : '');
        return (
          <div key={p.id} className="ci pp-trouve">
            <div className="pp-nom">
              <span className="ci-label">{p.nom} <span className="pp-trouve-qte">{quantiteFr(p.quantite)} {p.unite}</span></span>
              <small>{[avecDate ? jourLong(p.date) : '', `écrit par ${p.auteur}`, nouveau ? (p.produit ? 'produit retiré, à remettre' : 'nouveau produit') : 'déjà dans la liste', avecDate && valides.has(p.date) ? 'journée validée' : ''].filter(Boolean).join(' · ')}</small>
              {raison && <small className="pp-message">{raison}</small>}
            </div>
            <div className="pp-trouve-actions">
              {nouveau && !p.produit && admin
                ? <Selecteur libelle={`Catégorie de ${p.nom}`} className="pp-trouve-cat" options={listeCategories.map(c => ({ valeur: c, libelle: c }))}
                    valeur={categories[p.id] ?? p.categorie} onChange={v => { setCategories(c => ({ ...c, [p.id]: v })); }} />
                : <span className="pp-trouve-catfixe">{p.categorie}</span>}
              {!raison && <button type="button" className="btn btn-p btn-sm" aria-label={`Ajouter ${p.nom}`} disabled={enCours !== ''} onClick={() => void ajouter(p)}><Icone nom="plus" />Ajouter</button>}
              <button type="button" className="btn btn-g btn-sm" aria-label={`Ignorer ${p.nom}`} onClick={() => { ignorer(p); }}>Ignorer</button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
