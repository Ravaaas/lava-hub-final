import { useState } from 'react';
import type { Groupe } from '../../domain/types';
import { alertesGroupe, platsDuMenu } from '../../domain/menus';
import { dateCourte, groupesFiltres } from '../../domain/groupes';
import { contient, heureFr, pluriel } from '../../domain/texte';
import { supprimerGroupe } from '../../db/groupes';
import { useDonnees } from '../../etat/Donnees';
import { useMoi } from '../../etat/Session';
import { PleinEcran } from '../../ui/Fenetre';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';
import { useConfirmer } from '../../ui/Confirmation';
import { Etiquettes, Vide } from '../../ui/Puces';
import { ouvrirPdf } from '../../pdf/commun';
import { pdfGroupe } from '../../pdf/menuGroupe';
import { GroupeFormulaire } from './GroupeFormulaire';

export function Groupes() {
  const { groupes, menus, fichesRecette, fiches, pret } = useDonnees();
  const { peutGererGroupes } = useMoi();
  const [quand, setQuand] = useState<'avenir' | 'passes'>('avenir');
  const [q, setQ] = useState('');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [edition, setEdition] = useState<{ groupe: Groupe | null } | null>(null);

  const tous = groupesFiltres(groupes, quand);
  const liste = tous.filter(g => !q || contient(g.nom, q));
  const detail = ouvert ? groupes.find(g => g.id === ouvert) : undefined;

  return (
    <>
      <div className="ph">
        <div><div className="ph-title">Groupes</div>
          <div className="ph-sub">{!pret ? 'Chargement…' : `${pluriel(tous.length, 'groupe')} ${quand === 'avenir' ? 'à venir' : tous.length === 1 ? 'passé' : 'passés'}`}</div></div>
        <div className="ph-actions">
          {peutGererGroupes && <button type="button" className="btn btn-p" onClick={() => { setEdition({ groupe: null }); }}><Icone nom="plus" />Nouveau groupe</button>}
        </div>
      </div>
      <div className="log-filters" role="tablist">
        {([['avenir', 'À venir'], ['passes', 'Passés']] as const).map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={quand === v} className={`log-filter${quand === v ? ' active' : ''}`} onClick={() => { setQuand(v); }}>{l}</button>
        ))}
      </div>
      <div className="sb"><div className="si-wrap"><Icone nom="search" />
        <input className="si" type="text" placeholder="Rechercher un groupe…" value={q} onChange={e => { setQ(e.target.value); }} /></div></div>
      <div className="fg">
        {pret && !liste.length && <Vide icone="users" titre="Aucun groupe" texte="Rien à afficher ici" />}
        {liste.map(g => {
          const conflit = alertesGroupe(g, menus, fichesRecette, fiches).length > 0;
          const infos = [dateCourte(g.date), heureFr(g.heure), `${g.pax} pers.`, g.salle, menus.find(m => m.id === g.menu_id)?.nom ?? g.menu_nom ?? ''].filter(Boolean).join(' · ');
          return (
            <div key={g.id} className="fc" role="button" tabIndex={0} onClick={() => { setOuvert(g.id); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOuvert(g.id); } }}>
              <div className="fc-top"><div className="fc-name">{g.nom}</div><div className="fc-cat">{infos}</div></div>
              {(conflit || g.allergenes.length > 0) && (
                <div className="fc-tags">
                  {conflit && <span className="tag tag-danger"><Icone nom="alert" taille={14} />Conflit avec le menu</span>}
                  <Etiquettes liste={g.allergenes} effectifs={g.effectifs} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {detail && <GroupeDetail groupe={detail} onFermer={() => { setOuvert(null); }} onModifier={() => { setOuvert(null); setEdition({ groupe: detail }); }} />}
      {edition && <GroupeFormulaire groupe={edition.groupe} onFermer={() => { setEdition(null); }} />}
    </>
  );
}

function GroupeDetail({ groupe: g, onFermer, onModifier }: { groupe: Groupe; onFermer: () => void; onModifier: () => void }) {
  const { menus, fichesRecette, fiches, recharger, journal, setSynchro } = useDonnees();
  const { peutGererGroupes } = useMoi();
  const notifier = useNotifier();
  const confirmer = useConfirmer();
  const m = menus.find(x => x.id === g.menu_id);
  const plats = m ? platsDuMenu(m, fichesRecette, fiches) : [];
  const alertes = alertesGroupe(g, menus, fichesRecette, fiches);
  const info = (l: string, v: string) => v ? <div><div className="fdoc-fl">{l}</div><div className="fdoc-fv" style={{ fontSize: '0.95rem' }}>{v}</div></div> : null;

  const supprimer = async () => {
    if (!await confirmer('Supprimer ce groupe ?')) return;
    setSynchro(true);
    const r = await supprimerGroupe(g.id);
    setSynchro(false);
    if (!r.ok) { notifier('Suppression impossible : ' + r.message, 'err'); return; }
    onFermer();
    await journal('suppression groupe', g.nom);
    notifier('Groupe supprimé');
    await recharger();
  };

  return (
    <PleinEcran titre={g.nom} onRetour={onFermer} actions={
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-g btn-sm" onClick={() => void ouvrirPdf(o => pdfGroupe(o, g, menus, fichesRecette, fiches)).then(ok => { if (!ok) notifier('Erreur à la génération du PDF', 'err'); })}><Icone nom="printer" />Imprimer</button>
        {peutGererGroupes && <>
          <button type="button" className="btn btn-g btn-sm" onClick={onModifier}>Modifier</button>
          <button type="button" className="btn btn-d btn-sm" onClick={() => void supprimer()}>Supprimer</button>
        </>}
      </div>
    }>
      <div className="fdoc">
        <div className="fdoc-hdr"><div className="fdoc-nom">{g.nom}</div><div className="fdoc-sub">Fiche Groupe</div></div>
        <div className="fdoc-body">
          <hr className="fdoc-sep" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '1rem' }}>
            {info('Date', dateCourte(g.date))}{info('Arrivée des clients', heureFr(g.heure))}{info('Personnes', String(g.pax))}{info('Salle', g.salle)}{info('Reçu par', g.source)}
          </div>
          <div className="fdoc-ptitle">Menu choisi{m ? ` — ${m.nom}` : ''}</div>
          {plats.length
            ? <div className="fdoc-steps">{plats.map((p, i) => (
                <div key={i} className="fdoc-step"><div className="fdoc-snum">{i + 1}</div>
                  <div className="fdoc-stxt">{p.nom}{p.allergenes.length > 0 && <div className="fr-sr-allerg" style={{ margin: '0.3rem 0 0' }}><Etiquettes liste={p.allergenes} /></div>}</div>
                </div>))}</div>
            : <div className="ci-label" style={{ color: 'var(--gt)' }}>{m ? "Ce menu n'a pas encore de plats." : 'Menu sur mesure — voir les notes.'}</div>}
          <div className="fdoc-ptitle">Restrictions</div>
          {alertes.length > 0 && (
            <div role="alert" style={{ background: '#FBEDEC', border: '1px solid #E2B5B1', borderRadius: 12, padding: '0.75rem 1rem', marginBottom: '0.75rem', color: '#8C302A', fontSize: '0.9375rem', fontWeight: 600 }}>
              {alertes.map((a, i) => <div key={i}><Icone nom="alert" /> {a.plat} : {a.allergenes.join(', ')}</div>)}
            </div>
          )}
          <div className="fr-allerg-sub" style={{ marginTop: 0 }}><span className="fr-allerg-sub-lbl">Allergies</span>
            {g.allergenes.length ? <Etiquettes liste={g.allergenes} effectifs={g.effectifs} /> : <span style={{ fontSize: '0.875rem', color: 'var(--gt)' }}>Aucune déclarée</span>}</div>
          {g.regimes.length > 0 && <div className="fr-allerg-sub"><span className="fr-allerg-sub-lbl">Régimes</span><Etiquettes liste={g.regimes} effectifs={g.effectifs} /></div>}
          {g.notes && <><div className="fdoc-ptitle">Notes</div><div style={{ fontSize: '0.9375rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{g.notes}</div></>}
        </div>
      </div>
    </PleinEcran>
  );
}
