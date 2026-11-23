import { Fragment, useCallback, useEffect, useState } from 'react';
import type { ContactGroupe, Groupe } from '../../domain/types';
import { alertesGroupe, clePlat, libelleProfil, niveauxDuGroupe, personnesDuPlat, platAffiche, platsCommandes, resumeAlertes, totalNiveau } from '../../domain/menus';
import { AlertesMenu } from './AlertesMenu';
import { contactsUniques, csvContacts, dateCourte, dateLongue, erreurGroupe, euros, groupesFiltres, libelleReglement } from '../../domain/groupes';
import { contient, heureFr, pluriel } from '../../domain/texte';
import { changerStatut, chargerContacts, supprimerGroupe } from '../../db/groupes';
import { telecharger } from '../../lib/image';
import { Fenetre } from '../../ui/Fenetre';
import { useDonnees } from '../../etat/Donnees';
import { useMoi } from '../../etat/Session';
import { PleinEcran } from '../../ui/Fenetre';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';
import { useConfirmer } from '../../ui/Confirmation';
import { Etiquettes, Vide } from '../../ui/Puces';
import { GroupeFormulaire } from './GroupeFormulaire';

export function Groupes() {
  const { groupes, menus, fichesRecette, fiches, pret } = useDonnees();
  const { peutGererGroupes } = useMoi();
  const [quand, setQuand] = useState<'avenir' | 'passes'>('avenir');
  const [q, setQ] = useState('');
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [edition, setEdition] = useState<{ groupe: Groupe | null } | null>(null);
  const [voirContacts, setVoirContacts] = useState(false);
  // coordonnées des référents : admin et salle seulement (la base n'en donne aucune à la cuisine)
  const [contacts, setContacts] = useState<ContactGroupe[]>([]);
  const notifier = useNotifier();
  const relireContacts = useCallback(() => {
    if (!peutGererGroupes) return;
    chargerContacts().then(setContacts, (e: unknown) => { notifier('Contacts illisibles : ' + (e instanceof Error ? e.message : String(e)), 'err'); });
  }, [peutGererGroupes, notifier]);
  useEffect(relireContacts, [relireContacts]);
  const contactDe = (g: Groupe) => contacts.find(c => c.groupe_id === g.id);

  const tous = groupesFiltres(groupes, quand);
  const liste = tous.filter(g => !q || contient(g.nom, q));
  const detail = ouvert ? groupes.find(g => g.id === ouvert) : undefined;

  return (
    <>
      <div className="ph">
        <div><div className="ph-title">Groupes</div>
          <div className="ph-sub">{!pret ? 'Chargement…' : `${pluriel(tous.length, 'groupe')} ${quand === 'avenir' ? 'à venir' : tous.length === 1 ? 'passé' : 'passés'}`}</div></div>
        <div className="ph-actions">
          {peutGererGroupes && <button type="button" className="btn btn-g" onClick={() => { relireContacts(); setVoirContacts(true); }}><Icone nom="users" />Contacts</button>}
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
          const conflit = resumeAlertes(alertesGroupe(g, menus, fichesRecette, fiches));
          const infos = [dateCourte(g.date), heureFr(g.heure), g.pax > 0 ? `${g.pax} pers.` : '', g.salle, menus.find(m => m.id === g.menu_id)?.nom ?? g.menu_nom ?? (g.niveaux.some(n => n.plats.length) ? 'Sur mesure' : '')].filter(Boolean).join(' · ');
          return (
            <div key={g.id} className={`fc${g.statut === 'brouillon' ? ' fc-brouillon' : ''}`} role="button" tabIndex={0} onClick={() => { setOuvert(g.id); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOuvert(g.id); } }}>
              <div className="fc-top"><div className="fc-name">{g.nom}</div><div className="fc-cat">{infos}</div></div>
              {/* toujours une ligne d'étiquettes : toutes les cartes ont la même hauteur, avec ou sans allergie */}
              <div className="fc-tags">
                {g.statut === 'brouillon' && <span className="tag tag-brouillon">Brouillon</span>}
                {conflit && <span className="tag tag-danger"><Icone nom="alert" taille={14} />{conflit}</span>}
                {g.allergenes.length ? <Etiquettes liste={g.allergenes} effectifs={g.effectifs} /> : <span className="tag">Aucune allergie</span>}
              </div>
            </div>
          );
        })}
      </div>
      {detail && <GroupeDetail groupe={detail} contact={contactDe(detail)} onFermer={() => { setOuvert(null); }} onModifier={() => { setOuvert(null); setEdition({ groupe: detail }); }} />}
      {edition && <GroupeFormulaire groupe={edition.groupe} contact={edition.groupe ? contactDe(edition.groupe) : undefined} onFermer={() => { setEdition(null); }} onContact={relireContacts} />}
      {voirContacts && <Contacts contacts={contacts} onFermer={() => { setVoirContacts(false); }} />}
    </>
  );
}

