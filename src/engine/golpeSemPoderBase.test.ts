// Golpe de DANO SEM PODER BASE precisa de fato SAIR na rotacao do jogador.
//
// Falha silenciosa que isto tranca: `pickAbilityDaFila` decidia "isto e golpe
// de status" por `ability.power === 0`, e os 12 golpes de DANO_SEM_PODER_BASE
// (data/abilities.ts) tem justamente `power` 0 no catalogo — o dano deles nasce
// em `specialDamageFor`. Resultado: `activeAbilitiesPadrao` (que filtra por
// `isDamagingAbility`, e portanto os ACEITA) punha Flail num dos 4 slots do
// Magikarp, o HUD mostrava o slot cheio, e o golpe nunca disparava. Nada
// lancava, nada logava: o POKE so batia menos.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld } from './simulation'
import { useGameStateStore } from '@/stores/gameStateStore'

const IV = { hp: 20, atkFis: 20, atkEsp: 20, def: 20, defEsp: 20, speed: 20 }

/** Quais golpes o POKE do jogador chegou a disparar em `segundos` de luta. */
function golpesDisparados(speciesId: string, nivel: number, golpes: string[], segundos: number): Set<string> {
  const gameState = useGameStateStore.getState()
  const rng = createRng(4242)
  const poke = createPokeInstance(rng, speciesId, nivel, { rarity: 'comum', ivs: IV })
  poke.activeAbilities = golpes
  const world = buildMapWorld('route_46', poke, { seed: 0,
    rng: createRng(4242),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  // O POKE nao pode morrer no meio da medicao — a pergunta e sobre ESCOLHA de
  // golpe, nao sobre quem ganha a luta.
  world.player!.poke.stats.hp = 10_000_000
  world.player!.poke.hp = 10_000_000

  const usados = new Set<string>()
  const vistos = new Set<string>()
  for (let t = 0; t < segundos; t += 0.1) {
    stepWorld(world, 0.1, gameState, {})
    for (const hit of world.pendingHits) {
      if (vistos.has(hit.id)) continue
      vistos.add(hit.id)
      if (hit.attackerId === world.player!.id) usados.add(hit.ability.id)
    }
  }
  return usados
}

describe('golpe de dano sem poder base entra na rotacao do jogador', () => {
  it('Magikarp usa Flail — o unico golpe forte que a especie tem', () => {
    const usados = golpesDisparados('magikarp', 40, ['flail'], 40)
    expect([...usados]).toContain('flail')
  })

  it('Seismic Toss (dano fixo = nivel) sai na rotacao', () => {
    const usados = golpesDisparados('machamp', 50, ['seismic_toss'], 40)
    expect([...usados]).toContain('seismic_toss')
  })

  it('o slot com Flail nao vira turno perdido: o POKE ataca todo turno', () => {
    // Com o bug, [flail] deixava a rotacao VAZIA e o POKE do jogador ficava
    // parado (ele nao tem o fallback de Ataque Basico do selvagem).
    const usados = golpesDisparados('magikarp', 40, ['flail'], 40)
    expect(usados.size).toBeGreaterThan(0)
  })
})
