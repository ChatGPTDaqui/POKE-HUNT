import { describe, expect, it } from 'vitest'
import { criarMundoPvpReplay } from '@/features/pvp/pvpWorld'
import { stepPvpVisual } from './pvpSystem'
import type { PvpEventoRemoto } from '@/data/remote/servidor'

function evento(overrides: Partial<PvpEventoRemoto>): PvpEventoRemoto {
  return {
    atacante: 'Charmander',
    defensor: 'Squirtle',
    golpe: 'Ataque Básico',
    dano: 5,
    hpRestante: 95,
    efetividade: 1,
    nocaute: false,
    atacanteLado: 'anfitriao',
    atacanteSpeciesId: 'charmander',
    atacanteShiny: false,
    defensorLado: 'convidado',
    defensorSpeciesId: 'squirtle',
    defensorShiny: false,
    hpMaximoDefensor: 100,
    ...overrides,
  }
}

// dt bem maior que qualquer espera do stepper: cada chamada ou zera uma
// espera pendente ou processa um evento — nunca as duas coisas juntas (ver
// pvpReplaySystem.ts#stepPvpReplay). N chamadas com folga cobre N eventos.
function avancarReplay(world: ReturnType<typeof criarMundoPvpReplay>, vezes: number): void {
  for (let i = 0; i < vezes; i++) stepPvpVisual(world, 10)
}

describe('replay do PvP (PH-532)', () => {
  it('monta o mundo a partir do primeiro evento e comeca em replay', () => {
    const eventos = [evento({})]
    const world = criarMundoPvpReplay(eventos, 'anfitriao', 'vitoria', 'Rival')
    expect(world.pvp?.estado).toBe('replay')
    expect(world.player?.poke.speciesId).toBe('charmander')
    expect(world.enemies[0]?.poke.speciesId).toBe('squirtle')
  })

  it('dano >= 30% do hp maximo dispara o flinch (hurtAnimTimer) no defensor', () => {
    const eventos = [evento({ dano: 40, hpRestante: 60, hpMaximoDefensor: 100 })]
    const world = criarMundoPvpReplay(eventos, 'anfitriao', 'vitoria', 'Rival')
    avancarReplay(world, 2)
    const defensor = world.enemies[0]
    expect(defensor?.poke.hp).toBe(60)
    expect(defensor?.hurtAnimTimer).toBeGreaterThan(0)
  })

  it('dano abaixo de 30% NAO dispara o flinch', () => {
    const eventos = [evento({ dano: 10, hpRestante: 90, hpMaximoDefensor: 100 })]
    const world = criarMundoPvpReplay(eventos, 'anfitriao', 'vitoria', 'Rival')
    avancarReplay(world, 2)
    expect(world.enemies[0]?.hurtAnimTimer ?? 0).toBe(0)
  })

  it('esgotar os eventos aplica o resultadoFinal no estado do pvp', () => {
    const eventos = [evento({ nocaute: true, dano: 100, hpRestante: 0 })]
    const world = criarMundoPvpReplay(eventos, 'anfitriao', 'derrota', 'Rival')
    avancarReplay(world, 4)
    expect(world.pvp?.estado).toBe('derrota')
  })

  it('troca de especie no meio do replay quando o evento seguinte muda quem esta lutando', () => {
    const eventos = [
      evento({ atacanteSpeciesId: 'charmander', defensorSpeciesId: 'squirtle', nocaute: true, dano: 100, hpRestante: 0 }),
      evento({
        atacanteLado: 'convidado', atacanteSpeciesId: 'wartortle',
        defensorLado: 'anfitriao', defensorSpeciesId: 'charmander',
        dano: 5, hpRestante: 95, hpMaximoDefensor: 100,
      }),
    ]
    const world = criarMundoPvpReplay(eventos, 'anfitriao', 'derrota', 'Rival')
    // PH-535 Fase 3: a troca agora tem coreografia (recolhendo + arremessando,
    // ver pvpReplaySystem.ts) — cada fase so avanca UM passo por chamada,
    // mesmo com dt gigante, de proposito (pra nao pular o balao "Vai, X!").
    // Sequencia real (medida): 1=processa evento[0], 2=zera esperando,
    // 3=detecta troca/entra em recolhendo, 4=recolhendo->arremessando,
    // 5=ainda em arremessando (so zera o tempoNaFase, negativo), 6=troca a
    // especie de vez E processa evento[1] no mesmo tick (cai direto no
    // fluxo normal apos a troca terminar).
    avancarReplay(world, 6)
    expect(world.enemies[0]?.poke.speciesId).toBe('wartortle')
  })
})

describe('coreografia de troca (PH-535 Fase 3)', () => {
  const PASSO = 0.1

  function mundoComTroca() {
    const eventos = [
      evento({ atacanteSpeciesId: 'charmander', defensorSpeciesId: 'squirtle', nocaute: true, dano: 100, hpRestante: 0 }),
      evento({
        atacanteLado: 'convidado', atacanteSpeciesId: 'wartortle', atacante: 'Wartortle',
        defensorLado: 'anfitriao', defensorSpeciesId: 'charmander',
        dano: 5, hpRestante: 95, hpMaximoDefensor: 100,
      }),
    ]
    return criarMundoPvpReplay(eventos, 'anfitriao', 'derrota', 'Rival')
  }

  it('entra em "recolhendo" sem balao e sem efeito de bola ainda', () => {
    const world = mundoComTroca()
    // dt pequeno (PASSO), mas em quantidade suficiente pra processar o
    // primeiro evento (nocaute) e detectar a troca pendente do 2o evento.
    for (let i = 0; i < 40; i++) stepPvpVisual(world, PASSO)
    expect(world.pvp?.replay?.troca?.fase).toBe('recolhendo')
    expect(world.effects.some((e) => e.type === 'captureAnim')).toBe(false)
  })

  it('avanca pra "arremessando" com o efeito de bola e o balao "Vai, X!"', () => {
    const world = mundoComTroca()
    for (let i = 0; i < 40; i++) stepPvpVisual(world, PASSO)
    // +TEMPO_RECOLHENDO (1s) de sobra pra garantir a transicao de fase.
    for (let i = 0; i < 15; i++) stepPvpVisual(world, PASSO)
    expect(world.pvp?.replay?.troca?.fase).toBe('arremessando')
    expect(world.pvp?.replay?.troca?.nomeNovo).toBe('Wartortle')
    expect(world.effects.some((e) => e.type === 'captureAnim')).toBe(true)
    // A especie so troca DEPOIS do arremesso — ainda e o poke antigo aqui.
    expect(world.enemies[0]?.poke.speciesId).toBe('squirtle')
  })

  it('termina a troca, some com o efeito e o balao, especie nova em campo', () => {
    const world = mundoComTroca()
    // Tempo de sobra pra atravessar as duas fases inteiras.
    for (let i = 0; i < 80; i++) stepPvpVisual(world, PASSO)
    expect(world.pvp?.replay?.troca).toBeNull()
    expect(world.enemies[0]?.poke.speciesId).toBe('wartortle')
    expect(world.effects.some((e) => e.type === 'captureAnim')).toBe(false)
  })
})
