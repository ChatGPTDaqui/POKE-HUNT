// @vitest-environment jsdom
// PH-137 — a reserva DESMAIADA nao pode aparecer sorrindo.
//
// O trilho de reservas usava so `faceIconUrl` — a face neutra, sempre. E a
// reserva desmaiada e exatamente o POKE sobre o qual o jogador precisa decidir
// (curar, ou nao mandar pra campo). A face do POKE EM CAMPO ja respondia ao
// estado (`useFaceDoPoke`); o trilho de reservas ficou de fora.
//
// Este teste olha o `src` do `<img>`, e nao pixel: o que nao pode voltar e a
// reserva desmaiada apontando pro retrato neutro.
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { createPokeInstance } from '@/data/pokes'
import { createRng } from '@/core/rng'
import { useGameStateStore } from '@/stores/gameStateStore'
import { escolherFace, faceEmocaoUrl } from '@/data/faceEmotions'
import { faceIconUrl } from '@/data/sprites'
import { ReservasRail } from './ReservasRail'

/** Espécie com arte de KO em disco — senão o fallback neutro é o esperado. */
const ESPECIE = 'charmander'

function equipeCom(hpDaReserva: number) {
  const ativo = createPokeInstance(createRng(1), 'squirtle', 20)
  const reserva = createPokeInstance(createRng(2), ESPECIE, 20)
  reserva.hp = hpDaReserva
  useGameStateStore.setState({ team: [ativo, reserva], activeIndex: 0 } as never, false)
  return reserva
}

/** O `<img>` da reserva — o do ativo nao entra no trilho (ele vive no StatusRail). */
function srcDaReserva(): string | null {
  const imgs = screen.getAllByRole('presentation', { hidden: true }) as HTMLImageElement[]
  return imgs[0]?.getAttribute('src') ?? null
}

describe('reserva desmaiada mostra cara de KO (PH-137)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('reserva VIVA mostra a face neutra', () => {
    // O par do teste de baixo: se a cara de KO saisse sempre, ela nao diria
    // nada. Guarda contra "consertar" trocando a face de todo mundo.
    const reserva = equipeCom(20)
    render(<ReservasRail />)
    expect(srcDaReserva()).toBe(faceIconUrl(reserva.speciesId, reserva.isShiny))
  })

  it('reserva DESMAIADA mostra a cara de KO', () => {
    const reserva = equipeCom(0)
    const esperada = faceEmocaoUrl(reserva.speciesId, reserva.isShiny, escolherFace({
      hpFrac: 0, fainted: true, status: null, statusVolatil: null, emCombate: false, festejando: false,
    }))

    render(<ReservasRail />)

    // Guarda anti-teste-vacuo: se `charmander` nao tivesse a arte, `esperada`
    // seria a propria face neutra e o teste passaria sem provar nada.
    expect(
      esperada,
      `${ESPECIE} nao tem arte de KO — troque a especie deste teste por uma que tenha`,
    ).not.toBe(faceIconUrl(reserva.speciesId, reserva.isShiny))

    expect(
      srcDaReserva(),
      'reserva desmaiada continua com o retrato neutro — ela aparece sorrindo no trilho',
    ).toBe(esperada)
  })
})
