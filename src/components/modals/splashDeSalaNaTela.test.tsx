// @vitest-environment jsdom
//
// PH-395: o splash de chegada NA TELA.
//
// Tres contratos, e os tres foram pedidos explicitamente ou saem de uma decisao
// que custa se for esquecida:
//
//  1. ele diz o NOME do lugar — era isso que faltava (o toast que ele substitui
//     dizia, mas no mesmo canto e com a mesma duracao de "Item encontrado");
//  2. ele NAO desenha com janela do jogo aberta (pedido explicito);
//  3. ele sai depois de 4 segundos, e o relogio corre mesmo escondido — aviso de
//     chegada que aparece atrasado, depois de o jogador fechar o menu e ja ter
//     andado meia sala, informa a coisa errada.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import { SplashDeSala, DURACAO_DO_SPLASH_DE_SALA_MS } from './SplashDeSala'
import { splashDeSalaStore } from '@/stores/splashDeSalaVanilla'
import { useUiStore } from '@/stores/uiStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useWorldStore } from '@/stores/worldStore'
import type { SalaAtiva } from '@/engine/types'

/** `grass` existe em `SUB_BIOMA_POR_CHAVE` e se chama "Relvado". */
const SALA: SalaAtiva = { indice: 2, chave: 'grass', abates: 0, ciclos: 0 }
// PH-427: o estagio 1 tem 3 salas e cobre Lv 1-10 — a sala do fixture (indice
// 2) e a ULTIMA dele, e o splash diz "Sala 3/3".
const MAPA = { id: 'mata_e1', name: 'Mata 1', levelRange: [1, 10] }

beforeEach(() => {
  vi.useFakeTimers()
  splashDeSalaStore.getState().limpar()
  useUiStore.setState({
    viewportWidth: 1440, viewportHeight: 900, currentScreen: null,
    perfilOpen: false, perfilPublicoAlvo: null, analyzerOpen: false,
  } as never, false)
  usePokeProfileStore.setState({ open: null })
  useWorldStore.setState({ mapDef: MAPA } as never, false)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('splash de chegada em sala nova, na tela (PH-395)', () => {
  it('diz o nome do sub-bioma, a sala e a faixa de nivel dela', () => {
    splashDeSalaStore.getState().anunciarSala(SALA, false)
    render(<SplashDeSala />)

    const texto = document.body.textContent ?? ''
    expect(texto).toContain('Relvado')
    expect(texto).toContain('Nova área')
    expect(texto).toContain('Sala 3/3')
    // A faixa da SALA, nao a da hunt: e ela que sobe conforme o jogador avanca.
    expect(texto).toMatch(/Lv \d+-\d+/)
  })

  it('fechar o estagio troca o texto de cima', () => {
    splashDeSalaStore.getState().anunciarSala({ ...SALA, indice: 0, ciclos: 2 }, true)
    render(<SplashDeSala />)

    const texto = document.body.textContent ?? ''
    expect(texto).toContain('Estágio concluído')
    expect(texto).not.toContain('Nova área')
  })

  it('nao desenha nada quando ha janela do jogo aberta', () => {
    splashDeSalaStore.getState().anunciarSala(SALA, false)
    useUiStore.setState({ currentScreen: 'team' } as never, false)

    const { container } = render(<SplashDeSala />)
    expect(container.firstChild, 'o splash cobriu a janela aberta').toBeNull()
  })

  it('perfil de POKE aberto tambem esconde', () => {
    splashDeSalaStore.getState().anunciarSala(SALA, false)
    usePokeProfileStore.setState({
      open: { poke: {} as never, species: {} as never },
    } as never)

    const { container } = render(<SplashDeSala />)
    expect(container.firstChild).toBeNull()
  })

  it('sai da tela depois de 4 segundos', () => {
    splashDeSalaStore.getState().anunciarSala(SALA, false)
    render(<SplashDeSala />)
    expect(document.body.textContent).toContain('Relvado')

    vi.advanceTimersByTime(DURACAO_DO_SPLASH_DE_SALA_MS + 10)

    expect(splashDeSalaStore.getState().atual, 'o aviso ficou preso na tela').toBeNull()
  })

  it('o relogio corre mesmo escondido por janela aberta', () => {
    splashDeSalaStore.getState().anunciarSala(SALA, false)
    useUiStore.setState({ currentScreen: 'bag' } as never, false)
    render(<SplashDeSala />)

    vi.advanceTimersByTime(DURACAO_DO_SPLASH_DE_SALA_MS + 10)

    // Sem isso o aviso apareceria atrasado quando o jogador fechasse a Mochila —
    // anunciando uma chegada que aconteceu meia sala atras.
    expect(splashDeSalaStore.getState().atual).toBeNull()
  })
})
