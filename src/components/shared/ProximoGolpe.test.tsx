// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES, type Species } from '@/data/pokes'
import { ProximoGolpe, proximoAprendizado } from './ProximoGolpe'

afterEach(cleanup)
const poke = { ...createPokeInstance(createRng(1), 'charmander', 1), unlockedAbilities: [] }
const species: Species = { ...SPECIES.charmander, id: 'fixture-proximo', abilities: [
  { key: 'ember', levelReq: 7 }, { key: 'growl', levelReq: 7 },
  { key: 'flamethrower', levelReq: 20 },
] }

describe('próximo aprendizado', () => {
  it('agrupa todos os golpes do próximo nível e avança depois dele', () => {
    const proximo = proximoAprendizado(poke, species)!
    expect(proximo.nivel).toBe(7)
    expect(proximo.golpes.map(g => g.id).sort()).toEqual(['ember', 'growl'])
    expect(proximoAprendizado({ ...poke, level: 7 }, species)?.nivel).toBe(20)
  })
  it('não anuncia golpe já aprendido e termina sem inventar outro', () => {
    expect(proximoAprendizado({ ...poke, unlockedAbilities: ['ember', 'growl'] }, species)?.nivel).toBe(20)
    expect(proximoAprendizado({ ...poke, level: 100 }, species)).toBeNull()
  })
  it('abre ao toque e atualiza a previsão com o nível', async () => {
    const { rerender } = render(<ProximoGolpe poke={poke} species={species}>Lv 1</ProximoGolpe>)
    const trigger = screen.getByLabelText('Próximo golpe de Charmander')
    const touch = new Event('pointerdown', { bubbles: true })
    Object.defineProperty(touch, 'pointerType', { value: 'touch' })
    fireEvent(trigger, touch)
    fireEvent.click(trigger)
    expect(await screen.findByText(/No nível 7/)).toBeTruthy()
    rerender(<ProximoGolpe poke={{ ...poke, level: 7 }} species={species}>Lv 7</ProximoGolpe>)
    expect(await screen.findByText(/No nível 20/)).toBeTruthy()
  })
  it('recalcula para a forma atual e explica o fim do aprendizado por teclado', async () => {
    const { rerender } = render(<ProximoGolpe poke={poke} species={species}>Lv 1</ProximoGolpe>)
    fireEvent.focus(screen.getByLabelText('Próximo golpe de Charmander'))
    expect(await screen.findByText(/No nível 7/)).toBeTruthy()
    const evoluida = { ...SPECIES.charmeleon, id: 'fixture-evoluida', abilities: [{ key: 'flamethrower', levelReq: 30 }] }
    rerender(<ProximoGolpe poke={{ ...poke, level: 25, speciesId: 'charmeleon' }} species={evoluida}>Lv 25</ProximoGolpe>)
    expect(await screen.findByText(/No nível 30/)).toBeTruthy()
    rerender(<ProximoGolpe poke={{ ...poke, level: 100 }} species={evoluida}>Lv 100</ProximoGolpe>)
    expect(await screen.findByText(/não tem mais golpes/)).toBeTruthy()
  })
})
