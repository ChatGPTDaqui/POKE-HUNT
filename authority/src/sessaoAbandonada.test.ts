// PH-277 — sessao parada alem do limite e fechada e NAO credita; sessao viva
// nao e tocada.
//
// O QUE ESTA EM JOGO
//
// Antes disto uma sessao so fechava por caminho explicito. Quem fechava a aba
// sem o ultimo flush completar deixava a linha aberta pra sempre — medido no
// banco em 29/08: uma parada ha 1 dia e 6 horas, que nunca chegou a flushar.
//
// Hoje isso nao credita nada porque `FARM_OFFLINE_PAUSADO` descarta o intervalo
// de ausencia. Essa constante e TEMPORARIA, e o dia em que ela voltar a `false`
// e o dia em que a sessao esquecida vira horas de credito retroativo — premiando
// quem fecha a aba de qualquer jeito em vez de quem sai pela porta.
//
// O caso "NAO credita" e o que importa e o mais facil de perder numa refatoracao:
// bastaria `sessaoAberta` devolver a linha velha em vez de `null` pra o flush
// seguinte pagar o intervalo inteiro. Por isso o teste afirma sobre o que foi
// LIDO e ESCRITO, e nao so sobre o retorno.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Config } from './db.js'

const LEITURAS: string[] = []
const PATCHES: { caminho: string; patch: Record<string, unknown> }[] = []
let linhasDeSessao: Record<string, unknown>[] = []

vi.mock('./db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./db.js')>()
  return {
    ...real,
    selecionar: vi.fn(async (_cfg: unknown, caminho: string) => {
      LEITURAS.push(caminho)
      if (caminho.startsWith('game_sessions')) return linhasDeSessao
      return []
    }),
    atualizar: vi.fn(async (_cfg: unknown, caminho: string, patch: Record<string, unknown>) => {
      PATCHES.push({ caminho, patch })
    }),
    selecionarTudo: vi.fn(async () => []),
    atualizarRetornando: vi.fn(async () => []),
    chamarRpc: vi.fn(async () => ({ ok: true })),
    inserir: vi.fn(async () => []),
    apagar: vi.fn(async () => {}),
  }
})

const { sessaoAbandonada, SESSAO_INATIVA_SEGUNDOS, __testes } = await import('./appSessao.js')
const cfg = {} as Config
const USER = 'jogador-1'

/** Linha de sessao cujo ultimo flush foi ha `segundosAtras` segundos. */
function sessao(segundosAtras: number, id = 'sessao-1') {
  return {
    id,
    user_id: USER,
    map_id: 'mata_e1',
    poke_uid: 'poke-1',
    seed: 1,
    rng_state: 1,
    rng_draws: 0,
    started_at: new Date(Date.now() - segundosAtras * 1000).toISOString(),
    last_flush_at: new Date(Date.now() - segundosAtras * 1000).toISOString(),
    simulated_seconds: 0,
    closed_at: null,
    flushing_since: null,
    sequence_index: 0,
    sequence_cleared: false,
    sala_indice: 0,
    sala_chave: null,
    sala_abates: 0,
    ciclos: 0,
    sala_protetor: null,
  }
}

beforeEach(() => {
  LEITURAS.length = 0
  PATCHES.length = 0
  linhasDeSessao = []
  vi.clearAllMocks()
})

describe('sessaoAbandonada() — a regra, isolada (PH-277)', () => {
  it('o limite e de 30 minutos', () => {
    expect(SESSAO_INATIVA_SEGUNDOS).toBe(30 * 60)
  })

  it('parada por mais que o limite: abandonada', () => {
    expect(sessaoAbandonada(sessao(SESSAO_INATIVA_SEGUNDOS + 1))).toBe(true)
    expect(sessaoAbandonada(sessao(30 * 3600))).toBe(true) // o caso real de 1 dia e 6h
  })

  it('flush recente: viva', () => {
    // 90s e o `INTERVALO_FLUSH_MAX_MS` do cliente — o pior caso de uma aba VIVA.
    // Se este caso virar "abandonada", o jogo passa a expulsar quem esta jogando.
    expect(sessaoAbandonada(sessao(90))).toBe(false)
    expect(sessaoAbandonada(sessao(0))).toBe(false)
    expect(sessaoAbandonada(sessao(SESSAO_INATIVA_SEGUNDOS - 1))).toBe(false)
  })

  it('data invalida NAO vira abandonada', () => {
    // `NaN` em qualquer comparacao e `false`, e e esse o resultado que se quer:
    // na duvida a sessao continua viva e o caminho normal decide. O contrario
    // (coluna torta expulsando o jogador da hunt) seria pior.
    expect(sessaoAbandonada({ last_flush_at: 'nao-e-data' })).toBe(false)
  })

  it('exatamente no limite ainda e viva — o corte e estritamente maior', () => {
    expect(sessaoAbandonada({ last_flush_at: new Date(1000).toISOString() }, 1000 + SESSAO_INATIVA_SEGUNDOS * 1000)).toBe(false)
  })
})

describe('sessaoAberta() fecha a abandonada e nao a reaproveita (PH-277)', () => {
  it('sessao parada: devolve null, fecha a linha e limpa current_map_id', async () => {
    linhasDeSessao = [sessao(2 * 3600)]

    const r = await __testes.sessaoAberta(cfg, USER)

    expect(r, 'devolveu a linha velha — o flush seguinte pagaria as 2 horas abandonadas').toBeNull()
    expect(PATCHES.map((p) => p.caminho)).toEqual([
      'game_sessions?id=eq.sessao-1',
      `players?user_id=eq.${USER}`,
    ])
    expect(PATCHES[0].patch.closed_at, 'a linha nao foi fechada').toEqual(expect.any(String))
    expect(
      PATCHES[1].patch,
      'current_map_id ficou apontando pra um mapa sem sessao — o jogador volta pra dentro de uma cacada que nao credita nada',
    ).toEqual({ current_map_id: null })
  })

  it('sessao viva: devolve a linha e NAO escreve nada', async () => {
    linhasDeSessao = [sessao(60)]

    const r = await __testes.sessaoAberta(cfg, USER)

    expect(r?.id).toBe('sessao-1')
    expect(PATCHES, 'escreveu em cima de uma sessao viva').toEqual([])
  })

  it('a orfa extra continua sendo fechada, viva ou nao', async () => {
    // Comportamento anterior a esta issue, e ele nao pode ter sido perdido: o
    // indice unico parcial garante uma sessao aberta, e a varredura e a defesa
    // em profundidade contra dado legado.
    linhasDeSessao = [sessao(60, 'vencedora'), sessao(60, 'orfa')]

    const r = await __testes.sessaoAberta(cfg, USER)

    expect(r?.id).toBe('vencedora')
    expect(PATCHES.map((p) => p.caminho)).toEqual(['game_sessions?id=eq.orfa'])
  })

  it('nenhuma sessao aberta: null, sem escrita', async () => {
    linhasDeSessao = []
    expect(await __testes.sessaoAberta(cfg, USER)).toBeNull()
    expect(PATCHES).toEqual([])
  })
})
