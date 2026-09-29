// Teto de particulas por QUADRO, somado entre todos os efeitos na tela.
//
// POR QUE ORCAMENTO E NAO POOL (desvio consciente do spec, que dizia pool.ts):
// coreografia aqui e funcao pura do tempo — cada particula e CALCULADA a partir
// da semente e do `ms`, nao simulada e guardada. Nao existe objeto de particula
// pra reaproveitar, entao pool nao teria o que guardar. O que o pool protegia
// (custo explodindo com muitos combates) e protegido aqui: cada efeito PEDE
// particulas, e depois do teto recebe menos. O jogo degrada o enfeite, nunca o
// quadro.
export const TETO_DE_PARTICULAS = 300

export interface Orcamento {
  /** Pede `n`; devolve quantas cabem (0..n). */
  pedir: (n: number) => number
  gastas: () => number
}

export function novoOrcamento(teto = TETO_DE_PARTICULAS): Orcamento {
  let usadas = 0
  return {
    pedir(n) {
      const dadas = Math.max(0, Math.min(Math.floor(n), teto - usadas))
      usadas += dadas
      return dadas
    },
    gastas: () => usadas,
  }
}

/**
 * Orcamento do quadro corrente. Renovado por `iniciarQuadroDeVfx`, que o laco
 * de desenho chama uma vez por quadro antes das entidades.
 */
let doQuadro = novoOrcamento()

export function iniciarQuadroDeVfx(): void {
  doQuadro = novoOrcamento()
}

export function orcamentoDoQuadro(): Orcamento {
  return doQuadro
}
