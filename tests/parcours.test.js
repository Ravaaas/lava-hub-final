// Contrat de l'application : les parcours de l'équipe, joués dans un vrai navigateur comme un utilisateur
// (on clique sur des textes visibles, on remplit des champs par leur libellé), avec une base Supabase SIMULÉE.
// Ce test ne connaît rien du code : la nouvelle version de l'app doit le réussir tel quel.
//
// Lancer : npm run parcours (compile l'app puis joue les parcours sur dist/, servi en local)
//   CHROME_PATH = navigateur ; APP_URL = autre adresse à tester (par défaut dist/ servi sur le port 4173) ; SCREENSHOTS = dossier de captures ;
//   SEUL = « mot » pour ne jouer que les scénarios dont le nom le contient.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { creerBase, MOT_DE_PASSE, HOST } = require('./mock-supabase');

const CHEMINS = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'].filter(Boolean);
const NAVIGATEUR = CHEMINS.find(p => fs.existsSync(p));
if (!NAVIGATEUR) { console.error('Aucun navigateur trouvé : définis CHROME_PATH'); process.exit(2); }
let APP_URL = process.env.APP_URL;
const SHOTS = process.env.SCREENSHOTS;
const SEUL = (process.env.SEUL || '').toLowerCase();

// ── Outils injectés dans la page : trouver ce qu'un utilisateur voit ──
const OUTILS = () => {
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = el => { if (!el || !el.getClientRects().length) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden'; };
  // Couche active : fenêtre (modale) ouverte, sinon fiche détaillée plein écran, sinon la page.
  const couche = () => {
    const d = [...document.querySelectorAll('[role=dialog],[aria-modal=true],.mo.open')].filter(visible);
    if (d.length) return d[d.length - 1];
    const f = [...document.querySelectorAll('.fd.open,[data-plein-ecran]')].filter(visible);
    return f.length ? f[f.length - 1] : document.body;
  };
  const CLIQUABLES = 'button,a[href],[role=button],[role=tab],[role=menuitem],[role=checkbox],[role=radio],[role=link],[role=option]';
  const libelle = el => norm(el.getAttribute('aria-label') || el.innerText || el.value);
  const cliquables = () => [...couche().querySelectorAll(CLIQUABLES)].filter(e => visible(e) && !e.disabled);
  // Tous les éléments cliquables dont le texte vaut `txt` (sinon commence par, sinon contient).
  function tous(txt) {
    const c = norm(txt), els = cliquables();
    for (const test of [l => l === c, l => l.startsWith(c), l => l.includes(c)]) {
      const r = els.filter(e => test(libelle(e)) || test(norm(e.innerText)));
      if (r.length) return r;
    }
    return [];
  }
  // Bouton `txt` situé dans la même ligne (ou carte) qu'un texte `ligne`.
  function dansLigne(ligne, txt) {
    const l = norm(ligne);
    for (const b of tous(txt)) {
      let p = b.parentElement;
      for (let i = 0; p && i < 5; i++, p = p.parentElement) {
        if (tous(txt).filter(x => p.contains(x)).length > 1) break;   // on a dépassé la ligne
        if (norm(p.innerText).includes(l)) return b;
      }
    }
    return null;
  }
  // Champs dont le libellé, le texte d'aide ou l'aria-label vaut `txt`.
  function champs(txt) {
    const c = norm(txt), racine = couche();
    const saisies = [...racine.querySelectorAll('input:not([type=file]),select,textarea')].filter(visible);
    const sansEtoile = s => norm(s).replace(/\s*\*$/, '');
    const trouves = [];
    const ajoute = e => { if (e && visible(e) && !trouves.includes(e)) trouves.push(e); };
    for (const exact of [true, false]) {
      const ok = s => exact ? sansEtoile(s) === c : sansEtoile(s).startsWith(c);
      saisies.filter(i => ok(i.getAttribute('aria-label')) || ok(i.placeholder)).forEach(ajoute);
      for (const l of [...racine.querySelectorAll('label,.fl')].filter(visible)) {
        if (!ok(l.innerText)) continue;
        ajoute(l.htmlFor ? document.getElementById(l.htmlFor) : (l.querySelector('input,select,textarea') || l.parentElement.querySelector('input,select,textarea')));
      }
      saisies.filter(s => s.tagName === 'SELECT' && [...s.options].some(o => sansEtoile(o.textContent) === c && o.index === 0)).forEach(ajoute);
      if (trouves.length) return trouves;
    }
    return trouves;
  }
  function remplir(el, v) {
    el.focus();
    if (el.type === 'checkbox') { if (el.checked !== !!v) el.click(); return; }
    if (el.tagName === 'SELECT') {
      const o = [...el.options].find(o => norm(o.textContent) === norm(v)) || [...el.options].find(o => o.value === v);
      if (!o) throw new Error(`option « ${v} » absente`);
      v = o.value;
    }
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // Notifications affichées ([role=status], [role=alert]) : enregistrées au fil de l'eau.
  const notifs = [];
  new MutationObserver(recs => {
    for (const r of recs) {
      const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      const n = el && el.closest && el.closest('[role=status],[role=alert],.toast');
      if (n && n.textContent.trim()) notifs.push(n.textContent.trim());
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
  window.__t = { norm, visible, couche, tous, dansLigne, champs, remplir, notifs,
    texte: () => norm(document.body.innerText), texteCouche: () => norm(couche().innerText) };
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const resultats = [];
let scenarioCourant = '';
const check = (nom, ok, detail = '') => {
  resultats.push(!!ok);
  console.log((ok ? 'OK    ' : 'ECHEC ') + `[${scenarioCourant}] ${nom}` + (!ok && detail ? '  → ' + String(detail).slice(0, 300) : ''));
};

// ── Actions d'un utilisateur ──
function actions(page, base) {
  const a = {
    async clic(txt, n = 0) {
      const ok = await page.evaluate((t, n) => { const e = __t.tous(t)[n]; if (!e) return false; e.scrollIntoView({ block: 'center' }); e.click(); return true; }, txt, n);
      if (!ok) throw new Error(`bouton « ${txt} » introuvable`);
      await sleep(350);
    },
    async clicLigne(ligne, txt) {
      const ok = await page.evaluate((l, t) => { const e = __t.dansLigne(l, t); if (!e) return false; e.scrollIntoView({ block: 'center' }); e.click(); return true; }, ligne, txt);
      if (!ok) throw new Error(`bouton « ${txt} » introuvable dans la ligne « ${ligne} »`);
      await sleep(350);
    },
    existe: txt => page.evaluate(t => __t.tous(t).length > 0, txt),
    async remplir(champ, v, n = 0) {
      const ok = await page.evaluate((c, v, n) => { const e = __t.champs(c)[n]; if (!e) return false; __t.remplir(e, v); return true; }, champ, v, n);
      if (!ok) throw new Error(`champ « ${champ} » introuvable`);
      await sleep(150);
    },
    async touche(champ, t) {
      const ok = await page.evaluate(c => { const e = __t.champs(c)[0]; if (e) e.focus(); return !!e; }, champ);
      if (!ok) throw new Error(`champ « ${champ} » introuvable`);
      await page.keyboard.press(t); await sleep(350);
    },
    champ: (c, n = 0) => page.evaluate((c, n) => { const e = __t.champs(c)[n]; return e ? { valeur: e.value, lectureSeule: e.readOnly, desactive: e.disabled, coche: e.checked } : null; }, c, n),
    voit: txt => page.evaluate(t => __t.texte().includes(__t.norm(t)), txt),
    async attend(txt, ms = 6000) {
      try { await page.waitForFunction(t => __t.texte().includes(__t.norm(t)), { timeout: ms, polling: 100 }, txt); return true; } catch (e) { return false; }
    },
    async attendPlus(txt, ms = 6000) {
      try { await page.waitForFunction(t => !__t.texte().includes(__t.norm(t)), { timeout: ms, polling: 100 }, txt); return true; } catch (e) { return false; }
    },
    texte: () => page.evaluate(() => __t.texte()),
    // Les textes apparaissent-ils dans cet ordre ?
    enOrdre: async liste => { const t = await a.texte(); let i = 0; for (const x of liste) { i = t.indexOf(x.toLowerCase(), i); if (i < 0) return false; i += x.length; } return true; },
    marque: () => page.evaluate(() => __t.notifs.length),
    notifsDepuis: m => page.evaluate(m => __t.notifs.slice(m).join(' | '), m),
    async notif(m, re, ms = 5000) {
      const fin = Date.now() + ms;
      while (Date.now() < fin) { const t = await a.notifsDepuis(m); if (re.test(t)) return true; await sleep(100); }
      return false;
    },
    ecritures: (table, methode) => base.etat.ecritures.filter(e => e.table === table && (!methode || e.methode === methode)),
    async attendEcriture(table, methode, ms = 5000) {
      const fin = Date.now() + ms;
      while (Date.now() < fin) { const e = a.ecritures(table, methode); if (e.length) return e[e.length - 1]; await sleep(100); }
      return null;
    },
    // Ouvre un PDF : un nouvel onglet doit afficher un fichier généré (blob:).
    async ouvrePDF(bouton) {
      const nav = page.browser(), avant = new Set(nav.targets());
      await a.clic(bouton);
      const fin = Date.now() + 20000;
      while (Date.now() < fin) {
        const t = nav.targets().find(x => !avant.has(x) && x.url().startsWith('blob:'));
        if (t) { const p = await t.page().catch(() => null); if (p) await p.close().catch(() => {}); return true; }
        await sleep(200);
      }
      return false;
    },
    async onglet(nom) { await a.clic(nom); await sleep(300); },
    async connexion(equipe, profil, mdp = MOT_DE_PASSE) {
      await a.clic(equipe); await a.clic(profil);
      await a.remplir('Mot de passe', mdp); await a.clic('Se connecter');
      return a.attendClic('Menu du profil');
    },
    async attendClic(txt, ms = 8000) {
      try { await page.waitForFunction(t => __t.tous(t).length > 0, { timeout: ms, polling: 100 }, txt); return true; } catch (e) { return false; }
    },
    async deconnexion() { await a.clic('Menu du profil'); await a.clic('Quitter'); return a.attendClic('Cuisine'); },
  };
  return a;
}

// ── Scénarios ──
const SCENARIOS = [];
const scenario = (nom, options, fn) => SCENARIOS.push({ nom, options, fn });

scenario('Connexion', {}, async (a) => {
  check('écran d\'accueil : Cuisine et Salle', await a.existe('Cuisine') && await a.existe('Salle'));
  await a.clic('Cuisine');
  check('profils Cuisine classés par hiérarchie (Admin, Chef, Chef de partie)', await a.enOrdre(['Alexandre RAVASIO', 'Hugo PETIT', 'Julie MARTIN']));
  check('profil sans compte : « Première connexion »', /julie martin.*première connexion/.test(await a.texte()));
  await a.clic('Retour'); await a.clic('Salle');
  check('profils Salle : actifs seulement', await a.voit('Paul BERNARD') && !(await a.voit('Léa')));
  await a.clic('Retour'); await a.clic('Cuisine'); await a.clic('Alexandre RAVASIO');
  await a.remplir('Mot de passe', 'faux'); await a.clic('Se connecter');
  check('mauvais mot de passe : message clair', await a.attend('Mot de passe incorrect'));
  await a.remplir('Mot de passe', MOT_DE_PASSE); await a.clic('Se connecter');
  check('connexion admin', await a.attendClic('Menu du profil'));
  check('admin : Journal, Config, Nouvelle fiche', await a.existe('Journal') && await a.existe('Config') && await a.existe('Nouvelle fiche'));
  // changement de mot de passe
  await a.clic('Menu du profil'); await a.clic('Mot de passe');
  await a.remplir('Nouveau mot de passe', 'court'); await a.remplir('Répète-le', 'court');
  await a.clic('Enregistrer');
  check('nouveau mot de passe trop court refusé', await a.attend('8 caractères minimum'));
  let m = await a.marque();
  await a.remplir('Nouveau mot de passe', 'nouveau-mdp-2026'); await a.remplir('Répète-le', 'nouveau-mdp-2026');
  await a.clic('Enregistrer');
  check('mot de passe changé', await a.notif(m, /mot de passe modifié/i) && a.ecritures('auth', 'PUT').length === 1);
  check('déconnexion : retour à l\'accueil', await a.deconnexion());
});

scenario('Première connexion', {}, async (a) => {
  await a.clic('Cuisine'); await a.clic('Julie MARTIN');
  check('deux champs et « Créer mon mot de passe »', await a.existe('Créer mon mot de passe') && !!(await a.champ('Répète le mot de passe')));
  await a.remplir('Mot de passe', 'abc'); await a.remplir('Répète le mot de passe', 'abc'); await a.clic('Créer mon mot de passe');
  check('moins de 8 caractères refusé', await a.attend('8 caractères minimum'));
  await a.remplir('Mot de passe', 'mon-mot-de-passe'); await a.remplir('Répète le mot de passe', 'autre-chose'); await a.clic('Créer mon mot de passe');
  check('mots de passe différents refusés', await a.attend('différents'));
  check('rien envoyé tant que c\'est invalide', a.ecritures('fonction equipe').length === 0);
  await a.remplir('Mot de passe', 'mon-mot-de-passe'); await a.remplir('Répète le mot de passe', 'mon-mot-de-passe'); await a.clic('Créer mon mot de passe');
  check('compte activé puis connecté', await a.attendClic('Menu du profil') && a.ecritures('fonction equipe').some(e => e.corps.action === 'activer' && e.corps.email === 'julie.martin@lava-hub.local'));
  check('rôle cuisine : lecture seule (ni Nouvelle fiche, ni Journal, ni Config)', !(await a.existe('Nouvelle fiche')) && !(await a.existe('Journal')) && !(await a.existe('Config')));
  await a.onglet('Fiche Recette');
  check('rôle cuisine : ni Best of ni Archive', !(await a.existe('Archive')) && !(await a.existe('Best of')) && await a.existe('Partages'));
  await a.onglet('Groupes');
  check('rôle cuisine : pas de Nouveau groupe', !(await a.existe('Nouveau groupe')));
  await a.deconnexion(); await a.clic('Cuisine');
  check('après activation : plus de « Première connexion »', !/julie martin.{0,40}première connexion/.test(await a.texte()));
});

scenario('Rôle salle', {}, async (a) => {
  check('connexion salle', await a.connexion('Salle', 'Paul BERNARD'));
  check('salle : pas de Nouvelle fiche', !(await a.existe('Nouvelle fiche')));
  await a.onglet('Groupes');
  await a.clic('Nouveau groupe');
  await a.remplir('Nom du groupe', 'Déjeuner Martin'); await a.remplir('Nombre de personnes', '6');
  await a.clic('Enregistrer');
  check('salle : peut créer un groupe', !!(await a.attendEcriture('groupes', 'POST')) && await a.attend('Déjeuner Martin'));
});

scenario('Fiches techniques', {}, async (a, page) => {
  await a.connexion('Cuisine', 'Alexandre RAVASIO');
  check('3 fiches listées', await a.voit('VELOUTÉ CURRY') && await a.voit('CROUSTILLANT SARRASIN') && await a.voit('GANACHE CHOCOLAT'));
  await a.remplir('Rechercher…', 'curry');
  check('recherche par nom', await a.attendPlus('GANACHE CHOCOLAT') && await a.voit('VELOUTÉ CURRY'));
  await a.remplir('Rechercher…', 'sarrasin');
  check('recherche par ingrédient', await a.attend('GANACHE CHOCOLAT') && !(await a.voit('VELOUTÉ CURRY')));
  await a.remplir('Rechercher…', '');
  await a.remplir('Toutes les catégories', 'Dessert');
  check('filtre par catégorie', await a.attendPlus('VELOUTÉ CURRY') && await a.voit('GANACHE CHOCOLAT'));
  await a.remplir('Toutes les catégories', 'Toutes les catégories');
  // détail
  await a.clic('VELOUTÉ CURRY');
  check('détail : ingrédients, quantités, process, conditionnement', await a.attend('CRÈME') && await a.voit('500 g') && await a.voit('Chauffer la crème') && await a.voit('Sac sous vide'));
  await a.remplir('Nombre de portions', '2');
  check('portions ×2 : quantités doublées', await a.attend('1000 g'));
  check('fiche technique : PDF', await a.ouvrePDF('Imprimer'));
  await a.clic('Retour');
  // création
  await a.clic('Nouvelle fiche');
  await page.keyboard.press('Escape'); await sleep(300);
  check('Échap ferme la fenêtre', !(await a.existe('Enregistrer')));
  await a.clic('Nouvelle fiche');
  await a.remplir('Nom', 'jus de veau'); await a.remplir('Catégorie', 'Sauce'); await a.remplir('Quantité nette', '3 L');
  await a.remplir('Ingrédient', 'os de veau'); await a.remplir('Qté', '2');
  await a.remplir('Étape 1', 'Rôtir les os');
  await a.clic('Céleri');
  let m = await a.marque();
  await a.clic('Enregistrer');
  const cree = await a.attendEcriture('fiches', 'POST');
  check('création enregistrée (nom en majuscules, ingrédient, process, allergène)', cree && cree.corps.nom === 'JUS DE VEAU' && cree.corps.categorie === 'Sauce' && cree.corps.allergenes === 'Céleri'
    && cree.corps.ingredients[0].nom === 'OS DE VEAU' && cree.corps.ingredients[0].quantite === '2' && cree.corps.process[0] === 'Rôtir les os', JSON.stringify(cree && cree.corps));
  check('création : confirmée, listée et journalisée', await a.notif(m, /enregistrée/i) && await a.attend('JUS DE VEAU') && a.ecritures('audit_log', 'POST').some(e => /création/.test(e.corps.action) && e.corps.fiche_nom === 'JUS DE VEAU'));
  // doublon
  await a.clic('Nouvelle fiche'); await a.remplir('Nom', 'velouté curry');
  m = await a.marque(); await a.clic('Enregistrer');
  check('doublon refusé', await a.notif(m, /existe déjà/i) && a.ecritures('fiches', 'POST').length === 1);
  await a.clic('Annuler');
  // modification
  await a.clic('VELOUTÉ CURRY'); await a.clic('Modifier');
  await a.remplir('Quantité nette', '3 kg');
  await a.clic('Enregistrer');
  const modif = await a.attendEcriture('fiches', 'PATCH');
  check('modification enregistrée sur la bonne fiche', modif && modif.filtre.id === 'eq.f1' && modif.corps.quantite_nette === '3 kg', JSON.stringify(modif));
  await sleep(500);
  check('détail à jour après la modification', await a.attend('3 kg'));
  await a.clic('Retour');
  check('modification journalisée avec le détail', a.ecritures('audit_log', 'POST').some(e => (e.corps.detail || []).some(d => /Quantité nette : 2 kg → 3 kg/.test(d))));
  // copie
  await a.clic('GANACHE CHOCOLAT'); await a.clic('Copier');
  check('copie d\'une fiche', await a.attend('COPIE DE GANACHE CHOCOLAT'));
  // suppression avec avertissement
  await a.clic('CROUSTILLANT SARRASIN'); await a.clic('Supprimer');
  const avert = await a.texte();
  check('suppression : prévient des fiches qui l\'utilisent', /ganache chocolat/.test(avert) && /cassolette de saint-jacques/.test(avert));
  await a.clic('Supprimer');
  const sup = await a.attendEcriture('fiches', 'DELETE');
  check('suppression enregistrée', sup && sup.filtre.id === 'eq.f2' && await a.attendPlus('CROUSTILLANT SARRASIN'));
});

scenario('Refus des droits', { refuserEcritures: true }, async (a) => {
  await a.connexion('Cuisine', 'Alexandre RAVASIO');
  await a.clic('Nouvelle fiche'); await a.remplir('Nom', 'fiche refusée');
  let m = await a.marque(); await a.clic('Enregistrer');
  check('création refusée par la base : erreur affichée, pas de faux succès', await a.notif(m, /impossible|erreur|droits/i) && !/enregistrée/i.test(await a.notifsDepuis(m)));
  await a.clic('Annuler');
  check('fiche refusée absente de la liste', !(await a.voit('FICHE REFUSÉE')));
  await a.clic('VELOUTÉ CURRY'); await a.clic('Modifier'); await a.remplir('Quantité nette', '9 kg');
  m = await a.marque(); await a.clic('Enregistrer');
  check('modification refusée (0 ligne) : erreur affichée', await a.notif(m, /impossible|erreur|droits/i) && !/modifiée/i.test(await a.notifsDepuis(m)));
});

scenario('Fiches recette', {}, async (a, page) => {
  await a.connexion('Cuisine', 'Alexandre RAVASIO');
  await a.onglet('Fiche Recette');
  check('onglets de statut (admin)', await a.existe('Carte du soir') && await a.existe('Partages') && await a.existe('Lunch') && await a.existe('Best of') && await a.existe('Archive'));
  check('Carte du soir : ses plats et leurs allergènes', await a.attend('CASSOLETTE DE SAINT-JACQUES') && await a.voit('TARTE AU CITRON') && await a.voit('Céleri') && !(await a.voit('HOUMOUS BETTERAVE')));
  await a.clic('Partages');
  check('Partages', await a.attend('HOUMOUS BETTERAVE') && !(await a.voit('TARTE AU CITRON')));
  await a.clic('Archive');
  check('Archive', await a.attend('ANCIEN PLAT'));
  await a.clic('Carte du soir');
  await a.clic('CASSOLETTE DE SAINT-JACQUES');
  check('détail : éléments, grammages, élément libre, allergènes', await a.attend('VELOUTÉ CURRY') && await a.voit('80g') && await a.voit('Herbes fraîches') && await a.voit('Allergènes'));
  check('détail : pas de « modifié par »', !(await a.voit('modifié par')));
  await a.clic('Retour');
  // création avec photo portrait
  await a.clic('Nouvelle fiche recette');
  await a.remplir('Nom du plat', 'Tartare de boeuf'); await a.remplir('Statut', 'Partages');
  await a.remplir('Rechercher une fiche technique…', 'velo');
  await a.clicLigne('VELOUTÉ CURRY', 'Ajouter');
  await a.remplir('Grammage', '60g');
  await a.remplir('Élément libre', 'câpres'); await a.touche('Élément libre', 'Enter');
  check('allergènes calculés depuis les fiches liées', /céleri, lactose/.test(await a.texte()));
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 900; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 600, 900); return c.toDataURL('image/png').split(',')[1]; });
  const fichier = path.join(os.tmpdir(), 'lava-portrait.png'); fs.writeFileSync(fichier, Buffer.from(png, 'base64'));
  const entree = await page.evaluateHandle(() => [...__t.couche().querySelectorAll('input[type=file]')][0]);
  await entree.asElement().uploadFile(fichier); await sleep(800);
  await a.clic('Enregistrer');
  const cree = await a.attendEcriture('fiches_recette', 'POST');
  const sr = cree && cree.corps.sous_recettes;
  check('création : statut, allergènes, éléments dans l\'ordre', cree && cree.corps.nom === 'Tartare de boeuf' && cree.corps.statut === 'partages' && cree.corps.allergenes === 'Céleri, Lactose'
    && sr.length === 2 && sr[0].id === 'f1' && sr[0].grammage === '60g' && sr[1].text === 'câpres', JSON.stringify(cree && { ...cree.corps, photo: undefined }));
  const ratio = cree && cree.corps.photo ? await page.evaluate(src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i.width / i.height); i.src = src; }), cree.corps.photo) : 0;
  check('photo portrait enregistrée recadrée en 16/10 (JPEG)', Math.abs(ratio - 1.6) < 0.02 && /^data:image\/jpeg/.test(cree.corps.photo), ratio);
  // modification depuis la fiche ouverte
  await a.clic('CASSOLETTE DE SAINT-JACQUES'); await a.clic('Modifier');
  await a.remplir('Nom du plat', 'CASSOLETTE DE ST-JACQUES'); await a.clic('Enregistrer');
  const modif = await a.attendEcriture('fiches_recette', 'PATCH');
  check('modification enregistrée, fiche ouverte à jour', modif && modif.filtre.id === 'eq.r1' && await page.waitForFunction(() => /cassolette de st-jacques/.test(__t.texteCouche()), { timeout: 5000 }).then(() => true, () => false));
  await a.clic('Retour');
  // impression puis suppression
  await a.clic('Carte du soir'); await a.clic('TARTE AU CITRON');
  check('fiche recette : PDF', await a.ouvrePDF('Imprimer'));
  await a.clic('Supprimer'); await a.clic('Supprimer');
  const sup = await a.attendEcriture('fiches_recette', 'DELETE');
  check('suppression', sup && sup.filtre.id === 'eq.r2');
});

