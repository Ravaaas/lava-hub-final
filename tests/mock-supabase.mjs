// Base Supabase SIMULÉE pour les tests (aucun accès à la vraie base).
// Reproduit ce dont l'app dépend : connexion par compte, profils de connexion, fonction « equipe »,
// lecture/écriture des tables avec les mêmes droits que la RLS de la vraie base
// (écriture = admin ; copie Yokitup = fonction seulement ; groupes = admin ou salle ; coordonnées des référents = admin ou salle, lecture comprise ; journal = tout membre connecté ;
//  Ratio (prix et coûts) = admin seulement, lecture comprise ; coûts Yokitup = fonction seulement ;
//  Pertes & Perso = cuisine + admin, journée validée verrouillée, chacun ses commentaires et ses pertes ; fiche allergènes imprimée = tout membre).
// Déclencheur reproduit : allergènes d'une fiche technique modifiés → fiches recette qui l'utilisent recalculées (supabase/sql/automatisation.sql).
export const HOST = 'qmvxmxzsmpigvseuidcd.supabase.co';
export const MOT_DE_PASSE = 'bon-mot-de-passe';

const jour = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };   // date locale, comme l'app (pas UTC : faux entre minuit et 1 h à Paris)

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
      { id: 'g1', nom: 'Séminaire Dupont', date: jour(5), heure: '19:30', pax: 12, salle: 'Salon Basalte', source: 'Email', menu_id: null, menu_nom: null, allergenes: 'Gluten', regimes: 'Végétarien', notes: 'Un enfant', referent: 'Claire Dupont' },
      { id: 'g2', nom: 'Mariage Garnier', date: jour(-20), heure: '20:00', pax: 40, salle: 'Privatisation', source: 'Téléphone', menu_id: null, menu_nom: null, allergenes: '', regimes: '', notes: '' },
    ],
    // coordonnées des référents (admin et salle) ; groupe_id null = groupe supprimé, le contact reste
    groupes_contacts: [
      { id: 'c1', groupe_id: 'g1', nom: 'Claire Dupont', email: 'claire.dupont@exemple.fr', telephone: '06 12 34 56 78', groupe: 'Séminaire Dupont', date_groupe: jour(5) },
      { id: 'c2', groupe_id: null, nom: 'Marc Ancien', email: 'marc@exemple.fr', telephone: '', groupe: 'Pot de départ', date_groupe: '2025-06-01' },
    ],
    lava_config: [{ id: 'main', data: { cats: ['Base', 'Sauce', 'Garniture', 'Dessert', 'Autre'] } }],
    audit_log: [{ ts: Date.now() - 3600e3, action: 'modification', fiche_nom: 'VELOUTÉ CURRY', profil: 'Alexandre', detail: ['CRÈME : 400 g → 500 g'] }],
    sauvegardes: [{ id: 1, cree_le: new Date().toISOString(), contenu: { fiches: [] } }],
    perso_produits: [
      { cle: 'riz_basmati', nom: 'RIZ BASMATI', unite: 'kg', categorie: 'Épicerie', actif: true, cree_le: '2026-01-01T00:00:00Z' },
      { cle: 'penne', nom: 'PENNE', unite: 'kg', categorie: 'Épicerie', actif: true, cree_le: '2026-01-01T00:00:01Z' },
      { cle: 'creme', nom: 'CRÈME', unite: 'L', categorie: 'Fromages & crèmerie', actif: true, cree_le: '2026-01-01T00:00:02Z' },
      { cle: 'vieux_produit', nom: 'VIEUX PRODUIT', unite: 'kg', categorie: 'Épicerie', actif: false, cree_le: '2026-01-01T00:00:03Z' },
    ],
    perso_saisies: [{ date: jour(-1), produit_cle: 'penne', quantite: 2, saisi_par: 'Hugo', saisi_email: 'hugo.petit@lava-hub.local', modifie_le: new Date().toISOString() }],
    perso_commentaires: [],
    perso_validations: [],
    pertes: [],
    perso_recaps: [],
    // Yokitup : copie vide au départ, remplie par la fonction « yokitup » (voir RECETTES_YOKITUP)
    yokitup_recettes: [],
    yokitup_liens: [],
    yokitup_synchros: [],
    // Ratio (admin seulement) : coûts calculés par la fonction « yokitup », règles, budgets et prix de la carte (vides : valeurs de départ)
    yokitup_couts: [],
    ratio_regles: [],
    ratio_menus: [],
    ratio_carte: [],
    // dernière fiche allergènes imprimée de chaque menu (voir FICHE_IMPRIMEE)
    allergenes_imprimes: [],
  };
}

