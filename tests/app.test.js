// Test complet de l'app dans un vrai navigateur, avec une base Supabase SIMULÉE (aucun accès à la vraie base) :
//   connexion, fiches, menus, groupes, config, PDF, déconnexion.
// Lancer : npm i --no-save puppeteer-core && node tests/app.test.js   (CHROME_PATH pour choisir le navigateur)
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const CHEMINS = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'].filter(Boolean);
const BRAVE = CHEMINS.find(p => fs.existsSync(p));
if (!BRAVE) { console.error('Aucun navigateur trouvé : définis CHROME_PATH'); process.exit(2); }
const APP = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const SHOTS = process.env.SCREENSHOTS ? process.env.SCREENSHOTS + '/' : null;
const HOST = 'qmvxmxzsmpigvseuidcd.supabase.co';

// ── Base de données simulée (aucun accès à ta vraie base) ──
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', email: 'alexandre.ravasio@outlook.com', role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.x`;
const user = { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'alexandre.ravasio@outlook.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const db = {
  membres: [
    { email: 'alexandre.ravasio@outlook.com', prenom: 'Alexandre', nom: 'Ravasio', poste: 'Admin', equipe: 'cuisine', role: 'admin', actif: true, doit_changer_mdp: false, compte_cree: true },
    { email: 'julie.martin@lava-hub.local', prenom: 'Julie', nom: 'Martin', poste: 'Chef de partie', equipe: 'cuisine', role: 'cuisine', actif: true, doit_changer_mdp: false, compte_cree: false },
    { email: 'paul.bernard@lava-hub.local', prenom: 'Paul', nom: 'Bernard', poste: 'Maître d\'hôtel', equipe: 'salle', role: 'salle', actif: true, doit_changer_mdp: false, compte_cree: true },
  ],
  fiches: [
    { id: 'f1', nom: 'VELOUTÉ CURRY', categorie: 'Sauce', quantite_nette: '2 kg', conditionnement: '[]', allergenes: 'Lactose, Céleri', ingredients: [{ nom: 'CRÈME', quantite: '500', unite: 'g' }, { nom: 'CURRY', quantite: '10', unite: 'g' }], process: ['Chauffer la crème', 'Ajouter le curry'] },
    { id: 'f2', nom: 'CROUSTILLANT SARRASIN', categorie: 'Garniture', quantite_nette: '500 g', conditionnement: '[]', allergenes: 'Gluten', ingredients: [{ nom: 'SARRASIN', quantite: '200', unite: 'g' }], process: ['Cuire'] },
    { id: 'f3', nom: 'GANACHE CHOCOLAT', categorie: 'Dessert', quantite_nette: '1 kg', conditionnement: '[]', allergenes: ['Lactose', 'Soja'], ingredients: [{ nom: 'CHOCOLAT', quantite: '400', unite: 'g', ficheId: 'f2' }], process: [] },
  ],
  fiches_recette: [
    { id: 'r1', nom: 'CASSOLETTE DE SAINT-JACQUES', statut: 'carte', allergenes: 'Céleri, Gluten, Lactose', sous_recettes: [{ id: 'f1', grammage: '80g' }, { id: 'f2', grammage: '20g' }, { text: 'Herbes fraîches', grammage: '' }], photo: null, modifie_par: 'Alexandre', modifie_le: new Date().toISOString() },
    { id: 'r2', nom: 'TARTE AU CITRON', statut: 'carte', allergenes: 'Gluten, Lactose', sous_recettes: [{ id: 'f3', grammage: '' }], photo: null },
  ],
  groupes: [{ id: 'g1', nom: 'Séminaire Dupont', date: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), heure: '19:30', pax: 12, salle: 'Salon Basalte', source: 'Email', menu_id: null, menu_nom: null, allergenes: 'Gluten', regimes: 'Végétarien', notes: 'Un enfant', modifie_par: 'Paul', modifie_le: new Date().toISOString() }],
  lava_config: [{ id: 'main', data: { cats: ['Base', 'Sauce', 'Garniture', 'Dessert', 'Autre'] } }],
  audit_log: [{ ts: Date.now() - 3600e3, action: 'modification', fiche_nom: 'VELOUTÉ CURRY', profil: 'Alexandre', detail: ['CRÈME : 400 g → 500 g'] }],
  sauvegardes: [{ id: 1, cree_le: new Date().toISOString(), contenu: {} }],
};
const log = { writes: [], unknown: [] };

