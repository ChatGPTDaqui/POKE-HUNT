// Camada visual do CLIMA (PH-141). Irma de `ambiente.ts`, e nao um preset dele.
//
// ---------------------------------------------------------------------------
// POR QUE MODULO SEPARADO, E NAO MAIS UM PRESET
// ---------------------------------------------------------------------------
// `ambiente.ts` e dirigido pela ARTE (`PRESET_POR_ARTE`): a floresta tem folha
// caindo porque e uma floresta, e isso nao muda enquanto o jogador estiver ali.
// Clima e o oposto — ele TROCA embaixo da mesma arte, e um Rain Dance pode
// mudar tudo no meio da luta. Espremer isso no seletor por arte significaria
// um preset por (arte x clima), que e a tabela errada.
//
// Alem disso, clima desenha em DOIS momentos: atras das entidades (o grosso da
// precipitacao) e na FRENTE delas (a passagem rasante e a coloracao). Ambiente
// so tem o slot de tras. Ver `desenharClimaFundo`/`desenharClimaFrente`.
//
// ---------------------------------------------------------------------------
// AS TRES COISAS QUE FAZEM ISTO LER COMO CINEMA, E NAO COMO PONTINHOS
// ---------------------------------------------------------------------------
// 1. PROFUNDIDADE. Cada clima tem tres camadas com velocidade, tamanho e alpha
//    amarrados num sorteio so (perto = grande, rapido e opaco). Sorteados
//    separados, sai floco grande e lento junto de floco pequeno e rapido, que e
//    o contrario do que a distancia faz — a mesma licao que o `profundidade` do
//    ambiente ja tinha aprendido, aqui aplicada a todos.
//
// 2. UMA PASSAGEM NA FRENTE DA CAMERA. Meia duzia de particulas GRANDES,
//    rapidas e translucidas passando por cima das entidades. E o que separa
//    "chove no cenario" de "estou dentro da chuva": sem elas o jogador olha a
//    tempestade de fora, como quem ve por uma janela.
//
// 3. COLORACAO. Cada clima tem um filtro de cor e uma vinheta proprios. E o que
//    faz a cena INTEIRA mudar de humor em vez de so ganhar particula — e o que
//    o olho le primeiro, antes de identificar qualquer floco.
//
// ---------------------------------------------------------------------------
// O QUE ESTA CAMADA NAO PODE FAZER
// ---------------------------------------------------------------------------
// - NAO toca `world.rng`. Ele e autoritativo e compartilhado com o resim do
//   servidor: um sorteio a mais aqui desloca a sequencia inteira e o flush passa
//   a divergir do que o jogador viu (a classe de bug do PH-37). Sorteio local,
//   igual `ambiente.ts`.
// - NAO decide clima. Ela LE `world.clima`. Quem decide e o motor, e sob
//   autoridade quem decide e o servidor (PH-140).
// - NAO esconde o POKE. A passagem da frente e translucida e rala de proposito:
//   o jogador precisa ver a luta acontecendo.
import { useUiStore } from '@/stores/uiStore'

import type { ClimaTipo } from '@/engine/types'

export interface JanelaDeClima {
  x: number
  y: number
  w: number
  h: number
}

// ---------------------------------------------------------------------------
// RECEITAS
// ---------------------------------------------------------------------------

type Forma = 'risco' | 'floco' | 'pedra' | 'mota' | 'banco'

