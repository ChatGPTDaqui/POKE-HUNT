// Entrar numa hunt tem que FALAR quando recusa.
//
// Este teste existe por causa de uma sessao de diagnostico inteira perdida em
// 2026-08-18. O botao "Entrar" parou de funcionar e o sintoma era exatamente o
// de um clique que nao registra: nenhum aviso, nenhum request na aba de rede,
// nada no console. Foram gastas varias tentativas em cima da hipotese errada
// ("o painel re-renderiza por frame e engole o clique", que e um gotcha REAL
// deste projeto) antes de a causa aparecer — o POKE ativo estava desmaiado, e
// antes disso o slot ativo tinha ficado vazio.
//
// A licao que este arquivo tranca nao e sobre POKE desmaiado: e que
// `return false` sem aviso, num caminho que comeca em CLIQUE, e indistinguivel
// de UI quebrada. Recusa silenciosa nao quebra teste nenhum — por isso precisa
// de um teste proprio.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { controller } from './controller'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'

const HUNT = 'campo_aberto_faixa1'

function poke(hp: number) {
  const p = createPokeInstance(createRng(5), 'charmander', 20)
  return { ...p, hp }
}

function avisos(): string[] {
  return useToastStore.getState().toasts.map((t) => t.message)
}

describe('entrar na hunt nunca recusa em silencio', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
    useToastStore.setState({ toasts: [] })
  })

  it('slot ativo vazio: avisa em vez de nao fazer nada', async () => {
    // O caso que mais engana. O HUD continua desenhando o POKE antigo (ele vem
    // do `worldStore`, nao da equipe), entao a tela mostra um POKE saudavel em
    // campo enquanto `team[activeIndex]` e `undefined`.
    const gs = useGameStateStore.getState()
    gs.setActiveIndex(3)
    expect(useGameStateStore.getState().team[3]).toBeUndefined()

    expect(await controller.enterMap(HUNT)).toBe(false)
    expect(avisos().join(' ')).toMatch(/nenhum poke selecionado/i)
  })

  it('POKE desmaiado: avisa e diz o que fazer', async () => {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(poke(0))
    gs.setActiveIndex(0)

    expect(await controller.enterMap(HUNT)).toBe(false)
    expect(avisos().join(' ')).toMatch(/desmaiado/i)
  })

  it('POKE saudavel nao dispara nenhuma das duas recusas locais', async () => {
    // A prova de que os dois testes acima nao passam por acidente.
    //
    // NAO afirma `true`: sem servidor de verdade no vitest, `abrirSessaoDeHunt`
    // falha e `enterMap` devolve false por um motivo que nao tem nada a ver com
    // o que este arquivo cobre. O que importa aqui e que nenhuma das duas
    // recusas LOCAIS disparou — se um dia elas passarem a acusar POKE saudavel,
    // este teste cai.
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(poke(30))
    gs.setActiveIndex(0)

    await controller.enterMap(HUNT)
    expect(avisos().join(' ')).not.toMatch(/nenhum poke selecionado|desmaiado/i)
  })

  it('toda recusa devolve false — o menu so fecha quando entrou de verdade', async () => {
    // `HuntMenu#acionarHunt` fecha a tela SO com `true`. Se uma recusa
    // devolvesse `true`, o jogador cairia num combate que nao rende nada, que e
    // o bug que fez `enterMap` virar async.
    const gs = useGameStateStore.getState()
    gs.setActiveIndex(9)
    expect(await controller.enterMap(HUNT)).toBe(false)

    useGameStateStore.getState().addPokeToTeam(poke(0))
    useGameStateStore.getState().setActiveIndex(0)
    expect(await controller.enterMap(HUNT)).toBe(false)
  })
})
