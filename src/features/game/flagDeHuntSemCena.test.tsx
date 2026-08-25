// @vitest-environment jsdom
// PH-156 — flag de hunt ligada sem hunt na tela.
//
// `currentMapId` e o que o resto do jogo le como "estou numa cacada". Quando
// ele fica ligado com o Hospital na tela, a edicao dos 4 golpes no perfil some
// (`PokeStatDetail`: `podeEscolher = meu && !emHunt`) e nada desfaz isso — o
// unico caminho de volta era recarregar a pagina, porque o boot zera a flag
// quando nao da pra retomar. Dai o sintoma chegar como "so destrava com F5".
//
// Duas metades, e as duas tem caso aqui:
//
//  1. a CAUSA: `enterMap` gravava a flag antes de montar a cena, entao qualquer
//     falha no meio deixava o estado quebrado;
//  2. a RECONCILIACAO: ninguem observava a direcao "flag ligada, sem mapa" — o
//     observador que existia so cobria a oposta.
//
// O caso mais importante do arquivo e o ULTIMO: a reconciliacao NAO pode agir
// durante o boot, onde a flag ligada sem mapa e legitima (e a retomada de
// cacada, que roda antes de o jogo montar). Reconciliar ali mataria a hunt do
// jogador — e um teste que so provasse "limpa o estado quebrado" passaria feliz
// com essa regressao dentro.
import { describe, expect, it, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

import fonteDoController from '@/engine/controller.ts?raw'
import { buildHospitalWorld } from '@/engine/simulation'
import { createPokeInstance } from '@/data/pokes'
import { createRng } from '@/core/rng'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { useSaidaAoEncerrarSessao } from './hooks/useSaidaAoEncerrarSessao'

function pokeQualquer() {
  return createPokeInstance(createRng(5), 'charmander', 12)
}

/** Hospital na tela: mundo montado (`player` existe) e sem `mapDef`. */
function montarHospital() {
  const poke = pokeQualquer()
  useGameStateStore.setState({ team: [poke], activeIndex: 0 } as never, false)
  useWorldStore.getState().setWorld(buildHospitalWorld(poke, { x: 0, y: 0 }))
}

describe('a flag de hunt nao sobrevive sem cena (PH-156)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
    useWorldStore.setState({ player: null, mapDef: null } as never, false)
  })

  it('a reconciliacao zera a flag quando o Hospital esta na tela', () => {
    montarHospital()
    useGameStateStore.getState().setCurrentMapId('forest')
    // Anti-vacuo: sem isto, um `setCurrentMapId` que nunca gravou faria o
    // `expect` de baixo passar sem que nada tivesse sido reconciliado.
    expect(useGameStateStore.getState().currentMapId).toBe('forest')

    renderHook(() => useSaidaAoEncerrarSessao())

    expect(useGameStateStore.getState().currentMapId).toBeNull()
  })

  it('a flag ligada DEPOIS de o hook montar tambem e reconciliada', () => {
    // O caso real nao e o estado ja quebrado no mount: e ele nascendo com o
    // jogo aberto. Por isso o hook observa os dois stores, e nao so confere uma
    // vez na montagem.
    montarHospital()
    renderHook(() => useSaidaAoEncerrarSessao())

    useGameStateStore.getState().setCurrentMapId('forest')

    expect(useGameStateStore.getState().currentMapId).toBeNull()
  })

  it('NAO mexe na flag durante o boot, com o mundo ainda nao montado', () => {
    // A janela legitima: `retomarHuntSeHavia` roda ANTES de o jogo montar, com
    // `currentMapId` ja hidratado do banco e nenhum mundo em pe. Zerar aqui
    // jogaria fora a cacada que o jogador tinha — o oposto do que esta issue
    // quer. `player == null` e o que separa os dois estados.
    useWorldStore.setState({ player: null, mapDef: null } as never, false)
    useGameStateStore.getState().setCurrentMapId('forest')

    renderHook(() => useSaidaAoEncerrarSessao())

    expect(useGameStateStore.getState().currentMapId).toBe('forest')
  })

  it('NAO mexe na flag com uma hunt de verdade na tela', () => {
    // O outro lado do vacuo: se a reconciliacao disparasse com `mapDef`
    // presente, ela tiraria o jogador da cacada em que ele esta.
    montarHospital()
    useWorldStore.setState({ mapDef: { id: 'forest' } } as never, false)
    useGameStateStore.getState().setCurrentMapId('forest')

    renderHook(() => useSaidaAoEncerrarSessao())

    expect(useGameStateStore.getState().currentMapId).toBe('forest')
  })

  it('`enterMap` grava a flag DEPOIS de por o mundo em pe', () => {
    // Teste de FONTE, e nao de comportamento, de proposito: forcar `enterMap` a
    // falhar no meio exigiria mockar sessao, preload e montagem do mundo — tres
    // camadas — pra provar uma invariante de ORDEM que se le em duas linhas.
    //
    // A ordem e a correcao inteira: com a gravacao antes do `setWorld`, uma
    // excecao no meio deixa a flag ligada sem cena, que e o estado que os casos
    // acima existem pra limpar. Depois dele, esse estado nao chega a existir.
    // RECORTA O CORPO DE `enterMap` antes de medir. A primeira versao deste
    // caso procurava no arquivo inteiro, e `returnToHospital` — que vem antes e
    // tambem chama `setWorld(world)` — respondia pela busca: o `indexOf`
    // devolvia a posicao DELE, sempre menor que a da flag, e o teste passava
    // com a ordem errada dentro. Pego sabotando o codigo e vendo o verde.
    const inicio = fonteDoController.indexOf('async enterMap(')
    const fim = fonteDoController.indexOf('definirNomeDoTreinador', inicio)
    expect(inicio, 'nao achei `async enterMap(` no controller').toBeGreaterThan(0)
    expect(fim, 'nao achei o fim do bloco de `enterMap`').toBeGreaterThan(inicio)
    const enterMap = fonteDoController.slice(inicio, fim)

    const posSetWorld = enterMap.indexOf('setWorld(world)')
    const posFlag = enterMap.indexOf('setCurrentMapId(mapId)')
    expect(posSetWorld, 'nao achei o `setWorld(world)` dentro de enterMap').toBeGreaterThan(0)
    expect(posFlag, 'nao achei o `setCurrentMapId(mapId)` dentro de enterMap').toBeGreaterThan(0)
    expect(
      posFlag,
      '`setCurrentMapId(mapId)` voltou a rodar ANTES de `setWorld(world)` em `enterMap`. '
      + 'Entre os dois o mundo e montado, e uma falha ali deixa a flag de hunt ligada com o '
      + 'Hospital na tela — a trava que so o F5 desfazia (PH-156).',
    ).toBeGreaterThan(posSetWorld)
  })
})
