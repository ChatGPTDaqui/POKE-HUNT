import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defaultGameStateData } from '#engine'
import { ErroHttp, type Config } from './db.js'
import { gravarEstado, comRetryDeColisao, CONFLITO_ESCRITA_JOGADOR } from './progresso.js'

// Fake minimo da linha de `players`: so o suficiente pra exercitar o CAS de
// gravarEstado() sem banco real. As outras tabelas que gravarEstado toca
// (pokemon_instances/player_items/player_pokedex/player_auto_catch_rules) nao
// sao o foco da PH-5 -- ficam como no-op.
let tabelaPlayers: { user_id: string; updated_at: string; [k: string]: unknown }

vi.mock('./db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./db.js')>()
  return {
    ...real,
    atualizarRetornando: vi.fn(async (_cfg: unknown, caminho: string, patch: Record<string, unknown>) => {
      const bateUpdatedAt = caminho.includes(`updated_at=eq.${encodeURIComponent(tabelaPlayers.updated_at)}`)
      if (!bateUpdatedAt) return []
      Object.assign(tabelaPlayers, patch)
      // Simula o trigger `players_set_updated_at`: todo UPDATE bem sucedido
      // (nosso ou de um request concorrente) sempre avanca a versao.
      tabelaPlayers.updated_at = new Date(new Date(tabelaPlayers.updated_at).getTime() + 1).toISOString()
      return [tabelaPlayers]
    }),
    atualizar: vi.fn(async () => {}),
    selecionarTudo: vi.fn(async () => []),
    inserir: vi.fn(async () => []),
    apagar: vi.fn(async () => {}),
  }
})

const cfg = {} as Config

beforeEach(() => {
  tabelaPlayers = { user_id: 'jogador-1', updated_at: '2026-01-01T00:00:00.000Z' }
  vi.clearAllMocks()
})

describe('gravarEstado() — CAS na linha de players (PH-5)', () => {
  it('duas gravacoes concorrentes com o mesmo snapshot: a segunda leva 409, sem sobrescrever a primeira', async () => {
    const t0 = tabelaPlayers.updated_at
    const estado = defaultGameStateData()

    await gravarEstado(cfg, 'jogador-1', estado, new Set(), t0)
    const apósPrimeira = tabelaPlayers.updated_at
    expect(apósPrimeira).not.toBe(t0)

    await expect(gravarEstado(cfg, 'jogador-1', estado, new Set(), t0)).rejects.toThrow(ErroHttp)
    // updated_at continua exatamente o da primeira escrita: a segunda nao
    // aplicou nada por cima (sem isso seria o bug real de PH-5).
    expect(tabelaPlayers.updated_at).toBe(apósPrimeira)
  })

  it('gravacao sequencial (cada uma le o updated_at fresco) funciona normalmente', async () => {
    const estado = defaultGameStateData()

    await gravarEstado(cfg, 'jogador-1', estado, new Set(), tabelaPlayers.updated_at)
    const apósPrimeira = tabelaPlayers.updated_at

    await gravarEstado(cfg, 'jogador-1', estado, new Set(), apósPrimeira)
    expect(tabelaPlayers.updated_at).not.toBe(apósPrimeira)
  })
})