scenario('Menus', {}, async (a) => {
  await a.connexion('Cuisine', 'Alexandre RAVASIO');
  await a.onglet('Menus');
  await a.clic('Créer les 4 menus');
  check('4 menus créés', !!(await a.attendEcriture('lava_config', 'POST')) && await a.existe('Lunch') && await a.existe('3 temps') && await a.existe('5 temps'));
  await a.clic('Carte du soir');
  check('Carte du soir = Partages, Plat, Dessert', await a.enOrdre(['Partages', 'Plat', 'Dessert']));
  await a.clic('3 temps');
  check('3 temps = Temps 1, 2, 3', await a.enOrdre(['Temps 1', 'Temps 2', 'Temps 3']));
  await a.clic('5 temps');
  check('5 temps = Temps 1 à 5', await a.enOrdre(['Temps 1', 'Temps 2', 'Temps 3', 'Temps 4', 'Temps 5']));
  await a.clic('3 temps'); await a.clic('Modifier');
  const nom = await a.champ('Nom');
  check('menu à temps fixes verrouillé', nom && nom.lectureSeule && !(await a.existe('Ajouter un temps')) && !(await a.existe('Retirer ce temps')));
  await a.clic('Annuler');
  await a.clic('Carte du soir'); await a.clic('Modifier');
  // chaque temps a sa liste des fiches recette (la 1re option est la 1re fiche par ordre alphabétique)
  await a.remplir('ANCIEN PLAT', 'CASSOLETTE DE SAINT-JACQUES', 1); await a.clic('Recette', 1);   // dans « Plat »
  await a.remplir('Ou un plat libre', 'Mignardises maison', 2); await a.clic('Libre', 2);   // dans « Dessert »
  await a.clic('Enregistrer');
  check('menu enregistré : plat, ses éléments, allergènes, plat libre', await a.attend('CASSOLETTE DE SAINT-JACQUES') && await a.voit('VELOUTÉ CURRY · CROUSTILLANT SARRASIN') && await a.voit('Céleri') && await a.voit('Mignardises maison'));
  check('plats rangés dans le bon temps', await a.enOrdre(['Partages', 'Plat', 'CASSOLETTE DE SAINT-JACQUES', 'Dessert', 'Mignardises maison']));
  check('menu : PDF', await a.ouvrePDF('Imprimer'));
});

