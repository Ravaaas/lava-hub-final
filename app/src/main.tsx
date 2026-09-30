import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Thème clair par défaut ; sombre seulement si la personne l'a choisi (menu du profil).
try {
  if (localStorage.getItem('lava_theme') === 'dark') document.documentElement.dataset.theme = 'dark';
} catch { /* stockage indisponible (navigation privée) : thème clair */ }

const root = document.getElementById('root');
if (!root) throw new Error('#root absent de index.html');
createRoot(root).render(<StrictMode><App /></StrictMode>);
