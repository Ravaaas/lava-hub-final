import { useEffect, useState } from 'react';
import { scriptPrincipal } from '../domain/version';

const INTERVALLE = 60 * 1000;

/**
 * Bandeau « Nouvelle version disponible » : le site publié est relu chaque minute et au retour sur l'onglet ;
 * si son fichier de code a changé, on propose de recharger. Seulement sur la version compilée (pas en aperçu).
 */
export function NouvelleVersion() {
  const [dispo, setDispo] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || dispo) return;
    const actuelle = document.querySelector('script[type="module"][src]')?.getAttribute('src');
    if (!actuelle) return;
    const verifier = async () => {
      try {
        const r = await fetch(new URL('./', location.href), { cache: 'no-store' });
        const publiee = r.ok ? scriptPrincipal(await r.text()) : null;
        if (publiee && publiee !== actuelle) setDispo(true);
      } catch { /* hors ligne : on réessaiera */ }
    };
    const surRetour = () => { if (document.visibilityState === 'visible') void verifier(); };
    const minuteur = setInterval(() => { void verifier(); }, INTERVALLE);
    document.addEventListener('visibilitychange', surRetour);
    return () => { clearInterval(minuteur); document.removeEventListener('visibilitychange', surRetour); };
  }, [dispo]);

  if (!dispo) return null;
  return (
    <div className="maj" role="status">
      <span>Nouvelle version disponible</span>
      <button type="button" className="maj-btn" onClick={() => { location.reload(); }}>Recharger</button>
    </div>
  );
}
