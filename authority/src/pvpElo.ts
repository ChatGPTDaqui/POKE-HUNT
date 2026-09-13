// Elo (MMR interno) + PDL (pontos de liga, visiveis, estilo LoL) pro PvP
// ranqueado. Fonte UNICA desta matematica — `aplicar_resultado_pvp` (SQL) so
// persiste o que sai daqui, nunca recalcula.
//
// MMR: Elo classico, base 1000. K=40 nas primeiras 10 partidas (placement,
// convergencia rapida pro nivel real do jogador), K=20 depois.
// PDL: separado do MMR, sobe/desce por partida (15-25, mais alto quanto mais
// "surpreendente" o resultado foi pro Elo) e e o que define a divisao —
// o MMR nunca aparece na UI.
export type Resultado = 'vitoria' | 'derrota' | 'empate'

export interface EntradaJogador {
  mmr: number
  partidas: number
  pdl: number
  divisao: string
}

export interface SaidaJogador {
  mmr: number
  pdl: number
  divisao: string
  pdlDelta: number
}

const MMR_MINIMO = 100

function kFactor(partidas: number): number {
  return partidas < 10 ? 40 : 20
}

function esperado(mmrProprio: number, mmrRival: number): number {
  return 1 / (1 + 10 ** ((mmrRival - mmrProprio) / 400))
}

function scoreDe(resultado: Resultado): number {
  return resultado === 'vitoria' ? 1 : resultado === 'derrota' ? 0 : 0.5
}

// PDL ganho/perdido: base 20, ajustado pela "surpresa" do resultado (vencer
// sendo azarao rende mais, vencer sendo favorito rende menos), sempre dentro
// de 15-25. Empate nao mexe em PDL (nao ha empate mais forte/mais fraco).
function pdlDeltaBruto(resultado: Resultado, esperadoProprio: number): number {
  if (resultado === 'empate') return 0
  if (resultado === 'vitoria') return Math.round(clamp(25 - 10 * esperadoProprio, 15, 25))
  return -Math.round(clamp(15 + 10 * esperadoProprio, 15, 25))
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// Escada de divisoes: PDL 0-99 em cada uma, promove aos 100 (zera PDL na
// proxima), rebaixa abaixo de 0 (aterrissa em 99 na anterior). Mestre e teto:
// PDL soma sem promover, nunca fica negativo.
export const ESCADA_DIVISOES = [
  'bronze_1', 'bronze_2', 'bronze_3',
  'prata_1', 'prata_2', 'prata_3',
  'ouro_1', 'ouro_2', 'ouro_3',
  'platina_1', 'platina_2', 'platina_3',
  'diamante_1', 'diamante_2', 'diamante_3',
  'mestre',
] as const

function aplicarPdl(divisaoAtual: string, pdlAtual: number, delta: number): { divisao: string; pdl: number } {
  const indiceAtual = Math.max(0, ESCADA_DIVISOES.indexOf(divisaoAtual as (typeof ESCADA_DIVISOES)[number]))
  const ultimoIndice = ESCADA_DIVISOES.length - 1
  let indice = indiceAtual
  let pdl = pdlAtual + delta

  if (indice === ultimoIndice) {
    // Mestre: sem teto de divisao acima, so nao deixa PDL negativo.
    return { divisao: ESCADA_DIVISOES[indice], pdl: Math.max(0, pdl) }
  }

  while (pdl >= 100 && indice < ultimoIndice) {
    pdl -= 100
    indice += 1
  }
  while (pdl < 0 && indice > 0) {
    pdl += 100
    indice -= 1
  }
  if (indice === 0) pdl = Math.max(0, pdl)

  return { divisao: ESCADA_DIVISOES[indice], pdl }
}

export function calcularResultadoRanqueado(
  anfitriao: EntradaJogador,
  convidado: EntradaJogador,
  resultadoAnfitriao: Resultado,
): { anfitriao: SaidaJogador; convidado: SaidaJogador } {
  const resultadoConvidado: Resultado = resultadoAnfitriao === 'vitoria'
    ? 'derrota'
    : resultadoAnfitriao === 'derrota' ? 'vitoria' : 'empate'

  const espAnfitriao = esperado(anfitriao.mmr, convidado.mmr)
  const espConvidado = 1 - espAnfitriao

  const mmrAnfitriao = Math.max(
    MMR_MINIMO,
    Math.round(anfitriao.mmr + kFactor(anfitriao.partidas) * (scoreDe(resultadoAnfitriao) - espAnfitriao)),
  )
  const mmrConvidado = Math.max(
    MMR_MINIMO,
    Math.round(convidado.mmr + kFactor(convidado.partidas) * (scoreDe(resultadoConvidado) - espConvidado)),
  )

  const deltaAnfitriao = pdlDeltaBruto(resultadoAnfitriao, espAnfitriao)
  const deltaConvidado = pdlDeltaBruto(resultadoConvidado, espConvidado)
  const rankAnfitriao = aplicarPdl(anfitriao.divisao, anfitriao.pdl, deltaAnfitriao)
  const rankConvidado = aplicarPdl(convidado.divisao, convidado.pdl, deltaConvidado)

  return {
    anfitriao: { mmr: mmrAnfitriao, pdl: rankAnfitriao.pdl, divisao: rankAnfitriao.divisao, pdlDelta: deltaAnfitriao },
    convidado: { mmr: mmrConvidado, pdl: rankConvidado.pdl, divisao: rankConvidado.divisao, pdlDelta: deltaConvidado },
  }
}
