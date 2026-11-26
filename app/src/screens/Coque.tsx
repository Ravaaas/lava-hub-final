import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FicheRecette, Menu } from '../domain/types';
import { useSession, useMoi } from '../etat/Session';
import { useDonnees } from '../etat/Donnees';
import { groupesFiltres } from '../domain/groupes';
import { Icone, type NomIcone } from '../ui/Icone';
import { useEchap } from '../ui/Fenetre';
import { useNotifier } from '../ui/Notifications';
import { MotDePasse } from './MotDePasse';
import { Journal } from './journal/Journal';
import { FichesTechniques } from './fiches/FichesTechniques';
import { FichesRecette } from './fichesRecette/FichesRecette';
import { Menus } from './menus/Menus';
import { Groupes } from './groupes/Groupes';
import { Config } from './config/Config';
import { PertesPerso } from './pertesPerso/PertesPerso';
import { Ratio } from './ratio/Ratio';
import { chargerRatio } from '../db/ratio';
import { nbHorsBudget } from '../domain/ratio';

type Onglet = 'journal' | 'fiches' | 'recettes' | 'menus' | 'groupes' | 'pertes' | 'ratio' | 'config';

function basculerTheme() {
  const sombre = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = sombre ? 'dark' : 'light';
  try { localStorage.setItem('lava_theme', sombre ? 'dark' : 'light'); } catch { /* stockage indisponible */ }
}

/** Cadre de l'app : en-tête (synchro, menu du profil), onglets, contenu de l'onglet. */
export function Coque() {
  const { moi, admin, role } = useMoi();
  const { deconnecter } = useSession();
  const { fiches, fichesRecette, groupes, menus, synchro } = useDonnees();
  const notifier = useNotifier();
  const [onglet, setOnglet] = useState<Onglet>('fiches');
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [mdp, setMdp] = useState(false);
  const horsBudget = useHorsBudget(admin, onglet, menus, fichesRecette);

  const onglets: { id: Onglet; icone: NomIcone; long: string; court: string; badge?: number; alerte?: string; admin?: true; cuisine?: true }[] = [
    { id: 'journal', icone: 'clock', long: 'Journal', court: 'Journal', admin: true },
    { id: 'fiches', icone: 'file', long: 'Fiche Technique', court: 'Fiches', badge: fiches.length },
    { id: 'recettes', icone: 'book', long: 'Fiche Recette', court: 'Recettes', badge: fichesRecette.length },
    { id: 'menus', icone: 'utensils', long: 'Menus', court: 'Menus' },
    { id: 'groupes', icone: 'users', long: 'Groupes', court: 'Groupes', badge: groupesFiltres(groupes, 'avenir').length },
    { id: 'pertes', icone: 'clipboard', long: 'Pertes & Perso', court: 'Pertes', cuisine: true },
    { id: 'ratio', icone: 'ratio', long: 'Ratio', court: 'Ratio', admin: true, ...(horsBudget ? { alerte: `${horsBudget} hors budget` } : {}) },
    { id: 'config', icone: 'sliders', long: 'Config', court: 'Config', admin: true },
  ];

  const contenu: Record<Onglet, ReactNode> = {
    journal: <Journal />, fiches: <FichesTechniques />, recettes: <FichesRecette />, menus: <Menus />, groupes: <Groupes />, pertes: <PertesPerso />, ratio: <Ratio />, config: <Config />,
  };

  return (
    <div id="app" style={{ display: 'flex' }}>
      <header>
        <div className="h-left"><div className="h-logo" role="img" aria-label="LAVA" /></div>
        <div className="h-right">
          <div className="sync-pill" title="Synchronisation"><div className={`sync-dot${synchro ? ' syncing' : ''}`} /><span>{synchro ? 'Sync…' : 'Sync'}</span></div>
          <MenuProfil prenom={moi.prenom} ouvert={menuOuvert} setOuvert={setMenuOuvert}
            onMotDePasse={() => { setMdp(true); }} onQuitter={() => void deconnecter()} />
        </div>
      </header>
      <nav className="tabs">
        {onglets.filter(o => (admin || !o.admin) && (!o.cuisine || admin || role === 'cuisine')).map(o => (
          <button key={o.id} type="button" className={`tb${onglet === o.id ? ' active' : ''}`} aria-current={onglet === o.id ? 'page' : undefined}
            aria-label={o.alerte ? `${o.long} — ${o.alerte}` : undefined} title={o.alerte}
            onClick={e => { setOnglet(o.id); e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }}>
            <Icone nom={o.icone} taille={22} className="tb-ic" />
            <span className="l-full">{o.long}</span><span className="l-short">{o.court}</span>
            {o.badge !== undefined && <span className="tbadge">{o.badge}</span>}
            {o.alerte && <span className="tb-alerte" aria-hidden="true">{o.alerte.split(' ')[0]}</span>}
          </button>
        ))}
      </nav>
      <main><div className="tc active">{contenu[onglet]}</div></main>
      {mdp && <MotDePasse impose={false} onAnnuler={() => { setMdp(false); }} onFini={() => { setMdp(false); notifier('Mot de passe modifié', 'ok'); }} />}
    </div>
  );
}