// Recettes que la fonction « yokitup » simulée « lit » dans Yokitup : la cassolette en version Carte et Menu.
const ing = (id, nom, quantite, unite = 'g', autres = {}) => ({ id, nom, quantite, unite, sous_recette: true, allergenes: [], traces: [], ...autres });
const RECETTES_YOKITUP = [
  { id: 'yk1', nom: 'CASSOLETTE ST JACQUES (CARTE)', plat: 'CASSOLETTE ST JACQUES', version: 'CARTE', etiquettes: ['RECETTE CARTE'],
    ingredients: [ing('p1', 'VELOUTÉ CURRY', '90'), ing('p2', 'CROUSTILLANT SARRASIN', '20'), ing('p3', 'SEL FIN', '1', 'g', { sous_recette: false })] },
  { id: 'yk2', nom: 'CASSOLETTE ST JACQUES (MENU)', plat: 'CASSOLETTE ST JACQUES', version: 'MENU', etiquettes: ['RECETTE MENU'],
    ingredients: [ing('p1', 'VELOUTÉ CURRY', '60'), ing('p2', 'CROUSTILLANT SARRASIN', '15')] },
  { id: 'yk3', nom: 'TARTE CITRON (LUNCH)', plat: 'TARTE CITRON', version: 'LUNCH', etiquettes: ['RECETTE LUNCH'],
    ingredients: [ing('p4', 'GANACHE CHOCOLAT', '30')] },
];

// Coûts que la fonction « yokitup » simulée calcule (€ HT par portion) : la cassolette Menu (3,90 €) dépasse le Temps 3 du 5 temps (3,80 € après perte),
// et le 5 temps entier (la cassolette à chaque temps : 19,50 €) dépasse ses 14,25 € de budgets après perte.
const COUTS_YOKITUP = [
  { recette_id: 'yk1', cout: 4.2, manquants: [] },
  { recette_id: 'yk2', cout: 3.9, manquants: [] },
  { recette_id: 'yk3', cout: 1.1, manquants: ['ZESTE DE CITRON'] },
];
// Menus pour l'onglet Ratio : la cassolette à chaque temps du 5 temps et au Temps 2 du 3 temps, la tarte en dessert du Lunch, un plat libre au Lunch.
const MENUS_RATIO = { id: 'menus', data: { items: [
  { id: 'm1', nom: 'Carte du soir', services: [{ nom: 'Partages', plats: [] }, { nom: 'Plat', plats: [{ frId: 'r1' }] }, { nom: 'Dessert', plats: [{ frId: 'r2' }] }] },
  { id: 'm2', nom: '3 temps', services: [{ nom: 'Temps 1', plats: [] }, { nom: 'Temps 2', plats: [{ frId: 'r1' }] }, { nom: 'Temps 3', plats: [] }] },
  { id: 'm3', nom: '5 temps', services: ['Temps 1', 'Temps 2', 'Temps 3', 'Temps 4', 'Temps 5'].map(nom => ({ nom, plats: [{ frId: 'r1' }] })) },
  { id: 'm4', nom: 'Lunch', services: [{ nom: 'Entrée', plats: [] }, { nom: 'Plat', plats: [{ text: 'Plat du jour' }] }, { nom: 'Dessert', plats: [{ frId: 'r2' }] }] },
] } };

// Menus enregistrés par une ancienne version : « 3 temps » avec des noms de temps périmés.
const ANCIENS_MENUS = { id: 'menus', data: { items: [
  { id: 'm1', nom: 'Carte du soir', services: [{ nom: 'Plat', plats: [{ frId: 'r1' }] }, { nom: 'Dessert', plats: [{ frId: 'r2' }] }] },
  { id: 'm2', nom: '3 temps', services: [{ nom: 'Entrée', plats: [] }, { nom: 'Plat', plats: [{ frId: 'r1' }] }, { nom: 'Dessert', plats: [] }] },
] } };

