import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { decaler, lireQuantite, lundi, parCategorie, quantiteFr } from '../../domain/pertesPerso';
import { contient, pluriel } from '../../domain/texte';
import { chargerPeriode, enregistrerCommentaire, enregistrerQuantites, envoyerRecap, recapDejaEnvoye, rouvrirJournee, validerJournee } from '../../db/pertesPerso';
import { useDonnees } from '../../etat/Donnees';
import { useMoi } from '../../etat/Session';
import { useConfirmer } from '../../ui/Confirmation';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';
import { BarreJour, usePeriode } from './PertesPerso';
import { JOURS_RATTRAPAGE, ProduitsTrouves } from './ProduitsTrouves';
import { aujourdhui } from '../../domain/groupes';

const sans = <T,>(o: Record<string, T>, cles: readonly string[]): Record<string, T> => Object.fromEntries(Object.entries(o).filter(([k]) => !cles.includes(k)));

type Etat = 'envoi' | 'ok' | 'err';

/** Repas du personnel : quantité utilisée par produit pour le jour choisi, enregistrée automatiquement. */
export function RepasPerso({ jour, setJour }: { jour: string; setJour: (d: string) => void }) {
  const { moi, admin } = useMoi();
  const { journal } = useDonnees();
  const notifier = useNotifier();
  const confirmer = useConfirmer();
  const idCmt = useId();
  // saisies pas encore envoyées (clé → texte tapé) et état de chaque ligne
  const [tapes, setTapes] = useState<Record<string, string>>({});
  const [etats, setEtats] = useState<Record<string, Etat>>({});
  const [q, setQ] = useState('');
  const [correction, setCorrection] = useState(false);
  const [cmt, setCmt] = useState<string | null>(null);
  const enAttente = useRef<Record<string, number | null>>({});
  const minuterie = useRef<number | undefined>(undefined);
  // L'admin reçoit aussi les produits écrits dans les commentaires des 2 dernières semaines, pour créer les cases qui manquent.
  // Tout le reste de l'écran ne lit que le jour choisi.
  const debutRattrapage = decaler(aujourdhui(), -(JOURS_RATTRAPAGE - 1));
  const large = admin && jour >= debutRattrapage;
  const { donnees: d, erreur, recharger } = usePeriode(large ? debutRattrapage : jour, large ? aujourdhui() : jour, () => Object.keys(enAttente.current).length > 0 || cmt !== null);

  const validation = d?.validations.find(v => v.date === jour);
  const verrouille = !!validation && !(admin && correction);
  const actifs = d?.produits.filter(p => p.actif) ?? [];
  const saisies = new Map((d?.saisies ?? []).filter(s => s.date === jour).map(s => [s.cle, s]));
  const nbSaisis = [...saisies.values()].filter(s => s.quantite > 0).length;
  const autres = (d?.commentaires ?? []).filter(c => c.date === jour && c.email !== moi.email);
  const monCmt = (d?.commentaires ?? []).find(c => c.date === jour && c.email === moi.email)?.texte ?? '';

  const envoyer = useCallback(async () => {
    window.clearTimeout(minuterie.current);
    const items = Object.entries(enAttente.current);
    if (!items.length) return;
    enAttente.current = {};
    setEtats(e => ({ ...e, ...Object.fromEntries(items.map(([k]): [string, Etat] => [k, 'envoi'])) }));
    const r = await enregistrerQuantites(jour, items, moi);
    setEtats(e => ({ ...e, ...Object.fromEntries(items.map(([k]): [string, Etat] => [k, r.ok ? 'ok' : 'err'])) }));
    if (!r.ok) { notifier('Non enregistré : ' + r.message, 'err'); return; }
    await recharger();
    setTapes(t => sans(t, items.map(([k]) => k)));
  }, [jour, moi, notifier, recharger]);

  // Changement de jour ou départ de l'onglet : ce qui a été tapé part tout de suite.
  useEffect(() => () => { void envoyer(); }, [envoyer]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- nouvelle journée : on repart d'un écran propre
  useEffect(() => { setTapes({}); setEtats({}); setCorrection(false); setCmt(null); }, [jour]);

  const taper = (cle: string, v: string) => {
    setTapes(t => ({ ...t, [cle]: v }));
    const n = lireQuantite(v);
    if (Number.isNaN(n)) { setEtats(e => ({ ...e, [cle]: 'err' })); return; }
    setEtats(e => sans(e, [cle]));
    enAttente.current[cle] = n;
    window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(() => void envoyer(), n === null ? 2000 : 1000);
  };

  const enregistrerCmt = async () => {
    if (cmt === null) return;
    const r = await enregistrerCommentaire(jour, moi, cmt);
    if (!r.ok) { notifier('Commentaire non enregistré : ' + r.message, 'err'); return; }
    notifier(cmt.trim() ? 'Commentaire enregistré' : 'Commentaire retiré', 'ok');
    setCmt(null);
    await recharger();
  };

  const valider = async () => {
    if (!await confirmer('Valider cette journée ? Les quantités et commentaires seront verrouillés pour l\'équipe.', 'Valider')) return;
    await envoyer();
    const r = await validerJournee(jour);
    if (!r.ok) { notifier('Validation impossible : ' + r.message, 'err'); return; }
    await journal('validation repas perso', jour);
    notifier('Journée validée', 'ok');
    setCorrection(false);
    await recharger();
    await recapSiSemaineComplete();
  };
  // Comme l'ancienne app : le récap part par email dès que les 7 jours de la semaine sont validés (une seule fois).
  const recapSiSemaineComplete = async () => {
    const l = lundi(jour);
    try {
      const semaine = await chargerPeriode(l, decaler(l, 6));
      if (new Set(semaine.validations.map(v => v.date)).size < 7 || await recapDejaEnvoye(l)) return;
    } catch { return; }
    const r = await envoyerRecap(l);
    if (r.ok) { await journal('envoi récap pertes & perso', `Semaine du ${l}`); notifier(`Semaine complète : récap envoyé${r.destinataire ? ' à ' + r.destinataire : ''}`, 'ok'); }
    else notifier('Semaine complète, mais récap non envoyé : ' + r.message + ' (bouton « Envoyer » dans Récap)', 'err');
  };
  const rouvrir = async () => {
    if (!await confirmer('Rouvrir la saisie ? La journée repasse en attente et l\'équipe peut à nouveau modifier.', 'Rouvrir')) return;
    const r = await rouvrirJournee(jour);
    if (!r.ok) { notifier('Réouverture impossible : ' + r.message, 'err'); return; }
    await journal('réouverture repas perso', jour);
    notifier('Saisie rouverte', 'ok');
    setCorrection(false);
    await recharger();
  };

  const visibles = actifs.filter(p => !q || contient(p.nom, q));

  return (
    <>
      <BarreJour jour={jour} setJour={j => { void envoyer(); setJour(j); }} />
      {erreur && <div className="pp-statut pp-err">Impossible de charger : {erreur}</div>}
      {d && <div className={`pp-statut${validation ? ' pp-ok' : ''}`} role="status">
        {validation
          ? `Journée validée${validation.par ? ' par ' + validation.par : ''}. ${admin ? (correction ? 'Mode correction activé.' : 'Seul un admin peut encore corriger.') : 'Les quantités ne peuvent plus être modifiées.'}`
          : `En attente de validation · ${pluriel(nbSaisis, 'produit saisi', 'produits saisis')}`}
      </div>}
      {admin && d && <div className="pp-actions">
        {!validation && <button type="button" className="btn btn-p" onClick={() => void valider()}><Icone nom="check" />Valider la journée</button>}
        {validation && !correction && <>
          <button type="button" className="btn btn-g" onClick={() => { setCorrection(true); }}>Corriger</button>
          <button type="button" className="btn btn-g" onClick={() => void rouvrir()}>Rouvrir la saisie</button>
        </>}
        {validation && correction && <button type="button" className="btn btn-p" onClick={() => { void envoyer().then(() => { setCorrection(false); }); }}>Terminer la correction</button>}
      </div>}
      {d && <ProduitsTrouves donnees={d} jour={jour} modifiable={date => (date === jour ? !verrouille : admin)} recharger={recharger} />}
      <div className="sb"><div className="si-wrap"><Icone nom="search" />
        <input className="si" type="search" placeholder="Rechercher un produit…" value={q} onChange={e => { setQ(e.target.value); }} /></div></div>
      {!d && !erreur && <div className="ph-sub" style={{ padding: '8px 0' }}>Chargement…</div>}
      {d && !actifs.length && <div className="ci-label" style={{ color: 'var(--ink2)' }}>Aucun produit dans la liste{admin ? ' : ajoute-les dans « Produits ».' : '.'}</div>}
      {d && actifs.length > 0 && !visibles.length && <div className="ci-label" style={{ color: 'var(--ink2)' }}>Aucun produit ne correspond à ta recherche.</div>}
      {parCategorie(visibles).map(([cat, liste]) => (
        <div key={cat} className="cl">
          <div className="fsect">{cat}</div>
          {liste.map(p => {
            const s = saisies.get(p.cle);
            const valeur = tapes[p.cle] ?? (s ? quantiteFr(s.quantite) : '');
            const etat = etats[p.cle];
            return (
              <div key={p.cle} className="ci pp-ligne">
                <div className="pp-nom"><span className="ci-label">{p.nom}</span>
                  {s && !validation && <small>saisi par {s.par}</small>}</div>
                <div className="pp-qte">
                  <input className={`fi2${etat === 'err' ? ' pp-faux' : ''}`} inputMode="decimal" autoComplete="off" placeholder="0" aria-label={`Quantité ${p.nom}`}
                    value={valeur} disabled={verrouille} onChange={e => { taper(p.cle, e.target.value); }} onBlur={() => void envoyer()}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
                  <span className="pp-unite">{p.unite}</span>
                  <span className="pp-etat" aria-hidden="true">{etat === 'ok' && <Icone nom="check" />}{etat === 'err' && <Icone nom="alert" />}</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {d && <div className="cl">
        <div className="fsect">Commentaires</div>
        {autres.map(c => <div key={c.email} className="ci pp-cmt"><div><small>{c.nom}{c.heure ? ' · ' + c.heure : ''}</small><div>{c.texte}</div></div></div>)}
        {verrouille
          ? (monCmt ? <div className="ci pp-cmt"><div><small>{moi.prenom}</small><div>{monCmt}</div></div></div> : !autres.length && <div className="ci-label">Aucun commentaire.</div>)
          : <div className="ci pp-cmt-saisie">
              <label className="fl" htmlFor={idCmt}>Ton commentaire</label>
              <textarea className="fi2 fta" id={idCmt} rows={3} maxLength={1000} placeholder="Produit abîmé, reste de la veille…" value={cmt ?? monCmt} onChange={e => { setCmt(e.target.value); }} />
              {cmt !== null && cmt !== monCmt && <button type="button" className="btn btn-p btn-sm" onClick={() => void enregistrerCmt()}>Enregistrer le commentaire</button>}
            </div>}
      </div>}
    </>
  );
}