interface ReceitaDeClima {
  /** Particulas em tela cheia no desktop. O compacto usa metade. */
  quantidade: number
  cor: string
  forma: Forma
  /** Raio (ou meio-comprimento do risco) em unidades de mundo, [min, max]. */
  raio: [number, number]
  /** Velocidade em unidades de mundo por segundo, [min, max]. */
  velocidade: [number, number]
  /** Direcao dominante em radianos. PI/2 = pra baixo. */
  angulo: number
  /** Desvio por particula em torno do angulo dominante. */
  espalhamento: number
  alpha: number
  /** Desvio lateral, em unidades de mundo. */
  bamboleio: number
  /** `lighter`: soma luz em vez de tapar o cenario. */
  aditivo?: boolean
  /** Cor do filtro que cobre a cena inteira. */
  filtro: string
  /** Alpha do filtro. */
  filtroAlpha: number
  /**
   * `screen` clareia em vez de escurecer. Neve e nevoa LEVANTAM a sombra (a
   * neve reflete luz por todos os lados); chuva e areia escurecem.
   */
  filtroClareia?: boolean
  /** Vinheta nas bordas, 0 = nenhuma. */
  vinheta: number
  /** Rajadas: a velocidade oscila em ondas, em vez de ser constante. */
  rajada?: boolean
  /** Relampago raro: clarao branco seguido de escurecimento. */
  relampago?: boolean
  /** Feixes de luz descendo do topo. */
  raios?: boolean
  /**
   * Rastro atras da particula, em multiplos do raio.
   *
   * O granizo era o clima mais fraco dos seis na primeira captura: pedra
   * pequena e sem rastro se perde no cenario, e ele e justamente um dos dois
   * que tiram HP — tem que ser o mais evidente, nao o menos.
   */
  rastro?: number
}

const RECEITAS: Record<ClimaTipo, ReceitaDeClima> = {
  // Riscos longos e inclinados, escuros e dessaturados, com relampago raro. A
  // chuva e o unico clima com evento pontual — e o que impede uma tempestade
  // de virar papel de parede depois de trinta segundos olhando.
  chuva: {
    quantidade: 120, cor: '#cfe6f7', forma: 'risco',
    raio: [22, 58], velocidade: [520, 900], angulo: Math.PI / 2 + 0.26,
    espalhamento: 0.04, alpha: 0.6, bamboleio: 0,
    filtro: '#12243a', filtroAlpha: 0.28, vinheta: 0.2, relampago: true,
  },
  // Sol nao tem precipitacao: o que da o clima sao os feixes descendo e a poeira
  // suspensa que eles revelam. Por isso a contagem e baixa e o aditivo esta
  // ligado — a mota tem que BRILHAR, nao tapar.
  sol: {
    quantidade: 26, cor: '#ffe6a8', forma: 'mota',
    raio: [2.0, 5.2], velocidade: [6, 16], angulo: -Math.PI / 2 + 0.4,
    espalhamento: 1.1, alpha: 0.55, bamboleio: 12, aditivo: true,
    filtro: '#ffb347', filtroAlpha: 0.17, vinheta: 0.1, raios: true,
  },
  // Pedra dura, quase vertical e RAPIDA. O contraste alto e proposital: granizo
  // e o clima que machuca, e ele tem que parecer agressivo ao lado da neve, que
  // nao machuca e e macia.
  granizo: {
    quantidade: 110, cor: '#f2fdff', forma: 'pedra',
    raio: [4.6, 9.6], velocidade: [520, 820], angulo: Math.PI / 2 + 0.1,
    espalhamento: 0.05, alpha: 0.95, bamboleio: 2, rastro: 3.2,
    filtro: '#7fc6dd', filtroAlpha: 0.22, vinheta: 0.18,
  },
  // Floco grande, lento, com deriva larga. O filtro CLAREIA: neve reflete luz
  // por todos os lados e apaga a sombra da cena. E o oposto do granizo de
  // proposito — os dois convivem no bioma de gelo e o jogador precisa
  // distinguir de relance qual dos dois esta tirando o HP dele.
  neve: {
    quantidade: 80, cor: '#ffffff', forma: 'floco',
    raio: [3.0, 7.6], velocidade: [30, 74], angulo: Math.PI / 2 + 0.16,
    espalhamento: 0.3, alpha: 0.9, bamboleio: 26,
    filtro: '#dbeeff', filtroAlpha: 0.2, filtroClareia: true, vinheta: 0.1,
  },
  // Horizontal e em RAJADAS. A tempestade de areia e a unica que muda de
  // intensidade sozinha: sem a rajada ela vira um chuveiro lateral constante.
  areia: {
    quantidade: 150, cor: '#f0dcac', forma: 'risco',
    raio: [40, 120], velocidade: [700, 1250], angulo: 0.1,
    espalhamento: 0.09, alpha: 0.6, bamboleio: 6,
    filtro: '#a8763a', filtroAlpha: 0.24, vinheta: 0.16, rajada: true,
  },
  // Bancos enormes, lentissimos e quase transparentes, em varias camadas. A
  // nevoa nao tem particula visivel — ela e VOLUME. Alpha baixo com raio grande
  // e o que produz volume; alpha alto com raio pequeno produz bolinha cinza.
  nevoa: {
    quantidade: 22, cor: '#cfd6dc', forma: 'banco',
    raio: [70, 190], velocidade: [5, 16], angulo: 0.06,
    espalhamento: 0.5, alpha: 0.2, bamboleio: 10,
    filtro: '#b9c2cb', filtroAlpha: 0.3, filtroClareia: true, vinheta: 0.08,
  },
}