// Fiche allergènes de la carte imprimée avant un changement : la tarte n'avait que du Gluten (la base lui compte aussi le Lactose).
const FICHE_IMPRIMEE = { menu_id: 'carte', menu_nom: 'La carte', imprime_le: '2026-11-20T09:00:00Z', imprime_par: 'Alexandre', lignes: [
  { cle: 'r3', temps: 'Partages', nom: 'HOUMOUS BETTERAVE', allergenes: ['Sésame'] },
  { cle: 'r1', temps: 'Plats', nom: 'CASSOLETTE DE SAINT-JACQUES', allergenes: ['Céleri', 'Gluten', 'Lactose'] },
  { cle: 'r2', temps: 'Desserts', nom: 'TARTE AU CITRON', allergenes: ['Gluten'] },
] };

// Clé de chaque table (insertion = remplacement si la clé existe déjà, comme un upsert PostgREST).
const CLES = { yokitup_couts: ['recette_id'], ratio_carte: ['plat'], allergenes_imprimes: ['menu_id'], yokitup_liens: ['plat'], groupes_contacts: ['groupe_id'], membres: ['email'], perso_produits: ['cle'], perso_saisies: ['date', 'produit_cle'], perso_commentaires: ['date', 'email'], perso_validations: ['date'], perso_recaps: ['semaine'] };
const RATIO = ['yokitup_couts', 'ratio_regles', 'ratio_menus', 'ratio_carte'];
const PERSO = ['perso_produits', 'perso_saisies', 'perso_commentaires', 'perso_validations', 'pertes', 'perso_recaps'];

