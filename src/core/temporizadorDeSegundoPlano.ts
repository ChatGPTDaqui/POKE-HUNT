// PH-302: um `setTimeout` que sobrevive a aba em segundo plano.
//
// O PROBLEMA QUE ISTO RESOLVE
// ---------------------------------------------------------------------------
// O Chrome derruba os timers da thread principal de uma aba oculta: primeiro
// pra ~1 disparo por segundo, e depois de ~5 minutos escondida pra ~1 disparo
// por MINUTO (a "intensive throttling" do Chrome 88). O ritmo de liquidacao do
// jogo (`INTERVALO_FLUSH_MS`, 30s) vira entao um flush por minuto, e o teto do
// intervalo adaptativo (90s) vira 120s — exatamente `LIMIAR_OFFLINE_SEGUNDOS`,
// a linha em que o servidor deixa de tratar a janela como jogo ao vivo.
//
// Timer de Web Worker NAO entra nesse regime: o throttle e da thread principal
// do documento. Um worker que so conta tempo e devolve um recado mantem o
// ritmo com a aba minimizada, e custa uma thread ociosa.
//
// O QUE ISTO NAO RESOLVE, e nao ha como resolver do lado do cliente: uma aba
// CONGELADA (o navegador suspende a pagina inteira, worker junto) nao roda
// nada. Ali o intervalo cresce ate a aba voltar, e quem decide o que fazer com
// uma janela longa e o servidor.
//
// FALLBACK: sem `Worker` (jsdom nos testes, navegador antigo, CSP que barra
// blob:) cai em `setTimeout` e o comportamento e o de antes — pior no segundo
// plano, correto em tudo o mais. E o mesmo caminho que os testes exercitam com
// timers falsos, entao o fallback nao e codigo sem cobertura.

export interface TemporizadorCancelavel {
  cancelar(): void
}

// O worker so conta tempo. Nao importa modulo nenhum de proposito: assim ele
// nasce de um blob (sem arquivo separado, sem passo de build) e nao arrasta
// nada do jogo pra dentro de outra thread.
const FONTE_DO_WORKER = `
const pendentes = new Map()
self.onmessage = (e) => {
  const dado = e.data
  if (dado.cancelar) {
    const timer = pendentes.get(dado.id)
    if (timer !== undefined) { clearTimeout(timer); pendentes.delete(dado.id) }
    return
  }
  pendentes.set(dado.id, setTimeout(() => {
    pendentes.delete(dado.id)
    self.postMessage({ id: dado.id })
  }, dado.ms))
}
`

let worker: Worker | null = null
let workerIndisponivel = false
let proximoId = 1
const callbacks = new Map<number, () => void>()

function obterWorker(): Worker | null {
  if (worker) return worker
  if (workerIndisponivel) return null
  // Nao e "navegador moderno tem tudo isso": jsdom nao tem `Worker`, e uma CSP
  // sem `worker-src blob:` faz o construtor lancar. Os dois caem no fallback.
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    workerIndisponivel = true
    return null
  }
  try {
    const url = URL.createObjectURL(new Blob([FONTE_DO_WORKER], { type: 'text/javascript' }))
    const criado = new Worker(url)
    // O blob ja foi carregado pelo construtor; revogar aqui libera a memoria
    // sem afetar o worker vivo.
    URL.revokeObjectURL(url)
    criado.onmessage = (evento: MessageEvent<{ id: number }>) => {
      const callback = callbacks.get(evento.data.id)
      if (!callback) return
      callbacks.delete(evento.data.id)
      callback()
    }
    // Um worker que morre (OOM, aba descartando recursos) nao pode levar o
    // ritmo de liquidacao junto: derruba a referencia e o proximo agendamento
    // volta pro `setTimeout`.
    criado.onerror = () => {
      worker = null
      workerIndisponivel = true
      callbacks.clear()
    }
    worker = criado
    return worker
  } catch {
    workerIndisponivel = true
    return null
  }
}

/**
 * Chama `fn` daqui a `ms`, sem o throttle de aba em segundo plano quando o
 * navegador permite. `cancelar()` e idempotente e vale nos dois caminhos.
 */
export function agendarMesmoEmSegundoPlano(ms: number, fn: () => void): TemporizadorCancelavel {
  const w = obterWorker()
  if (!w) {
    const timer = setTimeout(fn, ms)
    return { cancelar: () => clearTimeout(timer) }
  }
  const id = proximoId++
  callbacks.set(id, fn)
  w.postMessage({ id, ms })
  return {
    cancelar: () => {
      if (!callbacks.delete(id)) return
      w.postMessage({ id, cancelar: true })
    },
  }
}

/** Diagnostico e teste: por qual caminho os agendamentos estao saindo. */
export function usandoWorker(): boolean {
  return obterWorker() != null
}
