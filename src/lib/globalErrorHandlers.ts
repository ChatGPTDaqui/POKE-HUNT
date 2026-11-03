// Cobre o que nem `ErrorBoundary` (erro de render) nem `toastStore.pushToast`
// (erro ja tratado num catch/toast) pegam: excecao sincrona escapando de um
// listener/callback fora do ciclo do React, e promise rejeitada sem `.catch`.
// Registrado uma vez, em main.tsx, antes do primeiro render.
import { supabase } from '@/lib/supabase'

// Erro dentro do loop do jogo repete a cada tick. Sem freio, UM bug virou 2.774
// chamadas de RPC em 20 dias (02/11/2026) — egress e linha de auditoria pra
// dizer a mesma coisa. A mesma mensagem sai no maximo uma vez por janela, e a
// aba inteira tem teto; a pilha vai junto, porque sem ela o erro e indecifravel.
export const JANELA_POR_MENSAGEM_MS = 10 * 60 * 1000
export const TETO_POR_ABA = 20
const TAMANHO_MAXIMO_DA_PILHA = 1500

const ultimaVez = new Map<string, number>()
const suprimidos = new Map<string, number>()
let enviados = 0

export function deveReportar(mensagem: string, agora: number): boolean {
  if (enviados >= TETO_POR_ABA) return false
  const antes = ultimaVez.get(mensagem)
  if (antes != null && agora - antes < JANELA_POR_MENSAGEM_MS) {
    suprimidos.set(mensagem, (suprimidos.get(mensagem) ?? 0) + 1)
    return false
  }
  ultimaVez.set(mensagem, agora)
  enviados++
  return true
}

export function reiniciarFreioDeErros(): void {
  ultimaVez.clear()
  suprimidos.clear()
  enviados = 0
}

function reportar(tipo: string, mensagem: string, pilha?: string): void {
  if (!deveReportar(mensagem, Date.now())) return
  const repetidos = suprimidos.get(mensagem) ?? 0
  suprimidos.delete(mensagem)
  void supabase.rpc('registrar_evento_auditoria', {
    p_rota: window.location.pathname,
    p_mensagem: mensagem,
    p_contexto: {
      tipo,
      ...(pilha ? { pilha: pilha.slice(0, TAMANHO_MAXIMO_DA_PILHA) } : {}),
      ...(repetidos > 0 ? { repetidos } : {}),
    },
  }).then(() => {}, () => {})
}

export function registrarErrosGlobais(): void {
  window.addEventListener('error', (evento) => {
    const erro: unknown = evento.error
    reportar('uncaught', evento.message, erro instanceof Error ? erro.stack : undefined)
  })
  window.addEventListener('unhandledrejection', (evento) => {
    const motivo = evento.reason
    reportar(
      'unhandled-rejection',
      motivo instanceof Error ? motivo.message : String(motivo),
      motivo instanceof Error ? motivo.stack : undefined,
    )
  })
}
