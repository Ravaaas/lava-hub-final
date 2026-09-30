import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// La nouvelle version vit dans app/ tant que l'ancienne (index.html à la racine) est en ligne.
// base './' : le site fonctionne aussi bien sur GitHub Pages (/lava-hub-final/) qu'en local.
export default defineConfig({
  root: 'app',
  base: './',
  plugins: [react()],
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
