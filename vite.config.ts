import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// La nouvelle version vit dans app/ tant que l'ancienne (index.html à la racine) est en ligne.
// base './' : le site fonctionne aussi bien sur GitHub Pages (/lava-hub-final/) qu'en local.
export default defineConfig({
  root: 'app',
  base: './',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022' },
  test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
});
