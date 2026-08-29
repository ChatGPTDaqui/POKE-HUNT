// PH-184 — `unlocked_abilities` atravessava a rede em toda leitura de POKE pra
// ser descartada na linha seguinte.
//
// `rowToPoke` RECALCULA o moveset de (especie, nivel) — a coluna gravada e
// ignorada de proposito, e isso ja era decisao antiga (a nota em `rowToPoke`
// explica: sem o recalculo, todo POKE salvo teria ficado preso no learnset da
// versao em que foi criado, e a migracao pro Ultra Sun renomeou 15 golpes).
//
// O que muda aqui e so parar de PEDIR a coluna.
//
// Os dois riscos desta mudanca, e os dois tem caso abaixo:
//
//   1. tirar coluna DEMAIS. `location` e `team_slot` nao sao lidas por
//      `rowToPoke`, mas quem chama decide equipe x mochila por elas. Sem elas o
//      POKE volta "sem lugar" e some da tela, em silencio.
//   2. a lista repetida por call-site. Sao seis `.select()`; com seis copias,
//      coluna nova entra no schema, um lugar e atualizado e os outros cinco
//      passam a devolver POKE incompleto sem nada acusar.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { COLUNAS_DE_POKE, rowToPoke } from './playerMapper'

const COLUNAS = COLUNAS_DE_POKE.split(',')

/** Linha completa o bastante pra `rowToPoke` — todos os campos que ele le. */
function linha(over: Record<string, unknown> = {}) {
  return {
    id: 'p1', species_id: 'bulbasaur', location: 'bag', team_slot: null,
    level: 10, exp: 0, hp: 20, is_shiny: false, rarity: 'comum', locked: false,
    nature: null, trait: null, original_trainer: null,
    status: null, status_turns: null, created_at: '2026-01-01T00:00:00.000Z',
    iv_hp: 10, iv_atk_fis: 10, iv_atk_esp: 10, iv_def: 10, iv_def_esp: 10, iv_speed: 10,
    stat_hp: 20, stat_atk_fis: 10, stat_atk_esp: 10, stat_def: 10, stat_def_esp: 10, stat_speed: 10,
    active_abilities: null, disabled_abilities: {},
    ...over,
  } as unknown as Parameters<typeof rowToPoke>[0]
}

afterEach(() => vi.restoreAllMocks())

describe('a lista de colunas (PH-184)', () => {
  it('nao pede `unlocked_abilities` — e o ponto da issue', () => {
    expect(COLUNAS).not.toContain('unlocked_abilities')
  })

  it('nao pede o que ninguem le', () => {
    // `user_id` e repetir o mesmo uuid em toda linha de uma consulta que ja
    // filtra por ele; `updated_at` nao tem leitor no cliente.
    expect(COLUNAS).not.toContain('user_id')
    expect(COLUNAS).not.toContain('updated_at')
  })

  it('pede TODA coluna que `rowToPoke` le', () => {
    // Guarda anti-vacuo e anti-corte-demais de uma vez: monta uma linha so com
    // as colunas pedidas e confere que o POKE sai inteiro. Tirar qualquer uma
    // da lista reprova aqui, em vez de virar `undefined` circulando pelo estado.
    const so = Object.fromEntries(COLUNAS.map((c) => [c, (linha() as Record<string, unknown>)[c]]))
    const poke = rowToPoke(so as unknown as Parameters<typeof rowToPoke>[0])
    expect(poke.uid).toBe('p1')
    expect(poke.speciesId).toBe('bulbasaur')
    expect(poke.level).toBe(10)
    expect(poke.stats.hp).toBeGreaterThan(0)
    expect(poke.ivs.hp).toBe(10)
    expect(poke.unlockedAbilities.length).toBeGreaterThan(0)
  })

  it('pede `location` e `team_slot`, que `rowToPoke` NAO le', () => {
    // Elas nao aparecem no POKE, entao o caso acima nunca as pegaria. Quem
    // decide equipe x mochila sao elas (`snapshotToGameState`, `refetchPoke`,
    // `mercadoRpc`) — sem elas o POKE volta sem lugar e some da tela.
    expect(COLUNAS).toContain('location')
    expect(COLUNAS).toContain('team_slot')
  })

  it('a lista mora num lugar so', () => {
    // Criterio 2 da issue. Se alguem voltar a escrever colunas a mao num
    // `.select()`, este arquivo nao pega — mas o `select('*')` volta a aparecer,
    // e e isso que a varredura abaixo tranca.
    const fontes = import.meta.glob('/src/data/remote/*.ts', {
      query: '?raw', import: 'default', eager: true,
    }) as Record<string, string>
    const comSelectEstrela = Object.entries(fontes)
      .filter(([caminho]) => !caminho.endsWith('.test.ts'))
      .filter(([, fonte]) => /from\('pokemon_instances'\)[\s\S]{0,80}?select\('\*'\)/.test(fonte))
      .map(([caminho]) => caminho)
    expect(comSelectEstrela).toEqual([])
  })
})

describe('especie fora do catalogo do cliente (PH-184, criterio 3)', () => {
  it('nao quebra a carga, e o POKE continua utilizavel', () => {
    // Antes o fallback era a coluna `unlocked_abilities`, que agora nao vem. O
    // POKE tem que continuar CARREGANDO — o jogo inteiro nao pode deixar de
    // abrir por causa de uma especie que o catalogo do cliente nao tem.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const poke = rowToPoke(linha({ species_id: 'especie-que-nao-existe' }))
    expect(poke.uid).toBe('p1')
    expect(poke.stats.hp).toBe(20) // cai nos `stat_*` gravados
    expect(poke.unlockedAbilities).toEqual([])
  })

  it('e GRITA, porque lista vazia em silencio ninguem descobre', () => {
    // A divergencia catalogo-banco e real e tem issue propria (PH-247: o banco
    // tem 6 especies que o cliente nao tem). Este console.error e o unico aviso
    // que existe de que um POKE chegou sem golpes.
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    rowToPoke(linha({ species_id: 'especie-que-nao-existe' }))
    expect(erro).toHaveBeenCalledTimes(1)
    expect(String(erro.mock.calls[0][0])).toContain('especie-que-nao-existe')
  })

  it('especie conhecida nao grita', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    rowToPoke(linha())
    expect(erro).not.toHaveBeenCalled()
  })
})
