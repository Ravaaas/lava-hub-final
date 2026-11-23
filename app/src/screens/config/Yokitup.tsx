import { useCallback, useEffect, useState } from 'react';
import type { FicheRecette } from '../../domain/types';
import { comparer, grammageYk, libelleVersion, lignesAReprendre, nbEcarts, platsYokitup, portionDeVersion, proposerLiens, reprendreGrammages, compteRelies, trierRelies, versionDeReference, type LigneComparaison, type PlatYk, type TriRelies } from '../../domain/yokitup';
import { diffFicheRecette } from '../../domain/fichesRecette';
import { compareFr, heureFr, pluriel } from '../../domain/texte';
import { chargerYokitup, delier, enregistrerElements, lireYokitup, relier, type DonneesYokitup } from '../../db/yokitup';
import { useDonnees } from '../../etat/Donnees';
import { useMoi } from '../../etat/Session';
import { Choix } from '../../ui/Choix';
import { Fenetre } from '../../ui/Fenetre';
import { Icone } from '../../ui/Icone';
import { Selecteur } from '../../ui/Selecteur';
import { useNotifier } from '../../ui/Notifications';
import { useConfirmer } from '../../ui/Confirmation';

/** Config > Yokitup : lecture des recettes Yokitup, liens plat ↔ fiche recette, comparaison et reprise des grammages. */
export function Yokitup() {
  const { fichesRecette, fiches, recharger, journal } = useDonnees();
  const { moi } = useMoi();
  const notifier = useNotifier();
  const [d, setD] = useState<DonneesYokitup | null>(null);
  const [lecture, setLecture] = useState(false);
  const [choixPlat, setChoixPlat] = useState<PlatYk | null>(null);
  const [comparaison, setComparaison] = useState<{ plat: PlatYk; fr: FicheRecette } | null>(null);
  const [tri, setTri] = useState<TriRelies>('ecarts');

  const charger = useCallback(async () => { setD(await chargerYokitup()); }, []);
  // Lecture initiale de la copie Yokitup (système externe) : les données arrivent de façon asynchrone.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void charger(); }, [charger]);

  const lire = async () => {
    setLecture(true);
    const r = await lireYokitup();
    setLecture(false);
    if (!r.ok) notifier(r.message, 'err'); else notifier(`${pluriel(r.recettes ?? 0, 'recette')} lue${(r.recettes ?? 0) > 1 ? 's' : ''} dans Yokitup`, 'ok');
    await charger();
  };
  const lierA = async (plat: string, fr: FicheRecette) => {
    const r = await relier(plat, fr.id, moi.prenom);
    if (!r.ok) { notifier('Lien impossible : ' + r.message, 'err'); return; }
    await journal('lien Yokitup', fr.nom, [`Yokitup : ${plat}`]);
    notifier('Plat relié');
    await charger();
  };
  const delierPlat = async (plat: string) => {
    const r = await delier(plat);
    if (!r.ok) { notifier('Impossible : ' + r.message, 'err'); return; }
    await journal('lien Yokitup retiré', plat);
    await charger();
  };

  if (!d) return <div className="spinner" />;
  const plats = platsYokitup(d.recettes);
  const propositions = new Map(proposerLiens(plats, fichesRecette, fiches, d.liens).map(p => [p.plat, p]));
  const libres = plats.filter(p => !d.liens.has(p.plat));
  // Plats reliés avec leur fiche et leur nombre d'écarts (null = fiche supprimée), triés selon le choix de l'admin.
  const relies = trierRelies(plats.filter(p => d.liens.has(p.plat)).map(p => {
    const fr = fichesRecette.find(f => f.id === d.liens.get(p.plat));
    return { p, fr, nom: fr?.nom ?? p.plat, ecarts: fr ? nbEcarts(comparer(fr, versionDeReference(p, fr), fiches)) : null };
  }), tri);
  const compte = compteRelies(relies);

  return (
    <>
      <div className="cs">
        <div className="cs-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span>Recettes Yokitup</span>
          <button type="button" className="btn btn-o btn-sm" disabled={lecture} onClick={() => void lire()}>{lecture ? 'Lecture…' : 'Mettre à jour depuis Yokitup'}</button>
        </div>
        <p className="ph-sub" style={{ marginBottom: '0.5rem', lineHeight: 1.6 }}>
          Le Hub lit les recettes étiquetées RECETTE CARTE, MENU et LUNCH dans Yokitup, chaque nuit et avec ce bouton. Il n'écrit jamais rien dans Yokitup,
          et ne change aucune fiche sans ton accord : relie chaque plat à sa fiche recette, compare, puis choisis de reprendre ou non les grammages.
        </p>
        <p className="ph-sub">
          {d.derniere
            ? <>Dernière lecture : {heureFr(new Date(d.derniere.le).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))} ({d.derniere.par})
              {d.derniere.ok ? ` · ${pluriel(d.derniere.recettes, 'recette')}` : <span style={{ color: 'var(--danger-tx)' }}> · échec : {d.derniere.message}</span>}</>
            : 'Aucune lecture pour le moment.'}
        </p>
      </div>

      {libres.length > 0 && (
        <div className="cs">
          <div className="cs-title">À relier ({libres.length})</div>
          <div className="cl">
            {libres.map(p => {
              const prop = propositions.get(p.plat);
              return (
                <div key={p.plat} className="ci" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span className="ci-label" style={{ flex: '1 1 260px' }}>
                    {p.plat} <span style={{ color: 'var(--gt)', fontWeight: 400 }}>· {p.versions.map(v => libelleVersion(v.version)).join(', ')}</span>
                    {prop && <span style={{ display: 'block', fontSize: 13, color: 'var(--ink2)' }}>Proposé : {prop.fiche.nom}{prop.confiance < 0.6 ? ' (à vérifier)' : ''}</span>}
                  </span>
                  <span style={{ display: 'flex', gap: '0.4rem' }}>
                    {prop && <button type="button" className="btn btn-p btn-sm" onClick={() => void lierA(p.plat, prop.fiche)}>Relier</button>}
                    <button type="button" className="btn btn-g btn-sm" onClick={() => { setChoixPlat(p); }}>Choisir une fiche</button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="cs">
        <div className="cs-title">Reliés ({relies.length})</div>
        {relies.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem 1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <Choix libelle="Trier les plats reliés" valeur={tri} onChange={setTri}
              options={[{ valeur: 'ecarts', libelle: "Écarts d'abord" }, { valeur: 'identiques', libelle: "Identiques d'abord" }, { valeur: 'nom', libelle: 'Par nom' }]} />
            <span className="ph-sub">{pluriel(compte.ecarts, 'fiche')} avec écarts · {pluriel(compte.identiques, 'identique')}</span>
          </div>
        )}
        <div className="cl">
          {!relies.length && <div className="ci-label">Aucun plat relié pour le moment.</div>}
          {relies.map(({ p, fr, ecarts }) => (
            <div key={p.plat} className="ci" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
              <span className="ci-label" style={{ flex: '1 1 260px' }}>
                {fr?.nom ?? 'Fiche supprimée'}
                <span style={{ display: 'block', fontSize: 13, color: 'var(--ink2)' }}>Yokitup : {p.plat} · {p.versions.map(v => libelleVersion(v.version)).join(', ')}</span>
              </span>
              <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                {fr && <span className={`tag ${ecarts ? 'tag-danger' : 'tag-accent'}`}>{ecarts ? pluriel(ecarts, 'écart') : 'Identique'}</span>}
                {fr && <button type="button" className="btn btn-g btn-sm" onClick={() => { setComparaison({ plat: p, fr }); }}>Comparer</button>}
                <button type="button" className="btn btn-g btn-sm" aria-label={`Délier ${p.plat}`} onClick={() => void delierPlat(p.plat)}>Délier</button>
              </span>
            </div>
          ))}
        </div>
      </div>

      {choixPlat && (
        <ChoixFiche plat={choixPlat} fichesRecette={fichesRecette.filter(f => ![...d.liens.values()].includes(f.id))}
          onFermer={() => { setChoixPlat(null); }} onChoisir={fr => { const p = choixPlat; setChoixPlat(null); void lierA(p.plat, fr); }} />
      )}
      {comparaison && (
        <Comparaison plat={comparaison.plat} fr={fichesRecette.find(f => f.id === comparaison.fr.id) ?? comparaison.fr}
          onFermer={() => { setComparaison(null); }} onEnregistre={async () => { await recharger(); }} />
      )}
    </>
  );
}

function ChoixFiche({ plat, fichesRecette, onFermer, onChoisir }: { plat: PlatYk; fichesRecette: FicheRecette[]; onFermer: () => void; onChoisir: (fr: FicheRecette) => void }) {
  const [id, setId] = useState('');
  const options = fichesRecette.filter(f => f.statut !== 'archive').sort((a, b) => compareFr(a.nom, b.nom)).map(f => ({ valeur: f.id, libelle: f.nom }));
  const choisie = fichesRecette.find(f => f.id === id);
  return (
    <Fenetre titre={plat.plat} largeur={520} onFermer={onFermer}
      pied={<>
        <button type="button" className="btn btn-g" onClick={onFermer}>Annuler</button>
        <button type="button" className="btn btn-p" disabled={!choisie} onClick={() => { if (choisie) onChoisir(choisie); }}>Relier</button>
      </>}>
      <label className="fl" htmlFor="yk-fiche">Fiche recette</label>
      <Selecteur id="yk-fiche" libelle="Fiche recette" options={options} valeur={id} onChange={setId} vide="Choisir…" />
    </Fenetre>
  );
}

const ETATS: Record<LigneComparaison['etat'], string> = {
  identique: 'Identique', different: 'Différent', unites: 'Unités différentes', vide: 'Grammage vide dans le Hub',
  absent: 'Absent de Yokitup', seulementYokitup: 'Seulement dans Yokitup', assaisonnement: 'Assaisonnement',
};

function Comparaison({ plat, fr, onFermer, onEnregistre }: { plat: PlatYk; fr: FicheRecette; onFermer: () => void; onEnregistre: () => Promise<void> }) {
  const { fiches, journal, setSynchro } = useDonnees();
  const notifier = useNotifier();
  const confirmer = useConfirmer();
  const [version, setVersion] = useState(versionDeReference(plat, fr).version);
  const recette = plat.versions.find(v => v.version === version) ?? versionDeReference(plat, fr);
  // Yokitup Menu → portion Menu de la fiche ; Carte (ou Lunch) → portion Carte ; autres versions : comparaison seulement.
  const portion = portionDeVersion(recette.version);
  const lignes = comparer(fr, recette, fiches, portion ?? 'carte');
  const aReprendre = portion ? lignesAReprendre(lignes) : [];
  const nomPortion = portion === 'menu' ? 'Menu' : 'Carte';

  const reprendre = async () => {
    if (!portion) return;
    if (!await confirmer(`Remplacer ${pluriel(aReprendre.length, 'grammage')} de la portion ${nomPortion} de la fiche par ceux de Yokitup (${libelleVersion(version)}) ? `
      + (portion === 'menu' ? 'Les grammages Carte ne changent pas.' : 'Les grammages Menu ne changent pas.'), 'Remplacer')) return;
    const elements = reprendreGrammages(fr, lignes, portion);
    setSynchro(true);
    const r = await enregistrerElements(fr.id, elements);
    setSynchro(false);
    if (!r.ok) { notifier('Enregistrement impossible : ' + r.message, 'err'); return; }
    await journal('grammages repris de Yokitup', fr.nom, [`Yokitup : ${recette.nom}`, ...diffFicheRecette(fr, { ...fr, elements }, fiches)]);
    notifier('Grammages repris de Yokitup', 'ok');
    await onEnregistre();
  };

  return (
    <Fenetre titre={fr.nom} largeur={720} onFermer={onFermer}
      pied={<>
        <button type="button" className="btn btn-g" onClick={onFermer}>Fermer</button>
        <button type="button" className="btn btn-p" disabled={!aReprendre.length} onClick={() => void reprendre()}>
          {!portion ? 'Comparaison seulement' : aReprendre.length ? `Reprendre ${pluriel(aReprendre.length, 'grammage')} ${nomPortion} de Yokitup` : 'Rien à reprendre'}
        </button>
      </>}>
      <p className="ph-sub" style={{ marginBottom: '0.75rem' }}>Yokitup : {recette.nom}</p>
      {portion === 'menu' && (
        <p className="ph-sub" style={{ marginBottom: '0.75rem' }}>Comparé à la portion Menu de la fiche (grammage Carte quand la portion Menu n'est pas précisée). Les grammages repris vont dans la portion Menu : la Carte ne change pas.</p>
      )}
      {!portion && <p className="ph-sub" style={{ marginBottom: '0.75rem' }}>Version comparée à la portion Carte, sans reprise possible.</p>}
      {plat.versions.length > 1 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <Choix libelle="Version Yokitup" options={plat.versions.map(v => ({ valeur: v.version, libelle: libelleVersion(v.version) }))} valeur={version} onChange={setVersion} />
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="fdoc-table yk-table">
          <thead><tr><th>Élément</th><th>Hub {nomPortion}</th><th>Yokitup</th><th>État</th></tr></thead>
          <tbody>
            {lignes.map((l, k) => (
              <tr key={k} className={l.etat === 'identique' || l.etat === 'assaisonnement' ? '' : 'yk-ecart'}>
                <td>{l.nom}{l.ingredient && l.index !== null && l.ingredient.nom.toUpperCase() !== l.nom.toUpperCase() && <span className="yk-sous">{l.ingredient.nom}{l.approx ? ' (nom proche, à vérifier)' : ''}</span>}</td>
                <td>{l.index === null ? '—' : l.grammageHub || '—'}</td>
                <td>{l.ingredient ? grammageYk(l.ingredient) : '—'}</td>
                <td>{l.approx && l.etat !== 'identique' ? 'Nom proche : à vérifier' : ETATS[l.etat]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lignes.some(l => l.etat === 'absent' || l.etat === 'seulementYokitup' || l.etat === 'unites' || (l.approx && l.etat !== 'identique')) && (
        <p className="ph-sub" style={{ marginTop: '0.75rem', display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
          <Icone nom="alert" />Les éléments absents d'un côté, les unités différentes et les noms seulement proches ne sont jamais repris : à corriger dans Yokitup ou dans la fiche.
        </p>
      )}
    </Fenetre>
  );
}
