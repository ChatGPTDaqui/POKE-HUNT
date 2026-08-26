// POKEDEX PARCIAL NO FLUSH (PH-186) — o flush deixou de ler a Pokedex inteira.
//
// `estado.pokedexKills` passa a conter SO os abates da janela, e `gravarEstado`
// soma sobre o banco em vez de sobrescrever. As duas formas de errar isso
// destroem save do jogador e nao emitem erro nenhum:
//
//  1. deixar o diff de REMOCAO ligado apaga toda especie ausente do estado —
//     com estado parcial, a colecao inteira;
//  2. gravar absoluto com o valor da janela transforma 400 abates em 3.
//
// Os dois casos estao aqui, e os dois passam a ser vermelhos se alguem trocar
// o caminho parcial pelo completo por engano.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defaultGameStateData, type GameStateData } from '#engine'
import type { Config } from './db.js'

let tabelaPlayers: { user_id: string; updated_at: string; [k: string]: unknown }
/** O que `player_pokedex` tem hoje, por especie. */
let dexNoBanco: Record<string, { normal: number; shiny: number }>

vi.mock('./db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./db.js')>()
  return {
    ...real,
    atualizarRetornando: vi.fn(async () => [tabelaPlayers]),
    chamarRpc: vi.fn(async (_cfg: unknown, nome: string, args: Record<string, unknown>) => {
      if (nome !== 'gravar_progresso') return { ok: true }
      Object.assign(tabelaPlayers, args.p_patch as Record<string, unknown>)
      return { ok: true, updatedAt: tabelaPlayers.updated_at }
    }),
    atualizar: vi.fn(async () => {}),
    // Banco de mentira que responde os DOIS formatos de leitura da pokedex:
    // filtrada por especie (o caminho novo) e SEM filtro (o caminho antigo, que
    // o diff de remocao usa). Sem responder a leitura sem filtro, o teste de
    // "nao apaga" passaria VAZIO — o codigo sabotado leria uma tabela vazia e
    // nao teria o que apagar. Ja aconteceu ao escrever este arquivo.
    selecionarTudo: vi.fn(async (_cfg: unknown, caminho: string) => {
      if (!caminho.includes('player_pokedex')) return []
      const filtro = /species_id=in\.\(([^)]*)\)/.exec(caminho)
      const ids = filtro ? filtro[1]!.split(',').filter(Boolean) : Object.keys(dexNoBanco)
      return ids.filter((id) => dexNoBanco[id]).map((id) => ({
        species_id: id, normal_kills: dexNoBanco[id]!.normal, shiny_kills: dexNoBanco[id]!.shiny,
      }))
    }),
    inserir: vi.fn(async () => []),
    apagar: vi.fn(async () => {}),
  }
})

const db = await import('./db.js')
const { gravarEstado } = await import('./progresso.js')
const cfg = {} as Config
const USER = 'jogador-1'

/** Estado com SO os abates da janela — o que o modo parcial produz. */
function janelaComAbates(kills: GameStateData['pokedexKills']): GameStateData {
  const estado = defaultGameStateData()
  estado.pokedexKills = kills
  return estado
}

function upsertsDaPokedex(): Record<string, unknown>[] {
  return vi.mocked(db.inserir).mock.calls
    .filter(([, tabela]) => tabela === 'player_pokedex')
    .flatMap(([, , linhas]) => linhas as Record<string, unknown>[])
}

beforeEach(() => {
  tabelaPlayers = { user_id: USER, updated_at: '2026-08-26T00:00:00Z' }
  dexNoBanco = {}
  vi.clearAllMocks()
})