function GroupeDetail({ groupe: g, contact, onFermer, onModifier }: { groupe: Groupe; contact: ContactGroupe | undefined; onFermer: () => void; onModifier: () => void }) {
  const { menus, fichesRecette, fiches, recharger, journal, setSynchro } = useDonnees();
  const { peutGererGroupes } = useMoi();
  const notifier = useNotifier();
  const confirmer = useConfirmer();
  const m = menus.find(x => x.id === g.menu_id);
  const nomMenu = m?.nom ?? g.menu_nom ?? '';
  const niveaux = niveauxDuGroupe(g, menus).filter(n => n.plats.length);
  // les quantités prennent la place des numéros dès qu'un plat en a une
  const avecQte = niveaux.some(n => n.plats.some(p => p.qte !== null));
  const debuts = niveaux.map((_, i) => niveaux.slice(0, i).reduce((t, n) => t + n.plats.length, 0));

  // un brouillon se valide si la fiche passe tous les contrôles ; sinon on ouvre le formulaire pour la finir
  const valider = async () => {
    const erreur = erreurGroupe({ ...g, email: contact?.email ?? '' });
    if (erreur) { notifier(`${erreur} — à compléter pour valider`, 'err'); onModifier(); return; }
    setSynchro(true);
    const r = await changerStatut(g.id, 'confirme');
    setSynchro(false);
    if (!r.ok) { notifier('Validation impossible : ' + r.message, 'err'); return; }
    await journal('validation groupe', g.nom);
    notifier('Fiche validée', 'ok');
    onFermer();
    await recharger();
  };

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
        <button type="button" className="btn btn-g btn-sm" onClick={() => { window.print(); }}><Icone nom="printer" />Imprimer</button>
        {peutGererGroupes && <>
          {g.statut === 'brouillon' && <button type="button" className="btn btn-p btn-sm" onClick={() => void valider()}>Valider la fiche</button>}
          <button type="button" className="btn btn-g btn-sm" onClick={onModifier}>Modifier</button>
          <button type="button" className="btn btn-d btn-sm" onClick={() => void supprimer()}>Supprimer</button>
        </>}
      </div>
    }>
      <div className="fdoc fdoc-groupe">
        <div className="fdoc-hdr"><div className="fdoc-sur">Fiche groupe</div><div className="fdoc-nom">{g.nom}</div>
          <div className="fdoc-cles">{[dateLongue(g.date), heureFr(g.heure), g.pax > 0 ? pluriel(g.pax, 'personne') : '', g.salle, nomMenu ? `Menu ${nomMenu}` : niveaux.length ? 'Menu sur mesure' : ''].filter(Boolean).map(t => <span key={t}>{t}</span>)}</div>
        </div>
        {g.statut === 'brouillon' && <div className="fdoc-brouillon" role="note">Brouillon — fiche non validée</div>}
        <div className="fdoc-body">
          <hr className="fdoc-sep" />
          <AlertesMenu alertes={alertesGroupe(g, menus, fichesRecette, fiches)} />
          {!niveaux.length && <><div className="fdoc-ptitle">Menu</div>
            <div className="ci-label" style={{ color: 'var(--gt)' }}>{m ? "Ce menu n'a pas encore de plats." : 'Menu sur mesure — voir les notes.'}</div></>}
          {niveaux.map((n, i) => {
            const { total, ecart } = totalNiveau(n, g.pax);
            return (
              <Fragment key={i}>
                <div className="fdoc-ptitle fdoc-niv"><span>{n.nom || 'Menu'}</span>
                  {total > 0 && <span className={`fdoc-total${ecart ? ' fdoc-ecart' : ''}`}>{total}{g.pax > 0 ? ` / ${g.pax}` : ''} pers.{ecart < 0 ? ` · il manque ${-ecart}` : ecart > 0 ? ` · ${ecart} de trop` : ''}</span>}</div>
                <div className="fdoc-steps">{platsCommandes(n).map((p, k) => {
                  const d = platAffiche(p, fichesRecette, fiches);
                  const risques = d.allergenes.filter(a => g.allergenes.includes(a));
                  const pour = personnesDuPlat(p, g.profils);
                  const remplace = p.remplace === undefined ? undefined : n.plats.filter(q => clePlat(q) === p.remplace).map(q => platAffiche(q, fichesRecette, fiches).nom)[0];
                  return (
                    <div key={k} className="fdoc-step">
                      {avecQte
                        ? <div className="fdoc-snum fdoc-qte" aria-label={p.qte === null ? 'Nombre non précisé' : `${p.qte} ×`}>{p.qte ?? '–'}</div>
                        : <div className="fdoc-snum">{(debuts[i] ?? 0) + k + 1}</div>}
                      <div className="fdoc-stxt">{d.nom}{remplace && <span className="fdoc-remplace"> · à la place de {remplace}</span>}{pour.length > 0 && <div className="fdoc-pour"><span className="fdoc-pour-lib">Pour</span>{pour.map(x => <span key={x.id} className="fdoc-pour-tag">{libelleProfil(x)} · {x.nb} pers.</span>)}</div>}{risques.length > 0 && <div className="fr-sr-allerg" style={{ margin: '0.3rem 0 0' }}><Etiquettes liste={risques} effectifs={g.effectifs} /></div>}</div>
                    </div>
                  );
                })}</div>
              </Fragment>
            );
          })}
          {g.boissons && <><div className="fdoc-ptitle">Boissons précommandées</div><div className="fdoc-notes">{g.boissons}</div></>}
          <div className="fdoc-ptitle">Restrictions</div>
          {/* une ligne par personne (ou personnes identiques) : allergies en rouge, régimes en gris */}
          {!g.profils.length && <span style={{ fontSize: '0.875rem', color: 'var(--gt)' }}>Aucune allergie ni régime déclaré</span>}
          {g.profils.map((p, i) => (
            <div key={i} className="fr-allerg-sub" style={i ? undefined : { marginTop: 0 }}><span className="fr-allerg-sub-lbl">{p.nb} pers.</span>
              <Etiquettes liste={p.allergenes} />{p.regimes.map(r => <span key={r} className="fr-allerg-tag fr-regime-tag">{r}</span>)}</div>
          ))}
          {/* référent et règlement sur une même ligne : la fiche tient sur une page A4 */}
          <div className="fdoc-ptitle">{g.referent ? 'Référent et règlement' : 'Règlement'}</div>
          <div className="fdoc-duo">
            {g.referent && <div className="fr-allerg-sub"><span className="fr-allerg-sub-lbl">Référent</span><span className="fdoc-reglement">{g.referent}</span></div>}
            <div className="fr-allerg-sub">{g.referent && <span className="fr-allerg-sub-lbl">Règlement</span>}
              <span className={`fdoc-reglement fdoc-reglement-${g.reglement}`}>{libelleReglement(g.reglement)}
                {peutGererGroupes && g.montant !== null && g.reglement !== 'aucun' && <span className="fdoc-ecran"> · {euros(g.montant)}</span>}</span></div>
          </div>
          {/* email et téléphone du référent : à l'écran pour l'admin et la salle, jamais imprimés (le nom est en tête de fiche) */}
          {peutGererGroupes && (contact?.email || contact?.telephone) && <div className="fdoc-ecran">
            <div className="fdoc-ptitle">Coordonnées du référent</div>
            <div className="fdoc-contact">
              {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
              {contact.telephone && <a href={`tel:${contact.telephone.replace(/[^\d+]/g, '')}`}>{contact.telephone}</a>}
            </div>
          </div>}
          {g.notes && <><div className="fdoc-ptitle">Notes</div><div className="fdoc-notes">{g.notes}</div></>}
        </div>
      </div>
    </PleinEcran>
  );
}

