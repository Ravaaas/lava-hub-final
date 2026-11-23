import { Fragment, useId, useState } from 'react';
import type { ContactGroupe, Groupe, Niveau } from '../../domain/types';
import type { Alerte } from '../../domain/menus';
import { ALLERGENES, REGIMES } from '../../domain/allergenes';
import { REGLEMENTS, SALLES, aujourdhui, dateCourte, erreurGroupe, groupesEnConflit, libelleMontant, montantSaisi, profilsAEnregistrer, resumeProfils } from '../../domain/groupes';
import { alertesMenu, allergieSaisie, clePlat, estAllergieLibre, lierRemplacant, niveauxAEnregistrer, sansRemplace, niveauxDuGroupe, niveauxDuMenu, platAffiche, totalNiveau } from '../../domain/menus';
import { creerGroupe, enregistrerContact, modifierGroupe } from '../../db/groupes';
import { useDonnees } from '../../etat/Donnees';
import { Fenetre } from '../../ui/Fenetre';
import { useNotifier } from '../../ui/Notifications';
import { heureFr } from '../../domain/texte';
import { Icone } from '../../ui/Icone';
import { Puces } from '../../ui/Puces';
import { AlertesMenu } from './AlertesMenu';
import { Choix } from '../../ui/Choix';
import { Selecteur } from '../../ui/Selecteur';
import { useConfirmer } from '../../ui/Confirmation';

