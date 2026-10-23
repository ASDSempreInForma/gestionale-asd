import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ebsuqdxflygxhuptnnun.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Sicurezza (23/10/2026): le chiamate alle funzioni del server
// (/functions/v1/...) partono con il token della sessione dell'amministratore
// quando c'è un admin collegato, invece della sola chiave pubblica. Così le
// funzioni riservate (email, bozze, AI...) possono verificare che a chiamarle
// sia davvero la segreteria. Le pagine pubbliche (modulo, area tesserati...)
// non hanno sessione e continuano a usare la chiave pubblica come prima.
if (typeof window !== 'undefined' && !window.__fetchFunzioniAdmin) {
  window.__fetchFunzioniAdmin = true
  const fetchOriginale = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || ''
      if (url.startsWith(SUPABASE_URL + '/functions/v1/')) {
        const { data } = await supabase.auth.getSession()
        const token = data && data.session && data.session.access_token
        if (token) {
          const headers = new Headers((init && init.headers) || (input instanceof Request ? input.headers : undefined))
          headers.set('Authorization', `Bearer ${token}`)
          init = { ...(init || {}), headers }
        }
      }
    } catch (_) { /* in caso di problemi la chiamata parte come prima */ }
    return fetchOriginale(input, init)
  }
}
