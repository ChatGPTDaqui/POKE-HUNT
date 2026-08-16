// @vitest-environment jsdom
//
// A selecao dos 4 golpes ativos, pela TELA. O resto da Leva A ja e coberto por
// teste de dado (activeAbilities.test.ts) e pela RPC no banco; o que so existe
// aqui e a fiacao: clique -> controller -> acao, mais as condicoes que
// escondem/desabilitam o controle (POKE que nao e seu, golpe nao aprendido,
// dentro de hunt — trava reintroduzida, ver os testes de hunt abaixo).
//
// Ataque Basico e o AOE de Nivel 50 pararam de ter linha/mecanismo especial
// (pedido explicito do usuario: "nao sao diferentes... podem ser retirados
// como qualquer outro golpe") — os dois viram linha normal da tabela, usando
// o MESMO `setActiveAbilities`/cap-de-4 de qualquer golpe aprendido.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SPECIES, type PokeInstance } from '@/data/pokes'
import { getAbility, BASIC_ATTACK } from '@/data/abilities'
import { typedAoeMoveKey } from '@/data/typedAoeMoves'
import { activeAbilitiesPadrao } from '@/data/activeAbilities'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'
import { MovesetTable } from './PokeStatDetail'

const setActiveAbilities = vi.fn()
const toggleAbility = vi.fn()
vi.mock('@/engine/controller', () => ({
  controller: {
    setActiveAbilities: (...args: unknown[]) => setActiveAbilities(...args),
    toggleAbility: (...args: unknown[]) => toggleAbility(...args),
  },
}))

const ESPECIE = SPECIES.charmander
const NIVEL = 60

function pokeDoJogador(extra: Partial<PokeInstance> = {}): PokeInstance {
  return {
    uid: 'poke-de-teste',
    speciesId: ESPECIE.id,
    level: NIVEL,
    isShiny: false,
    rarity: 'comum',
    exp: 0,
    ivs: { hp: 10, atkFis: 10, atkEsp: 10, def: 10, defEsp: 10, speed: 10 },
    stats: { hp: 100, atkFis: 50, atkEsp: 50, def: 50, defEsp: 50, speed: 50 },
    hp: 100,
    unlockedAbilities: ESPECIE.abilities
      .filter((a) => a.levelReq <= NIVEL)
      .map((a) => a.key)
      .filter((k) => getAbility(k)),
    activeAbilities: activeAbilitiesPadrao(ESPECIE, NIVEL),
    ...extra,
  }
}

// A linha da tabela e um grid de <div>s, nao um <tr> — acha pelo nome do golpe
// e sobe ate o container que tambem tem o botao "Usar".
function linhaDoGolpe(nome: string): HTMLElement {
  const rotulo = screen.getByText(nome)
  const linha = rotulo.closest('div[class*="grid"]')
  if (!linha) throw new Error(`linha nao encontrada para ${nome}`)
  return linha as HTMLElement
}

function botaoUsar(nomeDoGolpe: string): HTMLButtonElement | null {
  return within(linhaDoGolpe(nomeDoGolpe)).queryByRole('button')
}

function nomeDoGolpe(key: string): string {
  const a = getAbility(key)
  if (!a) throw new Error(`golpe desconhecido: ${key}`)
  return a.name
}

beforeEach(() => {
  setActiveAbilities.mockClear()
  toggleAbility.mockClear()
  useGameStateStore.setState({ team: [], bagPokes: [], currentMapId: null })
  useToastStore.setState({ toasts: [] })
})
afterEach(cleanup)

