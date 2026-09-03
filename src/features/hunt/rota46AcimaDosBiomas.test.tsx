// @vitest-environment jsdom
//
// PH-448 — a Rota 46 (Inicial) fica ACIMA dos 12 biomas.
//
// Ela e a PRIMEIRA cacada do jogo (Lv 1 a 2, so tipo Normal) e estava no mesmo
// balde das hunts de fim de jogo — as 11 BOSS, o Campeao Lance, o espelho do
// Pesadelo — na secao "Hunts especiais", ABAIXO do mapa dos 12 biomas. Quem
// acabava de escolher o inicial tinha que rolar a tela inteira, passando por
// todo o conteudo que nao pode jogar ainda, pra achar a unica hunt feita pra
// ele.
//
// O TESTE MEDE POSICAO NO DOM, e nao presenca. "A Rota 46 aparece" ja passava
// antes da mudanca; o que a issue pede e ORDEM, e ordem so se afirma comparando
// a posicao de dois nos. `compareDocumentPosition` e o que responde isso sem
// depender de contagem de pixel ou de layout.
//
// O outro risco coberto aqui e a DUPLICATA. A correcao extraiu o corpo do card
// para uma funcao chamada em duas posicoes; um filtro errado renderizaria a
// Rota 46 nas DUAS, e "aparece em cima" continuaria verde.
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { useUiStore } from '@/stores/uiStore'
import { MAPS } from '@/data/maps'
import { BIOMAS } from '@/data/biomas'
import { STARTER_HUNT_ID } from '@/data/huntSpawnOverrides'
import { HuntMenu } from './HuntMenu'

const INICIAL = MAPS[STARTER_HUNT_ID]

function comEquipe() {
  useGameStateStore.setState({
    team: [{
      uid: 'p1', speciesId: 'charmander', level: 10, hp: 30,
      stats: { hp: 30 }, isShiny: false, ivs: {},
    }],
    activeIndex: 0,
    unlockedMaps: Object.keys(MAPS),
    unlockedContinents: ['biomas', 'nightmare'],
    // Estagio 5 nos 12 biomas: sem isso o card do Lance diz "Bloqueado", que
    // nao muda nada aqui, mas deixa a tela mais parecida com a real.
    biomaProgress: Object.fromEntries(BIOMAS.map((b) => [b.chave, 5])),
  } as never)
}

/** `true` se `a` vem antes de `b` na ordem do documento. */
function vemAntes(a: Element, b: Element): boolean {
  // eslint-disable-next-line no-bitwise
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

/** Todos os nos cujo texto COMECA com o nome da hunt, do mais fundo pro topo. */
function ocorrenciasDe(nome: string): HTMLElement[] {
  return screen.queryAllByText((_, node) => node?.textContent?.startsWith(nome) === true)
    .filter((el) => el.className.includes('truncate') && el.className.includes('font-medium'))
}

beforeEach(() => {
  comEquipe()
  useUiStore.setState({ huntContinent: 'biomas', huntSearchTerm: '', huntType: 'all' } as never)
})
afterEach(() => { useWorldStore.setState({ mapDef: null } as never); cleanup() })

describe('a Rota 46 vem antes dos biomas', () => {
  it('o nome dela aparece ACIMA do rotulo "Biomas"', () => {
    render(<HuntMenu />)
    const rotuloBiomas = screen.getByText('Biomas')
    const [titulo] = ocorrenciasDe(INICIAL.name)
    expect(titulo, `nao achei o titulo do card de ${INICIAL.name}`).toBeTruthy()
    expect(
      vemAntes(titulo, rotuloBiomas),
      `${INICIAL.name} tem que vir ANTES do rotulo "Biomas"`,
    ).toBe(true)
  })

  it('e ACIMA do rotulo "Hunts especiais" tambem', () => {
    render(<HuntMenu />)
    const rotuloEspeciais = screen.getByText('Hunts especiais')
    const [titulo] = ocorrenciasDe(INICIAL.name)
    expect(vemAntes(titulo, rotuloEspeciais)).toBe(true)
  })

  it('aparece UMA vez, e nao duas', () => {
    // O risco direto de renderizar o mesmo card em duas posicoes: a Rota 46
    // ficaria em cima E dentro de "Hunts especiais", e o teste de ordem
    // passaria igual.
    render(<HuntMenu />)
    expect(ocorrenciasDe(INICIAL.name).length).toBe(1)
  })

  it('as outras hunts de cartao continuam DEPOIS do rotulo "Hunts especiais"', () => {
    // A correcao nao pode ter levado a lista inteira pra cima junto.
    render(<HuntMenu />)
    const rotuloEspeciais = screen.getByText('Hunts especiais')
    const lance = MAPS['boss_lance']
    const [tituloLance] = ocorrenciasDe(lance.name)
    expect(tituloLance, 'nao achei o card do Campeao Lance').toBeTruthy()
    expect(vemAntes(rotuloEspeciais, tituloLance)).toBe(true)
  })
})

describe('o card do topo obedece aos filtros', () => {
  it('a busca que nao casa com a Rota 46 esconde o card do topo', () => {
    // O card sai de `visibleMaps`, e nao de `MAPS`, exatamente por isso: um
    // card fixo que ignora o filtro ativo e um card que o jogador nao entende
    // por que continua ali.
    useUiStore.setState({ huntSearchTerm: 'zzz-nao-existe-nenhuma-hunt-assim' } as never)
    render(<HuntMenu />)
    expect(ocorrenciasDe(INICIAL.name).length).toBe(0)
  })

  it('a busca pelo nome dela mantem o card do topo', () => {
    useUiStore.setState({ huntSearchTerm: INICIAL.name } as never)
    render(<HuntMenu />)
    expect(ocorrenciasDe(INICIAL.name).length).toBe(1)
    // E com a busca casando SO ela, "Hunts especiais" nao deve nem aparecer.
    expect(screen.queryByText('Hunts especiais')).toBeNull()
  })
})
