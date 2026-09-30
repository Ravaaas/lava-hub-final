import { useCallback, useEffect, useState } from 'react';
import type { Membre } from '../../domain/types';
import { etatMembre, nomListe } from '../../domain/equipe';
import { contient } from '../../domain/texte';
import { enregistrerReglages } from '../../db/config';
import { idsFichesRecette, chargerPhoto, remplacerPhoto, toutesLesFichesRecette } from '../../db/fichesRecette';
import { contenuSauvegarde, listerSauvegardes, sauvegarderMaintenant } from '../../db/sauvegardes';
import { useDonnees } from '../../etat/Donnees';
import { Fenetre } from '../../ui/Fenetre';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';
import { useConfirmer } from '../../ui/Confirmation';
import { reduireImage, telecharger } from '../../lib/image';
import { ouvrirPdf } from '../../pdf/commun';
import { pdfFiches } from '../../pdf/fiche';
import { MembreFormulaire } from './MembreFormulaire';

type Partie = 'equipe' | 'categories' | 'sauvegarde';

export function Config() {
  const [partie, setPartie] = useState<Partie>('equipe');
  return (
    <>
      <div className="ph"><div><div className="ph-title">Configuration</div><div className="ph-sub">Admin uniquement</div></div></div>
      <div className="log-filters" role="tablist">
        {([['equipe', 'Équipe'], ['categories', 'Catégories'], ['sauvegarde', 'Sauvegarde']] as const).map(([v, l]) => (
          <button key={v} type="button" role="tab" aria-selected={partie === v} className={`log-filter${partie === v ? ' active' : ''}`} onClick={() => { setPartie(v); }}>{l}</button>
        ))}
      </div>
      {partie === 'equipe' && <Equipe />}
      {partie === 'categories' && <Categories />}
      {partie === 'sauvegarde' && <Sauvegardes />}
    </>
  );
}