/**
 * A "familia" de particula que este clima produz.
 *
 * Serve pra `ambiente.ts` calar o preset dele quando os dois desenhariam a
 * MESMA coisa: a caverna de gelo ja tem neve decorativa por causa da ARTE, e
 * com neve-clima por cima o jogador nao teria como distinguir "o cenario e
 * nevado" de "esta nevando agora" — que e justamente o que precisa ficar claro,
 * porque um dos dois mexe no combate.
 */
export function familiaDoClima(clima: ClimaTipo | null): 'neve' | 'areia' | null {
  if (clima === 'neve' || clima === 'granizo') return 'neve'
  if (clima === 'areia') return 'areia'
  return null
}

// ---------------------------------------------------------------------------
// ESTADO DO MODULO
// ---------------------------------------------------------------------------

interface ParticulaDeClima {
  x: number
  y: number
  vx: number
  vy: number
  raio: number
  alphaMax: number
  fase: number
  bamboleio: number
  /** 0 = mais longe, 1 = mais perto. Amarra tamanho, velocidade e alpha. */
  profundidade: number
}

let climaAtual: ClimaTipo | null = null
let particulas: ParticulaDeClima[] = []
let frente: ParticulaDeClima[] = []
let ultimoInstante = 0
let fase = 0
/** Segundos ate o proximo relampago. Recarrega sozinho. */
let proximoRelampago = 0
/** Segundos restantes do clarao atual. 0 = sem relampago agora. */
let relampagoAtivo = 0

/** Teto do passo. Aba em segundo plano devolve delta gigante ao voltar. */
const DELTA_MAXIMO = 0.5
/** Quantas particulas passam NA FRENTE das entidades. Poucas, e grandes. */
const QUANTIDADE_NA_FRENTE = 7
/** Intervalo entre relampagos, em segundos, [min, max]. */
const RELAMPAGO_INTERVALO: [number, number] = [7, 18]
/** Duracao do clarao. Curtissimo — relampago longo lê como bug de render. */
const RELAMPAGO_DURACAO = 0.16

