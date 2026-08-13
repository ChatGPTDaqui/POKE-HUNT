// Cobre o que nem `ErrorBoundary` (erro de render) nem `toastStore.pushToast`
// (erro ja tratado num catch/toast) pegam: excecao sincrona escapando de um
// listener/callback fora do ciclo do React, e promise rejeitada sem `.catch`.
// Registrado uma vez, em main.tsx, antes do primeiro render.
import { supabase } from '@/lib/supabase'

function reportar(rota: string, mensagem: string): void {
  void supabase.rpc('reportar_erro', { p_origem: 'client', p_rota: rota, p_mensagem: mensagem }).then(() => {}, () => {})
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