/** contact : coordonnées déjà enregistrées du référent (admin et salle) ; onContact : relire la base de contacts après un enregistrement. */
export function GroupeFormulaire({ groupe: g, contact, onFermer, onContact }: { groupe: Groupe | null; contact?: ContactGroupe | undefined; onFermer: () => void; onContact: () => void }) {
  const { menus, groupes, fichesRecette, fiches, recharger, journal, setSynchro } = useDonnees();
  const confirmer = useConfirmer();
  const notifier = useNotifier();
  const id = { nom: useId(), date: useId(), heure: useId(), pax: useId(), menu: useId(), boissons: useId(), notes: useId(), referent: useId(), email: useId(), tel: useId(), montant: useId() };
  const [nom, setNom] = useState(g?.nom ?? '');
  const [date, setDate] = useState(g?.date ?? aujourdhui());
  const [heure, setHeure] = useState(g?.heure ?? '');
  const [pax, setPax] = useState(g ? String(g.pax) : '');
  const [salle, setSalle] = useState(g?.salle || SALLES[0]);
  const [menuId, setMenuId] = useState(g?.menu_id ?? '');
  const [niveaux, setNiveaux] = useState<Niveau[]>(() => (g ? niveauxDuGroupe(g, menus) : NIVEAUX_DE_DEPART.map(nom => ({ nom, plats: [] }))));
  const [profils, setProfils] = useState<ProfilSaisi[]>(() => (g?.profils ?? []).map(p => ({ ...p, nb: String(p.nb) })));
  const [notes, setNotes] = useState(g?.notes ?? '');
  const [boissons, setBoissons] = useState(g?.boissons ?? '');
  const [reglement, setReglement] = useState(g?.reglement ?? 'aucun');
  const [montant, setMontant] = useState(g?.montant != null ? String(g.montant).replace('.', ',') : '');
  const [referent, setReferent] = useState(g?.referent ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [telephone, setTelephone] = useState(contact?.telephone ?? '');
  const [occupe, setOccupe] = useState(false);

  // brouillon : seuls le nom et la date sont exigés, la fiche reste à valider (aussi « Enregistrer » sur un brouillon la valide)
  const enregistrer = async (brouillon = false) => {
    const menu = menus.find(m => m.id === menuId);
    // une ligne par personne (ou personnes identiques) ; lignes sans rien de coché écartées ; nombre vide = 1
    const lignes = profilsAEnregistrer(profils.map(p => ({ ...p, nb: p.nb.trim() ? Number(p.nb) : 1 })));
    const personnes = { profils: lignes, ...resumeProfils(lignes) };
    const donnees: Omit<Groupe, 'id'> = {
      statut: brouillon ? 'brouillon' : 'confirme',
      nom: nom.trim(), date, heure, pax: pax.trim() ? Number(pax) : 0, salle,
      menu_id: menu ? menu.id : null, menu_nom: menu ? menu.nom : null,
      // niveaux du groupe (copiés du menu ou composés) ; fiches supprimées et plats libres vides écartés
      niveaux: niveauxAEnregistrer(niveaux, fichesRecette),
      ...personnes, notes: notes.trim(), boissons: boissons.trim(), reglement,
      // pas de montant tant que rien n'est reçu
      montant: reglement === 'aucun' ? null : montantSaisi(montant), referent: referent.trim(),
    };
    const coord = { email: email.trim(), telephone: telephone.trim() };
    const erreur = erreurGroupe({ ...donnees, email: coord.email }, brouillon);
    if (erreur) { notifier(erreur, 'err'); return; }
    if (!brouillon && date < aujourdhui() && date !== g?.date && !await confirmer(`Cette date est passée (${dateCourte(date)}). Enregistrer quand même ?`, 'Enregistrer')) return;
    const conflit = brouillon ? undefined : groupesEnConflit({ id: g?.id, date, heure, salle }, groupes)[0];
    if (conflit && !await confirmer(`« ${conflit.nom} » est déjà prévu dans cette salle à ${heureFr(conflit.heure)} le même jour. Enregistrer quand même ?`, 'Enregistrer')) return;
    setOccupe(true); setSynchro(true);
    try {
      const groupeId = g?.id ?? crypto.randomUUID();
      const r = g ? await modifierGroupe(groupeId, donnees) : await creerGroupe(groupeId, donnees);
      if (!r.ok) { notifier('Erreur : ' + r.message, 'err'); return; }
      // coordonnées du référent : table à part (base de contacts), écrite dès qu'il y a quelque chose à garder ou à effacer
      if (coord.email || coord.telephone || donnees.referent || contact) {
        const c = await enregistrerContact({ groupe_id: groupeId, nom: donnees.referent, ...coord, groupe: donnees.nom, date_groupe: date });
        if (!c.ok) notifier('Groupe enregistré, mais pas les coordonnées du référent : ' + c.message, 'err');
        onContact();
      }
      await journal(g ? 'modification groupe' : 'création groupe', brouillon ? `${donnees.nom} (brouillon)` : donnees.nom);
      notifier(brouillon ? 'Brouillon enregistré' : g ? 'Groupe modifié' : 'Groupe enregistré', 'ok');
      onFermer();
      await recharger();
    } finally { setOccupe(false); setSynchro(false); }
  };

  // Choisir un menu recopie ses niveaux et ses plats (quantités à saisir) ; « Sur mesure » garde les niveaux en cours.
  const choisirMenu = async (v: string) => {
    const menu = menus.find(m => m.id === v);
    if (menu && niveaux.some(n => n.plats.length) && !await confirmer(`Remplacer les niveaux et les plats actuels par ceux du menu « ${menu.nom} » ?`, 'Remplacer')) return;
    setMenuId(v);
    if (menu) setNiveaux(niveauxDuMenu(menu));
  };

  const liste = (valeurs: readonly string[], actuelle: string) => (actuelle && !valeurs.includes(actuelle) ? [actuelle, ...valeurs] : valeurs);

  return (
    <Fenetre titre={g ? `Modifier — ${g.nom}` : 'Nouveau groupe'} onFermer={onFermer}
      pied={<>
        <button type="button" className="btn btn-g" onClick={onFermer}>Annuler</button>
        {(!g || g.statut === 'brouillon') && <button type="button" className="btn btn-brouillon" disabled={occupe} onClick={() => void enregistrer(true)}>Enregistrer en brouillon</button>}
        <button type="button" className="btn btn-p" disabled={occupe} onClick={() => void enregistrer()}>Enregistrer</button>
      </>}>
      <div className="fg2"><label className="fl" htmlFor={id.nom}>Nom du groupe *</label>
        <input className="fi2" id={id.nom} type="text" placeholder="ex: Séminaire Dupont" value={nom} onChange={e => { setNom(e.target.value); }} /></div>
      <div className="fr">
        <div className="fg2"><label className="fl" htmlFor={id.date}>Date *</label><input className="fi2" id={id.date} type="date" value={date} onChange={e => { setDate(e.target.value); }} /></div>
        <div className="fg2"><label className="fl" htmlFor={id.heure}>Heure d'arrivée des clients</label><input className="fi2" id={id.heure} type="time" value={heure} onChange={e => { setHeure(e.target.value); }} /></div>
      </div>
      <div className="fr">
        <div className="fg2"><label className="fl" htmlFor={id.pax}>Nombre de personnes *</label><input className="fi2" id={id.pax} type="number" min="1" step="1" value={pax} onChange={e => { setPax(e.target.value); }} /></div>
        <div className="fg2"><span className="fl">Salle</span>
          <Choix libelle="Salle" options={liste(SALLES, salle).map(s => ({ valeur: s, libelle: s }))} valeur={salle} onChange={setSalle} /></div>
      </div>
      <div className="fsect">Référent du groupe</div>
      <div className="fg2"><label className="fl" htmlFor={id.referent}>Nom du référent</label>
        <input className="fi2" id={id.referent} type="text" autoComplete="off" placeholder="ex: Claire Dupont" value={referent} onChange={e => { setReferent(e.target.value); }} /></div>
      <div className="fr">
        <div className="fg2"><label className="fl" htmlFor={id.email}>Email du référent</label>
          <input className="fi2" id={id.email} type="email" autoComplete="off" placeholder="ex: claire.dupont@exemple.fr" value={email} onChange={e => { setEmail(e.target.value); }} /></div>
        <div className="fg2"><label className="fl" htmlFor={id.tel}>Téléphone du référent</label>
          <input className="fi2" id={id.tel} type="tel" autoComplete="off" placeholder="ex: 06 12 34 56 78" value={telephone} onChange={e => { setTelephone(e.target.value); }} /></div>
      </div>
      <p className="niv-aide" style={{ marginTop: '-0.25rem' }}>Email et téléphone ne sont visibles que par l'admin et la salle, et rejoignent la liste des contacts des groupes.</p>
      <div className="fg2"><label className="fl" htmlFor={id.menu}>Menu choisi</label>
          <Selecteur id={id.menu} options={[{ valeur: '', libelle: 'Sur mesure' }, ...menus.map(m => ({ valeur: m.id, libelle: m.nom }))]} valeur={menuId} onChange={v => void choisirMenu(v)} /></div>
      <Niveaux niveaux={niveaux} pax={Number(pax) || 0} onChange={setNiveaux} />
      <div className="fg2"><label className="fl" htmlFor={id.boissons}>Boissons précommandées</label>
        <textarea className="fta" id={id.boissons} placeholder="ex: 3 magnums de Chablis, 2 bouteilles de Saint-Joseph, eaux et cafés" value={boissons} onChange={e => { setBoissons(e.target.value); }} /></div>
      <Profils profils={profils} onChange={setProfils} niveaux={niveaux} onNiveaux={setNiveaux}
        alertes={alertesMenu(niveaux, profils.map(p => ({ ...p, nb: Number(p.nb) || 1 })), fichesRecette, fiches)} />
      <div className="fg2" style={{ marginTop: '1.25rem' }}><span className="fl">Règlement</span>
        <Choix libelle="Règlement" options={REGLEMENTS} valeur={reglement} onChange={setReglement} /></div>
      {reglement !== 'aucun' && <div className="fg2"><label className="fl" htmlFor={id.montant}>{libelleMontant(reglement)}</label>
        <input className="fi2" id={id.montant} type="text" inputMode="decimal" autoComplete="off" placeholder="ex: 300" value={montant} onChange={e => { setMontant(e.target.value); }} /></div>}
      <div className="fg2"><label className="fl" htmlFor={id.notes}>Notes</label>
        <textarea className="fta" id={id.notes} placeholder="Précisions : nombre d'enfants, contraintes, heure de service…" value={notes} onChange={e => { setNotes(e.target.value); }} /></div>
    </Fenetre>
  );
}

type ProfilSaisi = { nb: string; allergenes: string[]; regimes: string[] };

/**
 * Allergies et régimes : une ligne par personne, ou par personnes qui ont exactement les mêmes
 * (ex. 1 personne Œuf + Moutarde, 1 personne Œuf seul). Une seule ligne ouverte à la fois ; les autres sont résumées.
 */
function Profils({ profils, alertes, niveaux, onNiveaux, onChange }: { profils: ProfilSaisi[]; alertes: Alerte[]; niveaux: Niveau[]; onNiveaux: (n: Niveau[]) => void; onChange: (p: ProfilSaisi[]) => void }) {
  const { fichesRecette, fiches } = useDonnees();
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [autre, setAutre] = useState('');
  const ouvrir = (i: number | null) => { setOuvert(i); setAutre(''); };
  const modifier = (i: number, f: (p: ProfilSaisi) => ProfilSaisi) => { onChange(profils.map((p, k) => (k === i ? f(p) : p))); };
  // allergie libre (Kiwi…) : ajoutée comme une puce cochée ; « gluten » coche l'allergène Gluten
  const ajouterAutre = (i: number) => {
    const a = allergieSaisie(autre);
    if (a) modifier(i, x => (x.allergenes.includes(a) ? x : { ...x, allergenes: [...x.allergenes, a] }));
    setAutre('');
  };
  return (
    <>
      <div className="fsect">Allergies et régimes</div>
      <p className="niv-aide">Une ligne par personne, ou par personnes qui ont exactement les mêmes allergies et régimes. Une allergie absente de la liste s'écrit à la main : elle est cherchée dans les ingrédients des plats.</p>
      {profils.length === 0 && <div className="ci-label" style={{ color: 'var(--gt)', marginBottom: '0.6rem' }}>Aucune allergie ni régime déclaré.</div>}
      {profils.map((p, i) => {
        const coches = [...p.allergenes, ...p.regimes];
        return (
          <div key={i} className="niv prof">
            <div className="niv-tete">
              <input className="fi2 niv-qte" type="number" min="1" step="1" placeholder="1" aria-label={`Nombre de personnes — ligne ${i + 1}`} value={p.nb}
                onChange={e => { modifier(i, x => ({ ...x, nb: e.target.value })); }} />
              <span className="prof-pers">pers.</span>
              <button type="button" className="prof-resume" aria-expanded={ouvert === i} onClick={() => { ouvrir(ouvert === i ? null : i); }}>
                {coches.length ? coches.join(' · ') : 'Choisir les allergies et régimes'}<Icone nom={ouvert === i ? 'chevron-up' : 'chevron-down'} taille={16} />
              </button>
              <button type="button" className="btn-rm" aria-label="Retirer cette ligne" onClick={() => { onChange(profils.filter((_, k) => k !== i)); ouvrir(null); }}><Icone nom="x" /></button>
            </div>
            {ouvert === i && <>
              <div className="prof-sous">Allergies</div>
              <Puces choix={[...ALLERGENES, ...p.allergenes.filter(estAllergieLibre)]} selection={p.allergenes} onChange={v => { modifier(i, x => ({ ...x, allergenes: v })); }} />
              <div className="prof-autre">
                <input className="fi2" aria-label={`Autre allergie ou intolérance — ligne ${i + 1}`} placeholder="Autre allergie (ex: Kiwi)" value={autre}
                  onChange={e => { setAutre(e.target.value); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterAutre(i); } }} />
                <button type="button" className="btn-ar" disabled={!autre.trim()} onClick={() => { ajouterAutre(i); }}><Icone nom="plus" />Ajouter</button>
              </div>
              <div className="prof-sous">Régimes</div>
              <Puces choix={REGIMES} selection={p.regimes} onChange={v => { modifier(i, x => ({ ...x, regimes: v })); }} />
            </>}
          </div>
        );
      })}
      <button type="button" className="btn-ar" style={{ marginBottom: '1rem' }} onClick={() => { onChange([...profils, { nb: '1', allergenes: [], regimes: [] }]); ouvrir(profils.length); }}>
        <Icone nom="plus" />Ajouter une personne</button>
      <AlertesMenu alertes={alertes} adapter={a => {
        // autres plats du niveau où se trouve le plat en conflit : l'un d'eux peut être servi à sa place
        const niveau = niveaux.find(n => n.plats.some(p => platAffiche(p, fichesRecette, fiches).nom === a.plat));
        const conflit = niveau?.plats.find(p => platAffiche(p, fichesRecette, fiches).nom === a.plat);
        if (!niveau || !conflit) return null;
        const cle = clePlat(conflit);
        const autres = niveau.plats.filter(p => clePlat(p) !== cle).map(p => ({ valeur: clePlat(p), libelle: platAffiche(p, fichesRecette, fiches).nom }));
        if (!autres.length) return null;
        const choisi = niveau.plats.find(p => p.remplace === cle);
        return <Selecteur className="alerte-menu-choix" libelle={`Adapté avec — ${a.plat}`} vide="Adapté avec : choisir le plat" options={autres}
          valeur={choisi ? clePlat(choisi) : ''} onChange={v => { onNiveaux(lierRemplacant(niveaux, cle, v)); }} />;
      }} />
    </>
  );
}

