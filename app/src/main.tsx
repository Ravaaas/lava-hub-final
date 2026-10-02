import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { NouvelleVersion } from './ui/NouvelleVersion';
import './styles.css';

// Thème clair par défaut ; sombre seulement si la personne l'a choisi (menu du profil).
try {
  if (localStorage.getItem('lava_theme') === 'dark') document.documentElement.dataset.theme = 'dark';
} catch { /* stockage indisponible (navigation privée) : thème clair */ }

// Aperçu « vraie base » : connexion préparée avant l'affichage (code absent de la version compilée).
if (import.meta.env.MODE === 'live') await (await import('./apercuReel')).preparer();

const root = document.getElementById('root');
if (!root) throw new Error('#root absent de index.html');
createRoot(root).render(<StrictMode><App /><NouvelleVersion /></StrictMode>);