scenario('Anciens menus', { anciensMenus: true }, async (a) => {
  await a.connexion('Cuisine', 'Alexandre RAVASIO');
  await a.onglet('Menus'); await a.clic('Carte du soir');
  check('Carte du soir d\'avant : chaque plat reste dans son temps', await a.enOrdre(['Partages', 'Plat', 'CASSOLETTE DE SAINT-JACQUES', 'Dessert', 'TARTE AU CITRON']));
  await a.clic('3 temps');
  check('3 temps d\'avant : affiché en Temps 1, 2, 3', await a.enOrdre(['Temps 1', 'Temps 2', 'CASSOLETTE DE SAINT-JACQUES', 'Temps 3']) && !(await a.voit('Entrée')));
});

scenario('Groupes', { anciensMenus: true }, async (a) => {
  await a.connexion('Cuisine', 'Alexandre RAVASIO');
  await a.onglet('Groupes');
  check('à venir seulement', await a.attend('Séminaire Dupont') && !(await a.voit('Mariage Garnier')));
  await a.clic('Passés');
  check('passés', await a.attend('Mariage Garnier') && !(await a.voit('Séminaire Dupont')));
  await a.clic('À venir');
  await a.clic('Nouveau groupe');
  await a.remplir('Nom du groupe', 'Anniversaire Leroy');
  let m = await a.marque(); await a.clic('Enregistrer');
  check('champs obligatoires vérifiés', await a.notif(m, /obligatoires/i) && a.ecritures('groupes', 'POST').length === 0);
  await a.remplir('Nombre de personnes', '8'); await a.remplir('Menu', 'Carte du soir');
  await a.clic('Gluten'); await a.clic('Végétarien');
  await a.remplir('Notes', '2 enfants');
  await a.clic('Enregistrer');
  const cree = await a.attendEcriture('groupes', 'POST');
  check('groupe enregistré', cree && cree.corps.nom === 'Anniversaire Leroy' && cree.corps.pax === 8 && cree.corps.menu_id === 'm1' && cree.corps.menu_nom === 'Carte du soir'
    && cree.corps.allergenes === 'Gluten' && cree.corps.regimes === 'Végétarien' && cree.corps.notes === '2 enfants', JSON.stringify(cree && cree.corps));
  check('alerte de conflit sur la carte du groupe', await a.attend('Anniversaire Leroy') && await a.voit('Conflit avec le menu'));
  await a.clic('Anniversaire Leroy');
  check('fiche groupe : plat en conflit avec l\'allergie', /cassolette de saint-jacques\s*:\s*gluten/.test(await a.texte()));
  check('fiche groupe : pas de « modifié par »', !(await a.voit('modifié par')));
  check('groupe : PDF', await a.ouvrePDF('Imprimer'));
  await a.clic('Modifier'); await a.remplir('Nombre de personnes', '10'); await a.clic('Enregistrer');
  const modif = await a.attendEcriture('groupes', 'PATCH');
  check('groupe modifié', modif && modif.corps.pax === 10);
  await a.clic('Séminaire Dupont'); await a.clic('Supprimer'); await a.clic('Supprimer');
  const sup = await a.attendEcriture('groupes', 'DELETE');
  check('groupe supprimé', sup && sup.filtre.id === 'eq.g1' && await a.attendPlus('Séminaire Dupont'));
});

