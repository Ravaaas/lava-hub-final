// Vérifications rapides de index.html, sans navigateur : node tests/static.js
// Échoue (code 1) si le script est invalide, si le HTML est déséquilibré ou si le code cherche un élément qui n'existe pas.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
// Le script principal est le dernier <script> avant </body> (un petit script de thème précède, dans l'en-tête)
const m = html.match(/<script>((?:(?!<script>)[\s\S])*?)<\/script>\s*<\/body>/);
const problemes = [];

if (!m) {
  problemes.push('script principal introuvable (balise <script> avant </body>)');
} else {
  try { new vm.Script(m[1]); } catch (e) { problemes.push('erreur de syntaxe JavaScript : ' + e.message); }

  // Chaque getElementById('x') doit correspondre à un id="x" dans la page (sauf éléments créés à la volée)
  const dynamiques = new Set(['fr-setup-sql']);
  const ids = new Set([...m[1].matchAll(/getElementById\('([\w-]+)'\)/g)].map(x => x[1]));
  for (const id of ids) {
    if (!dynamiques.has(id) && !html.includes(`id="${id}"`)) problemes.push(`getElementById('${id}') : aucun élément id="${id}"`);
  }
}

// Un même id ne doit pas apparaître deux fois
const vus = new Map();
for (const x of html.matchAll(/\sid="([\w-]+)"/g)) vus.set(x[1], (vus.get(x[1]) || 0) + 1);
for (const [id, n] of vus) if (n > 1) problemes.push(`id="${id}" présent ${n} fois`);

// Les <div> doivent s'équilibrer (hors script)
const corps = m ? html.slice(0, html.indexOf(m[0])) : html;
const ouverts = (corps.match(/<div[\s>]/g) || []).length, fermes = (corps.match(/<\/div>/g) || []).length;
if (ouverts !== fermes) problemes.push(`<div> déséquilibrés : ${ouverts} ouverts, ${fermes} fermés`);

// Filet de sécurité : aucun secret ne doit apparaître dans la page (seule la clé publique « anon » est normale)
for (const [motif, nom] of [[/service_role/i, 'clé service_role'], [/sb_secret_/i, 'clé secrète Supabase'], [/lava_secret/i, 'mot de passe en clair']]) {
  if (motif.test(html)) problemes.push(`secret possible dans index.html : ${nom}`);
}

if (problemes.length) {
  console.error('ECHEC de la vérification statique :\n - ' + problemes.join('\n - '));
  process.exit(1);
}
console.log(`OK : script valide, ${vus.size} ids uniques, ${ouverts} <div> équilibrés, aucun secret.`);
