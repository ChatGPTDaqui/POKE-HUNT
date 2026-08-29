// O CLAIM ATOMICO DO FLUSH — as duas pontas, e por que a representacao e estreita.
//
// `aplicarFlush` reivindica o intervalo com um PATCH condicional em
// `game_sessions` (`last_flush_at=eq.<valor lido>`). Quem escreve primeiro move
// a ancora; o segundo nao encontra linha e desiste. Toda a protecao contra
// DUPLICACAO DE POKE (ver o comentario do claim em `progresso.ts`) depende de
// duas propriedades que nenhum teste cobria:
//
//  1. resposta VAZIA = corrida perdida, e quem perde nao le, nao simula, nao
//     grava, e NAO limpa a marca `flushing_since` de quem ganhou;
//  2. resposta NAO-VAZIA = segue o flush.
//
// A (1) e a que quebra em silencio: trocar `return=representation` por
// `return=minimal` deixaria a resposta sempre vazia, todo flush viraria
// "ocupado" e o jogo simplesmente pararia de creditar — sem erro nenhum.
//
// PH-219 acrescentou `&select=id` a esse PATCH: a representacao continua sendo
// o sinal de vitoria, mas a linha inteira (20+ colunas: `rng_state`, `sala_*`,
// `sequence_*`, e ate PH-241 tambem os 15 `boss_*`, ja migrados pra
// `sala_protetor`) nao atravessa mais a rede a cada 30s pra ser descartada.
// 439 B -> 47 B no fio, medido gzipado em producao em 27/08.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Config } from './db.js'
import type { LinhaSessao } from './progresso.js'

/** O que o PATCH de claim vai devolver — `[]` e a corrida perdida. */
let respostaDoClaim: { id: string }[]
/** Todo caminho passado a `atualizarRetornando`, na ordem. */
const PATCHES_RETORNANDO: string[] = []
/** Todo caminho lido — o que NAO pode acontecer depois de perder a corrida. */
const LEITURAS: string[] = []
/** `atualizar` (PATCH `return=minimal`): e por aqui que `flushing_since` e limpo. */
const PATCHES_MINIMOS: { caminho: string; patch: unknown }[] = []

/** Sentinela: para o flush logo depois do claim, sem simular o mundo. */
class ParouNaLeitura extends Error {}

vi.mock('./db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./db.js')>()
  return {
    ...real,
    atualizarRetornando: vi.fn(async (_cfg: unknown, caminho: string) => {
      PATCHES_RETORNANDO.push(caminho)
      // Fora de `game_sessions` e a fila de entregas do Mercado, que nesta
      // bancada esta sempre vazia.
      if (!caminho.startsWith('game_sessions')) return []
      return respostaDoClaim
    }),
    atualizar: vi.fn(async (_cfg: unknown, caminho: string, patch: unknown) => {
      PATCHES_MINIMOS.push({ caminho, patch })
    }),
    selecionar: vi.fn(async (_cfg: unknown, caminho: string) => {
      LEITURAS.push(caminho)
      throw new ParouNaLeitura(caminho)
    }),
    selecionarTudo: vi.fn(async (_cfg: unknown, caminho: string) => {
      LEITURAS.push(caminho)
      throw new ParouNaLeitura(caminho)
    }),
    chamarRpc: vi.fn(async () => ({ ok: true })),
    inserir: vi.fn(async () => []),
    apagar: vi.fn(async () => {}),
  }
})

const { aplicarFlush, FLUSH_OCUPADO } = await import('./progresso.js')
const cfg = {} as Config
const USER = 'jogador-1'
const ANCORA = '2026-08-27T00:00:00+00:00'

function sessao(): LinhaSessao {
  return {
    id: 'sessao-1',
    user_id: USER,
    map_id: 'floresta',
    poke_uid: 'poke-1',
    seed: 1,
    rng_state: 1,
    rng_draws: 0,
    last_flush_at: ANCORA,
    simulated_seconds: 0,
    closed_at: null,
    flushing_since: null,
    sequence_index: 0,
    sequence_cleared: false,
    sala_indice: 0,
    sala_chave: null,
    sala_abates: 0,
    ciclos: 0,
    // PH-241: `sala_protetor` e embutido via PostgREST (join), campo
    // opcional — ausente/`null` aqui e o mesmo "sem protetor pendente" que
    // estes testes de claim sempre quiseram.
    sala_protetor: null,
  }
}

