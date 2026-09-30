// Joue le contrat (tests/parcours.test.js) sur la nouvelle version compilée (dist/), servie en local.
// Lancer : npm run parcours:nouvelle   (compile d'abord)
const { spawn } = require('child_process');
const path = require('path');

(async () => {
  const { preview } = await import('vite');
  const serveur = await preview({ configFile: path.join(__dirname, '..', 'vite.config.mts'), preview: { port: 4173, strictPort: true } });
  const url = serveur.resolvedUrls.local[0];
  const test = spawn(process.execPath, [path.join(__dirname, 'parcours.test.js')], { stdio: 'inherit', env: { ...process.env, APP_URL: url } });
  test.on('exit', async code => { await serveur.close(); process.exit(code ?? 1); });
})().catch(e => { console.error(e); process.exit(2); });
