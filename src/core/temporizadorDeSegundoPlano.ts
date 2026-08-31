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
/**
 * O que esta esperando o worker responder.
 *
 * Guarda `ms` e `agendadoEm` junto do callback, e nao so o callback (PH-331):
 * quando o worker morre, o que falta do prazo tem que ser reagendado na thread
 * principal, e pra isso e preciso saber quanto falta. Ver `resgatarPendentes`.
 */
interface Pendente {
  fn: () => void
  ms: number
  agendadoEm: number
}
const callbacks = new Map<number, Pendente>()
/**
 * Timers que sairam do worker morto pra thread principal, pelo mesmo id.
 * Existem so pra `cancelar()` continuar valendo depois do resgate.
 */
const resgatados = new Map<number, ReturnType<typeof setTimeout>>()

/**
 * Worker morreu: passa o que estava pendente pro `setTimeout` da thread
 * principal, em vez de deixar cair.
 *
 * ---------------------------------------------------------------------------
 * O BURACO QUE ISTO FECHA (PH-331)
 * ---------------------------------------------------------------------------
 * `onerror` limpava o mapa (`callbacks.clear()`) e seguia. A intencao era "o
 * proximo agendamento volta pro setTimeout" — e ela e verdadeira, mas nao havia
 * proximo agendamento.
 *
 * O ritmo de liquidacao do jogo e uma CORRENTE, nao um intervalo: cada flush
 * agenda o seguinte (`data/remote/autoridade.ts`, `timerFlush =
 * agendarMesmoEmSegundoPlano(...)`). Descartar o elo pendente rompe a corrente
 * pra sempre — o jogo para de liquidar ate outro gatilho aparecer
 * (`visibilitychange`, uma acao do jogador), e enquanto isso a janela do
 * servidor cresce, atravessa `LIMIAR_OFFLINE_SEGUNDOS` e depois os 30 minutos de
 * sessao inativa. O sintoma pro jogador e "deixei em segundo plano e o jogo
 * parou", que e o oposto do que o worker foi posto aqui pra garantir.
 *
 * O prazo restante e reaproveitado (nao zerado): um flush disparado cedo cai no
 * piso de janela do servidor (`PISO_DE_JANELA_SEGUNDOS`) e o tempo fica represado
 * pro proximo — nao e perda, mas tambem nao e request de graca.
 */
function resgatarPendentes(): void {
  const agora = Date.now()
  const pendentes = [...callbacks.entries()]
  callbacks.clear()
  for (const [id, pendente] of pendentes) {
    const restante = Math.max(0, pendente.ms - (agora - pendente.agendadoEm))
    // Guardado POR ID, e nao solto: `cancelar()` do agendamento original ainda
    // pode ser chamado depois do resgate — `autoridade.ts` cancela o timer de
    // flush pra reagendar com outro intervalo. Sem isto o cancelamento viraria
    // no-op silencioso e o flush sairia duas vezes.
    resgatados.set(id, setTimeout(() => {
      resgatados.delete(id)
      pendente.fn()
    }, restante))
  }
}

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
      const pendente = callbacks.get(evento.data.id)
      if (!pendente) return
      callbacks.delete(evento.data.id)
      pendente.fn()
    }
    // Um worker que morre (OOM, aba descartando recursos) nao pode levar o
    // ritmo de liquidacao junto: derruba a referencia (os agendamentos seguintes
    // vao pro `setTimeout`) E resgata o que ja estava pendente, que e o elo da
    // corrente sem o qual nao ha "proximo agendamento" nenhum. Ver
    // `resgatarPendentes`.
    criado.onerror = () => {
      worker = null
      workerIndisponivel = true
      resgatarPendentes()
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
  callbacks.set(id, { fn, ms, agendadoEm: Date.now() })
  w.postMessage({ id, ms })
  return {
    cancelar: () => {
      // Resgatado (o worker morreu depois deste agendamento): quem segura o
      // prazo agora e um `setTimeout` da thread principal, e e ele que precisa
      // ser limpo. Avisar o worker morto nao faria nada.
      const resgatado = resgatados.get(id)
      if (resgatado !== undefined) {
        clearTimeout(resgatado)
        resgatados.delete(id)
        return
      }
      if (!callbacks.delete(id)) return
      w.postMessage({ id, cancelar: true })
    },
  }
}

/** Diagnostico e teste: por qual caminho os agendamentos estao saindo. */
export function usandoWorker(): boolean {
  return obterWorker() != null
}
