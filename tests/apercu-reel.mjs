// Aperçu « vraie base » (npm run apercu) : lecture en direct de la vraie base, ÉCRITURE BLOQUÉE.
// Ce script est chargé avant l'app et filtre tous les appels vers Supabase :
//  - lectures : passent (vraies données) ;
//  - fiches groupe : on peut en créer, modifier et supprimer pour TESTER ; elles restent dans ce navigateur
//    (sessionStorage, préfixe « [TEST] »), apparaissent dans la liste avec les vrais groupes et ne vont JAMAIS dans la base ;
//  - toute autre écriture (fiches, menus, équipe…) est refusée.
// Pour tout enregistrer pour de vrai : ajouter ?ecriture à l'adresse de l'aperçu.
// Chargé par vite.config.mts uniquement en mode « live » (jamais dans la version compilée).
const ecritureAutorisee = new URLSearchParams(location.search).has('ecriture');
const CLE = 'lava-apercu-groupes-test';
const JSON_HDR = { 'content-type': 'application/json' };
const reponse = (status, corps) => Promise.resolve(new Response(JSON.stringify(corps), { status, headers: JSON_HDR }));

const lire = () => { try { return JSON.parse(sessionStorage.getItem(CLE) || '[]'); } catch { return []; } };
const ecrire = l => { try { sessionStorage.setItem(CLE, JSON.stringify(l)); } catch { /* stockage indisponible : les groupes test durent le temps de la page */ } };

const natif = window.fetch.bind(window);
if (!ecritureAutorisee) {
  window.fetch = async (entree, init) => {
    const req = new Request(entree, init);
    const url = new URL(req.url);
    const p = url.pathname;
    if (!url.hostname.endsWith('.supabase.co') || !/^\/(rest|functions)\/v1\//.test(p)) return natif(req);

    // Groupes : les vrais (lecture) + les groupes test de ce navigateur
    if (p === '/rest/v1/groupes') {
      if (req.method === 'GET') {
        const vrais = await natif(req);
        if (!vrais.ok) return vrais;
        const lignes = [...(await vrais.json()), ...lire()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
        return reponse(200, lignes);
      }
      const test = lire();
      const cible = url.searchParams.get('id')?.replace('eq.', '');
      if (req.method === 'POST') {
        const corps = await req.json();
        const lignes = (Array.isArray(corps) ? corps : [corps]).map(l => ({
          ...l, id: 'test-' + Math.random().toString(36).slice(2, 9), nom: '[TEST] ' + l.nom, created_at: new Date().toISOString(), modifie_par: null, modifie_le: null,
        }));
        ecrire([...test, ...lignes]);
        return reponse(201, lignes);
      }
      if (cible?.startsWith('test-') && (req.method === 'PATCH' || req.method === 'DELETE')) {
        const ligne = test.find(l => l.id === cible);
        if (!ligne) return reponse(200, []);
        if (req.method === 'DELETE') { ecrire(test.filter(l => l.id !== cible)); return reponse(200, [ligne]); }
        const maj = { ...ligne, ...(await req.json()) };
        if (!String(maj.nom).startsWith('[TEST] ')) maj.nom = '[TEST] ' + maj.nom;
        ecrire(test.map(l => (l.id === cible ? maj : l)));
        return reponse(200, [maj]);
      }
    }
    // Le journal n'enregistre rien dans l'aperçu
    if (p === '/rest/v1/audit_log' && req.method === 'POST') return reponse(201, []);

    // Lectures et liste des profils de connexion
    if (req.method === 'GET' || req.method === 'HEAD' || /\/rpc\/profils_connexion/.test(p)) return natif(req);
    return reponse(403, { message: 'Aperçu en lecture seule : rien n\'est enregistré' });
  };
}

addEventListener('DOMContentLoaded', () => {
  const b = document.createElement('div');
  b.textContent = ecritureAutorisee
    ? 'BASE RÉELLE — les enregistrements sont RÉELS'
    : 'BASE RÉELLE en lecture seule — les fiches groupe créées ici sont des tests (jamais enregistrées dans la base)';
  b.style.cssText = `position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:99999;background:${ecritureAutorisee ? '#B5433C' : '#222'};color:#fff;font:600 11px system-ui;padding:2px 10px;border-radius:0 0 8px 8px;pointer-events:none;opacity:.85`;
  document.body.append(b);
});
