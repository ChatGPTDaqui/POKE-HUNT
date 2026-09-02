// PH-266 — a FIACAO da reentrada: `/sessao/abrir` com `retomando: true` grava a
// sala herdada, e sem a flag continua abrindo no ciclo 1, sala 1.
//
// `herancaDaLinha` (appSessao.test.ts) cobre a REGRA. Este arquivo cobre o que
// a regra sozinha nao prova: que a rota consulta a sessao anterior, escreve
// `sala_indice`/`sala_abates`/`ciclos` herdados na linha nova e copia o protetor
// pendente. Foi exatamente essa fiacao que faltava — a sala nunca esteve
// perdida, ela era sobrescrita por zero na abertura.
//
// O mock e do `db.js`: o teste inspeciona os INSERTs que a rota faz, que e onde
// o bug vivia.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { OpcoesApp } from './appSessao.js'

const USER = 'jogador-1'
const MAPA = 'mata_e1'

/** A sessao anterior que a consulta de heranca vai encontrar (ou nenhuma). */
let sessaoAnterior: Record<string, unknown> | null = null
/** Todo INSERT feito pela rota, na ordem: [tabela, linha]. */
const INSERTS: { tabela: string; linha: Record<string, unknown> }[] = []

vi.mock('./auth.js', () => ({
  autenticar: vi.fn(async () => ({ id: USER })),
}))

vi.mock('./db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./db.js')>()
  return {
    ...real,
    selecionar: vi.fn(async (_cfg: unknown, caminho: string) => {
      // A consulta de sessao ABERTA (`closed_at=is.null`) devolve vazio: no
      // caminho do F5 o boot ja fechou a sessao antes de reentrar.
      if (caminho.includes('closed_at=is.null')) return []
      if (caminho.startsWith('game_sessions')) return sessaoAnterior ? [sessaoAnterior] : []
      return []
    }),
    inserir: vi.fn(async (_cfg: unknown, tabela: string, linha: Record<string, unknown>) => {
      INSERTS.push({ tabela, linha })
      return [{ ...linha, id: 'sessao-nova', last_flush_at: '2026-08-29T12:00:00+00:00' }]
    }),
    atualizar: vi.fn(async () => {}),
    chamarRpc: vi.fn(async () => ({ ok: true })),
  }
})

vi.mock('./progresso.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./progresso.js')>()
  return {
    ...real,
    carregarEstado: vi.fn(async () => ({
      team: [{ uid: 'poke-1', hp: 30 }],
      unlockedMaps: [MAPA],
      unlockedContinents: ['faixa1'],
      // Alto o bastante pra liberar qualquer bioma da faixa: o gate sequencial
      // (PH-227) nao esta sob teste aqui.
      biomaProgress: { faixa1: 99, faixa2: 99, faixa3: 99, nightmare: 99 },
    })),
    aplicarFlush: vi.fn(async () => null),
  }
})

const { criarApp } = await import('./appSessao.js')

const app = criarApp({ origensPermitidas: [] } as unknown as OpcoesApp)

function linhaDaSessaoAnterior(patch: Record<string, unknown> = {}) {
  return {
    id: 'sessao-velha', user_id: USER, map_id: MAPA,
    sala_indice: 6, sala_chave: 'obra', sala_abates: 17, ciclos: 2,
    closed_at: new Date().toISOString(),
    sala_protetor: null,
    ...patch,
  }
}

async function abrir(retomando: boolean) {
  return app(new Request('https://x/sessao/abrir', {
    method: 'POST',
    body: JSON.stringify({ mapId: MAPA, pokeUid: 'poke-1', retomando }),
  }))
}

function sessaoGravada() {
  return INSERTS.find((i) => i.tabela === 'game_sessions')?.linha
}

describe('reentrada mantem a sala (PH-266)', () => {
  beforeEach(() => {
    INSERTS.length = 0
    sessaoAnterior = linhaDaSessaoAnterior()
  })

  it('com retomando: grava a sala, os abates e o ciclo da sessao anterior', () => {
    return abrir(true).then(async (resposta) => {
      expect(resposta.status).toBe(200)
      const linha = sessaoGravada()
      expect(linha).toMatchObject({
        sala_indice: 6, sala_chave: 'obra', sala_abates: 17, ciclos: 2,
      })
      // E o cliente recebe a MESMA sala, senao ele montaria o mundo numa e o
      // servidor simularia noutra.
      const corpo = await resposta.json() as { sala: { indice: number; chave: string } }
      expect(corpo.sala).toMatchObject({ indice: 6, chave: 'obra' })
    })
  })

  it('sem retomando (clique em "Entrar"): comeca no ciclo 1, sala 1', async () => {
    await abrir(false)
    const linha = sessaoGravada()
    expect(linha).toMatchObject({ sala_indice: 0, sala_abates: 0, ciclos: 0 })
    // A chave vem do sorteio, entao nao pode ser a da sessao anterior por
    // acidente do teste — o que importa e nao ter herdado indice/abates/ciclo.
    expect(linha?.sala_chave).toBeTruthy()
  })

  it('sessao anterior velha demais nao e herdada nem com a flag', async () => {
    sessaoAnterior = linhaDaSessaoAnterior({
      closed_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    })
    await abrir(true)
    expect(sessaoGravada()).toMatchObject({ sala_indice: 0, sala_abates: 0, ciclos: 0 })
  })

  it('o protetor pendente e copiado pra sessao nova, com o HP em que ficou', async () => {
    sessaoAnterior = linhaDaSessaoAnterior({
      sala_protetor: {
        session_id: 'sessao-velha', uid: 'protetor-1', species_id: 'onix',
        encounter_id: 'onix_1', level: 30, iv_hp: 20, iv_atk_fis: 20, iv_atk_esp: 20,
        iv_def: 20, iv_def_esp: 20, iv_speed: 20, rarity: 'raro', is_shiny: false,
        nature: null, trait: null, hp_atual: 42, tipo: 'guardian',
      },
    })
    await abrir(true)

    const protetor = INSERTS.find((i) => i.tabela === 'sala_protetor')?.linha
    expect(protetor).toBeTruthy()
    // `session_id` da sessao NOVA: a tabela tem uma linha por sessao, e copiar
    // o id velho quebraria a PK.
    expect(protetor?.session_id).toBe('sessao-nova')
    expect(protetor?.uid).toBe('protetor-1')
    // Sem o HP, dar F5 no meio da luta curaria o Guardian de graca.
    expect(protetor?.hp_atual).toBe(42)
  })

  it('sem protetor pendente nao insere linha nenhuma em sala_protetor', async () => {
    await abrir(true)
    expect(INSERTS.some((i) => i.tabela === 'sala_protetor')).toBe(false)
  })
})
