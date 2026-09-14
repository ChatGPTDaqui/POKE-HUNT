// PH-535: `rodarDuelo` e o loop headless que substitui `pvpSimulator.ts` —
// prova que a resolucao fim-a-fim (motor real, troca de time nos DOIS
// lados, vencedor certo) funciona sem precisar montar o Request/Config
// inteiro de `resolverDuelo`.
import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance, type PokeInstance } from '@/data/pokes'
import { rodarDuelo } from './appDuelo.js'

function pokeForte(speciesId: string, overrides: Partial<PokeInstance['stats']> = {}): PokeInstance {
  const poke = createPokeInstance(createRng(Math.floor(Math.random() * 1e9)), speciesId, 80)
  poke.stats = { ...poke.stats, atkFis: 400, atkEsp: 400, speed: 300, hp: 300, ...overrides }
  poke.hp = poke.stats.hp
  return poke
}

function pokeFraco(speciesId: string): PokeInstance {
  const poke = createPokeInstance(createRng(Math.floor(Math.random() * 1e9)), speciesId, 5)
  poke.stats = { ...poke.stats, def: 1, defEsp: 1, hp: 1, speed: 1 }
  poke.hp = 1
  return poke
}

describe('rodarDuelo (PH-535)', () => {
  it('o lado muito mais forte vence', () => {
    const resultado = rodarDuelo([pokeForte('tyranitar')], [pokeFraco('rattata')])
    expect(resultado.vencedor).toBe('jogador')
    expect(resultado.eventos.length).toBeGreaterThan(0)
  })

  it('troca de time funciona nos DOIS lados — jogador com reserva vence mesmo perdendo o primeiro', () => {
    const primeiroFraco = pokeFraco('rattata')
    const reservaForte = pokeForte('tyranitar')
    const resultado = rodarDuelo([primeiroFraco, reservaForte], [pokeForte('gyarados')])

    // O primeiro do jogador MORRE (e fraco contra um forte) mas a reserva
    // entra e vira o jogo — se a troca do lado jogador nao funcionasse,
    // `vencedor` teria que ser 'boss'.
    expect(resultado.vencedor).toBe('jogador')
  })

  it('rival com reserva tambem troca — nao e derrotado so por perder o primeiro', () => {
    const resultado = rodarDuelo(
      [pokeForte('tyranitar', { atkFis: 50, atkEsp: 50 })], // forte mas nao esmagador
      [pokeFraco('rattata'), pokeForte('gyarados')],
    )
    // Prova que a RESERVA (gyarados) chegou a entrar em campo — se a troca
    // do lado rival estivesse quebrada, `rivalSemTime` dispararia assim que
    // o rattata caisse e a luta acabaria sem gyarados aparecer em evento
    // nenhum. Checa "participou", nao "morreu por golpe": uma morte por
    // status (veneno/queimadura) nao passa pelo loop de `pendingHits` que
    // gera `EventoDuelo`, entao procurar um evento de NOCAUTE especifico
    // seria fragil.
    const gyaradosParticipou = resultado.eventos.some(
      (e) => e.atacanteSpeciesId === 'gyarados' || e.defensorSpeciesId === 'gyarados',
    )
    expect(gyaradosParticipou).toBe(true)
  })

  // Alternancia ESTRITA (sempre troca de lado) so vale quando Velocidade
  // nao muda no meio — coberto isolado (e deterministico, RNG fixo) em
  // `engine/systems/rodadaDeDuelo.test.ts`. Nao repete aqui: com movesets
  // REAIS e RNG novo a cada chamada (`rodarDuelo` semeia com
  // `randomSeed()`), tanto um golpe como Dragon Dance (deixa o mesmo lado
  // mais rapido, abre varios rounds seguidos — correto, pedido explicito do
  // usuario) quanto uma morte por status (veneno/queimadura, que nao passa
  // pelo loop de `pendingHits` que este teste captura) tornam qualquer
  // asserção sobre "o ultimo evento" ou "sempre alterna" estruturalmente
  // fragil, nao um bug do motor.
  it('resultado sempre e um dos tres validos, com pelo menos um evento', () => {
    const resultado = rodarDuelo([pokeForte('tyranitar', { speed: 150 })], [pokeForte('gyarados', { speed: 140, hp: 250 })])
    expect(resultado.eventos.length).toBeGreaterThan(0)
    expect(['jogador', 'boss', 'empate']).toContain(resultado.vencedor)
  })
})
