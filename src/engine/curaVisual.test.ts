import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { useRendererStore } from '@/stores/rendererStore'
import type { Renderer } from '@/render/renderer'
import { heal, VFX_CURA_DURACAO } from './entity'
import { buildHospitalWorld, stepWorld } from './simulation'
import { controller } from './controller'
import { tickStatus } from './systems/statusSystem'
import { danoPorTurno } from '@/data/statusEffects'
import { TURNO_SEGUNDOS } from '@/data/abilities'

const remoto = vi.hoisted(() => vi.fn())
vi.mock('@/data/remote/autoridade', () => ({
  pedirAcao: remoto, abrirSessaoDeHunt: vi.fn(), fecharSessaoDeHunt: vi.fn(),
}))
beforeEach(() => {
  useGameStateStore.getState().resetToDefaults()
  const poke = createPokeInstance(createRng(10), 'squirtle', 30)
  poke.hp = Math.max(1, poke.stats.hp - 40)
  useGameStateStore.setState({ team: [poke], activeIndex: 0 })
  useWorldStore.getState().setWorld(buildHospitalWorld(poke, { x: 0, y: 0 }))
  useRendererStore.setState({ renderer: null })
  remoto.mockReset().mockImplementation(async (_acao, fallback) => { fallback(); return true })
})

describe('disparos de cura', () => {
  it('poção e heal acionam só ganho real de HP; cura cheia não fica piscando', () => {
    useGameStateStore.getState().addItem('potion', 1)
    const antes = useWorldStore.getState().player!.poke.hp
    controller.useItem('potion')
    const player = useWorldStore.getState().player!
    expect(player.poke.hp).toBeGreaterThan(antes)
    expect(player.vfxCuraHp).toBe(VFX_CURA_DURACAO)
    const cheio = buildHospitalWorld({ ...player.poke, hp: player.poke.stats.hp }, { x: 0, y: 0 }).player!
    heal(cheio, 10)
    expect(cheio.vfxCuraHp).toBeUndefined()
  })
  it.each([false, true])('o timer de cura termina no Hospital sem mexer em combate (silent: %s)', silent => {
    const world = buildHospitalWorld(createPokeInstance(createRng(1), 'squirtle', 30), { x: 0, y: 0 })
    world.player!.vfxCuraHp = VFX_CURA_DURACAO
    world.player!.vfxCuraStatus = VFX_CURA_DURACAO
    world.player!.attackAnimTimer = .5
    world.player!.cooldowns = { recover: 4 }
    const hp = world.player!.poke.hp
    for (let i = 0; i < 61; i++) stepWorld(world, 1 / 60, useGameStateStore.getState(), { silent })
    expect(world.player!.vfxCuraHp).toBeUndefined()
    expect(world.player!.vfxCuraStatus).toBeUndefined()
    expect(world.player!.poke.hp).toBe(hp)
    expect(world.player!.attackAnimTimer).toBe(.5)
    expect(world.player!.cooldowns).toEqual({ recover: 4 })
  })
  it('Poison Heal usa o mesmo marcador, sem mudar quanto cura', () => {
    const player = buildHospitalWorld(createPokeInstance(createRng(1), 'shroomish', 30), { x: 0, y: 0 }).player!
    player.poke.trait = 'poison_heal'
    player.poke.status = { tipo: 'poison', turnosRestantes: 10 }
    player.poke.hp = 1
    tickStatus(createRng(2), player, TURNO_SEGUNDOS)
    expect(player.poke.hp).toBe(1 + danoPorTurno('poison', player.poke.stats.hp))
    expect(player.vfxCuraHp).toBe(VFX_CURA_DURACAO)
  })
  it.each([false, true])('Centro só inicia a sequência após confirmação aceita (ok: %s)', async ok => {
    remoto.mockResolvedValue(ok)
    const iniciarCuraNoCentro = vi.fn()
    useRendererStore.setState({ renderer: { iniciarCuraNoCentro } as unknown as Renderer })
    controller.healTeam()
    expect(iniciarCuraNoCentro).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(iniciarCuraNoCentro.mock.calls).toEqual(ok ? [[1]] : [])
    expect(useWorldStore.getState().player!.vfxCuraHp).toBeUndefined()
  })
  it('não leva uma resposta atrasada do Centro para uma hunt', async () => {
    let confirmar!: (ok: boolean) => void
    remoto.mockReturnValue(new Promise<boolean>(resolve => { confirmar = resolve }))
    const iniciarCuraNoCentro = vi.fn()
    useRendererStore.setState({ renderer: { iniciarCuraNoCentro } as unknown as Renderer })
    controller.healTeam()
    useWorldStore.setState({ mapDef: { id: 'outra-cena' } as NonNullable<ReturnType<typeof useWorldStore.getState>['mapDef']> })
    confirmar(true)
    await Promise.resolve()
    expect(iniciarCuraNoCentro).not.toHaveBeenCalled()
  })
})
