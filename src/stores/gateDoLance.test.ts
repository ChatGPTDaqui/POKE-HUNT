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

import {
  GRUPOS_INICIAIS, GRUPOS_DO_LANCE, GRUPOS_LEGADOS, traduzirGruposLiberados,
} from '@/data/biomas'

// PH-447: ESTE ARQUIVO COPIAVA A TRADUCAO, E A COPIA CUSTOU UMA PRODUCAO
// TRANCADA.
//
// Aqui existia uma `traduzirNaCarga` local — a formula do `merge` reescrita a
// mao, com o comentario "a mesma traducao que gameStateStore.ts#merge aplica na
// hidratacao". Os cinco casos abaixo passavam contra a copia, e a copia estava
// certa. O que estava errado era o codigo que este arquivo nao executava:
// `remote/playerMapper.ts`, o caminho de carga que vale sob autoridade, nao
// traduzia NADA — repassava `unlocked_continents` cru. Quando a PH-434
// renomeou o grupo que nasce aberto, o gate de continente reprovou as 8 linhas
// de producao e TODA hunt do jogo respondeu "Derrote o Campeao Lance" — com
// estes testes verdes.
//
// Agora ela IMPORTA a funcao de producao. Teste que reimplementa a regra prova
// a reimplementacao: ele nao pode reprovar o codigo, porque nao o chama.
const traduzirNaCarga = traduzirGruposLiberados

describe('gate do Campeao Lance sobrevive ao reload', () => {
  it('nenhum grupo que o Lance concede pode estar na lista de legados', () => {
    // A invariante de verdade, e a unica que impede a regressao de voltar por
    // outro caminho: o que o Lance da NAO pode ser o que a carga descarta.
    for (const grupo of GRUPOS_DO_LANCE) {
      expect(GRUPOS_LEGADOS.has(grupo), `${grupo} e concedido pelo Lance e nao pode ser legado`).toBe(false)
    }
  })

  it('quem derrotou o Lance continua com os dois grupos depois da carga', () => {
    const gravado = [...GRUPOS_INICIAIS, ...GRUPOS_DO_LANCE]
    const carregado = traduzirNaCarga(gravado)
    for (const grupo of GRUPOS_DO_LANCE) expect(carregado).toContain(grupo)
  })

  it('quem NAO derrotou o Lance nao ganha nada de graca', () => {
    const carregado = traduzirNaCarga([...GRUPOS_INICIAIS])
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
    for (const faixa of GRUPOS_INICIAIS) expect(carregado).toContain(faixa)
  })
})
