// PH-208: entrar numa hunt cujo teto de nivel o POKE ativo ja estourou tem
// que AVISAR. O achado que motivou isto: Zoka/Noctowl (Lv33) rodou 4 hunts de
// Faixa 1 (teto Lv30) por 4h39min reais, 8+6+2+1 ciclos, e o nivel nunca mudou
// — o jogador nao tinha como saber que estava preso numa hunt facil demais.
//
// O disparo mora em `controller.enterMap`, que roda uma vez por sessao de hunt
// (nunca por abate ou tick). O gatilho e uma funcao pura testada aqui sem
// servidor.
import { describe, expect, it } from 'vitest'

import { avisoDeTetoDeHunt } from './controller'
import { getMap } from '@/data/maps'

const HUNT = 'mata_faixa1'
const TETO = getMap(HUNT)!.levelRange[1] // Faixa I => 30

describe('avisoDeTetoDeHunt', () => {
  it('POKE abaixo do teto: nenhum aviso', () => {
    expect(avisoDeTetoDeHunt(TETO - 5, HUNT)).toBeNull()
  })

  it('POKE exatamente no teto: nenhum aviso (o teto ainda cabe)', () => {
    expect(avisoDeTetoDeHunt(TETO, HUNT)).toBeNull()
  })

  it('POKE acima do teto: avisa, com os dois numeros na mensagem', () => {
    const aviso = avisoDeTetoDeHunt(TETO + 3, HUNT)
    expect(aviso).not.toBeNull()
    expect(aviso).toContain(`Lv ${TETO + 3}`)
    expect(aviso).toContain(`Lv ${TETO}`)
    expect(aviso).toMatch(/teto desta hunt/i)
  })

  it('hunt desconhecida: nenhum aviso, sem estourar', () => {
    expect(avisoDeTetoDeHunt(999, 'hunt_que_nao_existe')).toBeNull()
  })
})
