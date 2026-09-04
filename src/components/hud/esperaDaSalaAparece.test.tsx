// @vitest-environment jsdom
//
// PH-386: a espera pela sala nova para de ser silenciosa.
//
// "30/30" tem QUATRO estados, e ate esta issue so tres apareciam na tela:
//
//   1. protetor vivo          -> "Derrote o Guardião" (PH-209/291)
//   2. avanco manual ligado   -> botao "Próximo Nível" (PH-180)
//   3. transicao em andamento -> overlay "Entrando em nova área"
//   4. esperando o servidor   -> NADA
//
// O (4) e o caso NORMAL de toda troca de sala sob autoridade, nao uma borda:
// medido em `scripts/harness/troca-de-sala-sob-autoridade.mjs`, 48 trocas em 8
// sementes deram mediana de 33,0s parado com a barra cheia e pior caso de 243s.
// Barra cheia que nao anda, sem explicacao, e o relato que abriu a issue — "ao
// completar os 30 a sala nao esta trocando".
//
// O que este arquivo tranca e a EXCLUSIVIDADE dos quatro estados. Cada um deles
// ligado por acidente junto de outro entrega duas mensagens contraditorias no
// mesmo canto da tela, e nenhuma combinacao dessas da erro.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import { SalaChip } from './SalaChip'
import { useWorldStore } from '@/stores/worldStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useUiStore } from '@/stores/uiStore'
import { ABATES_POR_SALA } from '@/data/biomas'

const MAPA = { id: 'mata_e1', name: 'Mata I', levelRange: [1, 30] }
/** `grass` fica no bioma campo_aberto, que pede protetor — sala 3 pede Guardian. */
const SALA_CHEIA = { indice: 2, chave: 'grass', abates: ABATES_POR_SALA, ciclos: 0 }
const AVISO = 'Preparando a próxima área'

function montar(mundo: Record<string, unknown>) {
  useWorldStore.setState({
    sala: SALA_CHEIA,
    mapDef: MAPA,
    salaSobAutoridade: true,
    salaCountdownRemaining: null,
    protetorResolvido: true,
    ...mundo,
  } as never, false)
  render(<SalaChip />)
  return document.body.textContent ?? ''
}

describe('a espera pela sala nova aparece na tela (PH-386)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
    useUiStore.setState({ viewportWidth: 1440, viewportHeight: 900 } as never, false)
    useWorldStore.setState({ sala: null, mapDef: null, player: null } as never, false)
  })
  afterEach(cleanup)

  it('quota fechada, protetor resolvido e nenhuma transicao: avisa que a area vem', () => {
    expect(montar({})).toContain(AVISO)
  })

  it('quota ABERTA nao avisa nada — ainda ha o que matar', () => {
    const texto = montar({ sala: { ...SALA_CHEIA, abates: ABATES_POR_SALA - 1 } })
    expect(texto).not.toContain(AVISO)
  })

  it('protetor vivo manda derrotar o protetor, e NAO diz que esta esperando', () => {
    const texto = montar({ protetorResolvido: false })
    expect(texto).toContain('Derrote o')
    expect(texto, 'duas mensagens contraditorias no mesmo canto').not.toContain(AVISO)
  })

  it('transicao em andamento nao avisa — o overlay de area nova ja esta na tela', () => {
    const texto = montar({ salaCountdownRemaining: 3 })
    expect(texto).not.toContain(AVISO)
  })

  it('jogo local (sem autoridade) nao avisa — ali a troca e imediata', () => {
    const texto = montar({ salaSobAutoridade: false })
    expect(texto).not.toContain(AVISO)
  })

  // O caso "com avanco manual ligado quem esta sendo esperado e o CLIQUE" saiu
  // na PH-493: o toggle e o botao "Próximo Nível" nao existem mais, entao
  // "30/30 parado" passou a ter uma causa so — o servidor — e e ela que os
  // casos acima medem.
})
