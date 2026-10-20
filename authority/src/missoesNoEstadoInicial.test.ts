// Tasks reivindicadas voltavam a aparecer como disponiveis a cada recarga da
// pagina (relato do dono, 20/10/2026). O estado com que a pagina ABRE vem de
// `/estado`, que montava `missoesReivindicadas` vazio — e no boot nao existe
// lista local pra `mesclarMissoes` unir. `comMissoes` le a tabela so ali; o
// flush continua sem essa leitura.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Config } from './db.js'
import { lerSnapshot } from './progresso.js'

const CAMINHOS: string[] = []

vi.mock('./db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./db.js')>()
  return {
    ...real,
    selecionar: vi.fn(async (_cfg: unknown, caminho: string) => {
      CAMINHOS.push(caminho)
      return caminho.startsWith('players?')
        ? [{ user_id: 'j1', updated_at: '2026-01-01T00:00:00.000Z', trainer_name: 'T', gold: 0, diamonds: 0, active_team_index: 0 }]
        : []
    }),
    selecionarTudo: vi.fn(async (_cfg: unknown, caminho: string) => {
      CAMINHOS.push(caminho)
      return caminho.startsWith('player_missoes_reivindicadas?')
        ? [{ user_id: 'j1', tipo: 'NORMAL', species_id: 'rattata' }]
        : []
    }),
  }
})

const cfg = { url: 'http://x', serviceKey: 'k' } as unknown as Config

describe('missoes reivindicadas no estado inicial', () => {
  beforeEach(() => { CAMINHOS.length = 0 })

  it('/estado (comMissoes) traz as missoes reivindicadas', async () => {
    const { estado } = await lerSnapshot(cfg, 'j1', { comMissoes: true })
    expect(estado.missoesReivindicadas).toEqual({ 'NORMAL:rattata': true })
  })

  it('o flush (padrao) nao le a tabela', async () => {
    const { estado } = await lerSnapshot(cfg, 'j1')
    expect(estado.missoesReivindicadas).toEqual({})
    expect(CAMINHOS.some((c) => c.startsWith('player_missoes_reivindicadas?'))).toBe(false)
  })
})
