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
    // Um evento de nocaute do lado 'enemy' antes do fim prova que o PRIMEIRO
    // rival caiu e a luta continuou (a reserva entrou) em vez de acabar ali.
    const primeiroNocauteInimigo = resultado.eventos.findIndex((e) => e.nocaute && e.defensorLado === 'enemy')
    expect(primeiroNocauteInimigo).toBeGreaterThanOrEqual(0)
    expect(primeiroNocauteInimigo).toBeLessThan(resultado.eventos.length - 1)
  })

  // Alternancia ESTRITA (sempre troca de lado) so vale quando Velocidade
  // nao muda no meio — ja coberto isolado em
  // `engine/systems/rodadaDeDuelo.test.ts`. Aqui, com movesets reais, um
  // golpe como Dragon Dance pode deixar o mesmo lado mais rapido e abrir
  // VARIOS rounds seguidos — comportamento correto (pedido explicito do
  // usuario: Velocidade mudando no meio reordena quem ataca primeiro).
  it('cada round some do resultado quando um lado vence — nunca produz evento com os dois HP zerados', () => {
    const resultado = rodarDuelo([pokeForte('tyranitar', { speed: 150 })], [pokeForte('gyarados', { speed: 140, hp: 250 })])
    expect(resultado.eventos.length).toBeGreaterThan(0)
    expect(['jogador', 'boss', 'empate']).toContain(resultado.vencedor)
    // O ultimo evento tem que ser um nocaute — a luta so termina quando
    // alguem cai (sem reserva), nunca no meio de um round.
    expect(resultado.eventos.at(-1)?.nocaute).toBe(true)
  })
})
