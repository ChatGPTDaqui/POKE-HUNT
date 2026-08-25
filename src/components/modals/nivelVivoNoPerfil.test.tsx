// @vitest-environment jsdom
// PH-155 — o perfil aberto tem que acompanhar o POKE, e o cabecalho tambem.
//
// `usePokeProfileStore#showProfile` grava o OBJETO tirado no clique, nao o uid.
// Isso e proposital (o mesmo modal abre com POKE de preview da Pokedex, que nao
// existe em `team` nem em `bagPokes`), e o preco e que o objeto nunca mais muda
// sozinho.
//
// A correcao anterior tratou isso DENTRO da `MovesetTable`, e o modal ficou
// meio vivo: a tabela de golpes acompanhava e o cabecalho nao. Subir de nivel
// com o perfil aberto deixava o `Lv` no numero velho ate fechar e reabrir.
//
// Por isso o caso principal aqui olha o CABECALHO, e nao a aba de golpes: era
// exatamente a parte que o contorno anterior nao cobria.
import { describe, expect, it, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'

import { SPECIES, createPokeInstance } from '@/data/pokes'
import { createRng } from '@/core/rng'
import { useGameStateStore } from '@/stores/gameStateStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { PokeProfileModal } from './PokeProfileModal'

const ESPECIE = 'charmander'

function abrirPerfilDeUmPokeDaEquipe() {
  const poke = createPokeInstance(createRng(3), ESPECIE, 30)
  useGameStateStore.setState({ team: [poke], activeIndex: 0 } as never, false)
  usePokeProfileStore.getState().showProfile(poke, SPECIES[ESPECIE]!)
  return poke
}

/**
 * O `Lv` do cabecalho (`ProfileHero`), escrito sem espaco — `Lv30`, e nao
 * `Lv 30`, que e a forma do trilho do HUD.
 *
 * Devolve o conjunto de textos distintos, e nao o primeiro achado: o `Painel`
 * pode renderizar o cabecalho em mais de um lugar (ele tambem e a alca de
 * arraste). Se um deles ficasse pra tras, pegar so o primeiro esconderia
 * exatamente o defeito desta issue.
 */
function niveisNoCabecalho(): string[] {
  return [...new Set(screen.getAllByText(/^Lv\d+$/).map((e) => e.textContent!))]
}

describe('o perfil aberto acompanha o POKE (PH-155)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
    usePokeProfileStore.getState().close()
  })

  it('o nivel do cabecalho muda quando o POKE sobe de nivel com o modal ABERTO', () => {
    const poke = abrirPerfilDeUmPokeDaEquipe()
    render(<PokeProfileModal />)
    expect(niveisNoCabecalho()).toEqual(['Lv30'])

    // Como o motor faz: `grantExp` devolve uma INSTANCIA NOVA e o simulation
    // grava por cima. Mutar o objeto no lugar nao serviria de teste — o React
    // nao veria mudanca nenhuma, e o bug de verdade e justamente a tela estar
    // presa no objeto antigo.
    // Dentro de `act`: o `setState` do zustand vem de fora do React, e sem ele
    // a re-renderizacao nao e liberada antes da assercao — a falha apontaria
    // pro componente quando o problema seria do proprio teste.
    act(() => {
      useGameStateStore.setState({ team: [{ ...poke, level: 31 }] } as never, false)
    })

    expect(niveisNoCabecalho()).toEqual(['Lv31'])
  })

  it('POKE de PREVIEW, fora da equipe e da mochila, continua abrindo', () => {
    // O caminho que impede "consertar" trocando o snapshot por um uid seco: na
    // Pokedex e no ranking a instancia e criada na hora e nao ha nada vivo pra
    // reler. Sem este caso, uma correcao que quebrasse a Pokedex passaria.
    const preview = createPokeInstance(createRng(9), ESPECIE, 44)
    usePokeProfileStore.getState().showProfile(preview, SPECIES[ESPECIE]!)
    render(<PokeProfileModal />)
    expect(niveisNoCabecalho()).toEqual(['Lv44'])
  })
})
