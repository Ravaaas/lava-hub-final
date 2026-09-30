import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Fiche, FicheRecette, Groupe, Membre, Menu } from '../domain/types';
import { chargerFiches } from '../db/fiches';
import { chargerFichesRecette, chargerPhoto } from '../db/fichesRecette';
import { chargerGroupes } from '../db/groupes';
import { chargerMenus, chargerReglages, CATEGORIES_PAR_DEFAUT, type Reglages } from '../db/config';
import { chargerMembres } from '../db/equipe';
import { journaliser } from '../db/journal';
import { surModification } from '../db/tempsReel';
import { membresClasses } from '../domain/equipe';
import { fenetreOuverte } from '../ui/Fenetre';
import { useNotifier } from '../ui/Notifications';
import { useMoi } from './Session';

interface Donnees {
  fiches: Fiche[];
  fichesRecette: FicheRecette[];
  groupes: Groupe[];
  menus: Menu[];
  reglages: Reglages;
  /** Équipe (admin uniquement ; vide pour les autres). */
  membres: Membre[];
  /** Chargement initial terminé. */
  pret: boolean;
  synchro: boolean;
  recharger: () => Promise<void>;
  rechargerMembres: () => Promise<void>;
  /** Photo d'une fiche recette : undefined tant qu'elle n'est pas chargée, null si aucune. */
  photo: (id: string) => string | null | undefined;
  chargerPhotoDe: (id: string) => Promise<string | null>;
  oublierPhoto: (id: string) => void;
  /** Journal : une ligne par action, signée par la personne connectée. */
  journal: (action: string, nom: string, detail?: readonly string[]) => Promise<void>;
  setSynchro: (v: boolean) => void;
}

const Contexte = createContext<Donnees | null>(null);
export function useDonnees(): Donnees {
  const d = useContext(Contexte);
  if (!d) throw new Error('useDonnees hors de <DonneesProvider>');
  return d;
}

export function DonneesProvider({ children }: { children: ReactNode }) {
  const { moi, admin } = useMoi();
  const notifier = useNotifier();
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [fichesRecette, setFichesRecette] = useState<FicheRecette[]>([]);
  const [groupes, setGroupes] = useState<Groupe[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [reglages, setReglages] = useState<Reglages>({ categories: CATEGORIES_PAR_DEFAUT, autres: {} });
  const [membres, setMembres] = useState<Membre[]>([]);
  const [photos, setPhotos] = useState<ReadonlyMap<string, string | null>>(new Map());
  const [pret, setPret] = useState(false);
  const [synchro, setSynchro] = useState(false);
  const dernierChargement = useRef(0);

  const recharger = useCallback(async () => {
    dernierChargement.current = Date.now();
    setSynchro(true);
    // chaque liste est chargée indépendamment : une table indisponible n'empêche pas les autres de s'afficher
    const [f, fr, g, m, r] = await Promise.allSettled([chargerFiches(), chargerFichesRecette(), chargerGroupes(), chargerMenus(), chargerReglages()]);
    if (f.status === 'fulfilled') setFiches(f.value);
    if (fr.status === 'fulfilled') setFichesRecette(fr.value);
    if (g.status === 'fulfilled') setGroupes(g.value);
    if (m.status === 'fulfilled') setMenus(m.value);
    if (r.status === 'fulfilled') setReglages(r.value);
    if ([f, fr, g, m, r].some(x => x.status === 'rejected')) notifier('Erreur de connexion — certaines données ne sont pas à jour', 'err');
    setPhotos(new Map());   // les photos seront relues à la demande
    setSynchro(false);
    setPret(true);
  }, [notifier]);

  const rechargerMembres = useCallback(async () => {
    if (!admin) return;
    try { setMembres(membresClasses(await chargerMembres())); } catch { setMembres([]); }
  }, [admin]);

  // Chargement initial depuis la base (système externe) : les données arrivent de façon asynchrone.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void recharger(); void rechargerMembres(); }, [recharger, rechargerMembres]);

  // En direct : quand quelqu'un modifie les données, l'écran se recharge (sans écraser une fenêtre ouverte).
  useEffect(() => {
    let minuterie: number | undefined;
    const plusTard = (ms: number) => {
      window.clearTimeout(minuterie);
      minuterie = window.setTimeout(() => { if (fenetreOuverte()) plusTard(5000); else void recharger(); }, ms);
    };
    const arreter = surModification(() => { plusTard(1500); });
    return () => { arreter(); window.clearTimeout(minuterie); };
  }, [recharger]);

  // Retour sur l'onglet du navigateur : rafraîchit (au plus toutes les 30 s), sauf fenêtre ouverte.
  useEffect(() => {
    const surVisibilite = () => {
      if (document.hidden || Date.now() - dernierChargement.current < 30000 || fenetreOuverte()) return;
      void recharger();
    };
    document.addEventListener('visibilitychange', surVisibilite);
    return () => { document.removeEventListener('visibilitychange', surVisibilite); };
  }, [recharger]);

  const chargerPhotoDe = useCallback(async (id: string) => {
    const p = await chargerPhoto(id);
    setPhotos(prec => new Map(prec).set(id, p));
    return p;
  }, []);
  const oublierPhoto = useCallback((id: string) => { setPhotos(prec => { const m = new Map(prec); m.delete(id); return m; }); }, []);
  const journal = useCallback((action: string, nom: string, detail: readonly string[] = []) => journaliser(action, nom, moi.prenom, detail), [moi.prenom]);

  const valeur: Donnees = {
    fiches, fichesRecette, groupes, menus, reglages, membres, pret, synchro,
    recharger, rechargerMembres, photo: id => photos.get(id), chargerPhotoDe, oublierPhoto, journal, setSynchro,
  };
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}
