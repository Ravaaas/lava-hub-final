import { useEffect, useState } from 'react';
import { aujourdhui } from '../../domain/groupes';
import { JOURS_COURTS, decaler, jourCourt, joursSemaine, lundi, parCategorie, quantiteFr, recapSemaine } from '../../domain/pertesPerso';
import { pluriel } from '../../domain/texte';
import { envoyerRecap, recapDejaEnvoye } from '../../db/pertesPerso';
import { useDonnees } from '../../etat/Donnees';
import { useMoi } from '../../etat/Session';
import { useConfirmer } from '../../ui/Confirmation';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';
import { usePeriode } from './PertesPerso';

/** Récap de la semaine (lundi → dimanche) : quantités par jour, pertes, commentaires. Imprimable sur A4 et envoyé par email. */
export function Recap({ jour, onOuvrirJour }: { jour: string; onOuvrirJour: (d: string) => void }) {
  const { admin } = useMoi();
  const { journal } = useDonnees();
  const notifier = useNotifier();
  const confirmer = useConfirmer();
  const [semaine, setSemaine] = useState(lundi(jour));
  const jours = joursSemaine(semaine);
  const dimanche = jours[6] ?? semaine;
  const { donnees: d, erreur } = usePeriode(semaine, dimanche);
  const [envoye, setEnvoye] = useState<{ le: string; a: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!admin) return;
    let actif = true;
    recapDejaEnvoye(semaine).then(r => { if (actif) setEnvoye(r); }, () => { if (actif) setEnvoye(null); });
    return () => { actif = false; };
  }, [admin, semaine]);

  const valides = new Set((d?.validations ?? []).map(v => v.date));
  const lignes = d ? recapSemaine(semaine, d.saisies, d.produits) : [];
  const pertes = d?.pertes ?? [];
  const commentaires = d?.commentaires ?? [];
  const nbValides = jours.filter(j => valides.has(j)).length;
  const periode = `${jourCourt(semaine)} au ${jourCourt(dimanche)}`;

  const envoyer = async () => {
    if (envoye && !await confirmer(`Le récap de cette semaine a déjà été envoyé à ${envoye.a}. Le renvoyer ?`, 'Renvoyer')) return;
    setEnvoi(true);
    try {
      const r = await envoyerRecap(semaine);
      if (!r.ok) { notifier('Récap non envoyé : ' + r.message, 'err'); return; }
      await journal('envoi récap pertes & perso', `Semaine du ${periode}`);
      notifier(`Récap envoyé${r.destinataire ? ' à ' + r.destinataire : ''}`, 'ok');
      setEnvoye(await recapDejaEnvoye(semaine));
    } finally { setEnvoi(false); }
  };

  return (
    <>
      <div className="pp-jour">
        <button type="button" className="btn btn-g pp-fleche" aria-label="Semaine précédente" onClick={() => { setSemaine(decaler(semaine, -7)); }}><Icone nom="chevron-left" /></button>
        <div className="pp-jour-txt"><strong>Semaine du {periode}</strong></div>
        <button type="button" className="btn btn-g pp-fleche" aria-label="Semaine suivante" disabled={dimanche >= aujourdhui()} onClick={() => { setSemaine(decaler(semaine, 7)); }}><Icone nom="chevron-right" /></button>
      </div>
      {erreur && <div className="pp-statut pp-err">Impossible de charger : {erreur}</div>}
      <div className="pp-semaine" aria-label="Jours de la semaine">
        {jours.map((j, i) => (
          <button key={j} type="button" className={`pp-jourbtn${valides.has(j) ? ' pp-valide' : ''}`} disabled={j > aujourdhui()} onClick={() => { onOuvrirJour(j); }}
            aria-label={`${JOURS_COURTS[i] ?? ''} ${jourCourt(j)}${valides.has(j) ? ', validé' : ', non validé'}`}>
            <span>{JOURS_COURTS[i]}</span><strong>{j.slice(8)}</strong></button>
        ))}
      </div>
      <div className="pp-actions">
        <button type="button" className="btn btn-g" onClick={() => { window.print(); }}><Icone nom="printer" />Imprimer</button>
        {admin && <button type="button" className="btn btn-p" disabled={envoi || nbValides < 7} onClick={() => void envoyer()}>
          {envoye ? 'Renvoyer le récap par email' : 'Envoyer le récap par email'}</button>}
      </div>
      {admin && <div className="ph-sub">{nbValides < 7
        ? `L'envoi par email est possible quand les 7 jours sont validés (${nbValides}/7).`
        : envoye ? `Récap envoyé le ${new Date(envoye.le).toLocaleDateString('fr-FR')} à ${envoye.a}.` : 'Semaine complète : le récap peut être envoyé.'}</div>}

      <div className="fdoc pp-fdoc">
        <div className="fdoc-hdr"><div className="fdoc-sur">Récap Pertes &amp; Perso</div><div className="fdoc-nom">Semaine du {periode}</div>
          <div className="fdoc-cles">{[`${nbValides}/7 jours validés`, pluriel(lignes.length, 'produit utilisé', 'produits utilisés'), pluriel(pertes.length, 'perte déclarée', 'pertes déclarées')].map(t => <span key={t}>{t}</span>)}</div>
        </div>
        <div className="fdoc-body">
          <hr className="fdoc-sep" />
          <div className="fdoc-ptitle">Repas perso — quantités utilisées</div>
          {!d && !erreur && <div className="fdoc-notes">Chargement…</div>}
          {d && !lignes.length && <div className="fdoc-notes">Aucune quantité saisie cette semaine.</div>}
          {lignes.length > 0 && <div className="pp-tableau"><table className="fdoc-table pp-table">
            <thead><tr><th>Produit</th>{jours.map((j, i) => <th key={j}>{JOURS_COURTS[i]} {j.slice(8)}{valides.has(j) ? '' : ' •'}</th>)}<th>Total</th></tr></thead>
            <tbody>{parCategorie(lignes).flatMap(([cat, l]) => [
              <tr key={cat} className="pp-cat"><td colSpan={9}>{cat}</td></tr>,
              ...l.map(x => <tr key={x.cle}><td>{x.nom} <span className="pp-u">({x.unite})</span></td>
                {x.parJour.map((v, i) => <td key={i}>{v ? quantiteFr(v) : '–'}</td>)}<td>{quantiteFr(x.total)}</td></tr>),
            ])}</tbody>
          </table></div>}
          {nbValides < 7 && lignes.length > 0 && <div className="pp-u" style={{ marginTop: '0.4rem' }}>• journée non validée</div>}
          <div className="fdoc-ptitle">Pertes diverses</div>
          {d && !pertes.length && <div className="fdoc-notes">Aucune perte déclarée cette semaine.</div>}
          {pertes.length > 0 && <table className="fdoc-table">
            <thead><tr><th>Jour</th><th>Produit / recette</th><th>Raison</th><th>Quantité</th></tr></thead>
            <tbody>{pertes.map(p => <tr key={p.id}>
              <td>{JOURS_COURTS[jours.indexOf(p.date)] ?? ''} {p.date.slice(8)}</td>
              <td><strong>{p.produit}</strong> <span className="pp-u">· {p.par}</span></td>
              <td>{p.raison}{p.precision && <div className="pp-u">{p.precision}</div>}</td>
              <td>{quantiteFr(p.quantite)} {p.unite}</td></tr>)}</tbody>
          </table>}
          {commentaires.length > 0 && <>
            <div className="fdoc-ptitle">Commentaires de l'équipe</div>
            {commentaires.map(c => <div key={c.date + c.email} className="fdoc-notes pp-note"><span className="pp-u">{JOURS_COURTS[jours.indexOf(c.date)] ?? ''} {jourCourt(c.date)} · {c.nom}</span><br />{c.texte}</div>)}
          </>}
        </div>
      </div>
    </>
  );
}
