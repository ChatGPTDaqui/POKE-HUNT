// @vitest-environment jsdom
//
// A barra de golpes do POKE em campo. O que este teste tranca: ela mostra o que
// a IA PODE usar, e nao o learnset inteiro. Antes do limite de 4 ela crescia com
// o nivel — um POKE nivel 60 enchia a barra de golpes que nunca seriam
// escolhidos, e nada quebraria se a barra voltasse a fazer isso.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SPECIES, type PokeInstance } from '@/data/pokes'
import { getAbility, isDamagingAbility } from '@/data/abilities'
import { typedAoeMoveKey } from '@/data/typedAoeMoves'
import { activeAbilitiesPadrao, golpesUtilizaveis } from '@/data/activeAbilities'
import { useWorldStore } from '@/stores/worldStore'
import { AbilityHud } from './AbilityHud'

vi.mock('@/engine/controller', () => ({ controller: { toggleAbility: vi.fn() } }))

const ESPECIE = SPECIES.charmander
const NIVEL = 60

function pokeEmCampo(extra: Partial<PokeInstance> = {}): PokeInstance {
  return {
    uid: 'poke-em-campo',
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

function porEmCampo(poke: PokeInstance): void {
  useWorldStore.setState({
    player: { poke, cooldowns: {} } as unknown as ReturnType<typeof useWorldStore.getState>['player'],
  })
}

// Cada slot e um <button> rotulado "Detalhes de <golpe>"; contar por ele e mais
// estavel do que por icone (tipo sem arte cai num rotulo de 3 letras).
//
// PH-165: era `getAllByTitle(/duplo clique/)`, e o `title=` nativo saiu do slot
// — a dica do duplo clique virou uma linha da bolha do golpe. O `aria-label` e
// ancora melhor de qualquer jeito: ele existe nos DOIS regimes (o `title` se
// anulava no `coarse`) e e o que um leitor de tela realmente anuncia.
function slots(): HTMLElement[] {
  return screen.getAllByLabelText(/^Detalhes de /)
}

/** Mesma busca, mas devolve vazio em vez de estourar quando nao ha slot. */
function slotsOuVazio(): HTMLElement[] {
  return screen.queryAllByLabelText(/^Detalhes de /)
}

beforeEach(() => { useWorldStore.setState({ player: null }) })
afterEach(cleanup)

describe('AbilityHud', () => {
  it('mostra so os slots escolhidos, nao o learnset inteiro', () => {
    const poke = pokeEmCampo()
    porEmCampo(poke)
    render(<AbilityHud />)

    const esperado = golpesUtilizaveis(poke, ESPECIE, false)
      .map((id) => getAbility(id))
      .filter((a) => isDamagingAbility(a))

    expect(slots()).toHaveLength(esperado.length)

    // A guarda que importa: o POKE conhece MUITO mais do que isso.
    const conhecidosComDano = poke.unlockedAbilities.filter((k) => isDamagingAbility(getAbility(k)))
    expect(conhecidosComDano.length).toBeGreaterThan(esperado.length)
  })

  it('trocar a selecao troca o que a barra mostra', () => {
    const poke = pokeEmCampo({ activeAbilities: [] })
    porEmCampo(poke)
    render(<AbilityHud />)

    // Sem nenhum golpe selecionado a barra fica VAZIA: desde 2026-08-18 nem a
    // Explosao Elemental nem o Ataque Basico sao anexados de graca.
    // `slotsOuVazio` e nao `slots()`: a busca `getAll*` estoura quando nao acha
    // nada, e "nao achar nada" e exatamente o que este teste afirma.
    expect(slotsOuVazio()).toHaveLength(0)
    expect(getAbility(typedAoeMoveKey(ESPECIE.type))).toBeTruthy()
  })

  it('sem POKE em campo nao desenha nada', () => {
    render(<AbilityHud />)
    expect(slotsOuVazio()).toHaveLength(0)
  })

  // BUG REAL CORRIGIDO: a barra filtrava golpe de status fora (so mostrava
  // golpe com dano), entao escolher um como um dos 4 ativos o fazia "sumir"
  // da barra sem nenhum aviso. `growl` (status, Charmander nivel 1) prova que
  // ele agora ocupa slot igual a qualquer outro golpe escolhido.
  it('golpe de status escolhido ocupa slot na barra', () => {
    const growl = getAbility('growl')!
    expect(isDamagingAbility(growl)).toBe(false)
    const poke = pokeEmCampo({ activeAbilities: ['growl'] })
    porEmCampo(poke)
    render(<AbilityHud />)

    // So o growl: nada mais e anexado por fora dos slots.
    expect(slots()).toHaveLength(1)
    // Golpe de status tambem ganha icone (mesmo esquema por tipo dos outros);
    // so o poder na faixa de baixo vira "—" em vez de um numero, ja que ele
    // nao tem power > 0.
    expect(screen.getByText('—')).toBeTruthy()
  })
})

// O POKE que nao ataca. Antes desta leva a barra devolvia `null` no caso de
// escolha vazia: o jogador via o POKE parado em campo, sem golpe nenhum na tela
// e sem nenhuma mensagem — le como jogo travado, nao como consequencia de dois
// cliques na tela de golpes. `pickAbility` nao tem fallback pro jogador desde
// 2026-08-18 (o Ataque Basico so luta se ocupar um slot).
describe('AbilityHud — aviso de POKE sem golpe', () => {
  it('escolha vazia: avisa em vez de nao desenhar nada', () => {
    porEmCampo(pokeEmCampo({ activeAbilities: [] }))
    render(<AbilityHud />)

    expect(screen.getByRole('status').textContent).toMatch(/nao ataca/i)
    expect(screen.getByRole('status').textContent).toMatch(/Sem golpe escolhido/i)
    expect(slotsOuVazio()).toHaveLength(0)
  })

  it('slots cheios mas TODOS desligados: avisa tambem', () => {
    // O caso que nem a contagem "4/4" da tela de golpes denuncia — o slot
    // continua ocupado, so fora da rotacao.
    const escolhidos = activeAbilitiesPadrao(ESPECIE, NIVEL)
    const desligados = Object.fromEntries(escolhidos.map((k) => [k, true]))
    porEmCampo(pokeEmCampo({ activeAbilities: escolhidos, disabledAbilities: desligados }))
    render(<AbilityHud />)

    expect(screen.getByRole('status').textContent).toMatch(/desligados/i)
    // A barra continua desenhada: os slots existem, so estao apagados.
    expect(slots()).toHaveLength(escolhidos.length)
  })

  it('com pelo menos um golpe utilizavel nao ha aviso nenhum', () => {
    const escolhidos = activeAbilitiesPadrao(ESPECIE, NIVEL)
    const desligados = Object.fromEntries(escolhidos.slice(1).map((k) => [k, true]))
    porEmCampo(pokeEmCampo({ activeAbilities: escolhidos, disabledAbilities: desligados }))
    render(<AbilityHud />)

    expect(screen.queryByRole('status')).toBeNull()
  })
})
