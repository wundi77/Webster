import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Kennung dieses Builds. Die fertige Seite legt sie zusätzlich als version.json ab;
// so merkt eine im Browser gespeicherte alte Fassung, dass es eine neuere gibt (siehe src/update.ts).
const BUILD_ID = new Date().toISOString().replace(/\D/g, '').slice(0, 14);

const versionFile = (): Plugin => ({
  name: 'webster-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
  },
});

export default defineConfig(({ command }) => ({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(command === 'build' ? BUILD_ID : 'dev') },
  // Relative Pfade: läuft auch in einem Unterordner (z. B. GitHub Pages: wundi77.github.io/Webster/)
  base: './',
  server: { port: 5173, strictPort: true },
  // Die Icon-Sammlung (ca. 600 KB) wird erst beim Öffnen des Icon-Dialogs geladen
  build: { chunkSizeWarningLimit: 700 },
}));
