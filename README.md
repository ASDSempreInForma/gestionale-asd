# Gestionale A.S.D. Sempre In Forma

## Come pubblicare su Vercel (prima volta)

### Prerequisiti
- Account GitHub gratuito su github.com
- Account Vercel gratuito su vercel.com

### Procedura

**1. Carica il progetto su GitHub**
- Vai su github.com → "New repository"
- Nome: `gestionale-asd`
- Clicca "Create repository"
- Trascina tutti i file di questa cartella nella pagina GitHub (Upload files)
- Clicca "Commit changes"

**2. Collega Vercel a GitHub**
- Vai su vercel.com → "Add New Project"
- "Import Git Repository" → seleziona `gestionale-asd`
- Framework: **Vite** (dovrebbe essere rilevato automaticamente)
- Clicca "Deploy"

**3. URL del tuo gestionale**
Vercel ti assegnerà un URL tipo:
`https://gestionale-asd.vercel.app`

### Come aggiornare dopo una modifica
1. Vai su GitHub → il tuo repository
2. Clicca sul file da modificare → matita (Edit)
3. Incolla il nuovo contenuto → "Commit changes"
4. Vercel si aggiorna automaticamente in 30 secondi

### Pagine disponibili
| URL | Contenuto |
|-----|-----------|
| `/` | Home pubblica con link ai form |
| `/iscriviti` | Modulo di iscrizione |
| `/prova` | Liberatoria lezione di prova |
| `/admin` | Area segreteria (richiede login) |

### Variabili d'ambiente (opzionale, già configurate nel codice)
Se vuoi nascondere le chiavi Supabase, crea in Vercel:
- `VITE_SUPABASE_URL` = https://ebsuqdxflygxhuptnnun.supabase.co
- `VITE_SUPABASE_ANON_KEY` = (la chiave anonima del progetto)
