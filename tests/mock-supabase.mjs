// Base Supabase SIMULÉE pour les tests (aucun accès à la vraie base).
// Reproduit ce dont l'app dépend : connexion par compte, profils de connexion, fonction « equipe »,
// lecture/écriture des tables avec les mêmes droits que la RLS de la vraie base
// (écriture = admin ; groupes = admin ou salle ; journal = tout membre connecté).
export const HOST = 'qmvxmxzsmpigvseuidcd.supabase.co';
export const MOT_DE_PASSE = 'bon-mot-de-passe';

const jour = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

function donneesDeDepart() {
  return {
    membres: [
      { email: 'alexandre.ravasio@outlook.com', prenom: 'Alexandre', nom: 'Ravasio', poste: 'Admin', equipe: 'cuisine', role: 'admin', actif: true, doit_changer_mdp: false, compte_cree: true },
      { email: 'julie.martin@lava-hub.local', prenom: 'Julie', nom: 'Martin', poste: 'Chef de partie', equipe: 'cuisine', role: 'cuisine', actif: true, doit_changer_mdp: false, compte_cree: false },
      { email: 'hugo.petit@lava-hub.local', prenom: 'Hugo', nom: 'Petit', poste: 'Chef', equipe: 'cuisine', role: 'cuisine', actif: true, doit_changer_mdp: false, compte_cree: true },
      { email: 'paul.bernard@lava-hub.local', prenom: 'Paul', nom: 'Bernard', poste: "Maître d'hôtel", equipe: 'salle', role: 'salle', actif: true, doit_changer_mdp: false, compte_cree: true },
      { email: 'lea.roux@lava-hub.local', prenom: 'Léa', nom: 'Roux', poste: 'Commis', equipe: 'salle', role: 'salle', actif: false, doit_changer_mdp: false, compte_cree: true },
    ],
    fiches: [
      { id: 'f1', nom: 'VELOUTÉ CURRY', categorie: 'Sauce', quantite_nette: '2 kg', conditionnement: '["Sac sous vide — 850 g"]', allergenes: 'Lactose, Céleri', ingredients: [{ nom: 'CRÈME', quantite: '500', unite: 'g' }, { nom: 'CURRY', quantite: '10', unite: 'g' }], process: ['Chauffer la crème', 'Ajouter le curry'] },
      { id: 'f2', nom: 'CROUSTILLANT SARRASIN', categorie: 'Garniture', quantite_nette: '500 g', conditionnement: '[]', allergenes: 'Gluten', ingredients: [{ nom: 'SARRASIN', quantite: '200', unite: 'g' }], process: ['Cuire'] },
      // allergènes au format tableau : les deux formats existent dans la vraie base
      { id: 'f3', nom: 'GANACHE CHOCOLAT', categorie: 'Dessert', quantite_nette: '1 kg', conditionnement: '[]', allergenes: ['Lactose', 'Soja'], ingredients: [{ nom: 'CROUSTILLANT SARRASIN', quantite: '400', unite: 'g', ficheId: 'f2' }], process: [] },
    ],
    fiches_recette: [
      { id: 'r1', nom: 'CASSOLETTE DE SAINT-JACQUES', statut: 'carte', allergenes: 'Céleri, Gluten, Lactose', sous_recettes: [{ id: 'f1', grammage: '80g' }, { id: 'f2', grammage: '20g' }, { text: 'Herbes fraîches', grammage: '' }], photo: null, modifie_par: 'Alexandre', modifie_le: new Date().toISOString() },
      { id: 'r2', nom: 'TARTE AU CITRON', statut: 'carte', allergenes: 'Gluten, Lactose', sous_recettes: [{ id: 'f3', grammage: '' }], photo: null },
      { id: 'r3', nom: 'HOUMOUS BETTERAVE', statut: 'partages', allergenes: 'Sésame', sous_recettes: [], photo: null },
      { id: 'r4', nom: 'ANCIEN PLAT', statut: 'archive', allergenes: '', sous_recettes: [], photo: null },
    ],
    groupes: [
      { id: 'g1', nom: 'Séminaire Dupont', date: jour(5), heure: '19:30', pax: 12, salle: 'Salon Basalte', source: 'Email', menu_id: null, menu_nom: null, allergenes: 'Gluten', regimes: 'Végétarien', notes: 'Un enfant' },
      { id: 'g2', nom: 'Mariage Garnier', date: jour(-20), heure: '20:00', pax: 40, salle: 'Privatisation', source: 'Téléphone', menu_id: null, menu_nom: null, allergenes: '', regimes: '', notes: '' },
    ],
    lava_config: [{ id: 'main', data: { cats: ['Base', 'Sauce', 'Garniture', 'Dessert', 'Autre'] } }],
    audit_log: [{ ts: Date.now() - 3600e3, action: 'modification', fiche_nom: 'VELOUTÉ CURRY', profil: 'Alexandre', detail: ['CRÈME : 400 g → 500 g'] }],
    sauvegardes: [{ id: 1, cree_le: new Date().toISOString(), contenu: { fiches: [] } }],
  };
}