/** Base de contacts des groupes : un référent par email (ou téléphone), le plus récent d'abord, et l'export CSV. */
function Contacts({ contacts, onFermer }: { contacts: readonly ContactGroupe[]; onFermer: () => void }) {
  const [q, setQ] = useState('');
  const tous = contactsUniques(contacts);
  const liste = tous.filter(c => !q || [c.nom, c.email, c.telephone, c.groupe].some(t => contient(t, q)));
  const exporter = () => { telecharger(`contacts-groupes-${new Date().toLocaleDateString('sv-SE')}.csv`, csvContacts(tous), 'text/csv;charset=utf-8'); };
  return (
    <Fenetre titre="Contacts des groupes" onFermer={onFermer}
      pied={<>
        <button type="button" className="btn btn-g" onClick={onFermer}>Fermer</button>
        <button type="button" className="btn btn-p" disabled={!tous.length} onClick={exporter}><Icone nom="download" />Télécharger (CSV)</button>
      </>}>
      <p className="niv-aide">{pluriel(tous.length, 'contact')} — un par email ou téléphone. Le fichier CSV s'ouvre dans Excel ou s'importe dans un outil d'emailing.</p>
      {tous.length > 5 && <div className="si-wrap" style={{ marginBottom: '0.75rem' }}><Icone nom="search" />
        <input className="si" type="text" aria-label="Rechercher un contact" placeholder="Rechercher un contact…" value={q} onChange={e => { setQ(e.target.value); }} /></div>}
      {!tous.length && <Vide icone="users" titre="Aucun contact" texte="Les coordonnées saisies dans les fiches groupe apparaîtront ici" />}
      <div className="ct-liste">{liste.map(c => (
        <div key={c.email || c.telephone} className="ct">
          <div className="ct-nom">{c.nom || c.email || c.telephone}</div>
          <div className="ct-coord">{[c.email, c.telephone].filter(Boolean).join(' · ')}</div>
          <div className="ct-groupe">{[c.groupe, c.date && dateCourte(c.date), c.groupes > 1 ? `${c.groupes} groupes` : ''].filter(Boolean).join(' · ')}</div>
        </div>
      ))}</div>
    </Fenetre>
  );
}
