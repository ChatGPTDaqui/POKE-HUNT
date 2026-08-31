// PH-302: o agendamento que sobrevive a aba em segundo plano.
//
// Os dois caminhos importam e os dois sao exercitados aqui:
//
//  - COM Worker e o caminho que roda no navegador de verdade, e o unico que
//    escapa do throttle de timer da thread principal;
//  - SEM Worker e o fallback, e ele nao e teoria: e por ele que TODA a suite
//    passa (jsdom nao tem Worker) e por ele que um navegador com CSP sem
//    `worker-src blob:` roda.
//
// O modulo guarda o worker num singleton, entao cada caso reimporta com
// `vi.resetModules()` — sem isso o primeiro teste decide o caminho dos outros.
import { afterEach, describe, expect, it, vi } from 'vitest'

type Modulo = typeof import('./temporizadorDeSegundoPlano')

/** Worker de mentira: guarda o que foi postado e deixa o teste responder. */
class WorkerFalso {
  static ultimo: WorkerFalso | null = null
  postados: Array<{ id: number; ms?: number; cancelar?: boolean }> = []
  onmessage: ((e: { data: { id: number } }) => void) | null = null
  onerror: (() => void) | null = null
  constructor() { WorkerFalso.ultimo = this }
  postMessage(dado: { id: number; ms?: number; cancelar?: boolean }) { this.postados.push(dado) }
  /** O worker respondendo que o tempo passou. */
  responder(id: number) { this.onmessage?.({ data: { id } }) }
}

// `URL` NAO pode ser trocado por um objeto solto: o resto da arvore faz
// `new URL(...)` no import e quebraria. So os dois metodos estaticos entram e
// saem — `restaurarUrl` desfaz no afterEach.
type UrlComBlob = typeof URL & { createObjectURL?: unknown; revokeObjectURL?: unknown }
let restaurarUrl: (() => void) | null = null

async function carregarComWorker(): Promise<Modulo> {
  vi.resetModules()
  WorkerFalso.ultimo = null
  vi.stubGlobal('Worker', WorkerFalso)
  vi.stubGlobal('Blob', class { constructor(partes: unknown[], opcoes?: unknown) { void partes; void opcoes } })
  const alvo = URL as UrlComBlob
  const antes = { criar: alvo.createObjectURL, revogar: alvo.revokeObjectURL }
  alvo.createObjectURL = () => 'blob:falso'
  alvo.revokeObjectURL = () => {}
  restaurarUrl = () => { alvo.createObjectURL = antes.criar; alvo.revokeObjectURL = antes.revogar }
  return import('./temporizadorDeSegundoPlano')
}

async function carregarSemWorker(): Promise<Modulo> {
  vi.resetModules()
  vi.stubGlobal('Worker', undefined)
  return import('./temporizadorDeSegundoPlano')
}

afterEach(() => {
  restaurarUrl?.()
  restaurarUrl = null
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('sem Worker (fallback)', () => {
  it('dispara depois do prazo e o cancelamento impede', async () => {
    const { agendarMesmoEmSegundoPlano, usandoWorker } = await carregarSemWorker()
    vi.useFakeTimers()
    expect(usandoWorker()).toBe(false)

    const disparou = vi.fn()
    agendarMesmoEmSegundoPlano(30000, disparou)
    vi.advanceTimersByTime(29999)
    expect(disparou).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(disparou).toHaveBeenCalledTimes(1)

    const cancelado = vi.fn()
    const t = agendarMesmoEmSegundoPlano(30000, cancelado)
    t.cancelar()
    vi.advanceTimersByTime(60000)
    expect(cancelado).not.toHaveBeenCalled()
  })
})

describe('com Worker', () => {
  it('o prazo vai pro worker, e nao pro setTimeout da thread principal', async () => {
    const { agendarMesmoEmSegundoPlano, usandoWorker } = await carregarComWorker()
    vi.useFakeTimers()
    expect(usandoWorker()).toBe(true)

    const disparou = vi.fn()
    agendarMesmoEmSegundoPlano(30000, disparou)
    const w = WorkerFalso.ultimo!
    expect(w.postados).toEqual([{ id: 1, ms: 30000 }])

    // E a PROVA de que o timer nao ficou na thread principal: adiantar o
    // relogio dela nao dispara nada. Quem dispara e o worker.
    vi.advanceTimersByTime(120000)
    expect(disparou).not.toHaveBeenCalled()

    w.responder(1)
    expect(disparou).toHaveBeenCalledTimes(1)
  })

  it('cancelar avisa o worker e a resposta atrasada nao chama o callback', async () => {
    const { agendarMesmoEmSegundoPlano } = await carregarComWorker()
    const disparou = vi.fn()
    const t = agendarMesmoEmSegundoPlano(30000, disparou)
    const w = WorkerFalso.ultimo!
    t.cancelar()
    expect(w.postados).toContainEqual({ id: 1, cancelar: true })

    // Corrida real: o worker pode ja ter postado o recado quando o cancelamento
    // chega. O callback nao pode rodar mesmo assim.
    w.responder(1)
    expect(disparou).not.toHaveBeenCalled()
  })

  it('worker que morre derruba o caminho pro fallback em vez de parar o jogo', async () => {
    const { agendarMesmoEmSegundoPlano, usandoWorker } = await carregarComWorker()
    vi.useFakeTimers()
    agendarMesmoEmSegundoPlano(1000, () => {})
    WorkerFalso.ultimo!.onerror?.()
    expect(usandoWorker()).toBe(false)

    const disparou = vi.fn()
    agendarMesmoEmSegundoPlano(1000, disparou)
    vi.advanceTimersByTime(1000)
    expect(disparou).toHaveBeenCalledTimes(1)
  })

  // PH-331: o caso acima provava so o agendamento SEGUINTE. O elo PENDENTE era
  // descartado, e e ele que sustenta o ritmo de liquidacao — cada flush agenda o
  // proximo (`autoridade.ts`), entao perder o pendente rompe a corrente pra
  // sempre. "O proximo agendamento volta pro setTimeout" nao ajuda quando nao
  // existe proximo agendamento.
  it('o callback que ESTAVA pendente quando o worker morreu ainda dispara', async () => {
    const { agendarMesmoEmSegundoPlano } = await carregarComWorker()
    vi.useFakeTimers()

    const disparou = vi.fn()
    agendarMesmoEmSegundoPlano(30000, disparou)
    WorkerFalso.ultimo!.onerror?.()

    // O prazo restante e reaproveitado, nao zerado: nada dispara antes da hora.
    vi.advanceTimersByTime(29999)
    expect(disparou).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(disparou).toHaveBeenCalledTimes(1)
  })

  it('cancelar o agendamento resgatado continua valendo', async () => {
    // Sem isto o cancelamento vira no-op silencioso: `autoridade.ts` cancela o
    // timer de flush pra reagendar com outro intervalo, e sairiam DOIS flushes.
    const { agendarMesmoEmSegundoPlano } = await carregarComWorker()
    vi.useFakeTimers()

    const disparou = vi.fn()
    const t = agendarMesmoEmSegundoPlano(30000, disparou)
    WorkerFalso.ultimo!.onerror?.()
    t.cancelar()

    vi.advanceTimersByTime(60000)
    expect(disparou).not.toHaveBeenCalled()
  })
})