// Menus enregistrés par une ancienne version : « 3 temps » avec des noms de temps périmés.
const ANCIENS_MENUS = { id: 'menus', data: { items: [
  { id: 'm1', nom: 'Carte du soir', services: [{ nom: 'Plat', plats: [{ frId: 'r1' }] }, { nom: 'Dessert', plats: [{ frId: 'r2' }] }] },
  { id: 'm2', nom: '3 temps', services: [{ nom: 'Entrée', plats: [] }, { nom: 'Plat', plats: [{ frId: 'r1' }] }, { nom: 'Dessert', plats: [] }] },
] } };

const b64 = o => btoa(JSON.stringify(o)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

export function creerBase(options = {}) {
  const db = donneesDeDepart();
  if (options.anciensMenus) db.lava_config.push(JSON.parse(JSON.stringify(ANCIENS_MENUS)));
  const mdp = {};   // mots de passe créés à la première connexion
  const etat = { session: null, ecritures: [], inconnus: [], refuserTout: !!options.refuserEcritures };

  const membre = email => db.membres.find(m => m.email === email);
  const role = () => { const m = etat.session && membre(etat.session); return m && m.actif ? m.role : null; };
  const peutEcrire = table => {
    if (etat.refuserTout) return false;
    const r = role();
    if (!r) return false;
    if (table === 'audit_log') return true;
    if (table === 'groupes') return r === 'admin' || r === 'salle';
    return r === 'admin';
  };
  const utilisateur = email => ({ id: 'u-' + email, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
  const jeton = email => ({
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-' + email, email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.x`,
    token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: utilisateur(email),
  });

  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' };
  const repondre = (req, status, body) => req.respond({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
  const corps = req => { try { return JSON.parse(req.postData() || '{}'); } catch (e) { return {}; } };

  function gerer(req) {
    const u = new URL(req.url()), p = u.pathname, m = req.method();
    if (m === 'OPTIONS') return req.respond({ status: 204, headers: CORS });

    // ── Connexion ──
    if (p === '/auth/v1/token') {
      const { email, password } = corps(req);
      const mb = membre(email);
      const attendu = mdp[email] || (mb && mb.compte_cree ? MOT_DE_PASSE : null);
      if (!mb || !attendu || password !== attendu) return repondre(req, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      etat.session = email;
      return repondre(req, 200, jeton(email));
    }
    if (p === '/auth/v1/user') {
      if (m === 'PUT') { const { password } = corps(req); if (etat.session && password) mdp[etat.session] = password; etat.ecritures.push({ methode: m, table: 'auth', corps: {} }); }
      return etat.session ? repondre(req, 200, utilisateur(etat.session)) : repondre(req, 401, { message: 'no session' });
    }
    if (p === '/auth/v1/logout') { etat.session = null; return req.respond({ status: 204, headers: CORS }); }

    // ── Fonction « equipe » (création du premier mot de passe, réinitialisation, suppression) ──
    if (p === '/functions/v1/equipe') {
      const b = corps(req);
      etat.ecritures.push({ methode: m, table: 'fonction equipe', corps: { action: b.action, email: b.email } });
      const mb = membre(b.email);
      if (!mb) return repondre(req, 200, { ok: false, message: 'Profil inconnu' });
      if (b.action === 'activer') {
        if (mb.compte_cree) return repondre(req, 200, { ok: false, message: 'Ce compte existe déjà' });
        mb.compte_cree = true; mdp[b.email] = b.password;
      } else if (b.action === 'reinitialiser') { mb.compte_cree = false; delete mdp[b.email]; }
      else if (b.action === 'supprimer') db.membres = db.membres.filter(x => x.email !== b.email);
      return repondre(req, 200, { ok: true });
    }

    // ── Fonctions de la base ──
    if (p === '/rest/v1/rpc/profils_connexion') return repondre(req, 200, db.membres.filter(x => x.actif).map(x => ({ email: x.email, prenom: x.prenom, nom: x.nom, poste: x.poste, equipe: x.equipe, statut: x.compte_cree ? 'actif' : 'ouvert' })));
    if (p === '/rest/v1/rpc/mdp_change') { const mb = membre(etat.session); if (mb) mb.doit_changer_mdp = false; return repondre(req, 200, null); }
    if (p === '/rest/v1/rpc/sauvegarder_maintenant') { etat.ecritures.push({ methode: m, table: 'sauvegardes', corps: {} }); db.sauvegardes.unshift({ id: db.sauvegardes.length + 1, cree_le: new Date().toISOString(), contenu: {} }); return repondre(req, 200, null); }

    // ── Tables ──
    const t = p.replace('/rest/v1/', '');
    if (p.startsWith('/rest/v1/') && db[t]) {
      const filtre = rows => { for (const [k, v] of u.searchParams) if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === v.slice(3)); return rows; };
      if (m === 'GET') {
        if (!role()) return repondre(req, 200, []);   // RLS : rien pour un inconnu
        const rows = filtre(db[t].slice());
        if (/vnd\.pgrst\.object/.test(req.headers()['accept'] || '')) return rows.length ? repondre(req, 200, rows[0]) : repondre(req, 406, { code: 'PGRST116', message: 'no rows' });
        return repondre(req, 200, rows);
      }
      const b = corps(req);
      if (!peutEcrire(t)) {
        // comme PostgREST : insertion refusée = erreur 403 ; modification/suppression refusée = 0 ligne, sans erreur
        if (m === 'POST') return repondre(req, 403, { code: '42501', message: 'new row violates row-level security policy' });
        return repondre(req, 200, []);
      }
      etat.ecritures.push({ methode: m, table: t, corps: b, filtre: Object.fromEntries(u.searchParams) });
      if (m === 'POST') {
        const rows = (Array.isArray(b) ? b : [b]).map(r => {
          const cle = r.id !== undefined ? 'id' : (t === 'membres' ? 'email' : null);
          const i = cle ? db[t].findIndex(x => x[cle] === r[cle]) : -1;
          if (i >= 0) { db[t][i] = { ...db[t][i], ...r }; return db[t][i]; }
          const n = { id: 'n' + Math.random().toString(36).slice(2, 7), ...r }; db[t].push(n); return n;
        });
        return repondre(req, 201, rows);
      }
      const cibles = filtre(db[t].slice());
      if (m === 'PATCH') { cibles.forEach(r => Object.assign(r, b)); return repondre(req, 200, cibles); }
      if (m === 'DELETE') { db[t] = db[t].filter(r => !cibles.includes(r)); return repondre(req, 200, cibles); }
    }
    if (p.startsWith('/rest/v1/')) { etat.inconnus.push(m + ' ' + p); return repondre(req, 200, []); }
    return req.continue();
  }

  return { db, etat, gerer, jeton, HOST };
}


