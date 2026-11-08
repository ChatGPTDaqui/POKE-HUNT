// O roteiro das cenas de evolucao e de ovo, como funcao PURA do tempo: o
// componente so desenha o que isto devolve. Ritmo inspirado nos jogos
// originais (silhueta que alterna cada vez mais rapido; ovo que balanca com
// pausas que encurtam), com desenho e tempos proprios.
//
// `t`: segundos desde o inicio. `tRevela`: segundo em que a revelacao comecou
// (null = ainda em suspense). O componente so marca `tRevela` quando o
// suspense minimo acabou E o servidor respondeu.

export const SUSPENSE_DA_EVOLUCAO = 5.2
export const SUSPENSE_DO_OVO = 4.4
export const SUSPENSE_REDUZIDO = 0.8
/** Quanto a cena fica no ar depois da revelacao antes de fechar sozinha. */
export const TEMPO_NA_TELA = 3.4

const lim = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const rampa = (t: number, de: number, ate: number) => lim((t - de) / (ate - de))

/**
 * Instantes em que a silhueta troca de forma: o intervalo comeca em 0,55 s e
 * encolhe 18% a cada troca, ate um piso de 0,05 s. Calculado uma vez.
 */
export const TROCAS_DA_EVOLUCAO: readonly number[] = (() => {
  const out: number[] = []
  let t = 1.6
  let passo = 0.55
  while (t < SUSPENSE_DA_EVOLUCAO) {
    out.push(+t.toFixed(3))
    t += passo
    passo = Math.max(0.05, passo * 0.82)
  }
  return out
})()

export interface QuadroDaEvolucao {
  /** Escurecimento do campo (0-1). */
  fundo: number
  /** Quanto o sprite esta branco (0 = cor normal, 1 = silhueta). */
  branco: number
  /** Qual forma aparece. */
  forma: 'antiga' | 'nova'
  /** Escala do sprite (a respiracao e o "puxao" de cada troca). */
  escala: number
  /** Clarao branco por cima de tudo (0-1). */
  clarao: number
  /** Raios atras do sprite (0-1). */
  raios: number
  /** Brilhos convergindo (0-1). */
  brilhos: number
  texto: 'evoluindo' | 'evoluiu' | 'parou' | null
}

export function quadroDaEvolucao(t: number, tRevela: number | null, falhou: boolean, reduzido = false): QuadroDaEvolucao {
  const fundo = rampa(t, 0, 0.6)
  if (tRevela == null || t < tRevela) {
    if (reduzido) {
      return { fundo, branco: rampa(t, 0.1, 0.6), forma: 'antiga', escala: 1, clarao: 0, raios: 0, brilhos: 0, texto: 'evoluindo' }
    }
    const branco = rampa(t, 0.6, 1.6)
    // Antes da primeira troca e a forma antiga; depois, alterna. Se o servidor
    // demorar, segue alternando no ritmo mais rapido ate a resposta chegar.
    let trocas = TROCAS_DA_EVOLUCAO.filter((x) => x <= t).length
    if (t > SUSPENSE_DA_EVOLUCAO) trocas += Math.floor((t - SUSPENSE_DA_EVOLUCAO) / 0.06)
    const desdeTroca = TROCAS_DA_EVOLUCAO.length && t <= SUSPENSE_DA_EVOLUCAO
      ? t - (TROCAS_DA_EVOLUCAO.filter((x) => x <= t).at(-1) ?? 0)
      : 0.2
    const puxao = trocas > 0 ? 0.06 * Math.exp(-desdeTroca * 14) : 0
    return {
      fundo, branco, forma: trocas % 2 === 1 ? 'nova' : 'antiga',
      escala: 1 + Math.sin(t * 3.2) * 0.015 + puxao,
      clarao: 0, raios: 0, brilhos: rampa(t, 0.5, 1.2) * (1 - rampa(t, SUSPENSE_DA_EVOLUCAO - 0.4, SUSPENSE_DA_EVOLUCAO + 0.6) * 0.5),
      texto: 'evoluindo',
    }
  }
  const r = t - tRevela
  if (falhou) {
    // Como nos jogos quando a evolucao e interrompida: volta a cor, forma antiga.
    return { fundo: 1 - rampa(r, TEMPO_NA_TELA - 0.5, TEMPO_NA_TELA), branco: 1 - rampa(r, 0, 0.5), forma: 'antiga', escala: 1, clarao: 0, raios: 0, brilhos: 0, texto: 'parou' }
  }
  return {
    fundo: 1 - rampa(r, TEMPO_NA_TELA - 0.5, TEMPO_NA_TELA),
    branco: reduzido ? 1 - rampa(r, 0, 0.4) : 1 - rampa(r, 0.25, 0.9),
    forma: 'nova',
    escala: reduzido ? 1 : 1 + 0.12 * Math.exp(-r * 5) * Math.cos(r * 14),
    clarao: reduzido ? 0 : 1 - rampa(r, 0.05, 0.45),
    raios: rampa(r, 0.15, 0.7),
    brilhos: 0,
    texto: 'evoluiu',
  }
}

