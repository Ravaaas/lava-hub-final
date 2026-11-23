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
let creerBase, MOT_DE_PASSE, HOST;   // chargés au début du déroulé (module ES)

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
    const saisies = [...racine.querySelectorAll('input:not([type=file]),select,textarea,[aria-haspopup=listbox]')].filter(visible);
    const sansEtoile = s => norm(s).replace(/\s*\*$/, '');
    const trouves = [];
    const ajoute = e => { if (e && visible(e) && !trouves.includes(e)) trouves.push(e); };
    for (const exact of [true, false]) {
      const ok = s => exact ? sansEtoile(s) === c : sansEtoile(s).startsWith(c);
      saisies.filter(i => ok(i.getAttribute('aria-label')) || ok(i.placeholder)).forEach(ajoute);
      for (const l of [...racine.querySelectorAll('label,.fl')].filter(visible)) {
        if (!ok(l.innerText)) continue;
        ajoute(l.htmlFor ? document.getElementById(l.htmlFor) : (l.querySelector('input,select,textarea') || l.parentElement.querySelector('input,select,textarea,[aria-haspopup=listbox]')));
      }
      saisies.filter(s => s.matches('[aria-haspopup=listbox]') && sansEtoile(s.innerText) === c).forEach(ajoute);   // liste de choix : par sa valeur affichée
      saisies.filter(s => s.tagName === 'SELECT' && [...s.options].some(o => sansEtoile(o.textContent) === c && o.index === 0)).forEach(ajoute);
      if (trouves.length) return trouves;
    }
    return trouves;
  }
  // Liste de choix (bouton + liste) : on l'ouvre puis on clique l'option, comme un utilisateur.
  async function choisir(el, v) {
    el.click(); await new Promise(r => setTimeout(r, 80));
    const o = [...el.closest('.sel').querySelectorAll('[role=option]')].find(o => norm(o.innerText) === norm(v));
    if (!o) throw new Error(`option « ${v} » absente`);
    o.click(); await new Promise(r => setTimeout(r, 80));
  }
  function remplir(el, v) {
    if (el.matches('[aria-haspopup=listbox]')) return choisir(el, v);
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
    // Bouton d'un choix (boutons côte à côte) actuellement retenu
    estActif: txt => page.evaluate(t => __t.tous(t).some(e => e.getAttribute('aria-pressed') === 'true'), txt),
    async remplir(champ, v, n = 0) {
      const ok = await page.evaluate(async (c, v, n) => { const e = __t.champs(c)[n]; if (!e) return false; await __t.remplir(e, v); return true; }, champ, v, n);
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
    /** Clique « Imprimer » (impression du navigateur, interceptée) et renvoie ce qui serait imprimé. */
    async imprime(bouton) {
      await page.evaluate(() => { window.__impressions = 0; window.print = () => { window.__impressions++; }; });
      await a.clic(bouton);
      await page.emulateMediaType('print');
      const r = await page.evaluate(() => ({ n: window.__impressions, texte: __t.norm(document.body.innerText) }));
      await page.emulateMediaType(null);
      return r;
    },
    /** Feuille imprimée sur A4 (PDF de Chrome) : nombre de pages et marge haute de la page imprimée (règle @page). */
    async feuilleA4() {
      const pdf = Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');
      const margeHaute = await page.evaluate(() => {
        const regles = l => [...l].flatMap(r => [r, ...(r.cssRules ? regles(r.cssRules) : [])]);
        const p = [...document.styleSheets].flatMap(f => { try { return regles(f.cssRules); } catch (e) { return []; } }).find(r => r instanceof CSSPageRule);
        return p ? p.style.marginTop : '';
      });
      return { pages: (pdf.match(/\/Type\s*\/Page(?![s\w])/g) || []).length, margeHaute };
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
  check('rôle cuisine : pas de Nouveau groupe ni de Contacts', !(await a.existe('Nouveau groupe')) && !(await a.existe('Contacts')));
  await a.clic('Séminaire Dupont');
  check('rôle cuisine : nom du référent, sans email ni téléphone', await a.attend('Claire Dupont') && await a.enOrdre(['Référent et règlement', 'Référent', 'Claire Dupont', 'Règlement', 'Rien reçu']) && !(await a.voit('Coordonnées du référent')) && !(await a.voit('claire.dupont@exemple.fr')) && !(await a.voit('06 12 34 56 78')));
  await a.clic('Retour');
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
  check('salle : pas d\'onglet Pertes & Perso', !(await a.existe('Pertes & Perso')));
});

scenario('Fiches techniques', {}, async (a, page) => {
  await a.connexion('Cuisine', 'Alexandre RAVASIO');
  check('3 fiches listées', await a.voit('VELOUTÉ CURRY') && await a.voit('CROUSTILLANT SARRASIN') && await a.voit('GANACHE CHOCOLAT'));
  await a.remplir('Rechercher…', 'curry');
  check('recherche par nom', await a.attendPlus('GANACHE CHOCOLAT') && await a.voit('VELOUTÉ CURRY'));
  await a.remplir('Rechercher…', 'sarrasin');
  check('recherche par ingrédient', await a.attend('GANACHE CHOCOLAT') && !(await a.voit('VELOUTÉ CURRY')));
  await a.remplir('Rechercher…', '');
  await a.remplir('Catégorie', 'Dessert');
  check('filtre par catégorie', await a.attendPlus('VELOUTÉ CURRY') && await a.voit('GANACHE CHOCOLAT'));
  await a.remplir('Catégorie', 'Toutes les catégories');
  // détail
  await a.clic('VELOUTÉ CURRY');
  check('détail : ingrédients, quantités, process, conditionnement', await a.attend('CRÈME') && await a.voit('500 g') && await a.voit('Chauffer la crème') && await a.voit('Sac sous vide'));
  await a.remplir('Nombre de portions', '2');
  check('portions ×2 : quantités doublées', await a.attend('1000 g'));
  const impFT = await a.imprime('Imprimer');
  check('fiche technique : impression de la fiche seule, portions comprises', impFT.n === 1 && impFT.texte.includes('fiche technique') && impFT.texte.includes('1000 g')
    && !impFT.texte.includes('retour') && !impFT.texte.includes('croustillant sarrasin'), impFT.texte.slice(0, 200));
  const a4 = await a.feuilleA4();
  check('impression A4 : 1 page, commencée à 4 cm du haut de chaque page', a4.pages === 1 && a4.margeHaute === '40mm', JSON.stringify(a4));
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
  await a.remplir('Nom du plat', 'Tartare de boeuf'); await a.clic('Partages');
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
  const impFR = await a.imprime('Imprimer');
  check('fiche recette : impression de la fiche seule', impFR.n === 1 && impFR.texte.includes('fiche recette') && impFR.texte.includes('tarte au citron')
    && !impFR.texte.includes('retour') && !impFR.texte.includes('cassolette'), impFR.texte.slice(0, 200));
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
  const impM = await a.imprime('Imprimer');
  check('menu : impression de la feuille seule', impM.n === 1 && impM.texte.includes('carte du soir') && impM.texte.includes('mignardises maison')
    && !impM.texte.includes('nouveau menu') && !impM.texte.includes('5 temps'), impM.texte.slice(0, 200));
});

scenario('Anciens menus', { anciensMenus: true }, async (a) => {
  await a.connexion('Cuisine', 'Alexandre RAVASIO');
  await a.onglet('Menus'); await a.clic('Carte du soir');
  check('Carte du soir d\'avant : chaque plat reste dans son temps', await a.enOrdre(['Partages', 'Plat', 'CASSOLETTE DE SAINT-JACQUES', 'Dessert', 'TARTE AU CITRON']));
  await a.clic('3 temps');
  check('3 temps d\'avant : affiché en Temps 1, 2, 3', await a.enOrdre(['Temps 1', 'Temps 2', 'CASSOLETTE DE SAINT-JACQUES', 'Temps 3']) && !(await a.voit('Entrée')));
});

scenario('Groupes', { anciensMenus: true }, async (a, page) => {
  await a.connexion('Cuisine', 'Alexandre RAVASIO');
  await a.onglet('Groupes');
  check('à venir seulement', await a.attend('Séminaire Dupont') && !(await a.voit('Mariage Garnier')));
  check('allergie sans nombre saisi : × 1', await a.voit('Gluten × 1'));
  await a.clic('Passés');
  check('passés', await a.attend('Mariage Garnier') && !(await a.voit('Séminaire Dupont')));
  await a.clic('À venir');
  await a.clic('Nouveau groupe');
  await a.remplir('Nom du groupe', 'Anniversaire Leroy');
  let m = await a.marque(); await a.clic('Enregistrer');
  check('champs obligatoires vérifiés', await a.notif(m, /obligatoires/i) && a.ecritures('groupes', 'POST').length === 0);
  await a.remplir('Nombre de personnes', '8.5');
  m = await a.marque(); await a.clic('Enregistrer');
  check('nombre de personnes : entier exigé', await a.notif(m, /entier/i) && a.ecritures('groupes', 'POST').length === 0);
  await a.remplir('Nombre de personnes', '8'); await a.remplir('Menu', 'Carte du soir');
  // une ligne par personne : 1 personne Gluten + Moutarde, à part de 2 personnes Gluten et végétariennes
  check('allergies : aucune ligne au départ', await a.voit('Aucune allergie ni régime déclaré'));
  await a.clic('Ajouter une personne'); await a.clic('Gluten'); await a.clic('Moutarde');
  await a.clic('Ajouter une personne'); await a.clic('Gluten'); await a.clic('Végétarien');
  check('ligne précédente refermée et résumée', await a.voit('Gluten · Moutarde') && await a.voit('Gluten · Végétarien'));
  await a.remplir('Nombre de personnes — ligne 2', '9');
  m = await a.marque(); await a.clic('Enregistrer');
  check('allergies : pas plus de personnes que le groupe', await a.notif(m, /10 personnes déclarées pour 8/i) && a.ecritures('groupes', 'POST').length === 0);
  await a.remplir('Nombre de personnes — ligne 2', '2');
  // allergie hors liste écrite à la main : cherchée dans les ingrédients des fiches techniques du plat (fiche VELOUTÉ CURRY de la cassolette)
  await a.clic('Ajouter une personne');
  await a.remplir('Autre allergie ou intolérance — ligne 3', '  curry ');
  await a.clic('Ajouter');
  const puce = t => page.evaluate(t => [...document.querySelectorAll('[role=checkbox]')].filter(e => e.textContent.trim() === t).map(e => e.getAttribute('aria-checked')), t);
  check('allergie libre : ajoutée comme puce cochée', (await a.champ('Autre allergie ou intolérance — ligne 3'))?.valeur === '' && JSON.stringify(await puce('Curry')) === '["true"]');
  await a.remplir('Autre allergie ou intolérance — ligne 3', 'gluten'); await a.clic('Ajouter');
  check('allergie libre : « gluten » coche l\'allergène Gluten, sans doublon', await a.voit('Curry · Gluten') && JSON.stringify(await puce('Gluten')) === '["true"]');
  await a.clic('Gluten');
  check('formulaire : plats à adapter expliqués', await a.enOrdre(['Plats à adapter', 'CASSOLETTE DE SAINT-JACQUES — Gluten, Curry (VELOUTÉ CURRY) · 4 pers.', 'TARTE AU CITRON — Gluten · 3 pers.']), (await a.texte()).replace(/^[\s\S]*allergies et régimes/, '').slice(0, 400));
  await a.remplir('Notes', '2 enfants');
  await a.remplir('Boissons précommandées', '3 magnums de Chablis\nEaux et cafés');
  check('règlement : rien reçu par défaut', await a.estActif('Rien reçu'));
  await a.clic('Acompte versé');
  // Niveaux recopiés du menu choisi ; nombre de chaque plat commandé à l'avance, total comparé au nombre de personnes
  check('niveaux du menu recopiés', await a.enOrdre(['Niveaux du menu', 'Aucun plat', 'CASSOLETTE DE SAINT-JACQUES', 'TARTE AU CITRON', 'Ajouter un niveau']) && !!(await a.champ('Nombre — TARTE AU CITRON'))
    && JSON.stringify(await Promise.all([0, 1, 2].map(async n => (await a.champ('Nom du niveau', n))?.valeur))) === JSON.stringify(['Partages', 'Plat', 'Dessert']));
  await a.remplir('Nombre — CASSOLETTE DE SAINT-JACQUES', '5');
  check('total d\'un niveau : écart signalé', await a.attend('Total : 5 / 8 pers. — il manque 3'));
  await a.remplir('Nombre — CASSOLETTE DE SAINT-JACQUES', '9');
  m = await a.marque(); await a.clic('Enregistrer');
  check('nombre de plats : pas plus que le groupe', await a.notif(m, /plats : un entier entre 1 et 8/i) && a.ecritures('groupes', 'POST').length === 0);
  await a.remplir('Nombre — CASSOLETTE DE SAINT-JACQUES', '8');
  check('total d\'un niveau juste', await a.attend('Total : 8 / 8 pers.') && !(await a.voit('il manque')));
  await a.remplir('Nombre — TARTE AU CITRON', '6');
  // autant de niveaux que nécessaire
  await a.clic('Ajouter un niveau');
  await a.remplir('Nom du niveau', 'Mignardises', 3);
  await a.remplir('Plat libre (Mignardises)', 'Café gourmand'); await a.clic('Libre', 3);
  await a.remplir('Nombre — Café gourmand', '2');
  // un plat sans nombre reste dans le formulaire mais n'est pas servi : absent de la fiche
  await a.remplir('Plat libre (Dessert)', 'Sorbet maison'); await a.clic('Libre', 2);
  // plat de remplacement : la cassolette sans gluten à la place de la cassolette, pour les personnes allergiques
  await a.remplir('Plat libre (Plat)', 'Cassolette sans gluten'); await a.clic('Libre', 1);
  await a.clic('Remplace un plat — Cassolette sans gluten');
  await a.remplir('Remplace — Cassolette sans gluten', 'CASSOLETTE DE SAINT-JACQUES');
  // personne servie avec ce plat : la personne allergique au curry mange la cassolette sans gluten
  await a.clic('Pour qui — Cassolette sans gluten');
  await a.clic('1 pers. — Curry');
  check('pour qui : personne reliée au plat', JSON.stringify(await puce('1 pers. — Curry')) === '["true"]' && !(await puce('2 pers. — Gluten · Végétarien')).includes('true'));
  check('remplacement : conflit adapté dans l\'encadré', await a.enOrdre(['Plats à adapter', 'CASSOLETTE DE SAINT-JACQUES — Gluten, Curry (VELOUTÉ CURRY) · 4 pers. → remplacé par Cassolette sans gluten', 'TARTE AU CITRON — Gluten · 3 pers.']), (await a.texte()).replace(/^[\s\S]*plats à adapter/, '').slice(0, 300));
  // depuis l'encadré : choisir le plat adapté sur la ligne en conflit (et le retirer)
  await a.remplir('Adapté avec — CASSOLETTE DE SAINT-JACQUES', 'Adapté avec : choisir le plat');
  check('encadré : retrait du plat adapté', !(await a.voit('remplacé par Cassolette sans gluten')) && await a.voit('Plats à adapter'));
  await a.remplir('Adapté avec — CASSOLETTE DE SAINT-JACQUES', 'Cassolette sans gluten');
  check('encadré : plat adapté choisi depuis la ligne en conflit', await a.voit('remplacé par Cassolette sans gluten') && await a.voit('à la place de'));
  // montant de l'acompte (champ affiché dès que quelque chose est reçu) et référent du groupe
  await a.remplir("Montant de l'acompte (€)", 'trois cents');
  m = await a.marque(); await a.clic('Enregistrer');
  check('montant illisible refusé', await a.notif(m, /Montant/) && a.ecritures('groupes', 'POST').length === 0);
  await a.remplir("Montant de l'acompte (€)", '250,50');
  await a.remplir('Nom du référent', 'Sophie Leroy'); await a.remplir('Email du référent', 'sophie@'); await a.remplir('Téléphone du référent', '06 11 22 33 44');
  m = await a.marque(); await a.clic('Enregistrer');
  check('email du référent invalide refusé', await a.notif(m, /Email du référent/) && a.ecritures('groupes', 'POST').length === 0);
  await a.remplir('Email du référent', 'sophie.leroy@exemple.fr');
  await a.clic('Enregistrer');
  const cree = await a.attendEcriture('groupes', 'POST');
  const contact = await a.attendEcriture('groupes_contacts', 'POST');
  check('montant et référent enregistrés', cree && cree.corps.montant === 250.5 && cree.corps.referent === 'Sophie Leroy' && !('email' in cree.corps), JSON.stringify(cree && cree.corps));
  check('coordonnées du référent dans la base de contacts', contact && cree && contact.corps.groupe_id === cree.corps.id && contact.corps.nom === 'Sophie Leroy'
    && contact.corps.email === 'sophie.leroy@exemple.fr' && contact.corps.telephone === '06 11 22 33 44' && contact.corps.groupe === 'Anniversaire Leroy', JSON.stringify(contact && contact.corps));
  check('groupe enregistré', cree && cree.corps.nom === 'Anniversaire Leroy' && cree.corps.pax === 8 && cree.corps.menu_id === 'm1' && cree.corps.menu_nom === 'Carte du soir'
    && cree.corps.allergenes === 'Gluten (3), Moutarde (1), Curry (1)' && cree.corps.regimes === 'Végétarien (2)' && cree.corps.notes === '2 enfants'
    && JSON.stringify(cree.corps.profils.map(({ id, ...p }) => p)) === JSON.stringify([{ nb: 1, allergenes: ['Gluten', 'Moutarde'], regimes: [] }, { nb: 2, allergenes: ['Gluten'], regimes: ['Végétarien'] }, { nb: 1, allergenes: ['Curry'], regimes: [] }])
    && cree.corps.boissons === '3 magnums de Chablis\nEaux et cafés' && cree.corps.reglement === 'acompte', JSON.stringify(cree && cree.corps));
  check('niveaux et quantités enregistrés', cree && JSON.stringify(cree.corps.niveaux) === JSON.stringify([
    { nom: 'Plat', plats: [{ frId: 'r1', qte: 8 }, { text: 'Cassolette sans gluten', qte: null, remplace: 'r1', pour: [cree.corps.profils[2].id] }] }, { nom: 'Dessert', plats: [{ frId: 'r2', qte: 6 }, { text: 'Sorbet maison', qte: null }] }, { nom: 'Mignardises', plats: [{ text: 'Café gourmand', qte: 2 }] },
  ]), JSON.stringify(cree && cree.corps.niveaux));
  check('alerte de conflit sur la carte du groupe', await a.attend('Anniversaire Leroy') && await a.voit('Conflit : TARTE AU CITRON (Gluten)') && !(await a.voit('Conflit : CASSOLETTE')));
  await a.clic('Anniversaire Leroy');
  check('fiche groupe : plat en conflit avec l\'allergie', /cassolette de saint-jacques[\s\S]*gluten/.test(await a.texte()));
  check('fiche groupe : encadré des plats à adapter avant le menu', await a.enOrdre(['Plats à adapter', 'CASSOLETTE DE SAINT-JACQUES — Gluten, Curry (VELOUTÉ CURRY) · 4 pers. → remplacé par Cassolette sans gluten', 'TARTE AU CITRON — Gluten · 3 pers.', 'Plat', '8 / 8 pers.', 'CASSOLETTE DE SAINT-JACQUES', 'Cassolette sans gluten · à la place de CASSOLETTE DE SAINT-JACQUES', 'Dessert']));
  check('fiche groupe : une ligne par personne', await a.enOrdre(['Restrictions', '1 pers.', 'Gluten', 'Moutarde', '2 pers.', 'Gluten', 'Végétarien', '1 pers.', 'Curry', 'Référent et règlement']));
  check('fiche groupe : boissons précommandées et règlement', await a.enOrdre(['Boissons précommandées', '3 magnums de Chablis', 'Eaux et cafés', 'Restrictions', 'Règlement', 'Acompte versé']));
  check('fiche groupe : référent, coordonnées et montant à l\'écran', await a.enOrdre(['Référent et règlement', 'Référent', 'Sophie Leroy', 'Règlement', 'Acompte versé · 250,50 €', 'Coordonnées du référent', 'sophie.leroy@exemple.fr', '06 11 22 33 44', 'Notes']));
  check('fiche groupe : salle et menu en tête', await a.voit('Menu Carte du soir') && await a.voit('Salle principale'));
  check('fiche groupe : niveaux, quantités et totaux', await a.enOrdre(['Plat', '8 / 8 pers.', '8', 'CASSOLETTE DE SAINT-JACQUES', 'Dessert', '6 / 8 pers. · il manque 2', '6', 'TARTE AU CITRON', 'Mignardises', '2', 'Café gourmand']), (await a.texte()).slice(0, 600));
  check('fiche groupe : personnes servies écrites en face du plat', await a.enOrdre(['Cassolette sans gluten', 'à la place de CASSOLETTE DE SAINT-JACQUES', 'Pour', 'Curry · 1 pers.', 'Dessert']));
  check('fiche groupe : plat sans nombre non affiché', !(await a.voit('Sorbet maison')));
  check('fiche groupe : pas de « modifié par »', !(await a.voit('modifié par')));
  // Impression : la fiche telle qu'à l'écran, sans les boutons ni le reste de l'app
  const imprime = await a.imprime('Imprimer');
  check('groupe : impression de la fiche seule', imprime.n === 1 && imprime.texte.includes('fiche groupe') && imprime.texte.includes('anniversaire leroy')
    && !imprime.texte.includes('retour') && !imprime.texte.includes('séminaire dupont'), imprime.texte.slice(0, 200));
  check('impression : nom du référent, sans email, téléphone ni montant', imprime.texte.includes('référent et règlement') && imprime.texte.includes('sophie leroy') && !imprime.texte.includes('coordonnées') && !imprime.texte.includes('sophie.leroy@') && !imprime.texte.includes('06 11 22') && !imprime.texte.includes('250'), imprime.texte);
  await a.clic('Modifier');
  check('modification : plat sans nombre toujours dans le formulaire, pas de brouillon sur un groupe validé', await a.voit('Sorbet maison') && !(await a.voit('Enregistrer en brouillon')));
  check('modification : lignes d\'allergies reprises', await a.voit('Gluten · Moutarde') && await a.voit('Gluten · Végétarien') && (await a.champ('Nombre de personnes — ligne 2'))?.valeur === '2');
  check('modification : coordonnées et montant repris', (await a.champ('Email du référent'))?.valeur === 'sophie.leroy@exemple.fr' && (await a.champ("Montant de l'acompte (€)"))?.valeur === '250,5');
  await a.remplir('Nombre de personnes', '10');
  check('modification : niveaux et quantités repris', await a.attend('Total : 8 / 10 pers. — il manque 2') && await a.voit('Café gourmand'), (await a.texte()).replace(/^[\s\S]*niveaux du menu/, '').slice(0, 800));
  await a.remplir('Menu', '3 temps');
  check('changer de menu : confirmation avant de remplacer les niveaux', await a.voit('Remplacer les niveaux'));
  await a.clic('Annuler');
  check('remplacement refusé : niveaux gardés', await a.attendPlus('Remplacer les niveaux') && await a.voit('Café gourmand'));
  await a.clic('Enregistrer');
  const modif = await a.attendEcriture('groupes', 'PATCH');
  check('groupe modifié', modif && modif.corps.pax === 10 && modif.corps.menu_id === 'm1' && modif.corps.niveaux.length === 3, JSON.stringify(modif && modif.corps));
  const modifContact = await (async () => { for (let i = 0; i < 50; i++) { const e = a.ecritures('groupes_contacts', 'POST'); if (e.length > 1) return e[e.length - 1]; await new Promise(r => setTimeout(r, 100)); } return null; })();
  check('modification : coordonnées réenregistrées sur la même ligne', modifContact && modifContact.corps.groupe_id === cree.corps.id && modifContact.corps.email === 'sophie.leroy@exemple.fr', JSON.stringify(modifContact && modifContact.corps));
  await a.clic('Séminaire Dupont'); await a.clic('Supprimer'); await a.clic('Supprimer');
  const sup = await a.attendEcriture('groupes', 'DELETE');
  check('groupe supprimé', sup && sup.filtre.id === 'eq.g1' && await a.attendPlus('Séminaire Dupont'));
  // Base de contacts : un par email, groupes supprimés compris, et export CSV
  await page.evaluate(() => { URL.createObjectURL = b => { b.text().then(t => { window.__csv = t; }); return 'data:text/plain,'; }; });
  await a.clic('Contacts');
  check('contacts des groupes : référents par date de groupe, groupe supprimé compris', await a.attend('Contacts des groupes') && await a.enOrdre(['3 contacts', 'Claire Dupont', 'Sophie Leroy', 'sophie.leroy@exemple.fr · 06 11 22 33 44', 'Anniversaire Leroy', 'Marc Ancien', 'Pot de départ']), (await a.texte()).slice(0, 600));
  await a.clic('Télécharger (CSV)');
  const csv = await page.waitForFunction(() => window.__csv, { timeout: 3000 }).then(h => h.jsonValue()).catch(() => '');
  check('contacts : fichier CSV pour Excel', csv.replace(/^\ufeff/, '').startsWith('Nom;Email;Téléphone;') && csv.includes('Sophie Leroy;sophie.leroy@exemple.fr;06 11 22 33 44;Anniversaire Leroy;') && csv.includes('Marc Ancien;marc@exemple.fr;;Pot de départ;2025-06-01;1'), csv);
  await a.clic('Fermer');
  // Menu sur mesure : pas de menu choisi → on compose les plats (fiche recette ou plat libre)
  await a.clic('Nouveau groupe');
  await a.remplir('Nom du groupe', 'Cocktail Petit'); await a.remplir('Nombre de personnes', '15');
  check('sur mesure : niveaux Entrée, Plat, Dessert proposés', await a.enOrdre(['Niveaux du menu', 'Aucun plat', 'Aucun plat', 'Aucun plat', 'Ajouter un niveau']));
  await a.remplir('Fiche recette à ajouter (Entrée)', 'CASSOLETTE DE SAINT-JACQUES'); await a.clic('Recette');
  await a.remplir('Plat libre (Plat)', 'Pain maison'); await a.clic('Libre', 1);
  await a.clic('Retirer ce niveau', 2);
  await a.remplir('Nombre — CASSOLETTE DE SAINT-JACQUES', '15');
  await a.clic('Ajouter une personne'); await a.clic('Gluten'); await a.clic('Enregistrer');
  const sm = await a.attendEcriture('groupes', 'POST');
  check('menu sur mesure enregistré', sm && sm.corps.menu_id === null && JSON.stringify(sm.corps.niveaux) === JSON.stringify([{ nom: 'Entrée', plats: [{ frId: 'r1', qte: 15 }] }, { nom: 'Plat', plats: [{ text: 'Pain maison', qte: null }] }])
    && JSON.stringify(sm.corps.plats_sur_mesure) === JSON.stringify([{ frId: 'r1' }, { text: 'Pain maison' }]), JSON.stringify(sm && sm.corps));
  check("sur mesure : conflit avec l'allergie", await a.attend('Cocktail Petit') && await a.voit('Conflit : CASSOLETTE DE SAINT-JACQUES (Gluten)'));
  await a.clic('Cocktail Petit');
  check('sur mesure : niveaux sur la fiche, plat sans nombre marqué –', await a.attend('Pain maison') && await a.voit('Menu sur mesure') && !(await a.voit('Menu choisi'))
    && await a.enOrdre(['Entrée', '15 / 15 pers.', '15', 'CASSOLETTE DE SAINT-JACQUES', 'Plat', '–', 'Pain maison']));
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
  await a.remplir('Prénom', 'Zoé'); await a.remplir('Nom', 'Lefèvre'); await a.clic('Salle');
  await a.remplir('Poste', 'Chef de rang'); await a.clic('Salle (groupes)');
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

scenario('Yokitup', {}, async (a, page, base) => {
  // tarte : un élément absent de Yokitup en plus du grammage vide → 2 écarts (pour le tri de la liste « Reliés »)
  base.db.fiches_recette[1].sous_recettes.push({ text: 'Zeste de citron', grammage: '5g' });
  await a.connexion('Cuisine', 'Alexandre RAVASIO');
  await a.onglet('Config'); await a.clic('Yokitup');
  check('avant toute lecture : rien à relier', await a.attend('Aucune lecture pour le moment') && await a.voit('Aucun plat relié'));
  let m = await a.marque();
  await a.clic('Mettre à jour depuis Yokitup');
  check('lecture Yokitup : recettes lues, aucune fiche modifiée', await a.notif(m, /3 recettes lues dans yokitup/i) && a.ecritures('fonction yokitup').length === 1 && !a.ecritures('fiches_recette').length);
  check('plats regroupés (Carte, Menu) et fiches proposées', await a.attend('CASSOLETTE ST JACQUES') && await a.voit('Carte, Menu')
    && await a.voit('Proposé : CASSOLETTE DE SAINT-JACQUES') && await a.voit('Proposé : TARTE AU CITRON'));
  await a.clicLigne('CASSOLETTE ST JACQUES', 'Relier');
  const lien = await a.attendEcriture('yokitup_liens', 'POST');
  check('lien plat Yokitup ↔ fiche recette enregistré', lien && lien.corps.plat === 'CASSOLETTE ST JACQUES' && lien.corps.fiche_recette_id === 'r1', JSON.stringify(lien && lien.corps));
  check('écarts comptés sur la version Carte', await a.attend('2 écarts'));
  await a.clicLigne('CASSOLETTE DE SAINT-JACQUES', 'Comparer');
  check('comparaison Carte : différent, absent, assaisonnement', await a.attend('Différent') && await a.voit('Hub Carte') && await a.voit('90G') && await a.voit('Absent de Yokitup') && await a.voit('Assaisonnement'));
  await a.clic('Reprendre 1 grammage Carte de Yokitup'); await a.clic('Remplacer');
  let p = await a.attendEcriture('fiches_recette', 'PATCH');
  let sr = p && p.corps.sous_recettes;
  check('grammage Carte repris de Yokitup : seuls les éléments changent (ni nom, ni photo)', p && p.filtre.id === 'eq.r1' && sr[0].grammage === '90G' && sr[1].grammage === '20g'
    && !sr.some(e => 'grammage_menu' in e) && sr[2].text === 'Herbes fraîches' && !('photo' in p.corps) && !('nom' in p.corps), JSON.stringify(p && p.corps));
  check('reprise inscrite au journal', a.ecritures('audit_log', 'POST').some(e => e.corps.action === 'grammages repris de Yokitup' && JSON.stringify(e.corps.detail).includes('80g → 90G')));
  check('Carte : plus rien à reprendre', await a.attend('Rien à reprendre'));
  await a.clic('Menu');
  check('comparaison Menu : portion Menu de la fiche (la Carte tant qu\'elle n\'est pas précisée)', await a.attend('Hub Menu') && await a.voit('CASSOLETTE ST JACQUES (MENU)') && await a.voit('60G') && await a.voit('15G'));
  const n = a.ecritures('fiches_recette', 'PATCH').length;
  const patch = async k => { for (let i = 0; i < 60; i++) { const e = a.ecritures('fiches_recette', 'PATCH'); if (e.length > k) return e[k]; await sleep(100); } return null; };
  await a.clic('Reprendre 2 grammages Menu de Yokitup'); await a.clic('Remplacer');
  p = await patch(n);
  sr = p && p.corps.sous_recettes;
  check('grammages Menu repris dans la portion Menu, la Carte ne change pas', sr && sr[0].grammage === '90G' && sr[0].grammage_menu === '60G' && sr[1].grammage === '20g' && sr[1].grammage_menu === '15G'
    && !('grammage_menu' in sr[2]), JSON.stringify(p && p.corps));
  check('reprise Menu inscrite au journal', a.ecritures('audit_log', 'POST').some(e => JSON.stringify(e.corps.detail).includes('(Menu) : — → 60G')));
  check('Menu : plus rien à reprendre', await a.attend('Rien à reprendre'));
  await a.clic('Fermer');
  // Tri de la liste « Reliés » : la cassolette garde 1 écart (herbes absentes de Yokitup), la tarte en a 2
  await a.clicLigne('TARTE CITRON', 'Relier');
  check('deux plats reliés, nombre de fiches par état', await a.attend('Reliés (2)') && await a.voit('2 fiches avec écarts · 0 identique'));
  check('« Écarts d\'abord » par défaut : le plus d\'écarts en premier', await a.estActif('Écarts d\'abord')
    && await a.enOrdre(['Reliés (2)', 'TARTE AU CITRON', '2 écarts', 'CASSOLETTE DE SAINT-JACQUES', '1 écart']));
  await a.clic('Identiques d\'abord');
  check('« Identiques d\'abord » : le moins d\'écarts en premier', await a.estActif('Identiques d\'abord')
    && await a.enOrdre(['Reliés (2)', 'CASSOLETTE DE SAINT-JACQUES', '1 écart', 'TARTE AU CITRON', '2 écarts']));
  await a.clic('Écarts d\'abord');
  check('retour à « Écarts d\'abord »', await a.enOrdre(['Reliés (2)', 'TARTE AU CITRON', 'CASSOLETTE DE SAINT-JACQUES']));
  await a.clic('Par nom');
  check('« Par nom » : ordre alphabétique', await a.estActif('Par nom') && await a.enOrdre(['Reliés (2)', 'CASSOLETTE DE SAINT-JACQUES', 'TARTE AU CITRON']));
  await a.onglet('Fiche Recette'); await a.clic('CASSOLETTE DE SAINT-JACQUES');
  check('fiche recette : choix Carte / Menu, Carte d\'abord', await a.attendClic('Menu') && await a.existe('Carte') && await a.voit('Portion Carte') && await a.voit('90G') && !(await a.voit('60G')));
  await a.clic('Menu');
  check('fiche recette : portion Menu', await a.attend('Portion Menu') && await a.voit('60G') && await a.voit('15G') && !(await a.voit('90G')));
  const imp = await a.imprime('Imprimer');
  check('impression : portion Menu, sans les boutons de choix', imp.texte.includes('60g') && imp.texte.includes('portion menu') && !/carte\s*menu/.test(imp.texte), imp.texte.slice(0, 300));
  // Formulaire : deux grammages par élément quand le plat a deux portions
  await a.clic('Modifier');
  check('formulaire : portions Carte et Menu reprises', (await a.champ('Grammage Menu — VELOUTÉ CURRY'))?.valeur === '60G' && (await a.champ('Grammage Carte — VELOUTÉ CURRY'))?.valeur === '90G');
  await a.remplir('Grammage Menu — VELOUTÉ CURRY', '50G');
  await a.remplir('Grammage Menu — CROUSTILLANT SARRASIN', '20g');
  await a.clic('Enregistrer');
  p = await patch(n + 1);
  sr = p && p.corps.sous_recettes;
  check('formulaire : grammage Menu modifié ; Menu égal à la Carte non gardé', sr && sr[0].grammage_menu === '50G' && sr[0].grammage === '90G' && !('grammage_menu' in sr[1]), JSON.stringify(p && p.corps));
  await a.attendPlus('Grammage Menu — VELOUTÉ CURRY');
  await a.attendClic('Modifier'); await a.clic('Modifier');
  await a.attendClic('Une portion'); await a.clic('Une portion');
  check('une seule portion : un seul grammage par élément', await a.attendPlus('Grammage Menu — VELOUTÉ CURRY') && !!(await a.champ('Grammage — VELOUTÉ CURRY')));
  await a.clic('Enregistrer');
  p = await patch(n + 2);
  sr = p && p.corps.sous_recettes;
  check('une seule portion : grammages Menu retirés', sr && sr[0].grammage === '90G' && !sr.some(e => 'grammage_menu' in e), JSON.stringify(p && p.corps));
  check('fiche sans portion Menu : pas de choix', await a.attendPlus('Portion Carte'));
  await a.clic('Retour');
  await a.deconnexion();
  base.db.fiches_recette[0].sous_recettes[0].grammage_menu = '60G';
  check('connexion cuisine', await a.connexion('Cuisine', 'Hugo PETIT'));
  await a.onglet('Fiche Recette'); await a.clic('CASSOLETTE DE SAINT-JACQUES');
  check('cuisine : choix Carte / Menu', await a.attendClic('Menu'));
  await a.clic('Menu');
  check('cuisine : voit la portion Menu', await a.attend('60G'));
  check('cuisine : pas de Config', !(await a.existe('Config')));
});

scenario('Yokitup sans clé', { yokitupSansCle: true }, async (a) => {
  await a.connexion('Cuisine', 'Alexandre RAVASIO');
  await a.onglet('Config'); await a.clic('Yokitup');
  const m = await a.marque();
  await a.clic('Mettre à jour depuis Yokitup');
  check('clé absente : message clair, rien de lu', await a.notif(m, /clé yokitup absente/i) && await a.attend('échec') && !a.ecritures('yokitup_liens').length);
});

scenario('Groupes brouillon', {}, async (a) => {
  await a.connexion('Cuisine', 'Alexandre RAVASIO');
  await a.onglet('Groupes');
  await a.clic('Nouveau groupe');
  await a.remplir('Nom du groupe', 'Cocktail Martin');
  await a.clic('Enregistrer en brouillon');
  const brouillon = await a.attendEcriture('groupes', 'POST');
  check('brouillon : enregistré avec le seul nom', brouillon && brouillon.corps.statut === 'brouillon' && brouillon.corps.pax === 0 && brouillon.corps.nom === 'Cocktail Martin', JSON.stringify(brouillon && brouillon.corps));
  check('brouillon : étiquette sur la carte', await a.attend('Cocktail Martin') && await a.voit('Brouillon'));
  await a.clic('Cocktail Martin');
  check('brouillon : bandeau sur la fiche, bouton Valider', await a.attend('Brouillon — fiche non validée') && await a.voit('Valider la fiche'));
  const imprime = await a.imprime('Imprimer');
  check('brouillon : mention dans l\'impression', imprime.texte.includes('brouillon — fiche non validée'), imprime.texte.slice(0, 200));
  let m = await a.marque(); await a.clic('Valider la fiche');
  check('brouillon incomplet : validation refusée, formulaire ouvert', await a.notif(m, /obligatoires|à compléter/i) && await a.attend('Modifier — Cocktail Martin'));
  await a.remplir('Nombre de personnes', '10');
  await a.clic('Enregistrer');
  const valide = await a.attendEcriture('groupes', 'PATCH');
  check('brouillon complété : groupe validé', valide && valide.corps.statut === 'confirme' && valide.corps.pax === 10, JSON.stringify(valide && valide.corps));
  check('groupe validé : plus de brouillon', await a.attend('Cocktail Martin') && !(await a.voit('Brouillon')));
  // un autre brouillon complet se valide d'un clic
  await a.clic('Nouveau groupe');
  await a.remplir('Nom du groupe', 'Dîner Petit'); await a.remplir('Nombre de personnes', '6');
  await a.clic('Enregistrer en brouillon');
  check('brouillon avec nombre de personnes', await a.attend('Dîner Petit') && await a.voit('6 pers.'));
  await a.clic('Dîner Petit');
  await a.attend('Valider la fiche');
  const avant = a.ecritures('groupes', 'PATCH').length;
  await a.clic('Valider la fiche'); await sleep(800);
  const v2 = a.ecritures('groupes', 'PATCH').slice(avant)[0];
  check('validation directe du brouillon', v2 && v2.corps.statut === 'confirme' && Object.keys(v2.corps).length === 1, JSON.stringify(v2 && v2.corps));
});

scenario('Journal', {}, async (a) => {
  await a.connexion('Cuisine', 'Alexandre RAVASIO');
  await a.onglet('Journal');
  check('mises à jour de l\'app et modifications', await a.attend('Onglet Partages') && await a.voit('VELOUTÉ CURRY') && await a.voit('CRÈME : 400 g → 500 g'));
  await a.clic('Modifications');
  check('filtre Modifications', await a.attendPlus('Onglet Partages') && await a.voit('VELOUTÉ CURRY'));
});

scenario('Nouvelle version', {}, async (a, page, base) => {
  const relire = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await relire(); await sleep(800);
  check('pas de bandeau sans nouvelle publication', !(await a.voit('Nouvelle version disponible')));
  base.etat.nouvelleVersion = true;
  await relire();
  check('nouvelle publication : bandeau affiché', await a.attend('Nouvelle version disponible'));
  base.etat.nouvelleVersion = false;
  await a.clic('Recharger');
  check('« Recharger » recharge la page', await a.attendClic('Cuisine') && !(await a.voit('Nouvelle version disponible')));
});

// Pertes & Perso : dates au format AAAA-MM-JJ, heure locale (comme l'app)
const jourLocal = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const lundiPrecedent = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); return d.toLocaleDateString('sv-SE'); };

scenario('Pertes & Perso — cuisinier', {}, async (a, page, base) => {
  base.db.pertes.push({ id: 'p-julie', date: jourLocal(), produit: 'SAUCE VIERGE', quantite: 1, unite: 'L', raison: 'DLC dépassée', precision: '', saisi_par: 'Julie', saisi_email: 'julie.martin@lava-hub.local', cree_le: new Date().toISOString() });
  base.db.perso_validations.push({ date: jourLocal(-1), valide_le: new Date().toISOString(), valide_par: 'Alexandre' });
  check('connexion cuisine', await a.connexion('Cuisine', 'Hugo PETIT'));
  await a.onglet('Pertes & Perso');
  check('cuisine : Repas perso, Pertes, Récap, sans Produits', await a.existe('Repas perso') && await a.existe('Récap') && !(await a.existe('Produits')));
  check('produits actifs seulement, par catégorie', await a.voit('RIZ BASMATI') && await a.voit('Fromages & crèmerie') && !(await a.voit('VIEUX PRODUIT')));
  // quantité enregistrée toute seule, signée par la base
  await a.remplir('Quantité RIZ BASMATI', '1,5');
  const e = await a.attendEcriture('perso_saisies', 'POST');
  const ligne = base.db.perso_saisies.find(x => x.produit_cle === 'riz_basmati');
  check('quantité enregistrée automatiquement (1,5 → 1.5)', !!e && ligne && ligne.quantite === 1.5 && ligne.date === jourLocal());
  check('saisie signée au nom du cuisinier', ligne && ligne.saisi_par === 'Hugo');
  check('« saisi par » affiché', await a.attend('saisi par Hugo'));
  const n = a.ecritures('perso_saisies').length;
  await a.remplir('Quantité PENNE', 'abc'); await sleep(2500);
  check('quantité invalide : rien envoyé', a.ecritures('perso_saisies').length === n);
  await a.remplir('Quantité PENNE', '');
  // commentaire
  await a.remplir('Ton commentaire', 'Reste de riz de la veille');
  let m = await a.marque();
  await a.clic('Enregistrer le commentaire');
  check('commentaire enregistré à son nom', await a.notif(m, /commentaire enregistré/i) && base.db.perso_commentaires.some(c => c.nom === 'Hugo' && c.texte === 'Reste de riz de la veille'));
  // journée validée : verrouillée pour la cuisine
  await a.clic('Jour précédent');
  check('journée validée : quantités verrouillées', await a.attend('Journée validée') && (await a.champ('Quantité PENNE'))?.desactive === true);
  check('quantité de la veille affichée', (await a.champ('Quantité PENNE'))?.valeur === '2');
  await a.clic('Jour suivant');
  // pertes
  await a.clic('Pertes');
  await a.clic('Ajouter la perte');
  check('perte vide refusée', await a.attend('Indique le produit ou la recette'));
  await a.remplir('Produit ou recette', 'saumon'); await a.remplir('Quantité perdue', '0,8'); await a.remplir('Raison', 'Autre');
  await a.clic('Ajouter la perte');
  check('raison « Autre » sans précision refusée', await a.attend('Précise la raison') && !a.ecritures('pertes', 'POST').length);
  await a.remplir('Précision', 'Odeur douteuse');
  await a.clic('Ajouter la perte');
  const perte = await a.attendEcriture('pertes', 'POST');
  const p = base.db.pertes.find(x => x.produit === 'SAUMON');
  check('perte enregistrée en majuscules, signée', !!perte && p && p.quantite === 0.8 && p.saisi_par === 'Hugo' && p.raison === 'Autre' && await a.attend('SAUMON'));
  check('on supprime ses pertes, pas celles des autres', await a.existe('Supprimer la perte SAUMON') && !(await a.existe('Supprimer la perte SAUCE VIERGE')));
  await a.clic('Supprimer la perte SAUMON'); await a.clic('Supprimer');
  check('perte supprimée', !!(await a.attendEcriture('pertes', 'DELETE')) && await a.attendPlus('Odeur douteuse'));
  // récap
  await a.clic('Récap');
  check('récap de la semaine : quantités et pertes', await a.attend('Semaine du') && await a.voit('RIZ BASMATI') && await a.voit('SAUCE VIERGE'));
  check('cuisine : pas d\'envoi du récap par email', !(await a.existe('Envoyer le récap par email')));
});

scenario('Pertes & Perso — admin', {}, async (a, page, base) => {
  check('connexion admin', await a.connexion('Cuisine', 'Alexandre RAVASIO'));
  await a.onglet('Pertes & Perso');
  // liste des produits
  await a.clic('Produits');
  await a.remplir('Nom du produit', 'blanc de poulet'); await a.remplir('Catégorie', 'Viandes');
  await a.clic('Ajouter');
  check('produit ajouté (nom en majuscules, clé stable)', !!(await a.attendEcriture('perso_produits', 'POST')) && base.db.perso_produits.some(x => x.cle === 'blanc_de_poulet' && x.nom === 'BLANC DE POULET' && x.categorie === 'Viandes'));
  await a.clic('Retirer PENNE'); await a.clic('Retirer');
  check('produit retiré sans effacer l\'historique', !!(await a.attendEcriture('perso_produits', 'PATCH')) && base.db.perso_produits.find(x => x.cle === 'penne').actif === false && base.db.perso_saisies.some(x => x.produit_cle === 'penne'));
  check('produit retiré : peut être remis', await a.attendClic('Remettre PENNE'));
  // validation
  await a.clic('Repas perso');
  check('produit retiré absent de la saisie, nouveau présent', await a.attend('BLANC DE POULET') && !(await a.voit('PENNE')));
  await a.remplir('Quantité RIZ BASMATI', '3');
  await a.attendEcriture('perso_saisies', 'POST');
  await a.clic('Valider la journée'); await a.clic('Valider');
  check('journée validée', !!(await a.attendEcriture('perso_validations', 'POST')) && await a.attend('Journée validée'));
  check('admin : peut corriger une journée validée', await a.existe('Corriger') && (await a.champ('Quantité RIZ BASMATI'))?.desactive === true);
  await a.clic('Rouvrir la saisie'); await a.clic('Rouvrir');
  check('journée rouverte', !!(await a.attendEcriture('perso_validations', 'DELETE')) && await a.attend('En attente de validation'));
  // semaine dernière : valider le dimanche (6 autres jours déjà validés) envoie le récap tout seul
  const l = lundiPrecedent();
  const jourDe = i => { const d = new Date(l + 'T12:00:00'); d.setDate(d.getDate() + i); return d.toLocaleDateString('sv-SE'); };
  for (let i = 0; i < 6; i++) base.db.perso_validations.push({ date: jourDe(i), valide_le: new Date().toISOString(), valide_par: 'Alexandre' });
  await a.remplir('Choisir une date', jourDe(6));
  check('choix d\'une date passée', await a.attend('En attente de validation'));
  let m = await a.marque();
  await a.clic('Valider la journée'); await a.clic('Valider');
  check('semaine complète : récap envoyé automatiquement', await a.notif(m, /récap envoyé à chef@exemple\.fr/i, 8000) && a.ecritures('fonction recap-pertes').some(x => x.corps.semaine === l));
  await a.clic('Récap');
  check('récap de la semaine du jour choisi : 7/7, déjà envoyé', await a.attend('7/7 jours validés') && await a.attend('Récap envoyé le'));
  m = await a.marque();
  await a.clic('Renvoyer le récap par email'); await a.clic('Renvoyer');
  check('récap renvoyé à la demande', await a.notif(m, /récap envoyé à chef@exemple\.fr/i) && a.ecritures('fonction recap-pertes').length === 2);
  const imp = await a.imprime('Imprimer');
  check('impression : la feuille du récap seulement', imp.n === 1 && imp.texte.includes('récap pertes & perso') && !imp.texte.includes('envoyer le récap'));
  await a.clic('Semaine suivante');
  check('semaine en cours incomplète : envoi impossible', await a.attend("L'envoi par email est possible quand les 7 jours sont validés"));
});

scenario('Téléphone', { mobile: true }, async (a, page) => {
  check('connexion sur téléphone', await a.connexion('Cuisine', 'Alexandre RAVASIO'));
  const debords = [];
  for (const nom of ['Fiches', 'Recettes', 'Menus', 'Groupes', 'Pertes', 'Config', 'Journal']) {
    await a.onglet(nom);
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) debords.push(nom);
  }
  check('aucun défilement horizontal sur les onglets', debords.length === 0, debords.join(', '));
});

// ── Déroulé ──
(async () => {
  ({ creerBase, MOT_DE_PASSE, HOST } = await import('./mock-supabase.mjs'));
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
    page.on('request', req => {
      if (req.url().includes(HOST) && !req.url().includes('/realtime/')) return base.gerer(req);
      // « Nouvelle version » : l'app relit la page publiée ; on simule une publication en changeant le nom du fichier de code
      if (base.etat.nouvelleVersion && req.resourceType() === 'fetch' && req.url().startsWith(APP_URL) && new URL(req.url()).pathname.endsWith('/'))
        return req.respond({ status: 200, contentType: 'text/html', body: '<script type="module" crossorigin src="./assets/index-NOUVELLE.js"></script>' });
      req.continue();
    });
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
