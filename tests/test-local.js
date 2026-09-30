// Version test : l'app (rechargée à chaque modification) dans Chrome, branchée sur la base SIMULÉE des parcours.
// Rien n'est écrit dans la vraie base ; chaque lancement repart des mêmes données. Fermer la fenêtre arrête tout.
// Lancer : npm run test-local   (CHROME_PATH = autre navigateur)
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { creerBase, MOT_DE_PASSE, HOST } = require('./mock-supabase');

const NAVIGATEUR = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'].filter(Boolean).find(p => fs.existsSync(p));
if (!NAVIGATEUR) { console.error('Aucun navigateur trouvé : définis CHROME_PATH'); process.exit(2); }

(async () => {
  const { createServer } = await import('vite');
  const serveur = await createServer({ configFile: path.join(__dirname, '..', 'vite.config.mts'), server: { port: 5174, strictPort: false } });
  await serveur.listen();
  const url = serveur.resolvedUrls.local[0];
  const base = creerBase({});
  const navigateur = await puppeteer.launch({ executablePath: NAVIGATEUR, headless: false, defaultViewport: null, args: ['--window-size=1280,900'] });
  const page = (await navigateur.pages())[0] || await navigateur.newPage();
  await page.setRequestInterception(true);
  page.on('request', req => { if (req.url().includes(HOST) && !req.url().includes('/realtime/')) base.gerer(req); else req.continue(); });
  await page.goto(url);
  console.log(`\nVersion test : ${url}\nBase simulée (rien n'est écrit en vrai). Mot de passe de tous les comptes : ${MOT_DE_PASSE}`);
  console.log('Comptes : Alexandre RAVASIO (admin), Hugo PETIT (cuisine), Paul BERNARD (salle).\nFerme la fenêtre Chrome pour arrêter.');
  navigateur.on('disconnected', () => { void serveur.close().then(() => process.exit(0)); });
})().catch(e => { console.error(e); process.exit(2); });
