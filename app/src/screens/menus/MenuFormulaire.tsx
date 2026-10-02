import { useId, useState } from 'react';
import type { Menu, Service } from '../../domain/types';
import { platAffiche, servicesAEnregistrer, servicesAffiches, tempsFixes } from '../../domain/menus';
import { useDonnees } from '../../etat/Donnees';
import { Fenetre } from '../../ui/Fenetre';
import { Icone } from '../../ui/Icone';
import { useNotifier } from '../../ui/Notifications';
import { Selecteur } from '../../ui/Selecteur';
import { useEnregistrerMenus } from './Menus';

/** Édition d'un menu : ses temps et leurs plats (fiches recette ou plats libres). Menus à temps fixes : nom et temps verrouillés. */
export function MenuFormulaire({ menu, onFermer }: { menu: Menu | null; onFermer: (idEnregistre?: string) => void }) {
  const { menus, fichesRecette, fiches } = useDonnees();
  const notifier = useNotifier();
  const enregistrerMenus = useEnregistrerMenus();
  const idNom = useId();
  const fixe = !!menu && !!tempsFixes(menu.nom);
  const [nom, setNom] = useState(menu?.nom ?? '');
  const [services, setServices] = useState<Service[]>(() => menu ? servicesAffiches(menu).map(s => ({ ...s, plats: [...s.plats] }))
    : ['Entrée', 'Plat', 'Dessert'].map(n => ({ nom: n, plats: [] })));
  const [choix, setChoix] = useState<Record<number, string>>({});
  const [libres, setLibres] = useState<Record<number, string>>({});
  const [occupe, setOccupe] = useState(false);
  const recettes = [...fichesRecette].sort((a, b) => a.nom.localeCompare(b.nom));

  const modifier = (i: number, f: (s: Service) => Service) => { setServices(l => l.map((s, k) => (k === i ? f(s) : s))); };
  const deplacer = (i: number, d: number) => { setServices(l => { const c = [...l]; const [x] = c.splice(i, 1); if (x) c.splice(i + d, 0, x); return c; }); };
  const ajouterRecette = (i: number) => {
    const id = choix[i] ?? recettes[0]?.id;
    if (id) modifier(i, s => ({ ...s, plats: [...s.plats, { frId: id }] }));
  };
  const ajouterLibre = (i: number) => {
    const t = (libres[i] ?? '').trim();
    if (!t) return;
    modifier(i, s => ({ ...s, plats: [...s.plats, { texte: t }] }));
    setLibres(l => ({ ...l, [i]: '' }));
  };

  const enregistrer = async () => {
    const n = menu && fixe ? menu.nom : nom.trim();
    if (!n) { notifier('Le nom est obligatoire', 'err'); return; }
    const m: Menu = { id: menu?.id ?? crypto.randomUUID(), nom: n, services: servicesAEnregistrer(services, fichesRecette) };
    setOccupe(true);
    const ok = await enregistrerMenus(menu ? menus.map(x => (x.id === m.id ? m : x)) : [...menus, m], menu ? 'modification menu' : 'création menu', n);
    setOccupe(false);
    if (ok) { notifier('Menu enregistré', 'ok'); onFermer(m.id); }
  };

  return (
    <Fenetre titre={menu ? `Modifier — ${menu.nom}` : 'Nouveau menu'} onFermer={() => { onFermer(); }}
      pied={<>
        <button type="button" className="btn btn-g" onClick={() => { onFermer(); }}>Annuler</button>
        <button type="button" className="btn btn-p" disabled={occupe} onClick={() => void enregistrer()}>Enregistrer</button>
      </>}>
      <div className="fg2"><label className="fl" htmlFor={idNom}>Nom *</label>
        <input className="fi2" id={idNom} type="text" placeholder="ex: 5 temps" value={nom} readOnly={fixe} onChange={e => { setNom(e.target.value); }} /></div>
      {services.map((s, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.5rem' }}>
            <input className="fi2" style={{ flex: 1 }} placeholder="Nom du temps (ex: Entrée)" aria-label="Nom du temps" value={s.nom} readOnly={fixe}
              onChange={e => { modifier(i, x => ({ ...x, nom: e.target.value })); }} />
            {!fixe && <>
              <button type="button" className="btn-rm" aria-label="Monter" disabled={i === 0} onClick={() => { deplacer(i, -1); }}>↑</button>
              <button type="button" className="btn-rm" aria-label="Descendre" disabled={i === services.length - 1} onClick={() => { deplacer(i, 1); }}>↓</button>
              <button type="button" className="btn-rm" aria-label="Retirer ce temps" onClick={() => { setServices(l => l.filter((_, k) => k !== i)); }}><Icone nom="x" /></button>
            </>}
          </div>
          {s.plats.map((p, j) => (
            <div key={j} className="ci" style={{ marginBottom: '0.3rem' }}>
              <span className="ci-label">{platAffiche(p, fichesRecette, fiches).nom}</span>
              <button type="button" className="btn-rm" aria-label="Retirer" onClick={() => { modifier(i, x => ({ ...x, plats: x.plats.filter((_, k) => k !== j) })); }}><Icone nom="x" /></button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
            <Selecteur style={{ flex: 1 }} libelle={`Fiche recette à ajouter (${s.nom || `temps ${i + 1}`})`} valeur={choix[i] ?? recettes[0]?.id ?? ''}
              vide={recettes.length ? undefined : 'Aucune fiche recette'} options={recettes.map(f => ({ valeur: f.id, libelle: f.nom }))}
              onChange={v => { setChoix(c => ({ ...c, [i]: v })); }} />
            <button type="button" className="btn btn-o btn-sm" onClick={() => { ajouterRecette(i); }}><Icone nom="plus" />Recette</button>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
            <input className="fi2" placeholder="Ou un plat libre" style={{ flex: 1 }} value={libres[i] ?? ''} onChange={e => { setLibres(l => ({ ...l, [i]: e.target.value })); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterLibre(i); } }} />
            <button type="button" className="btn btn-o btn-sm" onClick={() => { ajouterLibre(i); }}><Icone nom="plus" />Libre</button>
          </div>
        </div>
      ))}
      {!fixe && <button type="button" className="btn-ar" onClick={() => { setServices(l => [...l, { nom: '', plats: [] }]); }}><Icone nom="plus" />Ajouter un temps</button>}
    </Fenetre>
  );
}
