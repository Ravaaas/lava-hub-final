import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Membre, ProfilConnexion, Role } from '../domain/types';
import { ADMIN_SECOURS } from '../domain/equipe';
import { membreParEmail, profilsConnexion } from '../db/equipe';
import { emailConnecte, seDeconnecter } from '../db/session';
import { useNotifier } from '../ui/Notifications';

type Etat =
  | { ecran: 'chargement' }
  | { ecran: 'accueil'; erreur: string }
  | { ecran: 'mdp-impose'; moi: Membre }
  | { ecran: 'connecte'; moi: Membre };

interface Session {
  etat: Etat;
  profils: ProfilConnexion[] | null;
  rechargerProfils: () => Promise<void>;
  /** Après une connexion réussie : vérifie que la personne est un membre actif. */
  entrer: () => Promise<void>;
  deconnecter: () => Promise<void>;
}

const Contexte = createContext<Session | null>(null);
export function useSession(): Session {
  const s = useContext(Contexte);
  if (!s) throw new Error('useSession hors de <SessionProvider>');
  return s;
}

/** Personne connectée (écrans de l'app uniquement). */
export function useMoi(): { moi: Membre; role: Role; admin: boolean; peutGererGroupes: boolean } {
  const { etat } = useSession();
  if (etat.ecran !== 'connecte') throw new Error('useMoi sans personne connectée');
  const role = etat.moi.role;
  return { moi: etat.moi, role, admin: role === 'admin', peutGererGroupes: role === 'admin' || role === 'salle' };
}

const INACTIVITE_MAX = 30 * 60 * 1000;   // tablette partagée : déconnexion après 30 min sans activité

export function SessionProvider({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<Etat>({ ecran: 'chargement' });
  const [profils, setProfils] = useState<ProfilConnexion[] | null>(null);
  const notifier = useNotifier();

  const rechargerProfils = useCallback(async () => { setProfils(await profilsConnexion()); }, []);

  const entrer = useCallback(async () => {
    const email = await emailConnecte();
    if (!email) { setEtat({ ecran: 'accueil', erreur: '' }); return; }
    let m = await membreParEmail(email);
    if (!m && email === ADMIN_SECOURS) m = { email, prenom: 'Admin', nom: '', poste: 'Admin', equipe: 'cuisine', role: 'admin', actif: true, compte_cree: true, doit_changer_mdp: false };
    if (!m?.actif) {
      await seDeconnecter();
      setEtat({ ecran: 'accueil', erreur: "Accès désactivé ou inconnu. Contacte l'administrateur." });
      return;
    }
    setEtat(m.doit_changer_mdp ? { ecran: 'mdp-impose', moi: m } : { ecran: 'connecte', moi: m });
  }, []);

  const deconnecter = useCallback(async () => {
    await seDeconnecter();
    setEtat({ ecran: 'accueil', erreur: '' });
    void rechargerProfils();
  }, [rechargerProfils]);

  // Au démarrage : liste des profils et session conservée.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture asynchrone de la base et de la session
  useEffect(() => { void rechargerProfils(); void entrer(); }, [rechargerProfils, entrer]);

  // Déconnexion automatique après 30 minutes d'inactivité.
  const derniereActivite = useRef(0);
  const connecte = etat.ecran === 'connecte';
  useEffect(() => {
    if (!connecte) return;
    derniereActivite.current = Date.now();
    const activite = () => { derniereActivite.current = Date.now(); };
    const evts = ['pointerdown', 'keydown'] as const;
    evts.forEach(e => { document.addEventListener(e, activite, { passive: true }); });
    const minuterie = window.setInterval(() => {
      if (Date.now() - derniereActivite.current > INACTIVITE_MAX) {
        void deconnecter();
        notifier("Déconnecté après 30 minutes d'inactivité");
      }
    }, 60000);
    return () => { evts.forEach(e => { document.removeEventListener(e, activite); }); window.clearInterval(minuterie); };
  }, [connecte, deconnecter, notifier]);

  return <Contexte.Provider value={{ etat, profils, rechargerProfils, entrer, deconnecter }}>{children}</Contexte.Provider>;
}