scenario('Équipe', {}, async (a) => {
  await a.connexion('Cuisine', 'Alexandre RAVASIO');
  await a.onglet('Config');
  check('équipe par équipe et par nom', await a.attend('Cuisine (3)') && await a.voit('Salle (2)') && await a.enOrdre(['MARTIN Julie', 'PETIT Hugo', 'RAVASIO Alexandre']));
  check('membre désactivé signalé', /roux léa.{0,40}désactivé/.test(await a.texte()));
  await a.clic('MARTIN Julie');
  check('fiche membre : jamais d\'identifiant technique', !(await a.voit('lava-hub.local')) && await a.voit('Pas encore connecté'));
  await a.clic('Annuler');
  // ajout
  await a.clic('Ajouter un membre');
  await a.remplir('Prénom', 'Zoé'); await a.remplir('Nom', 'Lefèvre'); await a.remplir('Équipe', 'Salle');
  await a.remplir('Poste', 'Chef de rang'); await a.remplir('Droits', 'Salle (groupes)');
  await a.clic('Enregistrer');
  const ajout = await a.attendEcriture('membres', 'POST');
  check('membre ajouté (identifiant fabriqué, compte à créer)', ajout && ajout.corps.email === 'zoe.lefevre@lava-hub.local' && ajout.corps.compte_cree === false && ajout.corps.role === 'salle' && ajout.corps.poste === 'Chef de rang', JSON.stringify(ajout && ajout.corps));
  check('membre ajouté listé', await a.attend('LEFÈVRE Zoé'));
  await a.clic('Ajouter un membre');
  await a.remplir('Prénom', 'Julie'); await a.remplir('Nom', 'Martin'); await a.clic('Enregistrer');
  await sleep(800);
  check('homonyme : identifiant distinct', a.ecritures('membres', 'POST').some(e => e.corps.email === 'julie.martin2@lava-hub.local'));
  // couper l'accès
  await a.clic('BERNARD Paul'); await a.remplir('Accès actif', false); await a.clic('Enregistrer');
  const coupe = await a.attendEcriture('membres', 'PATCH');
  check('accès coupé', coupe && coupe.filtre.email === 'eq.paul.bernard@lava-hub.local' && coupe.corps.actif === false);
  // réinitialiser
  await a.clic('PETIT Hugo'); await a.clic('Réinitialiser le mot de passe'); await a.clic('Réinitialiser');
  await sleep(800);
  check('compte réinitialisé', a.ecritures('fonction equipe').some(e => e.corps.action === 'reinitialiser' && e.corps.email === 'hugo.petit@lava-hub.local'));
  // soi-même
  await a.clic('RAVASIO Alexandre');
  const actif = await a.champ('Accès actif');
  check('l\'admin ne peut ni se couper l\'accès ni se supprimer', (!actif || actif.desactive) && !(await a.existe('Supprimer')));
  await a.clic('Annuler');
});