const b64 = o => btoa(JSON.stringify(o)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

export function creerBase(options = {}) {
  const db = donneesDeDepart();
  if (options.anciensMenus) db.lava_config.push(JSON.parse(JSON.stringify(ANCIENS_MENUS)));
  if (options.ficheImprimee) db.allergenes_imprimes.push(JSON.parse(JSON.stringify(FICHE_IMPRIMEE)));
  if (options.ratio) {   // Yokitup déjà lu, plats reliés, menus composés
    db.lava_config.push(JSON.parse(JSON.stringify(MENUS_RATIO)));
    db.yokitup_recettes = JSON.parse(JSON.stringify(RECETTES_YOKITUP));
    db.yokitup_couts = JSON.parse(JSON.stringify(COUTS_YOKITUP));
    db.yokitup_liens = [{ plat: 'CASSOLETTE ST JACQUES', fiche_recette_id: 'r1' }, { plat: 'TARTE CITRON', fiche_recette_id: 'r2' }];
    db.yokitup_synchros = [{ id: 1, le: new Date().toISOString(), par: 'Lecture de la nuit', recettes: 3, ok: true, message: '2 plats · 3 coûts' }];
  }
  const mdp = {};   // mots de passe créés à la première connexion
  const etat = { session: null, ecritures: [], inconnus: [], refuserTout: !!options.refuserEcritures };
  const yokitup = { recettes: RECETTES_YOKITUP };   // remplaçable (aperçu démo : tests/yokitup-reel.json)

  const membre = email => db.membres.find(m => m.email === email);
  const role = () => { const m = etat.session && membre(etat.session); return m && m.actif ? m.role : null; };
  const valide = date => db.perso_validations.some(v => v.date === date);
  // Droit sur une ligne (Pertes & Perso : la ligne compte, comme la RLS de supabase/sql/pertes-perso.sql)
  const peutEcrire = (table, ligne = {}) => {
    if (etat.refuserTout) return false;
    const r = role();
    if (!r) return false;
    if (table === 'audit_log') return true;
    if (table === 'yokitup_recettes' || table === 'yokitup_synchros' || table === 'yokitup_couts') return false;   // remplies par la fonction « yokitup » seulement
    if (table === 'groupes' || table === 'groupes_contacts') return r === 'admin' || r === 'salle';
    if (table === 'allergenes_imprimes') return true;   // la personne qui imprime solde l'alerte
    if (table === 'perso_saisies') return r === 'admin' || (r === 'cuisine' && !valide(ligne.date));
    if (table === 'perso_commentaires') return r === 'admin' || (r === 'cuisine' && ligne.email === etat.session && !valide(ligne.date));
    if (table === 'pertes') return r === 'admin' || (r === 'cuisine' && (!ligne.saisi_email || ligne.saisi_email === etat.session));
    return r === 'admin';
  };
  // Auteur rempli par la base (déclencheur « auteur »)
  const signer = (t, r) => {
    const mb = membre(etat.session), prenom = mb ? mb.prenom : 'Admin';
    if (t === 'perso_saisies' || t === 'pertes') return { ...r, saisi_email: etat.session, saisi_par: prenom, ...(t === 'pertes' ? { cree_le: new Date().toISOString() } : { modifie_le: new Date().toISOString() }) };
    if (t === 'perso_commentaires') return { ...r, email: etat.session, nom: prenom, modifie_le: new Date().toISOString() };
    if (t === 'perso_validations') return { ...r, valide_par: prenom, valide_le: new Date().toISOString() };
    if (t === 'allergenes_imprimes') return { ...r, imprime_par: prenom, imprime_le: new Date().toISOString() };
    return r;
  };
  // Déclencheur « fiche_maj » : une fiche recette prend les allergènes de ses fiches techniques liées (jamais moins si un lien est cassé)
  const liste = a => (Array.isArray(a) ? a.map(String) : String(a || '').split(',')).map(x => x.trim()).filter(Boolean);
  const recalculerAllergenes = ficheId => {
    for (const fr of db.fiches_recette) {
      const ids = (fr.sous_recettes || []).map(e => (typeof e === 'string' ? e : e.id)).filter(Boolean);
      if (!ids.includes(ficheId)) continue;
      const liees = db.fiches.filter(f => ids.includes(f.id));
      const tout = liees.flatMap(f => liste(f.allergenes)).concat(liees.length < ids.length ? liste(fr.allergenes) : []);
      fr.allergenes = [...new Set(tout)].sort((x, y) => x.localeCompare(y, 'fr')).join(', ');
    }
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
    // ── Fonction « recap-pertes » (email de la semaine) ──
    if (p === '/functions/v1/recap-pertes') {
      const b = corps(req);
      etat.ecritures.push({ methode: m, table: 'fonction recap-pertes', corps: { semaine: b.semaine } });
      if (role() !== 'admin') return repondre(req, 200, { ok: false, message: "Réservé à l'administrateur" });
      db.perso_recaps = db.perso_recaps.filter(x => x.semaine !== b.semaine).concat([{ semaine: b.semaine, envoye_le: new Date().toISOString(), destinataire: 'chef@exemple.fr' }]);
      return repondre(req, 200, { ok: true, destinataire: 'chef@exemple.fr' });
    }
    // ── Fonction « yokitup » (lecture des recettes Yokitup ; sans clé : message « clé absente ») ──
    if (p === '/functions/v1/yokitup') {
      etat.ecritures.push({ methode: m, table: 'fonction yokitup', corps: corps(req) });
      if (role() !== 'admin') return repondre(req, 200, { ok: false, message: "Réservé à l'administrateur" });
      if (options.yokitupSansCle) {
        db.yokitup_synchros.unshift({ id: db.yokitup_synchros.length + 1, le: new Date().toISOString(), par: 'Alexandre', recettes: 0, ok: false, message: 'Clé Yokitup absente' });
        return repondre(req, 200, { ok: false, message: 'Clé Yokitup absente : à coller dans Supabase > Edge Functions > Secrets (YOKITUP_API_KEY)' });
      }
      db.yokitup_recettes = JSON.parse(JSON.stringify(yokitup.recettes));
      db.yokitup_couts = JSON.parse(JSON.stringify(COUTS_YOKITUP.filter(c => yokitup.recettes.some(r => r.id === c.recette_id))));
      const plats = new Set(yokitup.recettes.map(r => r.plat)).size;
      db.yokitup_synchros.unshift({ id: db.yokitup_synchros.length + 1, le: new Date().toISOString(), par: 'Alexandre', recettes: yokitup.recettes.length, ok: true, message: `${plats} plats` });
      return repondre(req, 200, { ok: true, recettes: yokitup.recettes.length, plats });
    }
    if (p === '/rest/v1/rpc/sauvegarder_maintenant') { etat.ecritures.push({ methode: m, table: 'sauvegardes', corps: {} }); db.sauvegardes.unshift({ id: db.sauvegardes.length + 1, cree_le: new Date().toISOString(), contenu: {} }); return repondre(req, 200, null); }

    // ── Tables ──
    const t = p.replace('/rest/v1/', '');
    if (p.startsWith('/rest/v1/') && db[t]) {
      const filtre = rows => {
        for (const [k, v] of u.searchParams) {
          if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === v.slice(3));
          else if (v.startsWith('gte.')) rows = rows.filter(r => String(r[k]) >= v.slice(4));
          else if (v.startsWith('lte.')) rows = rows.filter(r => String(r[k]) <= v.slice(4));
        }
        return rows;
      };
      if (m === 'GET') {
        if (!role()) return repondre(req, 200, []);   // RLS : rien pour un inconnu
        if (PERSO.includes(t) && role() === 'salle') return repondre(req, 200, []);   // Pertes & Perso : cuisine + admin
        if (t === 'perso_recaps' && role() !== 'admin') return repondre(req, 200, []);
        if (t === 'groupes_contacts' && role() === 'cuisine') return repondre(req, 200, []);   // coordonnées : admin et salle
        if (t === 'yokitup_synchros' && role() !== 'admin') return repondre(req, 200, []);   // historique Yokitup : admin
        if (RATIO.includes(t) && role() !== 'admin') { etat.ratioLuParAutre = true; return repondre(req, 200, []); }   // prix et coûts : admin
        const rows = filtre(db[t].slice());
        if (/vnd\.pgrst\.object/.test(req.headers()['accept'] || '')) return rows.length ? repondre(req, 200, rows[0]) : repondre(req, 406, { code: 'PGRST116', message: 'no rows' });
        return repondre(req, 200, rows);
      }
      const b = corps(req);
      const lignes = m === 'POST' ? (Array.isArray(b) ? b : [b]).map(r => signer(t, r)) : filtre(db[t].slice());
      if (PERSO.includes(t) ? !role() || etat.refuserTout || !lignes.every(l => peutEcrire(t, l)) : !peutEcrire(t)) {
        // comme PostgREST : insertion refusée = erreur 403 ; modification/suppression refusée = 0 ligne, sans erreur
        if (m === 'POST') return repondre(req, 403, { code: '42501', message: 'new row violates row-level security policy' });
        return repondre(req, 200, []);
      }
      etat.ecritures.push({ methode: m, table: t, corps: b, filtre: Object.fromEntries(u.searchParams) });
      if (m === 'POST') {
        const rows = lignes.map(r => {
          const cles = r.id !== undefined ? ['id'] : (CLES[t] || null);
          const i = cles ? db[t].findIndex(x => cles.every(c => x[c] === r[c])) : -1;
          if (i >= 0) { db[t][i] = { ...db[t][i], ...r }; return db[t][i]; }
          const n = CLES[t] ? { ...r } : { id: 'n' + Math.random().toString(36).slice(2, 7), ...r }; db[t].push(n); return n;
        });
        return repondre(req, 201, rows);
      }
      const cibles = filtre(db[t].slice());
      if (m === 'PATCH') {
        // fiche technique dont les allergènes changent : la base recalcule les fiches recette qui l'utilisent
        const changees = t === 'fiches' && 'allergenes' in b ? cibles.filter(r => liste(r.allergenes).join() !== liste(b.allergenes).join()).map(r => r.id) : [];
        cibles.forEach(r => Object.assign(r, b));
        changees.forEach(recalculerAllergenes);
        return repondre(req, 200, cibles);
      }
      if (m === 'DELETE') { db[t] = db[t].filter(r => !cibles.includes(r)); return repondre(req, 200, cibles); }
    }
    if (p.startsWith('/rest/v1/')) { etat.inconnus.push(m + ' ' + p); return repondre(req, 200, []); }
    return req.continue();
  }

  return { db, etat, yokitup, gerer, jeton, HOST };
}


