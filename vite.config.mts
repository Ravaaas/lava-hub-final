import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Sécurité : code uniquement depuis le site, connexions uniquement vers Supabase, aucun script ni style en ligne, aucun cadre.
// Ajoutée seulement à la version compilée : en aperçu (npm run apercu), Vite injecte les styles dans la page, ce qu'elle bloquerait.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  "connect-src 'self' https://qmvxmxzsmpigvseuidcd.supabase.co wss://qmvxmxzsmpigvseuidcd.supabase.co",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');
const securite = (): Plugin => ({
  name: 'lava-csp',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
});

// Le code de l'app est dans app/ ; la version compilée va dans dist/, publiée sur GitHub Pages.
// base './' : le site fonctionne aussi bien sur GitHub Pages (/lava-hub-final/) qu'en local.
export default defineConfig({
  root: 'app',
  base: './',
  plugins: [react(), securite()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    // Bibliothèques à part : une mise à jour de l'app ne fait pas retélécharger React ni Supabase.
    // jsPDF reste chargé à la demande (première impression).
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
          ],
        },
      },
    },
  },
  test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
});
