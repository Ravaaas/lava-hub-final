import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icone } from './Icone';

type Genre = 'ok' | 'err' | '';
export type Notifier = (message: string, genre?: Genre) => void;

const Contexte = createContext<Notifier>(() => undefined);
export const useNotifier = (): Notifier => useContext(Contexte);

/** Bandeau de notification : un seul à la fois, 2,5 s. Lu par les lecteurs d'écran (role=status). */
export function Notifications({ children }: { children: ReactNode }) {
  const [n, setN] = useState<{ id: number; message: string; genre: Genre; visible: boolean }>({ id: 0, message: '', genre: '', visible: false });
  const minuterie = useRef<number | undefined>(undefined);
  const notifier = useCallback<Notifier>((message, genre = '') => {
    window.clearTimeout(minuterie.current);
    setN(p => ({ id: p.id + 1, message, genre, visible: true }));
    minuterie.current = window.setTimeout(() => { setN(p => ({ ...p, visible: false })); }, 2500);
  }, []);
  useEffect(() => () => { window.clearTimeout(minuterie.current); }, []);
  return (
    <Contexte.Provider value={notifier}>
      {children}
      <div className={`toast${n.genre ? ' ' + n.genre : ''}${n.visible ? ' show' : ''}`} role="status" aria-live="polite">
        {n.message && (
          <span key={n.id} style={{ display: 'contents' }}>
            {n.genre === 'ok' && <Icone nom="check" />}{n.genre === 'err' && <Icone nom="alert" />}<span>{n.message}</span>
          </span>
        )}
      </div>
    </Contexte.Provider>
  );
}