/** Balancos do ovo: inicio de cada um; as pausas encurtam ate ele estourar. */
export const BALANCOS_DO_OVO: readonly number[] = [0.8, 1.9, 2.85, 3.45, 3.9]
const DURACAO_DO_BALANCO = 0.4

export interface QuadroDoOvo {
  fundo: number
  /** Inclinacao do ovo, em graus. */
  angulo: number
  /** Quantas trincas ja apareceram (0-3). */
  trincas: number
  /** Brilho pulsando atras do ovo (0-1). */
  brilho: number
  /** Abertura: 0 = inteiro, 1 = metades longe. */
  abertura: number
  clarao: number
  raios: number
  /** Entrada do bebe (0-1, com mola). */
  bebe: number
  texto: 'oh' | 'nasceu' | 'erro' | null
}

export function quadroDoOvo(t: number, tRevela: number | null, falhou: boolean, reduzido = false): QuadroDoOvo {
  const fundo = rampa(t, 0, 0.6)
  if (tRevela == null || t < tRevela) {
    if (reduzido) return { fundo, angulo: 0, trincas: rampa(t, 0, SUSPENSE_REDUZIDO) >= 1 ? 3 : 0, brilho: 0.4, abertura: 0, clarao: 0, raios: 0, bebe: 0, texto: 'oh' }
    let angulo = 0
    let feitos = 0
    BALANCOS_DO_OVO.forEach((b, i) => {
      const d = t - b
      if (d >= DURACAO_DO_BALANCO) feitos++
      if (d >= 0 && d < DURACAO_DO_BALANCO) angulo = Math.sin((d / DURACAO_DO_BALANCO) * Math.PI * 2) * (10 + i * 2.5)
    })
    // Servidor atrasado: um tremor curto e continuo ate a resposta.
    if (t > SUSPENSE_DO_OVO) angulo = Math.sin(t * 40) * 3
    return {
      fundo, angulo, trincas: feitos >= 5 ? 3 : feitos >= 4 ? 2 : feitos >= 2 ? 1 : 0,
      brilho: 0.25 + 0.5 * rampa(t, 2, SUSPENSE_DO_OVO) * (0.75 + 0.25 * Math.sin(t * 9)),
      abertura: 0, clarao: 0, raios: 0, bebe: 0, texto: 'oh',
    }
  }
  const r = t - tRevela
  if (falhou) return { fundo: 1 - rampa(r, TEMPO_NA_TELA - 0.5, TEMPO_NA_TELA), angulo: 0, trincas: 0, brilho: 0, abertura: 0, clarao: 0, raios: 0, bebe: 0, texto: 'erro' }
  const mola = (x: number) => (x <= 0 ? 0 : 1 - Math.exp(-x * 7) * Math.cos(x * 12))
  return {
    fundo: 1 - rampa(r, TEMPO_NA_TELA + 0.1, TEMPO_NA_TELA + 0.6),
    angulo: 0, trincas: 3, brilho: 0,
    abertura: reduzido ? 1 : rampa(r, 0, 0.6),
    clarao: reduzido ? 0 : 1 - rampa(r, 0.02, 0.5),
    raios: rampa(r, 0.2, 0.8),
    bebe: reduzido ? 1 : mola(r - 0.25),
    texto: 'nasceu',
  }
}

export const duracaoTotal = (tRevela: number, tipo: 'evolucao' | 'ovo') => tRevela + TEMPO_NA_TELA + (tipo === 'ovo' ? 0.6 : 0)
