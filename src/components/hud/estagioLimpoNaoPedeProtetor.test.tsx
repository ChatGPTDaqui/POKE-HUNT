// @vitest-environment jsdom
//
// PH-474: em estagio JA LIMPO o chip da sala mandava derrotar um Guardian que
// nao existe, e escondia o botao de avanco.
//
// COMO ISSO ACONTECIA. A PH-428 fez estagio limpo parar de repor protetor
// (Guardian e Lord existem pra travar a PRIMEIRA limpeza; num estagio fechado
// seriam so pedagio). O motor sabe disso: `salaDeveProtetor` olha
// `estagioJaLimpo` antes de qualquer coisa. O chip NAO sabia — ele reescrevia a
// regra a mao, sem esse campo:
//
//     travadaPeloProtetor = tipoDeProtetor != null && !protetorResolvido
//
// `protetorDaSala` e pura e continua respondendo 'guardian'/'lord' pra qualquer
// sala de bioma, e `protetorResolvido` nunca sobe (nenhum protetor nasce pra ser
// resolvido). Resultado, com a quota fechada num estagio limpo:
//
//   - "Derrote o Guardião" apontando pra um POKE que nao esta em campo;
//   - `podeAvancarManual` falso, entao o botao "Próximo Nível" nunca aparecia —
//     mesmo com o servidor aceitando o avanco.
//
// E o pior caminho: com o toggle de avanco manual ligado, `observarQuotaDeSala`
// sai cedo e nem flush extra e pedido. A sala fica em 30/30 sem saida visivel.
//
// A MESMA FORMA DA PH-429/430: a pergunta existia duas vezes e a segunda copia
// divergiu. Agora o chip chama `salaDeveProtetor` do motor.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import { SalaChip } from './SalaChip'
import { useWorldStore } from '@/stores/worldStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useUiStore } from '@/stores/uiStore'
import { ABATES_COMUNS_POR_SALA, ABATES_POR_SALA } from '@/data/biomas'

const MAPA = { id: 'mata_e1', name: 'Mata I', levelRange: [1, 30] }
/** `grass` fica num bioma de verdade, entao `protetorDaSala` responde 'guardian'. */
const SALA = { indice: 2, chave: 'grass', abates: ABATES_POR_SALA, ciclos: 0 }

function montar(mundo: Record<string, unknown>) {
  useWorldStore.setState({
    sala: SALA,
    mapDef: MAPA,
    salaSobAutoridade: false,
    salaCountdownRemaining: null,
    protetorResolvido: false,
    estagioJaLimpo: false,
    ...mundo,
  } as never, false)
  render(<SalaChip />)
  return document.body.textContent ?? ''
}

describe('estagio limpo nao pede protetor na tela (PH-474)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
    useUiStore.setState({ viewportWidth: 1440, viewportHeight: 900 } as never, false)
    useWorldStore.setState({ sala: null, mapDef: null, player: null } as never, false)
  })
  afterEach(cleanup)

  it('estagio NAO limpo com protetor de pe: manda derrotar (guarda anti-vacuo)', () => {
    // Sem este caso, os dois abaixo passariam com o chip mudo por qualquer
    // motivo — inclusive por nao renderizar nada.
    expect(montar({ estagioJaLimpo: false })).toContain('Derrote o')
  })

  it('estagio JA LIMPO nao manda derrotar protetor nenhum', () => {
    const texto = montar({ estagioJaLimpo: true })
    expect(texto, 'pede pra derrotar um protetor que nao vai nascer').not.toContain('Derrote o')
  })

  it('estagio JA LIMPO com avanco manual ligado OFERECE o botao de avancar', () => {
    useGameStateStore.getState().setAutoToggle('avancoManualDeSala', true)
    const texto = montar({ estagioJaLimpo: true })
    expect(texto, 'o botao de avanco sumiu num estado que o servidor aceita')
      .toContain('Próximo Nível')
  })

  it('estagio NAO limpo com protetor de pe NAO oferece o botao', () => {
    // O outro lado da regra: o botao continua escondido onde o servidor
    // recusaria o avanco. Um botao que da erro e pior que botao nenhum.
    useGameStateStore.getState().setAutoToggle('avancoManualDeSala', true)
    const texto = montar({ estagioJaLimpo: false })
    expect(texto).not.toContain('Próximo Nível')
  })

  it('em estagio limpo a quota volta a ser os 30 comuns (PH-473)', () => {
    // Sem protetor nao ha 30o abate de chefe: a sala so fecha nos 30 comuns.
    // Com 29 a quota esta ABERTA, e o botao de avanco nao pode aparecer.
    useGameStateStore.getState().setAutoToggle('avancoManualDeSala', true)
    const texto = montar({
      estagioJaLimpo: true,
      sala: { ...SALA, abates: ABATES_COMUNS_POR_SALA },
    })
    expect(texto).not.toContain('Próximo Nível')
  })
})
