// @vitest-environment jsdom
//
// PH-244 — a tela de selecao de hunt nao dizia em qual hunt o jogador estava.
//
// O custo disso nao e so estetico. `controller.enterMap` no MESMO mapa abre uma
// sessao NOVA no servidor, remonta o mundo e chama `resetStats` — zera o painel
// de taxa de farm. Um botao escrito "Entrar" na hunt em que voce ja esta e um
// convite a esse clique, e nada na tela avisava.
//
// Sao DOIS canais de proposito: a borda do card (le de relance na lista
// rolando) e o selo escrito (responde "por que este esta diferente"). Mais a
// linha no cabecalho FIXO, que e a unica que sobrevive aos filtros — e o
// jogador chega aqui justamente pra procurar outra hunt, com a aba e a busca
// mexidas.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { useUiStore } from '@/stores/uiStore'
import { MAPS } from '@/data/maps'
import { parseEstagioId } from '@/data/estagios'
import { BIOMAS } from '@/data/biomas'
import { HuntMenu } from './HuntMenu'

// Duas hunts da MESMA faixa, pra as duas aparecerem na mesma aba sem filtro.
//
// PH-431: e SEM ESTAGIO. As 120 hunts de bioma sairam da lista de cards e
// viraram a trilha de dois niveis; o que sobra em cartao e a hunt inicial, as
// BOSS e o Lance. Pegar as duas primeiras de `MAPS` sem esse filtro escolhia
// duas hunts que a lista nao desenha mais.
const [PRIMEIRA, SEGUNDA] = Object.values(MAPS)
  .filter((m) => parseEstagioId(m.id) == null)
  .filter((m) => (m.continent ?? 'biomas') === 'biomas')
  .slice(0, 2)

function comEquipe() {
  useGameStateStore.setState({
    team: [{
      uid: 'p1', speciesId: 'charmander', level: 10, hp: 30,
      stats: { hp: 30 }, isShiny: false, ivs: {},
    }],
    activeIndex: 0,
    unlockedMaps: Object.keys(MAPS),
    unlockedContinents: ['biomas', 'nightmare'],
    // PH-432: o Campeao Lance ganhou gate de entrada (estagio 5 nos 12 biomas),
    // e ele e uma das duas hunts que sobraram na lista de cartoes. Sem
    // progresso, o botao dele diz "Bloqueado" e o teste nao acha "Entrar".
    biomaProgress: Object.fromEntries(BIOMAS.map((b) => [b.chave, 5])),
  } as never)
}

function entrarNaHunt(mapId: string | null) {
  useWorldStore.setState({ mapDef: mapId ? ({ ...MAPS[mapId], collisionGrid: null } as never) : null })
}

/**
 * O card da hunt na LISTA, achado pelo nome dela.
 *
 * Sobe do texto ate o ancestral que e o card. Precisa varrer todos os textos
 * que casam, e nao so o primeiro: o nome da hunt ativa aparece TAMBEM na linha
 * do cabecalho fixo, que nao tem card nenhum acima — pegar aquele primeiro era
 * o que fazia a busca falhar.
 */
function cardDa(nome: string): HTMLElement {
  const candidatos = screen.getAllByText((_, node) => node?.textContent?.startsWith(nome) === true)
  for (const candidato of candidatos) {
    let el: HTMLElement | null = candidato as HTMLElement
    while (el && !el.className.includes('rounded-[.7em]')) el = el.parentElement
    if (el) return el
  }
  throw new Error(`card de ${nome} nao encontrado`)
}

beforeEach(() => {
  comEquipe()
  useUiStore.setState({ huntContinent: 'biomas', huntSearchTerm: '', huntType: 'all' } as never)
})
afterEach(() => { entrarNaHunt(null); cleanup() })

describe('indicador de hunt ativa (PH-244)', () => {
  it('sem hunt aberta, nada e marcado — guarda anti-vacuo dos casos seguintes', () => {
    entrarNaHunt(null)
    render(<HuntMenu />)
    expect(screen.queryByText('EM CAÇADA')).toBeNull()
  })

  it('a hunt em andamento ganha selo, e so ela', () => {
    entrarNaHunt(PRIMEIRA.id)
    render(<HuntMenu />)
    // Dois: o do cabecalho fixo e o do card. Nenhum na outra hunt.
    expect(screen.getAllByText('EM CAÇADA')).toHaveLength(2)
    expect(within(cardDa(SEGUNDA.name)).queryByText('EM CAÇADA')).toBeNull()
  })

  it('a borda do card e o segundo canal — cor sozinha no texto nao le na lista rolando', () => {
    entrarNaHunt(PRIMEIRA.id)
    render(<HuntMenu />)
    expect(cardDa(PRIMEIRA.name).className).toContain('border-ok')
    expect(cardDa(SEGUNDA.name).className).toContain('border-n800')
  })

  it('o cabecalho diz onde voce esta mesmo com a hunt filtrada pra fora da lista', () => {
    // O ponto da linha no cabecalho: o jogador chega aqui pra procurar OUTRA
    // hunt, e o card da ativa nem aparece.
    entrarNaHunt(PRIMEIRA.id)
    useUiStore.setState({ huntSearchTerm: 'zzz-nao-existe' } as never)
    render(<HuntMenu />)
    expect(screen.getAllByText('EM CAÇADA')).toHaveLength(1)
    expect(screen.getByText(PRIMEIRA.name)).toBeTruthy()
  })

  it('"Ver na lista" traz o card de volta', async () => {
    entrarNaHunt(PRIMEIRA.id)
    useUiStore.setState({ huntSearchTerm: 'zzz-nao-existe' } as never)
    render(<HuntMenu />)
    await userEvent.click(screen.getByRole('button', { name: /Ver na lista/i }))
    expect(useUiStore.getState().huntSearchTerm).toBe(PRIMEIRA.name)
  })
})

describe('o botao da hunt ativa (PH-244)', () => {
  it('vira "Voltar ao campo" — e nao reabre a sessao', async () => {
    entrarNaHunt(PRIMEIRA.id)
    const fechar = vi.fn()
    useUiStore.setState({ closeScreen: fechar } as never)
    render(<HuntMenu />)

    const botao = within(cardDa(PRIMEIRA.name)).getByRole('button', { name: /Voltar ao campo/i })
    await userEvent.click(botao)
    expect(fechar).toHaveBeenCalled()
    // O que este teste realmente protege: `enterMap` no mesmo mapa abriria
    // sessao nova e zeraria o painel de taxa de farm. Se o botao voltar a ser
    // "Entrar", esta busca falha.
    expect(within(cardDa(PRIMEIRA.name)).queryByRole('button', { name: /^Entrar$/ })).toBeNull()
  })

  it('as outras hunts continuam com "Entrar"', () => {
    entrarNaHunt(PRIMEIRA.id)
    render(<HuntMenu />)
    expect(within(cardDa(SEGUNDA.name)).getByRole('button', { name: /Entrar/i })).toBeTruthy()
  })
})
