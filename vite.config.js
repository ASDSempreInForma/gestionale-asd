import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Multi-entry (18/09/2026): ogni area pubblica ha il proprio file .html
// (accanto a index.html) con manifest/titolo/tema già scritti staticamente
// nell'head — necessario perché Safari su iPhone, per "Aggiungi alla
// schermata Home", legge il manifest collegato al caricamento iniziale
// della pagina e ignora i cambi fatti dopo via JavaScript. Tutti i file
// caricano lo stesso bundle (src/main.jsx): è lo stesso React Router a
// decidere cosa mostrare in base al percorso, come prima — cambia solo
// quale .html statico viene servito per ciascun percorso (vedi
// vercel.json). Se si aggiunge una nuova area pubblica da salvare in Home,
// va aggiunta qui, un manifest-<area>.json in /public, e la riga
// corrispondente in vercel.json.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        iscriviti: resolve(__dirname, 'iscriviti.html'),
        prova: resolve(__dirname, 'prova.html'),
        areaTesserati: resolve(__dirname, 'area-tesserati.html'),
        areaIstruttori: resolve(__dirname, 'area-istruttori.html'),
        areaSede: resolve(__dirname, 'area-sede.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
})
