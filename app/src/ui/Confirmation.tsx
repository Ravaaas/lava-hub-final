import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Fenetre } from './Fenetre';

type Confirmer = (message: string, bouton?: string) => Promise<boolean>;
const Contexte = createContext<Confirmer>(() => Promise.resolve(false));
export const useConfirmer = (): Confirmer => useContext(Contexte);

/** Fenêtre de confirmation, toujours au-dessus des autres (rendue en dernier). */
export function Confirmation({ children }: { children: ReactNode }) {
  const [demande, setDemande] = useState<{ message: string; bouton: string; reponse: (ok: boolean) => void } | null>(null);
  const confirmer = useCallback<Confirmer>((message, bouton = 'Supprimer') =>
    new Promise(reponse => { setDemande({ message, bouton, reponse }); }), []);
  const repondre = (ok: boolean) => { demande?.reponse(ok); setDemande(null); };
  return (
    <Contexte.Provider value={confirmer}>
      {children}
      {demande && (
        <Fenetre titre="Confirmer" largeur={400} onFermer={() => { repondre(false); }}
          pied={<>
            <button type="button" className="btn btn-g" onClick={() => { repondre(false); }}>Annuler</button>
            <button type="button" className="btn btn-d" onClick={() => { repondre(true); }}>{demande.bouton}</button>
          </>}>
          <p style={{ fontSize: '0.9375rem', color: 'var(--noir)', lineHeight: 1.6 }}>{demande.message}</p>
        </Fenetre>
      )}
    </Contexte.Provider>
  );
}