/** Nombre de menus entiers et de plats de la carte hors budget (admin) : relu à l'ouverture, quand les menus ou les fiches changent, et en quittant l'onglet Ratio. */
function useHorsBudget(admin: boolean, onglet: Onglet, menus: Menu[], frs: FicheRecette[]): number {
  const [d, setD] = useState<Awaited<ReturnType<typeof chargerRatio>> | null>(null);
  const surRatio = onglet === 'ratio';
  // Lecture des prix et coûts (système externe), admin seulement : les données arrivent de façon asynchrone.
  useEffect(() => {
    if (!admin || surRatio) return;
    let actif = true;
    chargerRatio().then(x => { if (actif) setD(x); }, () => { /* tables absentes : pas d'alerte */ });
    return () => { actif = false; };
  }, [admin, surRatio]);
  if (!admin || !d) return 0;
  return nbHorsBudget(d.budgets, menus, frs, d.recettes, d.liens, d.prixCarte, d.regles);
}

function MenuProfil({ prenom, ouvert, setOuvert, onMotDePasse, onQuitter }: { prenom: string; ouvert: boolean; setOuvert: (v: boolean) => void; onMotDePasse: () => void; onQuitter: () => void }) {
  const zone = useRef<HTMLDivElement>(null);
  useEchap(() => { setOuvert(false); }, ouvert);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => { if (!zone.current?.contains(e.target as Node)) setOuvert(false); };
    document.addEventListener('click', dehors);
    return () => { document.removeEventListener('click', dehors); };
  }, [ouvert, setOuvert]);
  const puis = (action: () => void) => () => { setOuvert(false); action(); };
  return (
    <div ref={zone} style={{ position: 'relative' }}>
      <button type="button" className="avatar" aria-haspopup="menu" aria-expanded={ouvert} aria-label="Menu du profil" onClick={() => { setOuvert(!ouvert); }}>
        <span>{prenom.charAt(0).toUpperCase()}</span>
      </button>
      <div className="menu" role="menu" hidden={!ouvert}>
        <div className="menu-head">{prenom}</div>
        <button type="button" role="menuitem" onClick={puis(onMotDePasse)}><Icone nom="key" taille={20} />Mot de passe</button>
        <button type="button" role="menuitem" onClick={puis(basculerTheme)}><Icone nom="moon" taille={20} className="ic-moon" /><Icone nom="sun" taille={20} className="ic-sun" />Thème clair ou sombre</button>
        <hr />
        <button type="button" role="menuitem" className="danger" onClick={puis(onQuitter)}><Icone nom="log-out" taille={20} />Quitter</button>
      </div>
    </div>
  );
}
