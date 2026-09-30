// Filet de sécurité : aucun secret dans le code publié. Lancer : npm run secrets
// Chaque clé Supabase (JWT) trouvée dans app/ et supabase/ est décodée : seule la clé publique « anon » est admise.
const fs = require('fs');
const path = require('path');

const racine = path.join(__dirname, '..');
const fichiers = [];
const parcourir = d => {
  if (!fs.existsSync(d)) return;
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) parcourir(p); else if (!/\.(avif|png|jpe?g|svg|ico)$/.test(f.name)) fichiers.push(p);
  }
};
parcourir(path.join(racine, 'app'));
parcourir(path.join(racine, 'supabase'));

const problemes = [];
for (const f of fichiers) {
  const texte = fs.readFileSync(f, 'utf8'), nom = path.relative(racine, f);
  for (const [jwt] of texte.matchAll(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g)) {
    let role = '?';
    try { role = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role; } catch (e) {}
    if (role !== 'anon') problemes.push(`${nom} : clé Supabase de rôle « ${role} » (seule la clé anon est publique)`);
  }
  if (/sb_secret_/i.test(texte)) problemes.push(`${nom} : clé secrète Supabase (sb_secret_)`);
}

if (problemes.length) {
  console.error('ECHEC : secret possible dans le code publié :\n - ' + problemes.join('\n - '));
  process.exit(1);
}
console.log(`OK : aucun secret (${fichiers.length} fichiers vérifiés).`);