/** LCG local. NAO pode ser o `world.rng` — ver o cabecalho. */
function sorteioLocal(semente: number): () => number {
  let s = semente || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function entre(r: () => number, faixa: [number, number]): number {
  return faixa[0] + r() * (faixa[1] - faixa[0])
}

function semearParticula(
  r: () => number, receita: ReceitaDeClima, janela: JanelaDeClima, naFrente: boolean,
): ParticulaDeClima {
  // UM sorteio manda em tamanho, velocidade e alpha. Ver o item 1 do cabecalho.
  const profundidade = r()
  const escala = naFrente ? 2.6 : 1
  const raio = (receita.raio[0] + profundidade * (receita.raio[1] - receita.raio[0])) * escala
  const vel = (receita.velocidade[0] + profundidade * (receita.velocidade[1] - receita.velocidade[0]))
    * (naFrente ? 1.5 : 1)
  const ang = receita.angulo + (r() - 0.5) * receita.espalhamento
  return {
    x: janela.x + r() * janela.w,
    y: janela.y + r() * janela.h,
    vx: Math.cos(ang) * vel,
    vy: Math.sin(ang) * vel,
    raio,
    // Perto = mais opaco. Na frente, mais translucido: e desfoque de lente, nao
    // um objeto solido tapando a luta.
    alphaMax: receita.alpha * (0.4 + profundidade * 0.6) * (naFrente ? 0.5 : 1),
    fase: r() * Math.PI * 2,
    bamboleio: receita.bamboleio * (0.5 + r()),
    profundidade,
  }
}

function reconstruir(clima: ClimaTipo, janela: JanelaDeClima, compacto: boolean): void {
  const receita = RECEITAS[clima]
  const r = sorteioLocal(clima.length * 7919 + 104729)
  const total = Math.max(1, Math.round(receita.quantidade * (compacto ? 0.5 : 1)))
  particulas = Array.from({ length: total }, () => semearParticula(r, receita, janela, false))
  frente = Array.from(
    { length: compacto ? Math.ceil(QUANTIDADE_NA_FRENTE / 2) : QUANTIDADE_NA_FRENTE },
    () => semearParticula(r, receita, janela, true),
  )
  climaAtual = clima
  proximoRelampago = entre(r, RELAMPAGO_INTERVALO)
  relampagoAtivo = 0
}

/** Recicla quem saiu da janela, mantendo a densidade constante. */
function reciclar(p: ParticulaDeClima, janela: JanelaDeClima, folga: number): void {
  if (p.vy > 0 && p.y - folga > janela.y + janela.h) { p.y = janela.y - folga; p.x = janela.x + Math.random() * janela.w }
  else if (p.vy < 0 && p.y + folga < janela.y) { p.y = janela.y + janela.h + folga; p.x = janela.x + Math.random() * janela.w }
  if (p.vx > 0 && p.x - folga > janela.x + janela.w) { p.x = janela.x - folga; p.y = janela.y + Math.random() * janela.h }
  else if (p.vx < 0 && p.x + folga < janela.x) { p.x = janela.x + janela.w + folga; p.y = janela.y + Math.random() * janela.h }
}

function avancar(
  lista: ParticulaDeClima[], janela: JanelaDeClima, delta: number, multiplicadorDeVelocidade: number,
): void {
  for (const p of lista) {
    p.x += p.vx * delta * multiplicadorDeVelocidade
    p.y += p.vy * delta * multiplicadorDeVelocidade
    p.fase += delta * 1.4
    // Desvio perpendicular ao deslocamento — o que impede a queda em linha reta.
    if (p.bamboleio > 0) {
      const desvio = Math.sin(p.fase) * p.bamboleio * delta
      p.x += -p.vy * desvio * 0.012
      p.y += p.vx * desvio * 0.012
    }
    reciclar(p, janela, p.raio * 2 + 40)
  }
}

function desenharParticula(ctx: CanvasRenderingContext2D, p: ParticulaDeClima, receita: ReceitaDeClima): void {
  const alpha = p.alphaMax * (0.75 + 0.25 * Math.sin(p.fase))
  ctx.globalAlpha = Math.max(0, alpha)
  switch (receita.forma) {
    case 'risco': {
      // Comprimento na DIRECAO do movimento: risco de chuva perpendicular a
      // queda e a falha mais obvia possivel, e acontece quando se desenha o
      // risco sempre na horizontal.
      const n = Math.hypot(p.vx, p.vy) || 1
      ctx.lineWidth = Math.max(1, p.raio * 0.09)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - (p.vx / n) * p.raio, p.y - (p.vy / n) * p.raio)
      ctx.stroke()
      break
    }
    case 'pedra': {
      // Rastro primeiro, pra a pedra ficar POR CIMA dele.
      if (receita.rastro) {
        const n = Math.hypot(p.vx, p.vy) || 1
        ctx.globalAlpha = Math.max(0, alpha * 0.45)
        ctx.lineWidth = Math.max(1, p.raio * 0.5)
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x - (p.vx / n) * p.raio * receita.rastro, p.y - (p.vy / n) * p.raio * receita.rastro)
        ctx.stroke()
        ctx.globalAlpha = Math.max(0, alpha)
      }
      // Pedra e um losango curto, nao um circulo: granizo tem quina.
      ctx.beginPath()
      ctx.moveTo(p.x, p.y - p.raio)
      ctx.lineTo(p.x + p.raio * 0.55, p.y)
      ctx.lineTo(p.x, p.y + p.raio)
      ctx.lineTo(p.x - p.raio * 0.55, p.y)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'banco': {
      // Elipse MUITO achatada e sem borda dura: banco de nevoa nao tem contorno.
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, p.raio, p.raio * 0.38, 0, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'floco':
    case 'mota':
    default:
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.raio, 0, Math.PI * 2)
      ctx.fill()
      break
  }
}

