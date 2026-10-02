// Aperçu « vraie base » (npm run apercu) : les vraies données en direct, mais RIEN n'est écrit dans la base.
// Ce script est chargé avant l'app et filtre tous les appels vers Supabase :
//  - lectures : passent (vraies données), puis on y applique les modifications de test de ce navigateur ;
//  - écritures (fiches, fiches recette, menus, groupes, équipe, catégories, journal…) : gardées dans ce navigateur
//    (sessionStorage : elles survivent au rechargement, disparaissent à la fermeture de l'onglet), jamais envoyées ;
//  - fonction « equipe », sauvegarde, changement de mot de passe : simulés.
// Limite : ce que la base calcule elle-même (allergènes des fiches recette, modifie_par/le) n'est pas recalculé.
// Pour tout enregistrer pour de vrai : ajouter ?ecriture à l'adresse de l'aperçu.
// Chargé par vite.config.mts uniquement en mode « live » (jamais dans la version compilée).
const ecritureAutorisee = new URLSearchParams(location.search).has('ecriture');
const CLE = 'lava-apercu-tests';
const JSON_HDR = { 'content-type': 'application/json' };
const reponse = (status, corps) => Promise.resolve(new Response(JSON.stringify(corps), { status, headers: JSON_HDR }));
const cleDe = table => (table === 'membres' ? 'email' : 'id');

// tests[table][clé] = { ligne, nouveau } ; ligne null = supprimée. nouveau = absente de la vraie base.
let tests = {};
try { tests = JSON.parse(sessionStorage.getItem(CLE) || '{}'); } catch { /* rien */ }
const garder = () => { try { sessionStorage.setItem(CLE, JSON.stringify(tests)); } catch { /* trop gros (photos) : gardé le temps de la page */ } };

const filtres = url => [...url.searchParams].filter(([, v]) => v.startsWith('eq.')).map(([k, v]) => [k, v.slice(3)]);
const passe = (ligne, f) => f.every(([k, v]) => String(ligne[k]) === v);
function trier(lignes, url) {
  const [col, sens] = (url.searchParams.get('order') || '').split('.');
  if (!col) return lignes;
  const s = sens === 'desc' ? -1 : 1;
  return lignes.sort((a, b) => s * (typeof a[col] === 'number' && typeof b[col] === 'number' ? a[col] - b[col] : String(a[col] ?? '').localeCompare(String(b[col] ?? ''))));
}

const natif = window.fetch.bind(window);
if (!ecritureAutorisee) {
  window.fetch = async (entree, init) => {
    const req = new Request(entree, init);
    const url = new URL(req.url);
    const p = url.pathname;
    if (!url.hostname.endsWith('.supabase.co')) return natif(req);

    // Changement de mot de passe : jamais envoyé
    if (p === '/auth/v1/user' && req.method === 'PUT') return natif(new Request(req.url, { headers: req.headers }));
    if (p === '/functions/v1/equipe') return reponse(200, { ok: true });
    if (p === '/rest/v1/rpc/sauvegarder_maintenant' || p === '/rest/v1/rpc/mdp_change') return reponse(200, null);
    if (!p.startsWith('/rest/v1/') || p.startsWith('/rest/v1/rpc/')) return natif(req);

    const table = p.slice('/rest/v1/'.length);
    const cle = cleDe(table);
    const t = (tests[table] ??= {});
    const f = filtres(url);

    if (req.method === 'GET' || req.method === 'HEAD') {
      const vrais = await natif(req);
      if (!vrais.ok || req.method === 'HEAD' || !Object.keys(t).length) return vrais;
      const donnees = await vrais.json();
      const unSeul = !Array.isArray(donnees);
      const vues = new Set();
      const lignes = (unSeul ? (donnees ? [donnees] : []) : donnees).flatMap(l => {
        const k = l[cle];
        vues.add(String(k));
        if (!(k in t)) return [l];
        return t[k].ligne ? [{ ...l, ...t[k].ligne }] : [];
      });
      for (const [k, { ligne, nouveau }] of Object.entries(t)) if (nouveau && ligne && !vues.has(k) && passe(ligne, f)) lignes.push(ligne);
      trier(lignes, url);
      return unSeul ? (lignes.length ? reponse(200, lignes[0]) : reponse(406, { code: 'PGRST116', message: 'no rows' })) : reponse(200, lignes);
    }

    const corps = req.method === 'DELETE' ? null : await req.json().catch(() => ({}));
    let touchees = [];
    if (req.method === 'POST') {
      const upsert = /merge-duplicates/.test(req.headers.get('prefer') || '');
      touchees = (Array.isArray(corps) ? corps : [corps]).map(r => {
        const k = r[cle] ?? 'test-' + Math.random().toString(36).slice(2, 9);
        const avant = t[k];
        const ligne = { ...(upsert ? avant?.ligne : { created_at: new Date().toISOString() }), ...r, [cle]: k };
        t[k] = { ligne, nouveau: avant ? avant.nouveau : !upsert };
        return ligne;
      });
    } else {
      const [, v] = f.find(([k]) => k === cle) || [];
      if (v !== undefined) {
        const avant = t[v];
        if (req.method === 'DELETE') { if (avant?.nouveau) delete t[v]; else t[v] = { ligne: null, nouveau: false }; }
        else if (avant?.ligne !== null) t[v] = { ligne: { ...avant?.ligne, ...corps, [cle]: v }, nouveau: !!avant?.nouveau };
        touchees = [{ [cle]: v }];
      }
    }
    garder();
    return reponse(req.method === 'POST' ? 201 : 200, touchees);
  };
}

addEventListener('DOMContentLoaded', () => {
  const b = document.createElement('div');
  b.textContent = ecritureAutorisee
    ? 'BASE RÉELLE — les enregistrements sont RÉELS'
    : 'BASE RÉELLE — mode test : vos modifications restent dans cet onglet, rien n\'est enregistré dans la base';
  b.style.cssText = `position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:99999;background:${ecritureAutorisee ? '#B5433C' : '#222'};color:#fff;font:600 11px system-ui;padding:2px 10px;border-radius:0 0 8px 8px;pointer-events:none;opacity:.85`;
  document.body.append(b);
});
