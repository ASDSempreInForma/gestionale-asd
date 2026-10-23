// Sessione dell'Area SEDE (23/10/2026, sicurezza): ogni chiamata alle funzioni
// del server porta il token dato dal login, salvato in localStorage
// 'sede_sessione'; il server lo verifica. Se manca o è scaduto si torna al login.
export function tokenSede() {
  try { return JSON.parse(localStorage.getItem('sede_sessione') || 'null')?.token || null; } catch (_) { return null; }
}

export function sessioneSedeScaduta(msg) {
  if (/Sessione scaduta/i.test(msg || '')) {
    try { localStorage.removeItem('sede_sessione'); } catch (_) { /* ignora */ }
    window.location.reload();
  }
}