describe('pokedex parcial no flush (PH-186)', () => {
  it('NAO apaga especie nenhuma — a colecao do jogador nao encolhe', async () => {
    // O cenario exato do desastre: banco com 50 especies, janela com 1.
    for (let i = 0; i < 50; i++) dexNoBanco[`especie_${i}`] = { normal: 10, shiny: 0 }
    const estado = janelaComAbates({ especie_0: { normal: 2, shiny: 0 } })

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at, undefined, false)

    expect(
      vi.mocked(db.apagar).mock.calls.filter(([, caminho]) => String(caminho).includes('player_pokedex')),
      'o diff de remocao rodou com pokedex parcial — isto apaga a colecao inteira do jogador',
    ).toHaveLength(0)
  })

  it('SOMA sobre o banco: 400 abates + 3 na janela = 403, nao 3', async () => {
    dexNoBanco.pikachu = { normal: 400, shiny: 7 }
    const estado = janelaComAbates({ pikachu: { normal: 3, shiny: 1 } })

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at, undefined, false)

    const linha = upsertsDaPokedex().find((l) => l.species_id === 'pikachu')
    expect(linha, 'nada foi gravado pra pikachu').toBeDefined()
    expect(linha!.normal_kills, 'contagem regrediu — escrita absoluta com valor da janela').toBe(403)
    expect(linha!.shiny_kills).toBe(8)
  })

  it('especie vista pela primeira vez grava a contagem da janela', async () => {
    const estado = janelaComAbates({ eevee: { normal: 2, shiny: 0 } })

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at, undefined, false)

    const linha = upsertsDaPokedex().find((l) => l.species_id === 'eevee')
    expect(linha!.normal_kills).toBe(2)
    expect(linha!.shiny_kills).toBe(0)
  })

  it('le SO as especies da janela, nao a tabela inteira', async () => {
    for (let i = 0; i < 200; i++) dexNoBanco[`especie_${i}`] = { normal: 1, shiny: 0 }
    const estado = janelaComAbates({ especie_7: { normal: 1, shiny: 0 } })

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at, undefined, false)

    const leiturasDaDex = vi.mocked(db.selecionarTudo).mock.calls
      .map(([, caminho]) => String(caminho))
      .filter((c) => c.includes('player_pokedex'))
    expect(leiturasDaDex.length, 'nenhuma leitura da pokedex aconteceu').toBeGreaterThan(0)
    for (const caminho of leiturasDaDex) {
      expect(caminho, 'leitura sem filtro de especie = tabela inteira, que e o que a issue veio remover')
        .toMatch(/species_id=in\./)
    }
  })

  it('janela sem abate nenhum nao toca a pokedex', async () => {
    dexNoBanco.pikachu = { normal: 400, shiny: 0 }
    const estado = janelaComAbates({})

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at, undefined, false)

    expect(
      vi.mocked(db.selecionarTudo).mock.calls.filter(([, c]) => String(c).includes('player_pokedex')),
      'flush parado leu a pokedex — o ganho da issue e justamente nao ler',
    ).toHaveLength(0)
    expect(upsertsDaPokedex()).toHaveLength(0)
  })

  it('o estado devolvido leva o TOTAL, nao o incremento', async () => {
    // E o que torna a resposta idempotente no cliente: reaplicar um total da o
    // mesmo numero, reaplicar um incremento dobra.
    dexNoBanco.pikachu = { normal: 400, shiny: 0 }
    const estado = janelaComAbates({ pikachu: { normal: 3, shiny: 0 } })

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at, undefined, false)

    expect(estado.pokedexKills.pikachu, 'o cliente receberia o incremento e mostraria 3 abates').toEqual({
      normal: 403, shiny: 0,
    })
  })

  it('com a pokedex CARREGADA, o caminho de sempre continua valendo', async () => {
    // Cliente antigo (sem `parcial: true`) nao pode cair no caminho novo: ele
    // substitui o estado local inteiro e nao sabe mesclar por especie.
    dexNoBanco.pikachu = { normal: 400, shiny: 0 }
    const estado = janelaComAbates({ pikachu: { normal: 3, shiny: 0 } })

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at, undefined, true)

    const linha = upsertsDaPokedex().find((l) => l.species_id === 'pikachu')
    expect(linha!.normal_kills, 'caminho completo deixou de gravar o valor absoluto do estado').toBe(3)
  })
})