function respond(req, status, body, extra = {}) {
  return req.respond({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' }, body: JSON.stringify(body), ...extra });
}
function handleSupabase(req) {
  const u = new URL(req.url()), p = u.pathname, m = req.method();
  if (m === 'OPTIONS') return req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
  if (p === '/auth/v1/token') return respond(req, 200, { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user });
  if (p === '/auth/v1/user') return respond(req, 200, user);
  if (p === '/auth/v1/logout') return req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
  if (p === '/rest/v1/rpc/profils_connexion') return respond(req, 200, db.membres.filter(x => x.actif).map(x => ({ email: x.email, prenom: x.prenom, nom: x.nom, poste: x.poste, equipe: x.equipe, statut: x.compte_cree ? 'actif' : 'ouvert' })));
  if (p === '/rest/v1/rpc/mdp_change' || p === '/rest/v1/rpc/sauvegarder_maintenant') { log.writes.push(m + ' ' + p); return respond(req, 200, null); }
  const t = p.replace('/rest/v1/', '');
  if (p.startsWith('/rest/v1/') && db[t]) {
    const single = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
    if (m === 'GET') {
      let rows = db[t].slice();
      for (const [k, v] of u.searchParams) if (typeof v === 'string' && v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === v.slice(3));
      if (single) return rows.length ? respond(req, 200, rows[0]) : respond(req, 406, { message: 'no rows' });
      return respond(req, 200, rows);
    }
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    log.writes.push(`${m} ${t} ${JSON.stringify(body).slice(0, 90)}`);
    if (m === 'POST') {
      const rows = Array.isArray(body) ? body : [body];
      rows.forEach(r => { const i = db[t].findIndex(x => x.id && x.id === r.id); if (i >= 0) db[t][i] = { ...db[t][i], ...r }; else db[t].push({ id: 'n' + Math.random().toString(36).slice(2, 7), ...r }); });
      return respond(req, 201, rows);
    }
    if (m === 'PATCH') { const id = (u.searchParams.get('id') || '').replace('eq.', ''), em = (u.searchParams.get('email') || '').replace('eq.', ''); const i = db[t].findIndex(x => x.id === id || x.email === em); if (i >= 0) Object.assign(db[t][i], body); return respond(req, 200, i >= 0 ? [{ id, email: em }] : []); }
    if (m === 'DELETE') { const id = (u.searchParams.get('id') || '').replace('eq.', ''); db[t] = db[t].filter(x => x.id !== id); return respond(req, 200, [{ id }]); }
  }
  if (p.startsWith('/rest/v1/')) { log.unknown.push(m + ' ' + p); return respond(req, 200, []); }
  return req.continue();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (nom, ok, detail = '') => { results.push([ok, nom, detail]); console.log((ok ? 'OK    ' : 'ECHEC ') + nom + (detail ? '  → ' + detail : '')); };

(async () => {
  const browser = await puppeteer.launch({ executablePath: BRAVE, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.setRequestInterception(true);
  page.on('request', req => { if (req.url().includes(HOST) && !req.url().includes('/realtime/')) handleSupabase(req); else req.continue(); });
  page.on('dialog', d => d.accept());

  await page.goto(APP, { waitUntil: 'networkidle2', timeout: 40000 });
  await sleep(800);

  // 1. Connexion : équipe -> profil -> mot de passe
  check('écran de connexion affiché', await page.evaluate(() => getComputedStyle(document.getElementById('lg-teams')).display !== 'none'));
  await page.evaluate(() => pickTeam('cuisine'));
  const profs = await page.evaluate(() => [...document.querySelectorAll('#lg-profile-list .pb')].map(b => b.innerText.replace(/\s+/g, ' ').trim()));
  check('profils Cuisine : « Prénom NOM », classés par hiérarchie (Admin en premier)', profs.length === 2 && profs[0].startsWith('Alexandre RAVASIO') && profs[1].startsWith('Julie MARTIN'), JSON.stringify(profs));
  await page.evaluate(() => pickTeam('salle'));
  check('profils Salle', await page.evaluate(() => document.querySelectorAll('#lg-profile-list .pb').length) === 1);
  await page.evaluate(() => pickTeam('cuisine'));
  await page.evaluate(() => pickProfile('alexandre.ravasio@outlook.com'));
  await page.type('#pw-input', 'motdepasse-simule');
  await page.click('#btn-confirm');
  await sleep(2500);
  check('connexion admin réussie', await page.evaluate(() => getComputedStyle(document.getElementById('app')).display === 'flex' && document.getElementById('prof-badge').textContent === 'Alexandre'));

  // 2. Fiches techniques / recette
  check('3 fiches techniques listées', await page.evaluate(() => document.querySelectorAll('#fiches-grid .fc').length) === 3);
  await page.evaluate(() => document.querySelectorAll('.tb')[2].click());
  check('2 fiches recette listées', await page.evaluate(() => document.querySelectorAll('#fr-grid .fc').length) === 2);
  await page.evaluate(() => openFRD('r1')); await sleep(300);
  const frTxt = await page.evaluate(() => document.getElementById('frdoc-area').innerText);
  check('fiche recette : « modifié par » masqué', !/modifié par/i.test(frTxt));
  await page.evaluate(() => closeFRD());
  // cadrage photo : portrait 600x900 → enregistré en 16/10, le zoom resserre, la fenêtre suit la position
  const ph = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 900; c.getContext('2d').fillRect(0, 0, 600, 900);
    await showFRPhoto(c.toDataURL('image/png'));
    const ratio = async () => { const i = new Image(); await new Promise(o => { i.onload = o; i.src = frPhotoData; }); return i.width / i.height; };
    const r1 = await ratio(), w1 = frWindow()[3];
    frPos.z = 2; frPos.y = 0; const w2 = frWindow();
    return { r1, h1: w1, h2: w2[3], y2: w2[1] };
  });
  check('photo portrait recadrée en 16/10, zoom x2 resserre le cadrage', Math.abs(ph.r1 - 1.6) < 0.02 && Math.abs(ph.h2 - ph.h1 / 2) < 1 && ph.y2 === 0, JSON.stringify(ph));


  // 3. Menus
  await page.evaluate(() => document.querySelectorAll('.tb').forEach(b => /Menus/.test(b.textContent) && b.click()));
  check('menus vides : bouton de création', await page.evaluate(() => /Créer les 4 menus/i.test(document.getElementById('menus-list').innerText)));
  await page.evaluate(() => seedMenus()); await sleep(600);
  const pills = await page.evaluate(() => [...document.querySelectorAll('#menus-list .log-filter')].map(b => b.textContent));
  check('4 menus créés en onglets', JSON.stringify(pills) === JSON.stringify(['Lunch', 'Carte du soir', '3 temps', '5 temps']), JSON.stringify(pills));
  await page.evaluate(() => setMenuTab(menus[1].id));
  const svc = await page.evaluate(() => [...document.querySelectorAll('#menus-list .fsect')].map(e => e.textContent));
  check('Carte du soir = Plat + Dessert', JSON.stringify(svc) === JSON.stringify(['Plat', 'Dessert']), JSON.stringify(svc));
  // ajout d'un plat via la fenêtre d'édition
  await page.evaluate(() => openMenu(1)); await sleep(300);
  await page.evaluate(() => { document.getElementById('ms-sel-0').value = 'r1'; addMenuPlat(0); });
  await page.evaluate(() => { document.getElementById('ms-free-1').value = 'Mignardises maison'; addMenuFree(1); });
  await page.evaluate(() => saveMenu()); await sleep(800);
  const menuTxt = await page.evaluate(() => document.getElementById('menus-list').innerText);
  check('plat + descriptif des éléments + allergènes', /CASSOLETTE/.test(menuTxt) && /VELOUTÉ CURRY/.test(menuTxt) && /Herbes fraîches/.test(menuTxt) && /Céleri/.test(menuTxt), menuTxt.replace(/\s+/g, ' ').slice(0, 160));
  if (SHOTS) await page.screenshot({ path: SHOTS + 'menus.png' });

  // 4. Groupes
  await page.evaluate(() => document.querySelectorAll('.tb').forEach(b => /Groupes/.test(b.textContent) && b.click()));
  check('groupe listé', await page.evaluate(() => /Séminaire Dupont/i.test(document.getElementById('gr-grid').innerText)));
  await page.evaluate(() => { openNewGroupe(); document.getElementById('g-nom').value = 'Anniversaire Leroy'; document.getElementById('g-pax').value = 8; document.getElementById('g-menu').value = menus[1].id; toggleGAllerg(ALLERGENES_LIST.indexOf('Gluten')); });
  await page.evaluate(() => saveGroupe()); await sleep(1200);
  check('groupe créé', await page.evaluate(() => /Anniversaire Leroy/i.test(document.getElementById('gr-grid').innerText)));
  await page.evaluate(() => { const g = groupes.find(x => x.nom === 'Anniversaire Leroy'); openGRD(g.id); }); await sleep(300);
  const gdoc = await page.evaluate(() => document.getElementById('grdoc-area').innerText);
  check('alerte allergène groupe / menu (gluten dans la cassolette)', /CASSOLETTE DE SAINT-JACQUES\s*:\s*Gluten/i.test(gdoc), gdoc.replace(/\s+/g, ' ').slice(-260));
  if (SHOTS) await page.screenshot({ path: SHOTS + 'groupe.png' });
  await page.evaluate(() => closeGRD());

  // 5. Config : équipe et sauvegardes
  await page.evaluate(() => document.querySelectorAll('.tb').forEach(b => /Config/.test(b.textContent) && b.click()));
  const team = await page.evaluate(() => document.getElementById('cfg-team').innerText.replace(/\s+/g, ' '));
  check('équipe listée par nom, Cuisine et Salle', /Cuisine \(2\)/i.test(team) && /Salle \(1\)/i.test(team) && team.indexOf('MARTIN') < team.indexOf('RAVASIO'), team.slice(0, 200));
  await page.evaluate(() => openMembre('julie.martin@lava-hub.local')); await sleep(300);
  check('fiche membre sans identifiant visible', await page.evaluate(() => !/lava-hub\.local/.test(document.getElementById('modal-membre').innerText)));
  if (SHOTS) await page.screenshot({ path: SHOTS + 'membre.png' });
  await page.evaluate(() => closeModal('modal-membre'));
  await page.evaluate(() => setCfgTab('backup')); await sleep(500);
  check('sauvegardes automatiques listées', await page.evaluate(() => document.querySelectorAll('#cfg-snaps .ci').length) === 1);

  // 6. PDF réels (jsPDF chargé à la demande)
  const pdf = await page.evaluate(async () => {
    await loadPDFLibs();
    const out = {};
    out.menu = buildMenuPDF(menus[1]).internal.getNumberOfPages();
    out.groupe = buildGroupePDF(groupes[0]).internal.getNumberOfPages();
    out.fr = buildFicheRecettePDF(fichesRecette[0]).internal.getNumberOfPages();
    const d = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }); addFicheToPDF(d, fiches[0], 1, 'brut'); out.fiche = d.internal.getNumberOfPages();
    return out;
  });
  check('4 PDF générés (menu, groupe, fiche recette, fiche technique)', Object.values(pdf).every(n => n >= 1), JSON.stringify(pdf));
  if (process.env.PDFS) require('fs').writeFileSync(process.env.PDFS + '/menu.pdf', Buffer.from(await page.evaluate(() => buildMenuPDF(menus[1]).output('datauristring').split(',')[1]), 'base64'));

  // 7. Écritures et déconnexion
  await page.evaluate(() => logout()); await sleep(600);
  check('déconnexion : retour à l\'écran de connexion', await page.evaluate(() => getComputedStyle(document.getElementById('login-screen')).display !== 'none' && getComputedStyle(document.getElementById('app')).display === 'none'));

  const bruit = /realtime|websocket|WebSocket|favicon/i;
  const vraies = errors.filter(e => !bruit.test(e));
  check('aucune erreur console (hors temps réel simulé)', vraies.length === 0, vraies.slice(0, 5).join(' | '));
  console.log('\nécritures simulées:', log.writes.length, '| appels inconnus:', log.unknown.length ? log.unknown : 'aucun');
  const ko = results.filter(r => !r[0]).length;
  console.log(`\n${results.length - ko}/${results.length} vérifications réussies`);
  await browser.close();
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error('ECHEC DU TEST', e); process.exit(2); });