scenario('Catégories et sauvegardes', {}, async (a) => {
  await a.connexion('Cuisine', 'Alexandre RAVASIO');
  await a.onglet('Config'); await a.clic('Catégories');
  await a.remplir('Nouvelle catégorie…', 'Boulangerie'); await a.clic('Ajouter');
  const cfg = await a.attendEcriture('lava_config', 'POST');
  check('catégorie ajoutée', cfg && cfg.corps.data.cats.includes('Boulangerie') && await a.attend('Boulangerie'));
  const m = await a.marque();
  await a.clicLigne('Sauce', 'Supprimer');
  check('catégorie utilisée : suppression refusée', await a.notif(m, /utilisée/i) && await a.voit('Sauce'));
  await a.clic('Sauvegarde');
  check('sauvegardes automatiques listées', await a.attendClic('Télécharger'));
  const m2 = await a.marque(); await a.clic('Sauvegarder maintenant');
  check('sauvegarde immédiate', await a.notif(m2, /sauvegarde faite/i) && a.ecritures('sauvegardes').length === 1);
});

scenario('Journal', {}, async (a) => {
  await a.connexion('Cuisine', 'Alexandre RAVASIO');
  await a.onglet('Journal');
  check('mises à jour de l\'app et modifications', await a.attend('Onglet Partages') && await a.voit('VELOUTÉ CURRY') && await a.voit('CRÈME : 400 g → 500 g'));
  await a.clic('Modifications');
  check('filtre Modifications', await a.attendPlus('Onglet Partages') && await a.voit('VELOUTÉ CURRY'));
});

