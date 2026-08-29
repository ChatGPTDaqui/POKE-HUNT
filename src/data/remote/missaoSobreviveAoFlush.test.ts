// PH-265 — "clico em reivindicar e aparece 'missao ja reivindicada'".
//
// A CAUSA, e ela nao estava na RPC. `carregarEstado` (authority/src/progresso.ts)
// monta o snapshot do jogador com `missoesReivindicadas: []` de proposito —
// missao nao entra na resimulacao de combate, entao a rota nao le a tabela. Esse
// estado e aplicado no cliente por `setState`, e a lista vazia SOBRESCREVIA a
// local: bastava um flush (de 30 em 30 segundos) pra a tela de Tasks voltar a
// mostrar como disponivel uma missao ja reivindicada. O jogador clicava, e ai
// sim a RPC — que le a tabela de verdade — respondia "Missao ja reivindicada".
//
// O ouro da primeira reivindicacao tinha sido pago; o que se perdia era a marca
// na tela. Medido no banco de producao no dia da issue: uma linha em
// `player_missoes_reivindicadas` (NORMAL/rattata) para o jogador que relatou.
//
// Este arquivo tranca a uniao nos TRES caminhos de `aplicarEstadoDoServidor`,
// porque cada um monta o `setState` do seu jeito e era possivel consertar um e
// esquecer os outros dois — o sintoma so aparece 30 segundos depois, longe do
// clique.
import { describe, expect, it, beforeEach, vi } from 'vitest'

import { useGameStateStore, type GameStateData } from '@/stores/gameStateStore'
import { aplicarEstadoDoServidor } from './autoridade'

vi.mock('./servidor', async (importOriginal) => {
  const real = await importOriginal<typeof import('./servidor')>()
  return { ...real, servidorAtivo: () => true }
})

const CHAVE = 'NORMAL:rattata'

/** O estado que o servidor devolve — com a lista de missoes SEMPRE vazia. */
function estadoDoServidor(patch: Partial<GameStateData> = {}): GameStateData {
  const base = useGameStateStore.getState()
  return {
    ...base,
    missoesReivindicadas: {},
    ...patch,
  } as GameStateData
}

describe('missao reivindicada sobrevive ao flush (PH-265)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
    useGameStateStore.getState().setMissaoReivindicada(CHAVE)
    expect(useGameStateStore.getState().missoesReivindicadas[CHAVE]).toBe(true)
  })

  it('estado COMPLETO (/estado, /sessao/abrir) nao apaga a marca', () => {
    aplicarEstadoDoServidor(estadoDoServidor(), false)
    expect(useGameStateStore.getState().missoesReivindicadas[CHAVE]).toBe(true)
  })

  it('flush PARCIAL com a mochila fora de memoria nao apaga a marca', () => {
    // Caminho comum: a Mochila so e carregada quando o jogador abre a tela.
    aplicarEstadoDoServidor(estadoDoServidor({ bagPokes: [] }), true)
    expect(useGameStateStore.getState().missoesReivindicadas[CHAVE]).toBe(true)
  })

  it('a marca que o servidor mandar SOMA com a local, nao substitui', () => {
    // Hoje o servidor manda sempre vazio; se um dia passar a mandar a lista
    // cheia, os dois lados tem que somar. A chave so entra — `setMissaoReivindicada`
    // nunca remove —, entao uniao e o unico resultado correto.
    aplicarEstadoDoServidor(estadoDoServidor({
      missoesReivindicadas: { 'FIRE:charmander': true },
    }), true)

    const depois = useGameStateStore.getState().missoesReivindicadas
    expect(depois[CHAVE]).toBe(true)
    expect(depois['FIRE:charmander']).toBe(true)
  })

  it('o resto do estado continua vindo do servidor', () => {
    // O contrato negativo: a protecao e SO da lista de missoes. Se ela virasse
    // "preserva o local", a regra "a verdade vem do servidor" cairia junto.
    aplicarEstadoDoServidor(estadoDoServidor({
      wallet: { gold: 12345, diamonds: 7 },
    }), false)

    expect(useGameStateStore.getState().wallet.gold).toBe(12345)
    expect(useGameStateStore.getState().missoesReivindicadas[CHAVE]).toBe(true)
  })
})
