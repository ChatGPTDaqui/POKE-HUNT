// Golpe de suporte resolvido por id cria o efeito de desenho (13/11).
//
// Estes golpes nao tem `status`/`statChanges` no catalogo — o efeito e por id
// no motor — e por isso nao marcavam "algo pegou": saiam sem efeito nenhum na
// tela. As familias Preparos e Pragas (render/vfx) desenham em cima do efeito
// criado aqui. So desenho: nada de dano, rng ou relogio muda.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { getAbility } from '@/data/abilities'
import { createPokeInstance } from '@/data/pokes'
import { resolverVfx } from '@/render/vfx/resolverVfx'
import { buildMapWorld } from '../simulation'
import { criarInimigoDeTeste } from '../testes/inimigoDeTeste'
import { updateCombat } from './combatSystem'

type Mundo = ReturnType<typeof buildMapWorld>
function usar(abilityId: string, especie = 'kangaskhan', antes?: (player: NonNullable<Mundo['player']>, enemy: Mundo['enemies'][number]) => void) {
  const poke = createPokeInstance(createRng(1), especie, 50, { rarity: 'comum' })
  const world = buildMapWorld('route_46', poke, { seed: 0, rng: createRng(1), counters: { entity: 1, effect: 1, pendingHit: 1 } })
  const player = world.player!
  const enemy = criarInimigoDeTeste(world, 'rattata', 50, { x: player.x + 40, y: player.y })
  enemy.targetId = player.id
  world.enemies = [enemy]
  antes?.(player, enemy)
  world.effects = []
  world.pendingHits.push({
    id: `hit-${world.counters.pendingHit++}`,
    timer: 0, attackerId: player.id, targetId: enemy.id, ability: getAbility(abilityId)!,
  })
  updateCombat(world, 0)
  return { player, enemy, efeitos: world.effects.filter((e) => e.type === 'abilityEffect' && e.abilityId === abilityId) }
}

const EM_QUEM_USOU = ['substitute', 'focus_energy', 'laser_focus', 'magnet_rise', 'ingrain', 'aqua_ring', 'belly_drum', 'acupressure',
  'destiny_bond', 'psych_up', 'aromatherapy', 'heal_bell', 'trick_room', 'haze', 'perish_song']
const NO_ALVO = ['leech_seed', 'nightmare', 'embargo', 'quash', 'roar', 'yawn', 'soak', 'lock_on', 'mind_reader', 'guard_swap', 'power_swap']

describe('suporte em quem usou cria o efeito nele', () => {
  for (const id of EM_QUEM_USOU) {
    it(id, () => {
      const { player, efeitos } = usar(id)
      expect(efeitos).toHaveLength(1)
      expect(efeitos[0].x).toBe(player.x)
      expect(resolverVfx({ abilityId: id, area: false })?.noCorpo).toBe(true)
    })
  }
})

describe('suporte no alvo cria o efeito nele, saindo de quem usou', () => {
  for (const id of NO_ALVO) {
    it(id, () => {
      const { player, efeitos } = usar(id)
      expect(efeitos).toHaveLength(1)
      // Roar empurra o alvo: o efeito nasce onde ele foi parar.
      expect(efeitos[0].x).not.toBe(player.x)
      expect(efeitos[0].origemX).toBe(player.x)
      expect(resolverVfx({ abilityId: id, area: false })?.noCorpo).toBe(false)
    })
  }

  it('curse de fantasma marca o alvo; de não-fantasma não inventa efeito', () => {
    expect(usar('curse', 'gastly').efeitos).toHaveLength(1)
  })

  it('psycho_shift só desenha quando há status pra transferir', () => {
    expect(usar('psycho_shift').efeitos).toHaveLength(0)
    expect(usar('psycho_shift', 'kangaskhan', (p) => { p.poke.status = { tipo: 'burn', turnosRestantes: 3 } }).efeitos).toHaveLength(1)
  })
})

describe('suporte que falha não desenha', () => {
  it('leech_seed em alvo já semeado', () => {
    expect(usar('leech_seed', 'kangaskhan', (p, e) => { e.seeded = { sourceId: p.id } }).efeitos).toHaveLength(0)
  })
  it('yawn em alvo que já tem status', () => {
    expect(usar('yawn', 'kangaskhan', (_p, e) => { e.poke.status = { tipo: 'burn', turnosRestantes: 3 } }).efeitos).toHaveLength(0)
  })
  it('substitute com substituto ativo', () => {
    expect(usar('substitute', 'kangaskhan', (p) => { p.substitutoHp = 10 }).efeitos).toHaveLength(0)
  })
})