describe('MovesetTable — selecao dos 4 golpes', () => {
  it('POKE que nao e seu (preview da Pokedex) nao mostra a selecao', () => {
    render(<MovesetTable poke={pokeDoJogador()} species={ESPECIE} />)
    expect(screen.queryByText(/Golpes ativos/)).toBeNull()
    expect(botaoUsar(nomeDoGolpe(pokeDoJogador().activeAbilities![0]))).toBeNull()
  })

  it('POKE da equipe mostra a contagem e marca exatamente os escolhidos', () => {
    const poke = pokeDoJogador()
    useGameStateStore.setState({ team: [poke] })
    render(<MovesetTable poke={poke} species={ESPECIE} />)

    expect(screen.getByText('4/4')).toBeTruthy()
    expect(screen.getByText(/Golpes ativos/)).toBeTruthy()

    for (const key of poke.activeAbilities!) {
      expect(botaoUsar(nomeDoGolpe(key))?.className).toContain('bg-primary')
    }
  })

  it('desmarcar manda a lista SEM o golpe', async () => {
    const poke = pokeDoJogador()
    useGameStateStore.setState({ team: [poke] })
    render(<MovesetTable poke={poke} species={ESPECIE} />)

    const alvo = poke.activeAbilities![0]
    await userEvent.click(botaoUsar(nomeDoGolpe(alvo))!)

    expect(setActiveAbilities).toHaveBeenCalledTimes(1)
    const [uid, lista] = setActiveAbilities.mock.calls[0]
    expect(uid).toBe(poke.uid)
    expect(lista).not.toContain(alvo)
    expect(lista).toHaveLength(3)
  })

  it('com os 4 cheios, marcar um quinto e recusado e avisa em vez de trocar em silencio', async () => {
    const poke = pokeDoJogador()
    useGameStateStore.setState({ team: [poke] })
    render(<MovesetTable poke={poke} species={ESPECIE} />)

    const deFora = poke.unlockedAbilities.find((k) => !poke.activeAbilities!.includes(k))!
    await userEvent.click(botaoUsar(nomeDoGolpe(deFora))!)

    expect(setActiveAbilities).not.toHaveBeenCalled()
    expect(useToastStore.getState().toasts.some((t) => /Maximo de 4/.test(t.message))).toBe(true)
  })

  it('com slot livre, marcar ACRESCENTA sem derrubar os outros', async () => {
    const escolhidos = activeAbilitiesPadrao(ESPECIE, NIVEL).slice(0, 2)
    const poke = pokeDoJogador({ activeAbilities: escolhidos })
    useGameStateStore.setState({ team: [poke] })
    render(<MovesetTable poke={poke} species={ESPECIE} />)

    const deFora = poke.unlockedAbilities.find((k) => !escolhidos.includes(k))!
    await userEvent.click(botaoUsar(nomeDoGolpe(deFora))!)

    const [, lista] = setActiveAbilities.mock.calls[0]
    expect(lista).toEqual([...escolhidos, deFora])
  })

  // Trava reintroduzida a pedido do usuario (revertendo a leva anterior, que a
  // tinha removido a pedido DELE tambem): build fixo durante o combate. A
  // RPC `definir_golpes_ativos` recusa com sessao viva — ver migration
  // 20260815190000 — e a tela so espelha desabilitando o botao, sem nem
  // chamar o controller.
  it('dentro de hunt o controle fica bloqueado, com aviso', async () => {
    const poke = pokeDoJogador()
    useGameStateStore.setState({ team: [poke], currentMapId: 'lv_1_10_floresta' })
    render(<MovesetTable poke={poke} species={ESPECIE} />)

    expect(screen.getByText(/Saia da hunt/)).toBeTruthy()
    const botao = botaoUsar(nomeDoGolpe(poke.activeAbilities![0]))!
    expect(botao.disabled).toBe(true)

    await userEvent.click(botao)
    expect(setActiveAbilities).not.toHaveBeenCalled()
  })

  it('golpe que o POKE ainda nao aprendeu nao pode ser escolhido', () => {
    const poke = pokeDoJogador()
    useGameStateStore.setState({ team: [poke] })
    render(<MovesetTable poke={poke} species={ESPECIE} />)

    const naoAprendido = ESPECIE.abilities.find((a) => a.levelReq > NIVEL && getAbility(a.key))
    if (!naoAprendido) return // especie sem golpe acima do nivel de teste
    expect(botaoUsar(nomeDoGolpe(naoAprendido.key))).toBeNull()
  })

  describe('Ataque Basico e AOE de Nivel 50 — golpes normais, sem mecanismo proprio', () => {
    it('Ataque Basico aparece na tabela mesmo pro POKE nivel 60 (linha sintetica, sempre "aprendido")', () => {
      const poke = pokeDoJogador()
      useGameStateStore.setState({ team: [poke] })
      render(<MovesetTable poke={poke} species={ESPECIE} />)
      expect(screen.getByText(BASIC_ATTACK.name)).toBeTruthy()
    })

    it('marcar Ataque Basico usa setActiveAbilities (nunca toggleAbility) e respeita o cap de 4', async () => {
      const escolhidos = activeAbilitiesPadrao(ESPECIE, NIVEL).slice(0, 3)
      const poke = pokeDoJogador({ activeAbilities: escolhidos })
      useGameStateStore.setState({ team: [poke] })
      render(<MovesetTable poke={poke} species={ESPECIE} />)

      await userEvent.click(botaoUsar(BASIC_ATTACK.name)!)

      expect(toggleAbility).not.toHaveBeenCalled()
      expect(setActiveAbilities).toHaveBeenCalledTimes(1)
      const [uid, lista] = setActiveAbilities.mock.calls[0]
      expect(uid).toBe(poke.uid)
      expect(lista).toEqual([...escolhidos, BASIC_ATTACK.id])
    })

    it('AOE de Nivel 50 usa setActiveAbilities e conta pro cap de 4 igual a qualquer golpe', async () => {
      const aoe = typedAoeMoveKey(ESPECIE.type)
      const escolhidos = activeAbilitiesPadrao(ESPECIE, NIVEL).filter((k) => k !== aoe).slice(0, 3)
      const poke = pokeDoJogador({ activeAbilities: escolhidos })
      useGameStateStore.setState({ team: [poke] })
      render(<MovesetTable poke={poke} species={ESPECIE} />)

      await userEvent.click(botaoUsar(nomeDoGolpe(aoe))!)

      expect(toggleAbility).not.toHaveBeenCalled()
      const [, lista] = setActiveAbilities.mock.calls[0]
      expect(lista).toEqual([...escolhidos, aoe])
      expect(lista).toHaveLength(4)
    })

    it('4 slots cheios (incluindo Ataque Basico) recusa o AOE como quinto', async () => {
      const aoe = typedAoeMoveKey(ESPECIE.type)
      const escolhidos = [BASIC_ATTACK.id, ...activeAbilitiesPadrao(ESPECIE, NIVEL).filter((k) => k !== aoe).slice(0, 3)]
      const poke = pokeDoJogador({ activeAbilities: escolhidos })
      useGameStateStore.setState({ team: [poke] })
      render(<MovesetTable poke={poke} species={ESPECIE} />)

      await userEvent.click(botaoUsar(nomeDoGolpe(aoe))!)

      expect(setActiveAbilities).not.toHaveBeenCalled()
      expect(useToastStore.getState().toasts.some((t) => /Maximo de 4/.test(t.message))).toBe(true)
    })

    it('Ataque Basico tambem bloqueia dentro de hunt (mesma trava dos outros golpes)', async () => {
      const poke = pokeDoJogador()
      useGameStateStore.setState({ team: [poke], currentMapId: 'lv_1_10_floresta' })
      render(<MovesetTable poke={poke} species={ESPECIE} />)

      const botao = botaoUsar(BASIC_ATTACK.name)!
      expect(botao.disabled).toBe(true)
      await userEvent.click(botao)
      expect(setActiveAbilities).not.toHaveBeenCalled()
    })
  })
})
