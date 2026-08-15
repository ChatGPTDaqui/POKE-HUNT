// Cobre o que nem `ErrorBoundary` (erro de render) nem `toastStore.pushToast`
// (erro ja tratado num catch/toast) pegam: excecao sincrona escapando de um
// listener/callback fora do ciclo do React, e promise rejeitada sem `.catch`.
// Registrado uma vez, em main.tsx, antes do primeiro render.
import { supabase } from '@/lib/supabase'

function reportar(tipo: string, mensagem: string): void {
  void supabase.rpc('registrar_evento_auditoria', {
    p_rota: window.location.pathname,
    p_mensagem: mensagem,
    p_contexto: { tipo },
  }).then(() => {}, () => {})
}

export function registrarErrosGlobais(): void {
  window.addEventListener('error', (evento) => {
    reportar('uncaught', evento.message)
  })
  window.addEventListener('unhandledrejection', (evento) => {
    const motivo = evento.reason
    reportar('unhandled-rejection', motivo instanceof Error ? motivo.message : String(motivo))
  })
}