/** Feixes de luz do sol, descendo inclinados. */
function desenharRaios(ctx: CanvasRenderingContext2D, janela: JanelaDeClima): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const largura = janela.w / 7
  for (let i = 0; i < 5; i++) {
    const x = janela.x + (i + 0.5) * (janela.w / 5) + Math.sin(fase * 0.22 + i) * 22
    const g = ctx.createLinearGradient(x, janela.y, x + largura * 0.7, janela.y + janela.h)
    g.addColorStop(0, 'rgba(255,228,160,0.16)')
    g.addColorStop(1, 'rgba(255,228,160,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(x, janela.y)
    ctx.lineTo(x + largura, janela.y)
    ctx.lineTo(x + largura * 1.9, janela.y + janela.h)
    ctx.lineTo(x + largura * 0.9, janela.y + janela.h)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/**
 * Desenha a precipitacao ATRAS das entidades.
 *
 * Chamada logo depois de `desenharAmbiente`, dentro da transformacao de camera —
 * as coordenadas sao de MUNDO.
 */
export function desenharClimaFundo(
  ctx: CanvasRenderingContext2D, clima: ClimaTipo | null, janela: JanelaDeClima,
): void {
  const ui = useUiStore.getState()
  // O mesmo ajuste que desliga a vida no cenario desliga a PARTICULA de clima:
  // quem desliga por desempenho quer menos coisa desenhando, e clima e a camada
  // mais cara das duas. A informacao nao se perde — o chip do HUD nao depende
  // deste ajuste (ver ClimaChip).
  if (!ui.vidaNoCenario || !clima) {
    if (particulas.length) { particulas = []; frente = []; climaAtual = null }
    return
  }

  const compacto = ui.viewportWidth > 0 && ui.viewportWidth < 760
  if (climaAtual !== clima || particulas.length === 0) reconstruir(clima, janela, compacto)

  const receita = RECEITAS[clima]
  const agora = performance.now()
  const delta = ultimoInstante === 0 ? 0 : Math.min(DELTA_MAXIMO, (agora - ultimoInstante) / 1000)
  ultimoInstante = agora
  fase += delta

  // RAJADA: a areia acelera e desacelera em ondas longas. Sem isto ela vira um
  // chuveiro lateral de intensidade constante, que nao le como tempestade.
  const rajada = receita.rajada ? 1 + Math.sin(fase * 0.5) * 0.45 : 1

  if (receita.relampago) {
    proximoRelampago -= delta
    relampagoAtivo = Math.max(0, relampagoAtivo - delta)
    if (proximoRelampago <= 0) {
      relampagoAtivo = RELAMPAGO_DURACAO
      const r = sorteioLocal(Math.round(fase * 1000))
      proximoRelampago = entre(r, RELAMPAGO_INTERVALO)
    }
  }

  avancar(particulas, janela, delta, rajada)
  avancar(frente, janela, delta, rajada)

  ctx.save()
  if (receita.raios) desenharRaios(ctx, janela)
  if (receita.aditivo) ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = receita.cor
  ctx.strokeStyle = receita.cor
  ctx.lineCap = 'round'
  for (const p of particulas) desenharParticula(ctx, p, receita)
  ctx.restore()
}

/**
 * Desenha o que vem NA FRENTE das entidades: a passagem rasante, o filtro de
 * cor, a vinheta e o relampago.
 *
 * Chamada depois das entidades e dos efeitos, ainda dentro da camera.
 */
export function desenharClimaFrente(
  ctx: CanvasRenderingContext2D, clima: ClimaTipo | null, janela: JanelaDeClima,
): void {
  const ui = useUiStore.getState()
  if (!ui.vidaNoCenario || !clima || climaAtual !== clima) return
  const receita = RECEITAS[clima]

  ctx.save()

  // 1. Filtro de cor sobre a cena inteira. E o que o olho le PRIMEIRO.
  //    `screen` na neve e na nevoa: elas levantam a sombra em vez de escurecer.
  ctx.globalCompositeOperation = receita.filtroClareia ? 'screen' : 'source-over'
  ctx.globalAlpha = receita.filtroAlpha
  ctx.fillStyle = receita.filtro
  ctx.fillRect(janela.x, janela.y, janela.w, janela.h)

  // 2. Vinheta: escurece as bordas e empurra o olho pro centro, onde a luta
  //    acontece. Radial do centro pra fora.
  if (receita.vinheta > 0) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    const cx = janela.x + janela.w / 2
    const cy = janela.y + janela.h / 2
    const raio = Math.hypot(janela.w, janela.h) / 2
    const g = ctx.createRadialGradient(cx, cy, raio * 0.45, cx, cy, raio)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(0,0,0,${receita.vinheta})`)
    ctx.fillStyle = g
    ctx.fillRect(janela.x, janela.y, janela.w, janela.h)
  }

  // 3. A passagem rasante. Grande, rapida, translucida — o "estou dentro dela".
  ctx.globalCompositeOperation = receita.aditivo ? 'lighter' : 'source-over'
  ctx.fillStyle = receita.cor
  ctx.strokeStyle = receita.cor
  ctx.lineCap = 'round'
  for (const p of frente) desenharParticula(ctx, p, receita)

  // 4. Relampago: clarao branco curto. Depois dele a cena fica um instante mais
  //    escura, que e o que faz o olho ler "clarao" em vez de "a tela piscou".
  if (relampagoAtivo > 0) {
    const forca = relampagoAtivo / RELAMPAGO_DURACAO
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = forca * 0.5
    ctx.fillStyle = '#dce9ff'
    ctx.fillRect(janela.x, janela.y, janela.w, janela.h)
  }

  ctx.restore()
}

/**
 * Solta o estado.
 *
 * Hoje so os testes chamam — em produção a troca de clima ja repovoa sozinha
 * (`climaAtual !== clima` reconstroi) e sair da hunt zera o clima no mundo, o
 * que cai no `if (!clima)` de `desenharClimaFundo`. Existe pelo mesmo motivo
 * que `reiniciarAmbiente`: sem ela, um teste herda as particulas posicionadas
 * na janela do caso anterior e mede o cenario errado.
 */
export function reiniciarClimaVisual(): void {
  particulas = []
  frente = []
  climaAtual = null
  ultimoInstante = 0
  fase = 0
  proximoRelampago = 0
  relampagoAtivo = 0
}
