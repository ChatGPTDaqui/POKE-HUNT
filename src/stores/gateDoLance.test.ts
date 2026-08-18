// O Modo Pesadelo, uma vez conquistado, NAO pode voltar a ficar trancado.
//
// BUG REAL REPRODUZIDO AO VIVO (2026-08-18): o jogador derrotava o Campeao
// Lance, o Modo Pesadelo abria, o servidor gravava em
// `players.unlocked_continents`... e o `merge` da hidratacao seguinte jogava
// 'nightmare' fora, TODA carga. Na tela: "Bloqueado — Derrote o Campeao Lance"
// nas 11 hunts, com a conquista registrada no banco e no Hall da Fama.
//
// A causa era `GRUPOS_LEGADOS` conter 'nightmare' — ele estava la porque no
// esquema antigo nascia aberto de graca, mas 'nightmare' TAMBEM e um dos dois
// grupos que o Lance concede hoje, e o filtro nao distingue os dois casos.
//
// Por que isso escapou tanto tempo: e INTERMITENTE. Quando havia catch-up
// offline logo apos a carga, a resposta do servidor sobrescrevia a store com a
// lista correta e o Pesadelo "voltava" sozinho — quem testasse depois de ficar
// um tempo fora nao via nada errado.
//
// O teste trabalha sobre as constantes de dado (nao sobre o `merge`, que e
// interno ao `persist`): e ali que a regra mora, e e ali que a regressao
// voltaria a ser escrita.
import { describe, expect, it } from 'vitest'

import { FAIXAS_INICIAIS, GRUPOS_DO_LANCE, GRUPOS_LEGADOS } from '@/data/biomas'

/** A mesma traducao que `gameStateStore.ts#merge` aplica na hidratacao. */
function traduzirNaCarga(gravados: string[]): string[] {
  return [...new Set([
    ...FAIXAS_INICIAIS,
    ...gravados.flatMap((c) => (
      c === 'kanto' ? GRUPOS_DO_LANCE : GRUPOS_LEGADOS.has(c) ? [] : [c]
    )),
  ])]
}

describe('gate do Campeao Lance sobrevive ao reload', () => {
  it('nenhum grupo que o Lance concede pode estar na lista de legados', () => {
    // A invariante de verdade, e a unica que impede a regressao de voltar por
    // outro caminho: o que o Lance da NAO pode ser o que a carga descarta.
    for (const grupo of GRUPOS_DO_LANCE) {
      expect(GRUPOS_LEGADOS.has(grupo), `${grupo} e concedido pelo Lance e nao pode ser legado`).toBe(false)
    }
  })

  it('quem derrotou o Lance continua com os dois grupos depois da carga', () => {
    const gravado = [...FAIXAS_INICIAIS, ...GRUPOS_DO_LANCE]
    const carregado = traduzirNaCarga(gravado)
    for (const grupo of GRUPOS_DO_LANCE) expect(carregado).toContain(grupo)
  })

  it('quem NAO derrotou o Lance nao ganha nada de graca', () => {
    const carregado = traduzirNaCarga([...FAIXAS_INICIAIS])
    for (const grupo of GRUPOS_DO_LANCE) expect(carregado).not.toContain(grupo)
  })

  it("save antigo com 'kanto' vira exatamente o que o Lance abre hoje", () => {
    const carregado = traduzirNaCarga(['johto', 'kanto'])
    for (const grupo of GRUPOS_DO_LANCE) expect(carregado).toContain(grupo)
    expect(carregado).not.toContain('kanto')
    expect(carregado).not.toContain('johto')
  })

  it('as faixas iniciais entram sempre, mesmo em save que nao as tinha', () => {
    const carregado = traduzirNaCarga([])
    for (const faixa of FAIXAS_INICIAIS) expect(carregado).toContain(faixa)
  })
})
