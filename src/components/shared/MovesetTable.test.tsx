// @vitest-environment jsdom
//
// A selecao dos 4 golpes ativos, pela TELA. O resto da Leva A ja e coberto por
// teste de dado (activeAbilities.test.ts) e pela RPC no banco; o que so existe
// aqui e a fiacao: clique -> controller -> acao, mais as condicoes que
// escondem/desabilitam o controle (POKE que nao e seu, golpe nao aprendido,
// dentro de hunt — trava reintroduzida, ver os testes de hunt abaixo).
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
  // `getAllByText` e nao `getByText`: o nome do golpe aparece TAMBEM na fila de
  // ordem de uso (chips no cabecalho), que nao e um grid — a linha da tabela e
  // a unica ocorrencia com ancestral `grid`.
  for (const rotulo of screen.getAllByText(nome)) {
    const linha = rotulo.closest('div[class*="grid"]')
    if (linha) return linha as HTMLElement
  }
  throw new Error(`linha nao encontrada para ${nome}`)
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

  it('mostra a ORDEM (1/2/3/4) na coluna Usar, nao so um check — reflete o indice em activeAbilities', () => {
    const poke = pokeDoJogador()
    useGameStateStore.setState({ team: [poke] })
    render(<MovesetTable poke={poke} species={ESPECIE} />)

    poke.activeAbilities!.forEach((key, i) => {
      expect(botaoUsar(nomeDoGolpe(key))?.textContent).toBe(String(i + 1))
    })
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

    const deFora = poke.unlockedAbilities.find(
      (k) => !poke.activeAbilities!.includes(k) && k !== typedAoeMoveKey(ESPECIE.type),
    )!
    await userEvent.click(botaoUsar(nomeDoGolpe(deFora))!)

    expect(setActiveAbilities).not.toHaveBeenCalled()
    expect(useToastStore.getState().toasts.some((t) => /Maximo de 4/.test(t.message))).toBe(true)
  })

  it('com slot livre, marcar ACRESCENTA sem derrubar os outros', async () => {
    const escolhidos = activeAbilitiesPadrao(ESPECIE, NIVEL).slice(0, 2)
    const poke = pokeDoJogador({ activeAbilities: escolhidos })
    useGameStateStore.setState({ team: [poke] })
    render(<MovesetTable poke={poke} species={ESPECIE} />)

    const deFora = poke.unlockedAbilities.find(
      (k) => !escolhidos.includes(k) && k !== typedAoeMoveKey(ESPECIE.type),
    )!
    await userEvent.click(botaoUsar(nomeDoGolpe(deFora))!)

    const [, lista] = setActiveAbilities.mock.calls[0]
    expect(lista).toEqual([...escolhidos, deFora])
  })

  // Trava reintroduzida a pedido do usuario (revertendo a leva anterior, que a
  // tinha removido a pedido DELE tambem): build fixo durante o combate. A
  // RPC (`definir_golpes_ativos`/`alternar_habilidade`) recusa com sessao
  // viva — ver migration 20260815190000 — e a tela so espelha desabilitando o
  // botao, sem nem chamar o controller.
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

  it('a Explosao Elemental ocupa slot como qualquer outro golpe', async () => {
    // Um slot livre de proposito: com os 4 cheios `alternar` recusa e so mostra
    // o aviso de teto, que e outro caminho (ja coberto noutro teste).
    const poke = pokeDoJogador({ activeAbilities: ['ember'] })
    useGameStateStore.setState({ team: [poke] })
    render(<MovesetTable poke={poke} species={ESPECIE} />)

    const aoe = nomeDoGolpe(typedAoeMoveKey(ESPECIE.type))
    const botao = botaoUsar(aoe)!
    // Fora dos escolhidos por padrao (o default pega os 4 de maior dano do
    // learnset), entao a celula comeca VAZIA — e clicar ADICIONA a fila, em vez
    // de chamar o liga/desliga que ela usava quando ficava fora dos slots.
    expect(botao.className).not.toContain('bg-primary')

    await userEvent.click(botao)
    expect(toggleAbility).not.toHaveBeenCalled()
    expect(setActiveAbilities).toHaveBeenCalled()
  })

  it('AOE de Nivel 50 tambem bloqueia dentro de hunt (mesma trava do slot-de-4)', async () => {
    const poke = pokeDoJogador()
    useGameStateStore.setState({ team: [poke], currentMapId: 'lv_1_10_floresta' })
    render(<MovesetTable poke={poke} species={ESPECIE} />)

    const botao = botaoUsar(nomeDoGolpe(typedAoeMoveKey(ESPECIE.type)))!
    expect(botao.disabled).toBe(true)
    await userEvent.click(botao)
    expect(toggleAbility).not.toHaveBeenCalled()
  })

  it('AOE desligado (disabledAbilities) aparece desmarcado', () => {
    const aoeKey = typedAoeMoveKey(ESPECIE.type)
    const poke = pokeDoJogador({ disabledAbilities: { [aoeKey]: true } })
    useGameStateStore.setState({ team: [poke] })
    render(<MovesetTable poke={poke} species={ESPECIE} />)

    expect(botaoUsar(nomeDoGolpe(aoeKey))?.className).not.toContain('bg-primary')
  })

  it('golpe que o POKE ainda nao aprendeu nao pode ser escolhido', () => {
    const poke = pokeDoJogador()
    useGameStateStore.setState({ team: [poke] })
    render(<MovesetTable poke={poke} species={ESPECIE} />)

    const naoAprendido = ESPECIE.abilities.find((a) => a.levelReq > NIVEL && getAbility(a.key))
    if (!naoAprendido) return // especie sem golpe acima do nivel de teste
    expect(botaoUsar(nomeDoGolpe(naoAprendido.key))).toBeNull()
  })

  describe('Ataque Basico — golpe comum, ocupa um dos 4 slots', () => {
    it('aparece so pro POKE que e seu', () => {
      render(<MovesetTable poke={pokeDoJogador()} species={ESPECIE} />)
      expect(screen.queryByText(BASIC_ATTACK.name)).toBeNull()
    })

    it('clicar poe/tira da fila via setActiveAbilities (nunca toggleAbility)', async () => {
      const poke = pokeDoJogador({ activeAbilities: ['ember'] })
      useGameStateStore.setState({ team: [poke] })
      render(<MovesetTable poke={poke} species={ESPECIE} />)

      const botao = botaoUsar(BASIC_ATTACK.name)!
      // Fora da escolha, entao a celula comeca vazia.
      expect(botao.className).not.toContain('bg-primary')
      await userEvent.click(botao)
      expect(toggleAbility).not.toHaveBeenCalled()
      expect(setActiveAbilities).toHaveBeenCalled()
    })

    it('tambem bloqueia dentro de hunt (mesma trava dos outros golpes)', async () => {
      const poke = pokeDoJogador()
      useGameStateStore.setState({ team: [poke], currentMapId: 'lv_1_10_floresta' })
      render(<MovesetTable poke={poke} species={ESPECIE} />)

      const botao = botaoUsar(BASIC_ATTACK.name)!
      expect(botao.disabled).toBe(true)
      await userEvent.click(botao)
      expect(toggleAbility).not.toHaveBeenCalled()
    })
  })
})