const NIVEAUX_DE_DEPART = ['Entrée', 'Plat', 'Dessert'];

/**
 * Niveaux du menu du groupe (Entrée, Plat, Dessert… autant que nécessaire) et, pour chaque plat, le nombre commandé à l'avance.
 * Les plats se choisissent parmi les fiches recette ou s'écrivent librement ; le total de chaque niveau est comparé au nombre de personnes.
 */
function Niveaux({ niveaux, pax, onChange }: { niveaux: Niveau[]; pax: number; onChange: (n: Niveau[]) => void }) {
  const { fichesRecette, fiches } = useDonnees();
  const [choix, setChoix] = useState<Record<number, string>>({});
  const [libres, setLibres] = useState<Record<number, string>>({});
  const [lien, setLien] = useState<string | null>(null);   // ligne « à la place de » ouverte : « niveau-plat »
  const recettes = fichesRecette.filter(f => f.statut !== 'archive').sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const modifier = (i: number, f: (n: Niveau) => Niveau) => { onChange(niveaux.map((n, k) => (k === i ? f(n) : n))); };
  const echanger = <T,>(l: readonly T[], i: number, d: number): T[] => { const c = [...l]; const [x] = c.splice(i, 1); if (x !== undefined) c.splice(i + d, 0, x); return c; };
  const ajouterRecette = (i: number) => { const id = choix[i] || recettes[0]?.id; if (id) modifier(i, n => ({ ...n, plats: [...n.plats, { frId: id, qte: null }] })); };
  const ajouterLibre = (i: number) => {
    const t = (libres[i] ?? '').trim();
    if (!t) return;
    modifier(i, n => ({ ...n, plats: [...n.plats, { texte: t, qte: null }] }));
    setLibres(l => ({ ...l, [i]: '' }));
  };
  return (
    <>
      <div className="fsect">Niveaux du menu</div>
      <p className="niv-aide">Pour chaque plat, le nombre choisi à l'avance par les clients (facultatif).</p>
      {niveaux.map((n, i) => {
        const { total, ecart } = totalNiveau(n, pax);
        const nom = n.nom || `niveau ${i + 1}`;
        return (
          <div key={i} className="niv">
            <div className="niv-tete">
              <input className="fi2" style={{ flex: 1 }} placeholder="Nom du niveau (ex: Entrée)" aria-label="Nom du niveau" value={n.nom}
                onChange={e => { modifier(i, x => ({ ...x, nom: e.target.value })); }} />
              <button type="button" className="btn-rm" aria-label="Monter ce niveau" disabled={i === 0} onClick={() => { onChange(echanger(niveaux, i, -1)); }}>↑</button>
              <button type="button" className="btn-rm" aria-label="Descendre ce niveau" disabled={i === niveaux.length - 1} onClick={() => { onChange(echanger(niveaux, i, 1)); }}>↓</button>
              <button type="button" className="btn-rm" aria-label="Retirer ce niveau" onClick={() => { onChange(niveaux.filter((_, k) => k !== i)); }}><Icone nom="x" /></button>
            </div>
            {n.plats.length === 0 && <div className="ci-label" style={{ color: 'var(--gt)', marginBottom: '0.4rem' }}>Aucun plat pour le moment.</div>}
            {n.plats.map((p, j) => {
              const libelle = platAffiche(p, fichesRecette, fiches).nom;
              const autres = n.plats.filter(q => clePlat(q) !== clePlat(p)).map(q => ({ valeur: clePlat(q), libelle: platAffiche(q, fichesRecette, fiches).nom }));
              const voirLien = autres.length > 0 && (p.remplace !== undefined || lien === `${i}-${j}`);
              return (
                <Fragment key={j}>
                <div className="ci niv-plat">
                  <input className="fi2 niv-qte" type="number" min="1" step="1" placeholder="—" aria-label={`Nombre — ${libelle}`} value={p.qte ?? ''}
                    onChange={e => { const v = e.target.value.trim(); modifier(i, x => ({ ...x, plats: x.plats.map((q, k) => (k === j ? { ...q, qte: v ? Number(v) : null } : q)) })); }} />
                  <span className="ci-label">{libelle}</span>
                  <button type="button" className="btn-rm" aria-label="Monter" disabled={j === 0} onClick={() => { modifier(i, x => ({ ...x, plats: echanger(x.plats, j, -1) })); }}>↑</button>
                  <button type="button" className="btn-rm" aria-label="Descendre" disabled={j === n.plats.length - 1} onClick={() => { modifier(i, x => ({ ...x, plats: echanger(x.plats, j, 1) })); }}>↓</button>
                  {autres.length > 0 && <button type="button" className={`btn-rm${voirLien ? ' actif' : ''}`} aria-label={`Remplace un plat — ${libelle}`} aria-expanded={voirLien}
                    onClick={() => { if (p.remplace !== undefined) modifier(i, x => ({ ...x, plats: x.plats.map((q, k) => (k === j ? sansRemplace(q) : q)) })); setLien(voirLien ? null : `${i}-${j}`); }}>⇄</button>}
                  <button type="button" className="btn-rm" aria-label="Retirer ce plat" onClick={() => { modifier(i, x => ({ ...x, plats: x.plats.filter((_, k) => k !== j) })); }}><Icone nom="x" /></button>
                </div>
                {voirLien && <div className="niv-remplace">
                  <span>à la place de</span>
                  <Selecteur style={{ flex: 1 }} libelle={`Remplace — ${libelle}`} vide="Choisir le plat remplacé" options={autres} valeur={p.remplace ?? ''}
                    onChange={v => { modifier(i, x => ({ ...x, plats: x.plats.map((q, k) => (k !== j ? q : v ? { ...q, remplace: v } : sansRemplace(q))) })); }} />
                </div>}
                </Fragment>
              );
            })}
            {total > 0 && <div className={`niv-total${ecart ? ' niv-ecart' : ''}`} role="note">
              Total : {total}{pax > 0 ? ` / ${pax}` : ''} pers.{ecart < 0 ? ` — il manque ${-ecart}` : ecart > 0 ? ` — ${ecart} de trop` : ''}</div>}
            <div className="niv-ajout">
              <Selecteur style={{ flex: 1 }} libelle={`Fiche recette à ajouter (${nom})`} vide={recettes.length ? undefined : 'Aucune fiche recette'}
                options={recettes.map(f => ({ valeur: f.id, libelle: f.nom }))} valeur={choix[i] || recettes[0]?.id || ''} onChange={v => { setChoix(c => ({ ...c, [i]: v })); }} />
              <button type="button" className="btn btn-o btn-sm" onClick={() => { ajouterRecette(i); }}><Icone nom="plus" />Recette</button>
            </div>
            <div className="niv-ajout">
              <input className="fi2" style={{ flex: 1 }} aria-label={`Plat libre (${nom})`} placeholder="Ou un plat libre" value={libres[i] ?? ''} onChange={e => { setLibres(l => ({ ...l, [i]: e.target.value })); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterLibre(i); } }} />
              <button type="button" className="btn btn-o btn-sm" onClick={() => { ajouterLibre(i); }}><Icone nom="plus" />Libre</button>
            </div>
          </div>
        );
      })}
      <button type="button" className="btn-ar" style={{ marginBottom: '1rem' }} onClick={() => { onChange([...niveaux, { nom: '', plats: [] }]); }}><Icone nom="plus" />Ajouter un niveau</button>
    </>
  );
}
