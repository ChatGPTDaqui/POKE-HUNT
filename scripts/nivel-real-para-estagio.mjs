// A reescala: nivel dos jogos reais -> estagio nosso (PH-501).
//
// O PROBLEMA, E A DECISAO DO DONO DO PROJETO
// ---------------------------------------------------------------------------
// O encontro selvagem de Gen I-III vai de Lv 2 (Rota 1) a Lv 67 (Caverna
// Cerulean B1F). Os nossos estagios vao a Lv 100. Nao ha analogo real pra
// Lv 68-100, e nunca havera.
//
// Decisao de 2026-09-04, do dono do projeto, entre tres opcoes apresentadas:
// **o nivel real vale como ORDINAL DE PROGRESSAO, e nao como nosso nivel.**
// Lv real 2 e "o comeco de tudo" e cai no estagio 1; Lv real 67 e "o fundo do
// fim de jogo" e cai no estagio 10. O que a reescala preserva e a ORDEM em que
// os jogos apresentam as coisas, que e o que "progressao fiel aos classicos"
// significa na pratica.
//
// O QUE ISSO FAZ COM A DISTRIBUICAO, MEDIDO E NAO SUPOSTO
// ---------------------------------------------------------------------------
// A distribuicao de nivel real e concentrada embaixo: p50 = Lv 26, p90 = Lv 40.
// Depois da reescala, p50 cai no estagio 4 e p90 no estagio 6 — os estagios 7 a
// 10 recebem so os ~8% mais altos do dado real, que sao exatamente os lugares
// de fim de jogo: Caverna Cerulean (46-67), Mt. Silver (40-53), Estrada da
// Vitoria (36-44), Caverna do Artesao (40-50), Passagem do Deserto (35-45).
//
// ISSO NAO E UM BURACO, E O DESENHO. Sub-bioma raso nao tem lugar de fim de
// jogo porque a curva de profundidade JA o zera nos estagios altos: `beach`
// (profundidade 0.0) nao existe no estagio 10, entao nao precisa de encontro de
// Lv 60 na praia. E sub-bioma fundo (`cave`, `wasteland`, `seabed`) e
// justamente quem recebe o dado alto.
//
// Onde um sub-bioma ATIVO nao recebe dado real num estagio, o gerador herda a
// tabela do estagio real mais proximo e as FORMAS avancam sozinhas pela janela
// de nivel da sala — e assim que `plains` no estagio 8 entrega Linoone, Pidgeot
// e Raticate onde o estagio 1 entrega Zigzagoon, Pidgey e Rattata.

/** Menor nivel de encontro selvagem em Gen I-III: Rota 1, Pidgey/Rattata. */
export const NIVEL_REAL_MINIMO = 2

/** Maior: Caverna Cerulean B1F, no Gen 1. */
export const NIVEL_REAL_MAXIMO = 67

export const ESTAGIOS = 10

/**
 * O estagio (1..10) em que um nivel dos jogos reais cai.
 *
 * Linear e com arredondamento pro mais proximo. Nivel fora da faixa observada e
 * APARADO em vez de estourar: nada no dado de hoje cai fora, mas uma fonte nova
 * (um remake, uma tabela de pos-jogo) nao deve derrubar o gerador — ela deve
 * cair no estagio da ponta, que e a resposta certa.
 */
export function estagioDoNivelReal(nivel) {
  const t = (nivel - NIVEL_REAL_MINIMO) / (NIVEL_REAL_MAXIMO - NIVEL_REAL_MINIMO)
  const bruto = Math.round(1 + t * (ESTAGIOS - 1))
  return Math.max(1, Math.min(ESTAGIOS, bruto))
}

/**
 * A faixa FECHADA de estagios que um encontro cobre, do nivel minimo ao maximo.
 *
 * O encontro nao e um ponto: a pesca de Emerald e declarada como Lv 5-45, o que
 * atravessa sete estagios. Usar so o ponto medio jogaria fora essa extensao e
 * faria o Magikarp de vara super existir num estagio so — quando nos jogos ele
 * aparece de Lv 5 a Lv 45.
 */
export function estagiosDoEncontro(nivelMin, nivelMax) {
  const lo = estagioDoNivelReal(nivelMin)
  const hi = estagioDoNivelReal(nivelMax)
  const saida = []
  for (let e = Math.min(lo, hi); e <= Math.max(lo, hi); e++) saida.push(e)
  return saida
}
