// PH-184 — toda leitura de POKE fazia `select('*')`, trazendo colunas que o
// cliente descarta.
//
// A issue nasceu apontando `unlocked_abilities` como o alvo (17% do payload,
// dizia): `rowToPoke` RECALCULA o moveset de (especie, nivel) e so cai na coluna
// quando a especie e desconhecida.
//
// MEDIDO, A CONTA VIROU OUTRA. No fio, gzipado, a coluna custa 0,7 ponto
// percentual — o gzip come um array de ids de golpe repetido linha apos linha. E
// ela e a UNICA fonte de golpes pra um POKE de especie fora do catalogo do
// cliente. Entao ela FICA, e o ganho real (8,8%) vem de `user_id`/`updated_at`,
// que a issue nem mencionava.
//
// Os riscos desta mudanca, e cada um tem caso abaixo:
//
//   1. tirar coluna DEMAIS. `location` e `team_slot` nao sao lidas por
//      `rowToPoke`, mas quem chama decide equipe x mochila por elas. Sem elas o
//      POKE volta "sem lugar" e some da tela, em silencio.
//   2. a lista repetida por call-site. Sao seis `.select()`; com seis copias,
//      coluna nova entra no schema, um lugar e atualizado e os outros cinco
//      passam a devolver POKE incompleto sem nada acusar.
//   3. o fallback de especie desconhecida parar de resolver golpe. POKE sem
//      golpe nao luta.
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
    active_abilities: null, disabled_abilities: {}, unlocked_abilities: [],
    ...over,
  } as unknown as Parameters<typeof rowToPoke>[0]
}

afterEach(() => vi.restoreAllMocks())

describe('a lista de colunas (PH-184)', () => {
  it('PEDE `unlocked_abilities`, ao contrario do que a issue previa', () => {
    // A issue queria corta-la (17% do payload, dizia). Medido no fio, gzipado,
    // ela custa 0,7 ponto percentual — o gzip come um array de ids de golpe
    // repetido linha apos linha. E ela e a UNICA fonte de golpes pra um POKE de
    // especie fora do catalogo do cliente. Decisao registrada: fica.
    expect(COLUNAS).toContain('unlocked_abilities')
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
  it('AINDA RESOLVE OS GOLPES, pela coluna gravada', () => {
    // Criterio 3 da issue, ao pe da letra. E a unica razao de
    // `unlocked_abilities` seguir no `select`: sem ela o POKE chegaria sem golpe
    // nenhum, e POKE sem golpe nao luta.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const poke = rowToPoke(linha({
      species_id: 'especie-que-nao-existe',
      unlocked_abilities: ['tackle', 'growl'],
    }))
    expect(poke.uid).toBe('p1')
    expect(poke.stats.hp).toBe(20) // cai nos `stat_*` gravados
    expect(poke.unlockedAbilities).toEqual(['tackle', 'growl'])
  })

  it('avisa, porque especie fora do catalogo nao e situacao normal', () => {
    // O POKE ainda aparece sem nome, sem sprite e com os stats gravados em vez
    // dos recalculados. E sinal de divergencia catalogo-banco (PH-247), e sem
    // log ninguem descobre.
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    rowToPoke(linha({ species_id: 'outra-que-nao-existe', unlocked_abilities: ['tackle'] }))
    expect(aviso).toHaveBeenCalledTimes(1)
    expect(String(aviso.mock.calls[0][0])).toContain('outra-que-nao-existe')
  })

  it('avisa UMA vez por especie, e nao uma por POKE', () => {
    // `rowToPoke` roda uma vez por linha e uma mochila real tem 4.082 delas —
    // sem a deduplicacao o console vira 4.082 linhas identicas e afoga todo o
    // resto.
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (let i = 0; i < 50; i++) {
      rowToPoke(linha({ id: `p${i}`, species_id: 'repetida-desconhecida', unlocked_abilities: [] }))
    }
    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('especie conhecida nao avisa', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    rowToPoke(linha())
    expect(aviso).not.toHaveBeenCalled()
  })
})
