// Aperçu « démo » (npm run dev) : l'app dans le navigateur, déjà connectée en admin, branchée sur la base SIMULÉE des parcours.
// Rien n'est écrit dans la vraie base ; les données repartent de zéro à chaque rechargement de la page.
// Chargé par vite.config.mts uniquement en mode démo (jamais dans la version compilée).
import { creerBase, HOST } from './mock-supabase.mjs';

const EMAIL = 'alexandre.ravasio@outlook.com';
const base = creerBase({});
base.etat.session = EMAIL;
try {
  const jeton = { ...base.jeton(EMAIL), expires_at: Math.floor(Date.now() / 1000) + 10 * 864e3 };
  localStorage.setItem('sb-' + HOST.split('.')[0] + '-auth-token', JSON.stringify(jeton));
} catch { /* stockage indisponible : on passera par l'écran de connexion (mot de passe : bon-mot-de-passe) */ }

// Les appels vers Supabase sont traités par la base simulée, les autres passent normalement.
const natif = window.fetch.bind(window);
window.fetch = async (entree, init) => {
  const req = new Request(entree, init);
  if (!req.url.includes(HOST) || req.url.includes('/realtime/')) return natif(req);
  const corps = await req.clone().text();
  return new Promise(resolve => base.gerer({
    url: () => req.url,
    method: () => req.method,
    postData: () => corps,
    headers: () => Object.fromEntries(req.headers),
    respond: ({ status, headers, body, contentType }) =>
      resolve(new Response(status === 204 ? null : body, { status, headers: { ...(contentType ? { 'content-type': contentType } : {}), ...headers } })),
    continue: () => resolve(natif(req)),
  }));
};

addEventListener('DOMContentLoaded', () => {
  const b = document.createElement('div');
  b.textContent = 'APERÇU DÉMO — données fictives';
  b.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:99999;background:#222;color:#fff;font:600 11px system-ui;padding:2px 10px;border-radius:0 0 8px 8px;pointer-events:none;opacity:.8';
  document.body.append(b);
});
