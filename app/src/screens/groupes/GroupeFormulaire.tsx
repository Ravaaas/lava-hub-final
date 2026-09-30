import { useId, useState } from 'react';
import type { Groupe } from '../../domain/types';
import { ALLERGENES, REGIMES } from '../../domain/allergenes';
import { SALLES, SOURCES, aujourdhui, dateCourte, erreurGroupe, groupesEnConflit } from '../../domain/groupes';
import { creerGroupe, modifierGroupe } from '../../db/groupes';
import { useDonnees } from '../../etat/Donnees';
import { Fenetre } from '../../ui/Fenetre';
import { useNotifier } from '../../ui/Notifications';
import { heureFr } from '../../domain/texte';
import { Puces } from '../../ui/Puces';
import { useConfirmer } from '../../ui/Confirmation';

export function GroupeFormulaire({ groupe: g, onFermer }: { groupe: Groupe | null; onFermer: () => void }) {
  const { menus, groupes, recharger, journal, setSynchro } = useDonnees();
  const confirmer = useConfirmer();
  const notifier = useNotifier();
  const id = { nom: useId(), date: useId(), heure: useId(), pax: useId(), salle: useId(), menu: useId(), source: useId(), notes: useId() };
  const [nom, setNom] = useState(g?.nom ?? '');
  const [date, setDate] = useState(g?.date ?? aujourdhui());
  const [heure, setHeure] = useState(g?.heure ?? '');
  const [pax, setPax] = useState(g ? String(g.pax) : '');
  const [salle, setSalle] = useState(g?.salle || SALLES[0]);
  const [source, setSource] = useState(g?.source || (g ? 'Autre' : SOURCES[0]));
  const [menuId, setMenuId] = useState(g?.menu_id ?? '');
  const [allergenes, setAllergenes] = useState<string[]>(g ? g.allergenes.filter(a => (ALLERGENES as readonly string[]).includes(a)) : []);
  const [regimes, setRegimes] = useState<string[]>(g ? g.regimes.filter(r => (REGIMES as readonly string[]).includes(r)) : []);
  const [effectifs, setEffectifs] = useState<Record<string, string>>(Object.fromEntries(Object.entries(g?.effectifs ?? {}).map(([k, v]) => [k, String(v)])));
  const [notes, setNotes] = useState(g?.notes ?? '');
  const [occupe, setOccupe] = useState(false);

  const enregistrer = async () => {
    const menu = menus.find(m => m.id === menuId);
    const donnees: Omit<Groupe, 'id'> = {
      nom: nom.trim(), date, heure, pax: pax.trim() ? Number(pax) : 0, salle, source,
      menu_id: menu ? menu.id : null, menu_nom: menu ? menu.nom : null, allergenes, regimes, notes: notes.trim(),
      // seuls les allergènes et régimes cochés gardent un nombre ; vide = non précisé
      effectifs: Object.fromEntries([...allergenes, ...regimes].filter(n => effectifs[n]?.trim()).map(n => [n, Number(effectifs[n])])),
    };
    const erreur = erreurGroupe(donnees);
    if (erreur) { notifier(erreur, 'err'); return; }
    if (date < aujourdhui() && date !== g?.date && !await confirmer(`Cette date est passée (${dateCourte(date)}). Enregistrer quand même ?`, 'Enregistrer')) return;
    const conflit = groupesEnConflit({ id: g?.id, date, heure, salle }, groupes)[0];
    if (conflit && !await confirmer(`« ${conflit.nom} » est déjà prévu dans cette salle à ${heureFr(conflit.heure)} le même jour. Enregistrer quand même ?`, 'Enregistrer')) return;
    setOccupe(true); setSynchro(true);
    try {
      const r = g ? await modifierGroupe(g.id, donnees) : await creerGroupe(donnees);
      if (!r.ok) { notifier('Erreur : ' + r.message, 'err'); return; }
      await journal(g ? 'modification groupe' : 'création groupe', donnees.nom);
      notifier(g ? 'Groupe modifié' : 'Groupe enregistré', 'ok');
      onFermer();
      await recharger();
    } finally { setOccupe(false); setSynchro(false); }
  };

  const liste = (valeurs: readonly string[], actuelle: string) => (actuelle && !valeurs.includes(actuelle) ? [actuelle, ...valeurs] : valeurs);

  return (
    <Fenetre titre={g ? `Modifier — ${g.nom}` : 'Nouveau groupe'} onFermer={onFermer}
      pied={<>
        <button type="button" className="btn btn-g" onClick={onFermer}>Annuler</button>
        <button type="button" className="btn btn-p" disabled={occupe} onClick={() => void enregistrer()}>Enregistrer</button>
      </>}>
      <div className="fg2"><label className="fl" htmlFor={id.nom}>Nom du groupe *</label>
        <input className="fi2" id={id.nom} type="text" placeholder="ex: Séminaire Dupont" value={nom} onChange={e => { setNom(e.target.value); }} /></div>
      <div className="fr">
        <div className="fg2"><label className="fl" htmlFor={id.date}>Date *</label><input className="fi2" id={id.date} type="date" value={date} onChange={e => { setDate(e.target.value); }} /></div>
        <div className="fg2"><label className="fl" htmlFor={id.heure}>Heure</label><input className="fi2" id={id.heure} type="time" value={heure} onChange={e => { setHeure(e.target.value); }} /></div>
      </div>
      <div className="fr">
        <div className="fg2"><label className="fl" htmlFor={id.pax}>Nombre de personnes *</label><input className="fi2" id={id.pax} type="number" min="1" step="1" value={pax} onChange={e => { setPax(e.target.value); }} /></div>
        <div className="fg2"><label className="fl" htmlFor={id.salle}>Salle</label>
          <select className="fsel" id={id.salle} value={salle} onChange={e => { setSalle(e.target.value); }}>{liste(SALLES, salle).map(s => <option key={s}>{s}</option>)}</select></div>
      </div>
      <div className="fr">
        <div className="fg2"><label className="fl" htmlFor={id.menu}>Menu</label>
          <select className="fsel" id={id.menu} value={menuId} onChange={e => { setMenuId(e.target.value); }}>
            <option value="">Sur mesure</option>
            {menus.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select></div>
        <div className="fg2"><label className="fl" htmlFor={id.source}>Reçu par</label>
          <select className="fsel" id={id.source} value={source} onChange={e => { setSource(e.target.value); }}>{liste(SOURCES, source).map(s => <option key={s}>{s}</option>)}</select></div>
      </div>
      <div className="fsect">Allergies déclarées</div>
      <Puces choix={ALLERGENES} selection={allergenes} onChange={setAllergenes} />
      <Nombres noms={allergenes} valeurs={effectifs} onChange={setEffectifs} />
      <div className="fsect" style={{ marginTop: '1.25rem' }}>Régimes</div>
      <Puces choix={REGIMES} selection={regimes} onChange={setRegimes} />
      <Nombres noms={regimes} valeurs={effectifs} onChange={setEffectifs} />
      <div className="fg2" style={{ marginTop: '1.25rem' }}><label className="fl" htmlFor={id.notes}>Notes</label>
        <textarea className="fta" id={id.notes} placeholder="Précisions : nombre d'enfants, contraintes, heure de service…" value={notes} onChange={e => { setNotes(e.target.value); }} /></div>
    </Fenetre>
  );
}

/** Nombre de personnes pour chaque allergie ou régime coché (facultatif). */
function Nombres({ noms, valeurs, onChange }: { noms: readonly string[]; valeurs: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const base = useId();
  return noms.map((n, i) => (
    <div key={n} className="eff-row">
      <label className="fl" htmlFor={`${base}-${i}`}>{n} — nombre de personnes</label>
      <input className="fi2" id={`${base}-${i}`} type="number" min="1" step="1" placeholder="—" value={valeurs[n] ?? ''}
        onChange={e => { onChange({ ...valeurs, [n]: e.target.value }); }} />
    </div>
  ));
}
