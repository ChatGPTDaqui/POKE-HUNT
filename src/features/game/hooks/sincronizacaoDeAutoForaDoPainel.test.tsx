// @vitest-environment jsdom
//
// PH-490: mudar uma automação chega ao servidor mesmo com o painel de
// Automações FECHADO.
//
// O DEFEITO QUE ISTO IMPEDE nasceria da própria PH-490. O efeito que chama
// `sincronizarAuto` vivia DENTRO de `AbaDeAutomacoes`, e isso funcionava
// enquanto todo controle de auto morava lá. A PH-490 tirou um deles — "Avançar
// de estágio ao concluir" foi pra trilha do bioma — e com o efeito preso ao
// painel o resultado seria:
//
//   o jogador liga o avanço na trilha, com Automações fechado
//   -> o `useEffect` do painel não está montado
//   -> `sincronizarAuto` nunca roda
//   -> a tela mostra ligado e o servidor continua com o valor velho
//
// E o servidor LÊ essa config na simulação. O efeito prático seria o estágio
// repetindo para sempre com o jogador achando que mandou avançar. Sem erro, sem
// log, sem teste vermelho — a mesma família da PH-492, que acabou de custar 24h
// de produção.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { act } from 'react'

import fonteDoJogoCarregado from '@/features/game/components/JogoCarregado.tsx?raw'
import fonteDoAutoPanel from '@/components/auto/AutoPanel.tsx?raw'

const sincronizarAuto = vi.fn()
vi.mock('@/data/remote/autoridade', () => ({
  sincronizarAuto: () => sincronizarAuto(),
}))

const { useSincronizarAuto } = await import('./useSincronizarAuto')
const { useGameStateStore } = await import('@/stores/gameStateStore')

/** O menor consumidor possível: só monta o hook. */
function Montado() {
  useSincronizarAuto()
  return null
}

afterEach(cleanup)

describe('a sincronização de auto não depende do painel (PH-490)', () => {
  beforeEach(() => { sincronizarAuto.mockClear() })

  it('o primeiro disparo é ignorado — ele é o estado chegando do servidor', () => {
    // Sem isto, todo boot devolveria ao servidor os mesmos valores que acabaram
    // de vir dele.
    render(<Montado />)
    expect(sincronizarAuto).not.toHaveBeenCalled()
  })

  it('mudar um toggle sincroniza, com o painel de Automações fora da árvore', () => {
    // A árvore tem SÓ o hook — nenhum componente do painel. É exatamente o
    // cenário do jogador que mexe no toggle pela trilha.
    render(<Montado />)
    act(() => { useGameStateStore.getState().setAutoToggle('avancarDeEstagio', true) })
    expect(sincronizarAuto).toHaveBeenCalledTimes(1)

    act(() => { useGameStateStore.getState().setAutoToggle('autoCatch', true) })
    expect(sincronizarAuto).toHaveBeenCalledTimes(2)
  })

  it('UMA mudança dispara UMA sincronização', () => {
    // Dois pontos de montagem dobrariam o request a cada clique — e
    // `sincronizarAuto` manda o batch completo, então seriam dois requests
    // iguais. Este caso falha se alguém remontar o hook noutro lugar sem tirar
    // este.
    render(<Montado />)
    act(() => { useGameStateStore.getState().setAutoToggle('autoPot', false) })
    expect(sincronizarAuto).toHaveBeenCalledTimes(1)
  })
})

// O CONTRATO DE MONTAGEM, LIDO NO FONTE.
//
// Montar duas vezes dobra a sincronização e montar zero vezes a desliga, e
// nenhum dos dois quebra teste de unidade — o hook em si continua correto. O
// que importa é QUEM o monta, e isso é estrutural e legível.
describe('quem monta o hook (PH-490)', () => {
  it('`JogoCarregado` monta, e uma vez só', () => {
    expect(fonteDoJogoCarregado).toContain('useSincronizarAuto()')
    expect(fonteDoJogoCarregado.split('useSincronizarAuto()').length - 1).toBe(1)
  })

  it('o painel de Automações NÃO sincroniza mais por conta própria', () => {
    // Se o efeito voltar pra lá sem sair daqui, cada mudança vira dois
    // requests idênticos enquanto o painel estiver aberto.
    expect(fonteDoAutoPanel, 'o efeito de sync voltou pro painel')
      .not.toContain('sincronizarAuto()')
  })
})