/** O PATCH de claim: o unico `atualizarRetornando` em `game_sessions`. */
function caminhoDoClaim(): string {
  const claims = PATCHES_RETORNANDO.filter((c) => c.startsWith('game_sessions'))
  expect(claims, 'nenhum PATCH de claim saiu — o teste rodaria no vacuo').toHaveLength(1)
  return claims[0]!
}

beforeEach(() => {
  respostaDoClaim = [{ id: 'sessao-1' }]
  PATCHES_RETORNANDO.length = 0
  LEITURAS.length = 0
  PATCHES_MINIMOS.length = 0
  vi.clearAllMocks()
})

describe('claim atomico do flush', () => {
  it('resposta VAZIA = corrida perdida: devolve ocupado sem ler nada', async () => {
    respostaDoClaim = []

    const resultado = await aplicarFlush(cfg, USER, sessao())

    expect(resultado).toBe(FLUSH_OCUPADO)
    expect(
      LEITURAS,
      'quem perdeu a corrida leu estado — e o estado lido depois do vencedor simular seria regravado por cima dele',
    ).toEqual([])
  })

  it('quem perde a corrida NAO limpa `flushing_since` do vencedor', async () => {
    // A marca e do request que ganhou o claim, e e ela que faz um /estado
    // concorrente esperar em vez de ler no meio da simulacao. Limpa-la aqui
    // liberaria a corrida que o vencedor esta tentando evitar.
    respostaDoClaim = []

    await aplicarFlush(cfg, USER, sessao())

    expect(
      PATCHES_MINIMOS.filter((p) => p.caminho.startsWith('game_sessions')),
      'o perdedor escreveu em `game_sessions` — a marca do vencedor foi mexida',
    ).toEqual([])
  })

  it('resposta NAO-VAZIA = claim ganho: o flush segue para a leitura de estado', async () => {
    // A sentinela e lancada pela primeira leitura do snapshot. Ela chegar aqui
    // e a prova de que o claim foi aceito — com `return=minimal` a resposta
    // seria sempre vazia e este teste veria `FLUSH_OCUPADO`.
    await expect(aplicarFlush(cfg, USER, sessao())).rejects.toThrow(ParouNaLeitura)
    expect(LEITURAS.length, 'o claim passou mas nada foi lido').toBeGreaterThan(0)
  })

  it('a marca `flushing_since` e limpa mesmo quando o flush estoura no meio', async () => {
    // `finally`: marca que sobrevive a um erro faria TODO request seguinte
    // esperar o teto dela antes de desistir.
    await aplicarFlush(cfg, USER, sessao()).catch(() => {})

    expect(
      PATCHES_MINIMOS.filter((p) => p.caminho.includes('game_sessions')),
      'nenhum PATCH limpou a marca depois do erro',
    ).toEqual([{ caminho: 'game_sessions?id=eq.sessao-1', patch: { flushing_since: null } }])
  })

  it('o claim pede SO `id` de volta, e o CAS continua no filtro (PH-219)', () => {
    // As tres partes do caminho, e cada uma protege uma coisa diferente:
    //  - `last_flush_at=eq.` e o CAS: sem ele dois flushes creditam a mesma janela;
    //  - `closed_at=is.null` impede reivindicar sessao ja fechada;
    //  - `select=id` mantem a representacao no menor tamanho possivel. Sem ele o
    //    PostgREST devolve a linha inteira, que ninguem le, a cada 30s por jogador.
    return aplicarFlush(cfg, USER, sessao()).catch(() => {}).then(() => {
      const caminho = caminhoDoClaim()
      expect(caminho).toContain(`last_flush_at=eq.${encodeURIComponent(ANCORA)}`)
      expect(caminho).toContain('closed_at=is.null')
      expect(
        caminho,
        'o claim voltou a trazer a linha inteira de `game_sessions` — ver PH-219',
      ).toContain('&select=id')
    })
  })
})
