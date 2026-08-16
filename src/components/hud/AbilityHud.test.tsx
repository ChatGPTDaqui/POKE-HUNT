// @vitest-environment jsdom
//
// A barra de golpes do POKE em campo. O que este teste tranca: ela mostra o que
// a IA PODE usar, e nao o learnset inteiro. Antes do limite de 4 ela crescia com
// o nivel — um POKE nivel 60 enchia a barra de golpes que nunca seriam
// escolhidos, e nada quebraria se a barra voltasse a fazer isso.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SPECIES, type PokeInstance } from '@/data/pokes'
import { getAbility, isDamagingAbility, BASIC_ATTACK } from '@/data/abilities'
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

// Cada slot e um <div> com titulo de duplo clique; contar por eles e mais
// estavel do que por icone (tipo sem arte cai num rotulo de 3 letras).
function slots(): HTMLElement[] {
  return screen.getAllByTitle(/duplo clique|Duplo clique/i)
}

beforeEach(() => { useWorldStore.setState({ player: null }) })
afterEach(cleanup)

describe('AbilityHud', () => {
  it('mostra so os 4 escolhidos + AOE + Ataque Basico, nao o learnset inteiro', () => {
    const poke = pokeEmCampo()
    porEmCampo(poke)
    render(<AbilityHud />)

    const esperado = [...golpesUtilizaveis(poke, ESPECIE, false), BASIC_ATTACK.id]
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

    // Sem nenhum golpe selecionado sobram o AOE de Nivel 50 e o Ataque Basico.
    expect(slots()).toHaveLength(2)
    expect(getAbility(typedAoeMoveKey(ESPECIE.type))).toBeTruthy()
  })

  it('sem POKE em campo nao desenha nada', () => {
    render(<AbilityHud />)
    expect(screen.queryAllByTitle(/duplo clique/i)).toHaveLength(0)
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

    // AOE de Nivel 50 + Ataque Basico + growl.
    expect(slots()).toHaveLength(3)
    // Golpe de status tambem ganha icone (mesmo esquema por tipo dos outros);
    // so o poder na faixa de baixo vira "—" em vez de um numero, ja que ele
    // nao tem power > 0.
    expect(screen.getByText('—')).toBeTruthy()
  })
})