function Equipe() {
  const { membres } = useDonnees();
  const [edition, setEdition] = useState<{ membre: Membre | null } | null>(null);
  const Etiquette = ({ texte, genre = '' }: { texte: string; genre?: string }) => <span className={`tag ${genre}`}>{texte}</span>;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <p className="ph-sub" style={{ maxWidth: 520, lineHeight: 1.6 }}>Classés par nom. La personne crée elle-même son mot de passe à sa première connexion. Clique sur une ligne pour modifier, couper l'accès ou réinitialiser.</p>
        <button type="button" className="btn btn-p btn-sm" onClick={() => { setEdition({ membre: null }); }}><Icone nom="plus" />Ajouter un membre</button>
      </div>
      {!membres.length && <div className="ci-label" style={{ color: 'var(--gt)' }}>Aucun membre.</div>}
      {([['cuisine', 'Cuisine'], ['salle', 'Salle']] as const).map(([eq, libelle]) => {
        const l = membres.filter(m => m.equipe === eq);
        return l.length > 0 && (
          <div key={eq} className="cs">
            <div className="cs-title">{libelle} ({l.length})</div>
            <div className="cl">
              {l.map(m => {
                const etat = etatMembre(m);
                return (
                  <div key={m.email} className="ci" style={{ cursor: 'pointer' }} role="button" tabIndex={0}
                    onClick={() => { setEdition({ membre: m }); }} onKeyDown={e => { if (e.key === 'Enter') setEdition({ membre: m }); }}>
                    <span className="ci-label">{nomListe(m)}{m.poste && <span style={{ color: 'var(--gt)', fontWeight: 400 }}> · {m.poste}</span>}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {etat && <Etiquette texte={etat} genre={m.actif ? '' : 'tag-danger'} />}
                      {m.role === 'admin' && <Etiquette texte="Admin" genre="tag-accent" />}
                      <span style={{ color: 'var(--ink3)', display: 'inline-flex' }}><Icone nom="chevron-right" /></span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {edition && <MembreFormulaire membre={edition.membre} onFermer={() => { setEdition(null); }} />}
    </div>
  );
}

function Categories() {
  const { reglages, fiches, recharger, journal } = useDonnees();
  const notifier = useNotifier();
  const [nouvelle, setNouvelle] = useState('');
  const enregistrer = async (categories: string[]) => {
    const r = await enregistrerReglages({ ...reglages, categories });
    if (!r.ok) { notifier('Enregistrement impossible — reconnecte-toi en admin', 'err'); return false; }
    await journal('config', 'catégories');
    await recharger();
    return true;
  };
  const ajouter = async () => {
    const v = nouvelle.trim();
    if (!v || reglages.categories.includes(v)) return;
    if (await enregistrer([...reglages.categories, v])) { setNouvelle(''); notifier('Catégorie ajoutée', 'ok'); }
  };
  const retirer = async (c: string) => {
    if (reglages.categories.length <= 1) { notifier('Au moins une catégorie requise', 'err'); return; }
    if (fiches.some(f => f.categorie === c)) { notifier('Catégorie utilisée par des fiches — impossible de la supprimer', 'err'); return; }
    await enregistrer(reglages.categories.filter(x => x !== c));
  };
  return (
    <div className="cs">
      <div className="cs-title">Catégories des fiches techniques</div>
      <div className="cl">
        {reglages.categories.map(c => (
          <div key={c} className="ci"><span className="ci-label">{c}</span>
            <button type="button" className="btn btn-d btn-sm" onClick={() => void retirer(c)}>Supprimer</button></div>
        ))}
      </div>
      <div className="ca-row">
        <input type="text" placeholder="Nouvelle catégorie…" aria-label="Nouvelle catégorie" value={nouvelle} onChange={e => { setNouvelle(e.target.value); }}
          onKeyDown={e => { if (e.key === 'Enter') void ajouter(); }} />
        <button type="button" className="btn btn-p btn-sm" onClick={() => void ajouter()}>Ajouter</button>
      </div>
    </div>
  );
}

function Sauvegardes() {
  const { fiches, reglages, setSynchro } = useDonnees();
  const notifier = useNotifier();
  const confirmer = useConfirmer();
  const [liste, setListe] = useState<{ id: number; creeLe: string }[] | 'indisponible' | null>(null);
  const [exporter, setExporter] = useState(false);

  const charger = useCallback(async () => {
    try { setListe(await listerSauvegardes()); } catch { setListe('indisponible'); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture asynchrone de la base
  useEffect(() => { void charger(); }, [charger]);

  const complete = async () => {
    setSynchro(true);
    try {
      telecharger(`lava-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, { date: new Date().toISOString(), fiches, fiches_recette: await toutesLesFichesRecette(), config: { cats: reglages.categories, ...reglages.autres } });
      notifier('Sauvegarde téléchargée', 'ok');
    } catch { notifier('Erreur de sauvegarde', 'err'); }
    setSynchro(false);
  };
  const maintenant = async () => {
    const r = await sauvegarderMaintenant();
    if (!r.ok) { notifier('Sauvegarde impossible : ' + r.message, 'err'); return; }
    notifier('Sauvegarde faite', 'ok');
    await charger();
  };
  const telechargerAuto = async (id: number) => {
    const s = await contenuSauvegarde(id);
    if (!s) { notifier('Téléchargement impossible', 'err'); return; }
    telecharger(`lava-sauvegarde-auto-${s.creeLe.slice(0, 10)}.json`, s.contenu);
  };
  // Recompresse les photos déjà en base (à lancer une fois) : seules les plus lourdes, et seulement si le gain est réel.
  const alleger = async () => {
    if (!await confirmer('Recompresser les photos existantes des fiches recette ? Aucune donnée ne sera perdue.', 'Lancer')) return;
    setSynchro(true);
    let n = 0, gain = 0;
    try {
      for (const id of await idsFichesRecette()) {
        const p = await chargerPhoto(id);
        if (!p || p.length < 150000) continue;
        const petite = await reduireImage(p);
        if (petite.length > p.length * 0.9) continue;
        if (!(await remplacerPhoto(id, petite)).ok) continue;
        n++; gain += p.length - petite.length;
      }
      notifier(`${n} photo(s) allégée(s) (−${Math.round(gain / 1024)} Ko)`, 'ok');
    } catch { notifier("Erreur pendant l'optimisation", 'err'); }
    setSynchro(false);
  };

  return (
    <>
      <div className="cs">
        <div className="cs-title">Sauvegarde et export</div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-o btn-sm" onClick={() => void complete()}><Icone nom="download" />Sauvegarde complète (JSON)</button>
          <button type="button" className="btn btn-o btn-sm" onClick={() => { setExporter(true); }}><Icone nom="download" />Exporter des fiches (PDF)</button>
          <button type="button" className="btn btn-g btn-sm" onClick={() => void alleger()}>Alléger les photos existantes</button>
        </div>
      </div>
      <div className="cs">
        <div className="cs-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span>Sauvegardes automatiques (chaque nuit)</span>
          <button type="button" className="btn btn-o btn-sm" onClick={() => void maintenant()}>Sauvegarder maintenant</button>
        </div>
        <p className="ph-sub" style={{ marginBottom: '0.75rem' }}>Les 14 dernières, sans les photos. Pour restaurer une fiche supprimée par erreur, télécharge la sauvegarde et demande-moi de la remettre.</p>
        <div className="cl">
          {liste === null && <div className="spinner" />}
          {liste === 'indisponible' && <div className="ci-label" style={{ color: 'var(--gt)' }}>Sauvegardes indisponibles pour le moment.</div>}
          {Array.isArray(liste) && !liste.length && <div className="ci-label" style={{ color: 'var(--gt)' }}>Aucune sauvegarde pour le moment.</div>}
          {Array.isArray(liste) && liste.map(s => (
            <div key={s.id} className="ci">
              <span className="ci-label">{new Date(s.creeLe).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>
              <button type="button" className="btn btn-g btn-sm" onClick={() => void telechargerAuto(s.id)}><Icone nom="download" />Télécharger</button>
            </div>
          ))}
        </div>
      </div>
      {exporter && <ExportPdf onFermer={() => { setExporter(false); }} />}
    </>
  );
}

function ExportPdf({ onFermer }: { onFermer: () => void }) {
  const { fiches } = useDonnees();
  const notifier = useNotifier();
  const [q, setQ] = useState('');
  const [choix, setChoix] = useState<ReadonlySet<string>>(new Set());
  const visibles = fiches.filter(f => !q || contient(f.nom, q)).sort((a, b) => a.nom.localeCompare(b.nom));
  const tout = (oui: boolean) => { setChoix(c => { const n = new Set(c); visibles.forEach(f => { if (oui) n.add(f.id); else n.delete(f.id); }); return n; }); };
  const generer = async () => {
    if (!choix.size) { notifier('Sélectionne au moins une fiche', 'err'); return; }
    const selection = fiches.filter(f => choix.has(f.id)).sort((a, b) => a.nom.localeCompare(b.nom));
    if (await ouvrirPdf(o => pdfFiches(o, selection))) onFermer(); else notifier('Erreur à la génération du PDF', 'err');
  };
  return (
    <Fenetre titre="Exporter en PDF" largeur={520} onFermer={onFermer}
      pied={<>
        <button type="button" className="btn btn-g" onClick={onFermer}>Annuler</button>
        <button type="button" className="btn btn-p" onClick={() => void generer()}><Icone nom="download" />Générer le PDF ({choix.size})</button>
      </>}>
      <div className="si-wrap" style={{ marginBottom: '0.75rem' }}>
        <input className="si" style={{ paddingLeft: '0.85rem' }} type="text" placeholder="Rechercher…" value={q} onChange={e => { setQ(e.target.value); }} />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button type="button" className="btn btn-g btn-sm" onClick={() => { tout(true); }}>Tout cocher</button>
        <button type="button" className="btn btn-g btn-sm" onClick={() => { tout(false); }}>Tout décocher</button>
      </div>
      <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {!visibles.length && <div className="ci-label" style={{ color: 'var(--gt)' }}>Aucun résultat</div>}
        {visibles.map(f => (
          <label key={f.id} className="ci" style={{ cursor: 'pointer' }}><span className="ci-label">{f.nom}</span>
            <input type="checkbox" checked={choix.has(f.id)} onChange={e => { const oui = e.target.checked; setChoix(c => { const n = new Set(c); if (oui) n.add(f.id); else n.delete(f.id); return n; }); }} />
          </label>
        ))}
      </div>
    </Fenetre>
  );
}