// A ORDEM dos slots e a rotacao de combate (`pickAbilityDaFila` percorre
// `activeAbilities` do 1o ao ultimo). Antes desta leva nao havia como
// reordenar: a coluna Usar so acrescenta no fim e remove, entao pôr um golpe em
// 1o custava desmarcar os quatro e remarcar na ordem — oito cliques e oito
// chamadas de rede, cada uma podendo falhar sozinha.
describe('MovesetTable — reordenar a fila', () => {
  function setaDe(nome: string, direcao: 'Subir' | 'Descer'): HTMLButtonElement {
    return screen.getByLabelText(new RegExp(`${direcao} ${nome}`, 'i')) as HTMLButtonElement
  }

  it('subir um golpe manda a lista na ordem nova, numa chamada so', async () => {
    const escolhidos = activeAbilitiesPadrao(ESPECIE, NIVEL)
    const poke = pokeDoJogador({ activeAbilities: escolhidos })
    useGameStateStore.setState({ team: [poke] })
    render(<MovesetTable poke={poke} species={ESPECIE} />)

    await userEvent.click(setaDe(nomeDoGolpe(escolhidos[1]), 'Subir'))

    expect(setActiveAbilities).toHaveBeenCalledTimes(1)
    const [, lista] = setActiveAbilities.mock.calls[0]
    expect(lista).toEqual([escolhidos[1], escolhidos[0], ...escolhidos.slice(2)])
  })

  it('descer faz o simetrico', async () => {
    const escolhidos = activeAbilitiesPadrao(ESPECIE, NIVEL)
    const poke = pokeDoJogador({ activeAbilities: escolhidos })
    useGameStateStore.setState({ team: [poke] })
    render(<MovesetTable poke={poke} species={ESPECIE} />)

    await userEvent.click(setaDe(nomeDoGolpe(escolhidos[0]), 'Descer'))

    const [, lista] = setActiveAbilities.mock.calls[0]
    expect(lista).toEqual([escolhidos[1], escolhidos[0], ...escolhidos.slice(2)])
  })

  it('as pontas da fila nao tem pra onde ir', () => {
    const escolhidos = activeAbilitiesPadrao(ESPECIE, NIVEL)
    const poke = pokeDoJogador({ activeAbilities: escolhidos })
    useGameStateStore.setState({ team: [poke] })
    render(<MovesetTable poke={poke} species={ESPECIE} />)

    expect(setaDe(nomeDoGolpe(escolhidos[0]), 'Subir').disabled).toBe(true)
    expect(setaDe(nomeDoGolpe(escolhidos.at(-1)!), 'Descer').disabled).toBe(true)
  })

  it('dentro de hunt reordenar fica bloqueado, como o resto da tela', async () => {
    const escolhidos = activeAbilitiesPadrao(ESPECIE, NIVEL)
    const poke = pokeDoJogador({ activeAbilities: escolhidos })
    useGameStateStore.setState({ team: [poke], currentMapId: 'mata_faixa1' })
    render(<MovesetTable poke={poke} species={ESPECIE} />)

    const seta = setaDe(nomeDoGolpe(escolhidos[1]), 'Subir')
    expect(seta.disabled).toBe(true)
    await userEvent.click(seta)
    expect(setActiveAbilities).not.toHaveBeenCalled()
  })

  it('a tela diz que a ordem e a ordem de uso', () => {
    const poke = pokeDoJogador()
    useGameStateStore.setState({ team: [poke] })
    render(<MovesetTable poke={poke} species={ESPECIE} />)
    expect(screen.getByText(/Ordem de uso/i)).toBeTruthy()
  })
})
