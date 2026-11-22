import { useId, useState } from 'react';
import type { Groupe, Niveau } from '../../domain/types';
import { ALLERGENES, REGIMES } from '../../domain/allergenes';
import { SALLES, aujourdhui, dateCourte, erreurGroupe, groupesEnConflit } from '../../domain/groupes';
import { niveauxAEnregistrer, niveauxDuGroupe, niveauxDuMenu, platAffiche, totalNiveau } from '../../domain/menus';
import { creerGroupe, modifierGroupe } from '../../db/groupes';
import { useDonnees } from '../../etat/Donnees';
import { Fenetre } from '../../ui/Fenetre';
import { useNotifier } from '../../ui/Notifications';
import { heureFr } from '../../domain/texte';
import { Icone } from '../../ui/Icone';
import { Puces } from '../../ui/Puces';
import { Choix } from '../../ui/Choix';
import { Selecteur } from '../../ui/Selecteur';
import { useConfirmer } from '../../ui/Confirmation';

export function GroupeFormulaire({ groupe: g, onFermer }: { groupe: Groupe | null; onFermer: () => void }) {
  const { menus, groupes, fichesRecette, recharger, journal, setSynchro } = useDonnees();
  const confirmer = useConfirmer();
  const notifier = useNotifier();
  const id = { nom: useId(), date: useId(), heure: useId(), pax: useId(), menu: useId(), notes: useId() };
  const [nom, setNom] = useState(g?.nom ?? '');
  const [date, setDate] = useState(g?.date ?? aujourdhui());
  const [heure, setHeure] = useState(g?.heure ?? '');
  const [pax, setPax] = useState(g ? String(g.pax) : '');
  const [salle, setSalle] = useState(g?.salle || SALLES[0]);
  const [menuId, setMenuId] = useState(g?.menu_id ?? '');
  const [niveaux, setNiveaux] = useState<Niveau[]>(() => (g ? niveauxDuGroupe(g, menus) : NIVEAUX_DE_DEPART.map(nom => ({ nom, plats: [] }))));
  const [allergenes, setAllergenes] = useState<string[]>(g ? g.allergenes.filter(a => (ALLERGENES as readonly string[]).includes(a)) : []);
  const [regimes, setRegimes] = useState<string[]>(g ? g.regimes.filter(r => (REGIMES as readonly string[]).includes(r)) : []);
  const [effectifs, setEffectifs] = useState<Record<string, string>>(Object.fromEntries(Object.entries(g?.effectifs ?? {}).map(([k, v]) => [k, String(v)])));
  const [notes, setNotes] = useState(g?.notes ?? '');
  const [occupe, setOccupe] = useState(false);

  const enregistrer = async () => {
    const menu = menus.find(m => m.id === menuId);
    const donnees: Omit<Groupe, 'id'> = {
      nom: nom.trim(), date, heure, pax: pax.trim() ? Number(pax) : 0, salle,
      menu_id: menu ? menu.id : null, menu_nom: menu ? menu.nom : null,
      // niveaux du groupe (copiés du menu ou composés) ; fiches supprimées et plats libres vides écartés
      niveaux: niveauxAEnregistrer(niveaux, fichesRecette),
      allergenes, regimes, notes: notes.trim(),
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
      <div className="fg2"><label className="fl" htmlFor={id.menu}>Menu choisi</label>
          <Selecteur id={id.menu} options={[{ valeur: '', libelle: 'Sur mesure' }, ...menus.map(m => ({ valeur: m.id, libelle: m.nom }))]} valeur={menuId} onChange={v => void choisirMenu(v)} /></div>
      <Niveaux niveaux={niveaux} pax={Number(pax) || 0} onChange={setNiveaux} />
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

const NIVEAUX_DE_DEPART = ['Entrée', 'Plat', 'Dessert'];

/**
 * Niveaux du menu du groupe (Entrée, Plat, Dessert… autant que nécessaire) et, pour chaque plat, le nombre commandé à l'avance.
 * Les plats se choisissent parmi les fiches recette ou s'écrivent librement ; le total de chaque niveau est comparé au nombre de personnes.
 */
function Niveaux({ niveaux, pax, onChange }: { niveaux: Niveau[]; pax: number; onChange: (n: Niveau[]) => void }) {
  const { fichesRecette, fiches } = useDonnees();
  const [choix, setChoix] = useState<Record<number, string>>({});
  const [libres, setLibres] = useState<Record<number, string>>({});
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
              return (
                <div key={j} className="ci niv-plat">
                  <input className="fi2 niv-qte" type="number" min="1" step="1" placeholder="—" aria-label={`Nombre — ${libelle}`} value={p.qte ?? ''}
                    onChange={e => { const v = e.target.value.trim(); modifier(i, x => ({ ...x, plats: x.plats.map((q, k) => (k === j ? { ...q, qte: v ? Number(v) : null } : q)) })); }} />
                  <span className="ci-label">{libelle}</span>
                  <button type="button" className="btn-rm" aria-label="Monter" disabled={j === 0} onClick={() => { modifier(i, x => ({ ...x, plats: echanger(x.plats, j, -1) })); }}>↑</button>
                  <button type="button" className="btn-rm" aria-label="Descendre" disabled={j === n.plats.length - 1} onClick={() => { modifier(i, x => ({ ...x, plats: echanger(x.plats, j, 1) })); }}>↓</button>
                  <button type="button" className="btn-rm" aria-label="Retirer ce plat" onClick={() => { modifier(i, x => ({ ...x, plats: x.plats.filter((_, k) => k !== j) })); }}><Icone nom="x" /></button>
                </div>
              );
            })}
            {total > 0 && <div className={`niv-total${ecart ? ' niv-ecart' : ''}`} role="note">
              Total : {total} / {pax} pers.{ecart < 0 ? ` — il manque ${-ecart}` : ecart > 0 ? ` — ${ecart} de trop` : ''}</div>}
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