scenario('Téléphone', { mobile: true }, async (a, page) => {
  check('connexion sur téléphone', await a.connexion('Cuisine', 'Alexandre RAVASIO'));
  const debords = [];
  for (const nom of ['Fiches', 'Recettes', 'Menus', 'Groupes', 'Config', 'Journal']) {
    await a.onglet(nom);
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) debords.push(nom);
  }
  check('aucun défilement horizontal sur les onglets', debords.length === 0, debords.join(', '));
});

// ── Déroulé ──
(async () => {
  // Sans APP_URL : sert la version compilée (dist/) le temps du test.
  let serveur = null;
  if (!APP_URL) {
    const { preview } = await import('vite');
    serveur = await preview({ configFile: path.join(__dirname, '..', 'vite.config.mts'), preview: { port: 4173, strictPort: true } });
    APP_URL = serveur.resolvedUrls.local[0];
  }
  const navigateur = await puppeteer.launch({ executablePath: NAVIGATEUR, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const erreurs = [];
  for (const s of SCENARIOS) {
    if (SEUL && !s.nom.toLowerCase().includes(SEUL)) continue;
    scenarioCourant = s.nom;
    const base = creerBase(s.options);
    const contexte = await (navigateur.createBrowserContext || navigateur.createIncognitoBrowserContext).call(navigateur);   // navigateur vierge : aucune session gardée
    const page = await contexte.newPage();
    await page.setViewport(s.options.mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 860 });
    page.on('console', m => { if (m.type() === 'error') erreurs.push(`[${s.nom}] ${m.text()}`); });
    page.on('pageerror', e => erreurs.push(`[${s.nom}] PAGEERROR ${e.message}`));
    page.on('dialog', d => d.accept());
    await page.setRequestInterception(true);
    page.on('request', req => { if (req.url().includes(HOST) && !req.url().includes('/realtime/')) base.gerer(req); else req.continue(); });
    await page.evaluateOnNewDocument(OUTILS);
    await page.goto(APP_URL, { waitUntil: 'networkidle2', timeout: 40000 });
    const a = actions(page, base);
    await a.attendClic('Cuisine');
    try { await s.fn(a, page, base); } catch (e) { check('déroulé du scénario', false, e.message); }
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, s.nom.replace(/\W+/g, '-') + '.png') }).catch(() => {});
    if (base.etat.inconnus.length) check('aucun appel inconnu à la base', false, base.etat.inconnus.join(', '));
    await contexte.close();
  }
  scenarioCourant = 'Général';
  const vraies = erreurs.filter(e => !/realtime|websocket|favicon|Failed to load resource/i.test(e));
  check('aucune erreur dans la console', vraies.length === 0, vraies.slice(0, 5).join(' | '));
  const ko = resultats.filter(r => !r).length;
  console.log(`\n${resultats.length - ko}/${resultats.length} vérifications réussies`);
  await navigateur.close();
  if (serveur) await serveur.close();
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error('ECHEC DU TEST', e); process.exit(2); });
