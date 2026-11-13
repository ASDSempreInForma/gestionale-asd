// =====================================================================
// VERIFICA IN DUE PASSAGGI (13/11/2026, richiesta di Solomon)
// Codice a 6 cifre da un'app di autenticazione (Google Authenticator,
// Microsoft Authenticator…) oltre alla password, per l'area segreteria.
// Supabase Auth TOTP: una sessione solo con password è "aal1"; dopo il
// codice diventa "aal2". Dal DB: is_admin() richiede aal2 a chi ha attivato
// la verifica (migrazione mfa_admin_aal2), quindi con la sola password
// non si leggono i dati nemmeno chiamando l'API a mano.
// =====================================================================
import { supabase } from './supabase.js'

// { serveCodice: password ok ma manca il codice, attiva: verifica attivata }
export async function statoMfa() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) return { serveCodice: false, attiva: false }
  return {
    serveCodice: data.nextLevel === 'aal2' && data.currentLevel !== 'aal2',
    attiva: data.nextLevel === 'aal2',
  }
}

export async function fattoriTotp() {
  const { data } = await supabase.auth.mfa.listFactors()
  return (data?.totp || []).filter(f => f.status === 'verified')
}

// Verifica il codice con il primo fattore attivo
export async function verificaCodice(codice) {
  const fattori = await fattoriTotp()
  if (!fattori.length) return { errore: 'Nessuna app di autenticazione collegata.' }
  let ultimoErrore = null
  // Se ci sono più telefoni collegati prova ciascun fattore
  for (const f of fattori) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code: codice.trim() })
    if (!error) return { ok: true }
    ultimoErrore = error
  }
  return { errore: /invalid|expired/i.test(ultimoErrore?.message || '') ? 'Codice non corretto o scaduto. Riprova con il codice che vedi adesso.' : (ultimoErrore?.message || 'Verifica non riuscita.') }
}
