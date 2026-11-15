import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative Pfade: läuft auch in einem Unterordner (z. B. GitHub Pages: wundi77.github.io/Webster/)
  base: './',
  server: { port: 5173, strictPort: true },
  // Die Icon-Sammlung (ca. 600 KB) wird erst beim Öffnen des Icon-Dialogs geladen
  build: { chunkSizeWarningLimit: 700 },
});