describe('comRetryDeColisao() — BUG REAL: janela inteira (inclusive a sequencia do Lance) descartada por uma colisao efemera', () => {
  it('retenta uma colisao de escrita e devolve o resultado da tentativa que deu certo', async () => {
    let chamadas = 0
    const resultado = await comRetryDeColisao(async () => {
      chamadas += 1
      if (chamadas < 3) throw new ErroHttp(409, CONFLITO_ESCRITA_JOGADOR)
      return 'sequencia gravada'
    })
    expect(resultado).toBe('sequencia gravada')
    expect(chamadas).toBe(3)
  })

  it('desiste depois do teto de tentativas e deixa o 409 subir', async () => {
    let chamadas = 0
    await expect(comRetryDeColisao(async () => {
      chamadas += 1
      throw new ErroHttp(409, CONFLITO_ESCRITA_JOGADOR)
    })).rejects.toThrow(CONFLITO_ESCRITA_JOGADOR)
    expect(chamadas).toBe(3)
  })

  it('NAO retenta um 409 de outro motivo (ex: "nenhuma sessao aberta")', async () => {
    let chamadas = 0
    await expect(comRetryDeColisao(async () => {
      chamadas += 1
      throw new ErroHttp(409, 'nenhuma sessao aberta')
    })).rejects.toThrow('nenhuma sessao aberta')
    expect(chamadas).toBe(1)
  })

  it('NAO retenta erro que nao e ErroHttp', async () => {
    let chamadas = 0
    await expect(comRetryDeColisao(async () => {
      chamadas += 1
      throw new Error('estouro de verdade, nao colisao')
    })).rejects.toThrow('estouro de verdade')
    expect(chamadas).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// O invariante que sustenta as 13 RPCs que creditam por `gold = gold + X`
//
// `gravarEstado` grava a linha de `players` com valor ABSOLUTO, calculado de um
// snapshot lido antes. Toda RPC de economia (vender POKE/item, comprar, mercado,
// desbloquear hunt) credita por INCREMENTO, num UPDATE proprio. As duas coisas
// escrevem a mesma coluna, e nada as coordena — exceto o CAS em `updated_at`
// mais o trigger `players_set_updated_at`, que avanca `updated_at` em TODO
// UPDATE da linha (`new.updated_at = now()`, sem condicao de coluna).
//
// Medido em producao em 2026-08-18: 26 rodadas disparando venda no meio de um
// flush (atraso de 0, 50, 400 e 800ms), zero divergencia de ouro e zero flush
// descartado. Ou seja: o desenho funciona — mas funciona por causa de tres fatos
// que ninguem estava trancando. Se o trigger virar condicional, se o CAS sair de
// `gravarEstado`, ou se o retry parar de reler, o ouro passa a evaporar em
// silencio nas 13 funcoes de uma vez.
//
// O segundo teste abaixo e o que documenta isso: ele exercita a MESMA sequencia
// com o trigger neutralizado e mostra o dinheiro sumindo. Se alguem tornar o
// trigger condicional um dia, o primeiro teste fica vermelho e o segundo explica
// por que.
describe('credito incremental de RPC vs escrita absoluta do flush', () => {
  const LOOT = 30
  const VENDA = 1010

  // O que o trigger faz. Isolado numa funcao pra o teste seguinte poder OMITIR.
  function creditoDeRpc(valor: number, comTrigger: boolean) {
    tabelaPlayers.gold = (tabelaPlayers.gold as number) + valor
    if (comTrigger) {
      tabelaPlayers.updated_at = new Date(new Date(tabelaPlayers.updated_at).getTime() + 1).toISOString()
    }
  }

  // Um ciclo de flush: le o ouro do banco, simula (LOOT), grava o ABSOLUTO. A
  // RPC entra entre a leitura e a escrita — a janela perigosa.
  function cicloDeFlush(opcoes: { creditarAgora: boolean; comTrigger: boolean }) {
    return async () => {
      const versaoNoLoad = tabelaPlayers.updated_at
      const estado = defaultGameStateData()
      estado.wallet.gold = (tabelaPlayers.gold as number) + LOOT

      if (opcoes.creditarAgora) creditoDeRpc(VENDA, opcoes.comTrigger)

      await gravarEstado(cfg, 'jogador-1', estado, new Set(), versaoNoLoad)
    }
  }

  it('venda concorrente NAO e apagada: o CAS recusa a escrita velha e o retry soma as duas', async () => {
    tabelaPlayers.gold = 1000
    let primeira = true

    await comRetryDeColisao(async () => {
      const creditarAgora = primeira
      primeira = false
      await cicloDeFlush({ creditarAgora, comTrigger: true })()
    })

    expect(tabelaPlayers.gold).toBe(1000 + VENDA + LOOT)
  })

  it('a escrita velha e recusada com o 409 que o retry conhece — nao com outro erro', async () => {
    tabelaPlayers.gold = 1000
    // Sem retry: a primeira tentativa TEM que estourar exatamente
    // CONFLITO_ESCRITA_JOGADOR, senao `comRetryDeColisao` nao a reconhece como
    // colisao efemera e desiste (jogando fora a janela de caçada inteira).
    await expect(cicloDeFlush({ creditarAgora: true, comTrigger: true })())
      .rejects.toThrow(CONFLITO_ESCRITA_JOGADOR)
    // E a venda continua no banco: a escrita velha nao passou.
    expect(tabelaPlayers.gold).toBe(1000 + VENDA)
  })

  it('CONTRAFACTUAL: sem o trigger avancando a versao, a venda e APAGADA em silencio', async () => {
    tabelaPlayers.gold = 1000

    // Nenhum erro, nenhum retry: o CAS passa porque `updated_at` nao mudou.
    await cicloDeFlush({ creditarAgora: true, comTrigger: false })()

    // Os 1010 da venda sumiram sem nada aparecer. E ISTO que o trigger impede —
    // por isso ele nao pode virar condicional ("so avanca se a coluna X mudou").
    expect(tabelaPlayers.gold).toBe(1000 + LOOT)
  })
})
