// @vitest-environment jsdom
//
// PH-374: o slot de golpe no celular cabe o icone, e o "pronto" nao acende
// nada.
//
// Os dois defeitos que este arquivo tranca nao lancavam excecao e nao apareciam
// em nenhum log — so em medicao na tela:
//
// 1. `TAMANHO_SLOT.estreito` era `2.05em` (32,8px em 390px). A faixa de dano
//    ocupava 15,5px e a sigla de tipo repetido mais 11,5px: 82% do slot em
//    faixa opaca, com 5,8px sobrando pro icone do elemento. O encolhimento
//    tinha sido calibrado pra uma fileira de OITO slots, que nao existe mais
//    desde `MAX_ACTIVE_ABILITIES = 4`.
// 2. O anel branco de `ready` acendia em todo slot fora de recarga — ou seja,
//    no estado normal de um idle. Destaque que vale pro caso comum nao
//    destaca.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SPECIES, type PokeInstance } from '@/data/pokes'
import { getAbility } from '@/data/abilities'
import { MAX_ACTIVE_ABILITIES, activeAbilitiesPadrao } from '@/data/activeAbilities'
import { useWorldStore } from '@/stores/worldStore'
import { AbilityHud } from './AbilityHud'

vi.mock('@/engine/controller', () => ({ controller: { toggleAbility: vi.fn() } }))

// Fonte crua do componente. `import.meta.glob('?raw')` e nao `node:fs`: o
// tsconfig do app nao carrega os tipos de Node, e o teste roda pelo Vite —
// mesmo caminho de `hudNaoUsaTitleNativo.test.ts` e de `vfxTiras.test.ts`.
const FONTE_DO_ABILITY_HUD = (import.meta.glob('./AbilityHud.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>)['./AbilityHud.tsx']

const ESPECIE = SPECIES.charmander
const NIVEL = 60

function pokeEmCampo(): PokeInstance {
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
  }
}

beforeEach(() => { useWorldStore.setState({ player: null }) })
afterEach(cleanup)

describe('slot de golpe legivel (PH-374)', () => {
  it('nenhum slot acende anel de "pronto" — nem com todos os golpes prontos', () => {
    useWorldStore.setState({
      player: { poke: pokeEmCampo(), cooldowns: {} } as unknown as ReturnType<typeof useWorldStore.getState>['player'],
    })
    const { container } = render(<AbilityHud />)

    // Todos os golpes estao fora de recarga (`cooldowns: {}`), ou seja o caso em
    // que o anel antigo acendia em CADA slot.
    const comAnel = container.querySelectorAll('[class*="shadow-[0_0_0_2px"]')
    expect(comAnel).toHaveLength(0)
    expect(screen.getAllByLabelText(/^Detalhes de /).length).toBeGreaterThan(0)
  })

  it('a fileira nao passa de MAX_ACTIVE_ABILITIES — a premissa do slot pequeno', () => {
    // O comentario que justificava `2.05em` falava numa fileira de OITO slots
    // crescendo com o nivel. Se este numero voltar a subir, o calculo de
    // largura do slot precisa ser refeito, e nao herdado.
    expect(MAX_ACTIVE_ABILITIES).toBe(4)
  })

  it('o slot estreito nao volta a encolher abaixo do alvo minimo de toque', () => {
    // Leitura de FONTE porque o valor e uma constante de estilo, nao um
    // atributo que o DOM de teste expoe util (jsdom nao resolve `em`). O mesmo
    // padrao de `hudNaoUsaTitleNativo.test.ts`.
    const fonte = FONTE_DO_ABILITY_HUD
    const linha = fonte.match(/const TAMANHO_SLOT = \{[^}]*\}/)?.[0] ?? ''
    const estreito = Number(linha.match(/estreito:\s*'([\d.]+)em'/)?.[1] ?? 0)

    expect(estreito).toBeGreaterThan(0)
    // 1em = 16px no compacto (piso do clamp da `.hud-root`), entao o piso de
    // 44px do `.alvo-toque` do index.css e 2.75em.
    expect(estreito * 16).toBeGreaterThanOrEqual(44)
  })

  it('as tres faixas do slot usam leading apertado, senao voltam a comer 82% dele', () => {
    const fonte = FONTE_DO_ABILITY_HUD
    // Faixa de dano, sigla de tipo repetido e OFF.
    const faixas = fonte.match(/rounded-[tb]-\[\.32em\] bg-black\/70[^"]*/g) ?? []
    expect(faixas.length).toBe(3)
    for (const faixa of faixas) expect(faixa).toContain('leading-[1.1]')
  })
})
