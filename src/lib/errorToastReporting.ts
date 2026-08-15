// Choke point unico de captura de erro do client — achado no pente fino:
// Mercado/Shop tem seu proprio toast() local, mas todos embrulham
// `useToastStore.pushToast`, entao OBSERVAR a store (em vez de editar a
// action) cobre toda feature de uma vez, sem cacar call site.
//
// Por que um subscriber externo e nao um hook dentro de `pushToast`: aquele
// arquivo e importado por `engine/simulation.ts`, que roda HEADLESS EM NODE
// (servidor tambem simula) — import de `@/lib/supabase` ali dentro arrastaria
// o client Supabase de browser pro bundle da Edge Function de novo (mesmo
// bug do PH-6). Este arquivo so e importado do client (main.tsx), nunca do
// `#engine`.
import { useToastStore } from '@/stores/toastStore'
import { supabase } from '@/lib/supabase'

export function iniciarCapturaDeErroDeToast(): void {
  let ultimoLength = useToastStore.getState().toasts.length
  useToastStore.subscribe((state) => {
    const novos = state.toasts.slice(ultimoLength)
    ultimoLength = state.toasts.length
    for (const toast of novos) {
      if (toast.type !== 'error') continue
      // `.catch` mudo de proposito: reportar erro nao pode gerar outro erro.
      void supabase.rpc('registrar_evento_auditoria', {
        p_rota: window.location.pathname,
        p_mensagem: toast.message,
        p_contexto: { canal: toast.channel },
      }).then(() => {}, () => {})
    }
  })
}
