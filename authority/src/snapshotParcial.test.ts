// A leitura parcial (`comBag: false`) e uma otimizacao de EGRESS que mexe no
// caminho mais perigoso do servidor: o que apaga linha de POKE. Se ela alargar
// um dia, o sintoma nao e erro — e mochila apagada em producao. Estes testes
// trancam as duas propriedades que garantem que isso nao acontece:
//
//  1. o modo parcial le so `location=eq.team`;
//  2. o diff de remocao de `gravarEstado` nunca alcanca linha de mochila,
//     porque `pokeIdsNoLoad` so tem o que foi lido.
//
// Motivo da otimizacao: medido em 2026-08-17, uma conta com 5035 POKEs custava
// 3,23 MB POR FLUSH — e o flush roda a cada 30s (ou 5s, com `commitAgora`).
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Config } from './db.js'
import { lerSnapshot, gravarEstado } from './progresso.js'

const CAMINHOS: string[] = []
const APAGADOS: string[] = []
let INSERIDOS: { tabela: string; linhas: unknown[] }[] = []

function linhaDePoke(id: string, location: 'team' | 'bag', slot: number | null) {
  return {
    id,
    user_id: 'jogador-1',
    species_id: 'bulbasaur',
    location,
    team_slot: slot,
    level: 5,
    exp: 0,
    hp: 20,
    is_shiny: false,
    rarity: 'comum',
    locked: false,
    original_trainer: null,
    iv_hp: 1, iv_atk_fis: 1, iv_atk_esp: 1, iv_def: 1, iv_def_esp: 1, iv_speed: 1,
    stat_hp: 20, stat_atk_fis: 10, stat_atk_esp: 10, stat_def: 10, stat_def_esp: 10, stat_speed: 10,
    unlocked_abilities: ['tackle'],
    active_abilities: null,
    status: null,
    status_turns: 0,
    disabled_abilities: {},
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

const TIME = [linhaDePoke('time-1', 'team', 0)]
const MOCHILA = [linhaDePoke('bag-1', 'bag', null), linhaDePoke('bag-2', 'bag', null)]

vi.mock('./db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./db.js')>()
  return {
    ...real,
    selecionar: vi.fn(async (_cfg: unknown, caminho: string) => {
      CAMINHOS.push(caminho)
      if (caminho.startsWith('players?')) {
        return [{
          user_id: 'jogador-1',
          updated_at: '2026-01-01T00:00:00.000Z',
          trainer_name: 'T', trainer_level: 1, trainer_exp: 0,
          gold: 0, diamonds: 0, active_team_index: 0, current_map_id: null,
          unlocked_maps: [], unlocked_continents: [],
          auto_toggles: null, auto_pot_rules: null, auto_catch_config: null,
          auto_status_config: null, perf_stats: null,
        }]
      }
      return []
    }),
    selecionarTudo: vi.fn(async (_cfg: unknown, caminho: string) => {
      CAMINHOS.push(caminho)
      if (!caminho.startsWith('pokemon_instances?')) return []
      // O filtro do modo parcial, do jeito que o PostgREST o receberia.
      if (caminho.includes('location=eq.team')) return TIME
      // `id=in.(...)`: a releitura do diff de remocao, nao o snapshot.
      if (caminho.includes('id=in.')) {
        return [...TIME, ...MOCHILA].filter((l) => caminho.includes(l.id))
      }
      return [...TIME, ...MOCHILA]
    }),
    atualizarRetornando: vi.fn(async () => [{ user_id: 'jogador-1', updated_at: 'x' }]),
    // PH-67: gravarEstado() agora chama a RPC gravar_progresso em vez do
    // PATCH cru — mesmo sucesso incondicional que o mock acima simulava.
    chamarRpc: vi.fn(async () => ({ ok: true, updatedAt: 'x' })),
    atualizar: vi.fn(async () => {}),
    inserir: vi.fn(async (_cfg: unknown, tabela: string, linhas: unknown) => {
      INSERIDOS.push({ tabela, linhas: Array.isArray(linhas) ? linhas : [linhas] })
      return []
    }),
    apagar: vi.fn(async (_cfg: unknown, caminho: string) => { APAGADOS.push(caminho) }),
  }
})

const cfg = {} as Config

beforeEach(() => {
  CAMINHOS.length = 0
  APAGADOS.length = 0
  INSERIDOS = []
  vi.clearAllMocks()
})

const urlDoSnapshotDePoke = () =>
  CAMINHOS.find((c) => c.startsWith('pokemon_instances?') && !c.includes('id=in.'))

describe('lerSnapshot({ comBag: false })', () => {
  it('le so o time — nao a mochila', async () => {
    const ctx = await lerSnapshot(cfg, 'jogador-1', { comBag: false })

    expect(urlDoSnapshotDePoke()).toContain('location=eq.team')
    expect(ctx.estado.team.map((p) => p.uid)).toEqual(['time-1'])
    // Vazio NAO significa "mochila vazia": significa "nao carregada". Quem le
    // isto sem olhar `bagCarregada` esta prestes a apagar a mochila do jogador.
    expect(ctx.estado.bagPokes).toEqual([])
    expect(ctx.bagCarregada).toBe(false)
    expect(ctx.pokeIdsNoLoad).toEqual(new Set(['time-1']))
  })

  it('modo completo continua trazendo a mochila inteira (o caminho de /estado)', async () => {
    const ctx = await lerSnapshot(cfg, 'jogador-1')

    expect(urlDoSnapshotDePoke()).not.toContain('location=eq.')
    expect(ctx.estado.bagPokes.map((p) => p.uid)).toEqual(['bag-1', 'bag-2'])
    expect(ctx.bagCarregada).toBe(true)
  })
})

describe('gravarEstado() depois de um flush parcial', () => {
  it('nao apaga nenhuma linha de mochila, e grava a captura da janela', async () => {
    const ctx = await lerSnapshot(cfg, 'jogador-1', { comBag: false })
    // O que a simulacao faz com a mochila num flush: so `push`.
    ctx.estado.bagPokes.push({ ...ctx.estado.team[0], uid: 'capturado-agora' })

    await gravarEstado(cfg, 'jogador-1', ctx.estado, ctx.pokeIdsNoLoad, ctx.playerUpdatedAt)

    // ESTA e a linha que impede o desastre: nenhum DELETE em pokemon_instances.
    expect(APAGADOS.filter((c) => c.startsWith('pokemon_instances?'))).toEqual([])
    const pokesGravados = INSERIDOS
      .filter((i) => i.tabela === 'pokemon_instances')
      .flatMap((i) => i.linhas as { id: string }[])
      .map((l) => l.id)
    expect(pokesGravados).toEqual(['time-1', 'capturado-agora'])
  })

  it('o diff de remocao continua valendo pro TIME (POKE que saiu de la e apagado)', async () => {
    const ctx = await lerSnapshot(cfg, 'jogador-1', { comBag: false })
    // POKE do time some do estado — vendido/soltado por uma RPC no meio.
    ctx.estado.team = []

    await gravarEstado(cfg, 'jogador-1', ctx.estado, ctx.pokeIdsNoLoad, ctx.playerUpdatedAt)

    expect(APAGADOS.some((c) => c.includes('id=in.(time-1)'))).toBe(true)
  })
})
