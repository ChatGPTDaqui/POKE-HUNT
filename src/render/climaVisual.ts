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
import { emPoke } from './escalaDoMundo'
import {
  avancarGotas, criarEstadoDeGotas, desenharGotas, povoarGotas,
  type ConfigDeGota, type EstadoDeGotas,
} from './gotas'

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

export type Forma = 'risco' | 'cristal' | 'pedra' | 'mota' | 'banco'

export interface ReceitaDeClima {
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
   * Cor do CONTORNO desenhado por baixo da particula, mais grosso que ela.
   *
   * Existe porque a neve some no cenario dela. Floco branco sobre caverna de
   * gelo (que e branca e azul-clara) e sobre floresta nevada e invisivel — e
   * sao justamente os dois sub-biomas onde ela mais aparece. O contorno escuro
   * resolve nos dois fundos de uma vez, sem escurecer o floco em si.
   */
  contorno?: string
  /**
   * Rastro atras da particula, em multiplos do raio.
   *
   * O granizo era o clima mais fraco dos seis na primeira captura: pedra
   * pequena e sem rastro se perde no cenario, e ele e justamente um dos dois
   * que tiram HP — tem que ser o mais evidente, nao o menos.
   */
  rastro?: number
  /**
   * Gotas que POUSAM e respingam no chao (PH-232). Ver `gotas.ts`.
   *
   * So a chuva pede, e o motivo esta la: sem contato com o solo a
   * precipitacao flutua em espaco de tela, o olho nao tem contra o que aferir
   * o tamanho dela, e depois de trinta segundos a tempestade vira papel de
   * parede. Granizo tambem bateria no chao na vida real, mas ele ja tem
   * rastro e quina pra se distinguir, e dois climas respingando ao mesmo
   * tempo no bioma de gelo apagaria a diferenca entre "machuca" e "nao
   * machuca" — que e a unica coisa que o jogador PRECISA ler ali.
   */
  gotas?: { quantidade: number; config: ConfigDeGota }
}

/**
 * A chuva que pousa. Convive com os riscos de fundo em vez de substitui-los:
 * os riscos sao a chuva DISTANTE (que cai fora do que da pra ver) e as gotas
 * sao a chuva PERTO, que termina no chao pintado. Duas distancias, nao dois
 * desenhos da mesma coisa.
 */
const GOTAS_DE_CHUVA: ConfigDeGota = {
  cor: '#cfe6f7', corDoRespingo: '#e8f5ff',
  comprimento: [emPoke(0.2), emPoke(0.45)], espessura: [0.9, 1.8],
  velocidade: [420, 700], inclinacao: 0.26, espalhamento: 0.05, alpha: 0.62,
  raioDoRespingo: [2.6, 4.6], vidaDoRespingo: [0.3, 0.48], microgotas: 3, alphaDoRespingo: 0.95,
  // Nem toda gota respinga: com 1.0 o chao inteiro pisca ao mesmo tempo e o
  // efeito vira ruido. O resto atravessa a janela e le como "caiu fora do
  // enquadramento", que e o que acontece de verdade.
  fracaoQuePousa: 0.55,
}

// ---------------------------------------------------------------------------
// A ESCALA DESTAS RECEITAS (PH-232)
// ---------------------------------------------------------------------------
// Os corpos sao declarados em `emPoke(fracao)` — fracao da altura de um POKE,
// ver `escalaDoMundo.ts`. O que havia antes, medido contra a mesma regua:
//
//   risco de chuva    ate 58 de comprimento por 5,2 de espessura  = corda
//   cristal de neve   ate 22 de diametro                          = 55% de um POKE
//   pedra de granizo  ate 19,2 de diametro                        = 48%
//   mota de sol       ate 10,4 de diametro                        = 26%
//
// O teto de clima e mais folgado que o de ambiente de proposito (18% contra
// 12%): granizo e areia TIRAM HP, e um evento que mexe no combate tem que ser
// mais evidente que a decoracao fixa do bioma. O banco de nevoa fica fora do
// teto porque ele e volume, nao corpo.
export const RECEITAS: Record<ClimaTipo, ReceitaDeClima> = {
  // Riscos inclinados, escuros e dessaturados, com relampago raro, MAIS as
  // gotas que pousam (PH-232). A chuva e o unico clima com evento pontual — e
  // o que impede uma tempestade de virar papel de parede depois de trinta
  // segundos olhando.
  chuva: {
    quantidade: 55, cor: '#cfe6f7', forma: 'risco',
    raio: [emPoke(0.18), emPoke(0.4)], velocidade: [480, 780], angulo: Math.PI / 2 + 0.26,
    espalhamento: 0.04, alpha: 0.6, bamboleio: 0,
    filtro: '#12243a', filtroAlpha: 0.28, vinheta: 0.2, relampago: true,
    gotas: { quantidade: 58, config: GOTAS_DE_CHUVA },
  },
  // Sol nao tem precipitacao: o que da o clima sao os feixes descendo e a poeira
  // suspensa que eles revelam. Por isso a contagem e baixa e o aditivo esta
  // ligado — a mota tem que BRILHAR, nao tapar.
  sol: {
    quantidade: 48, cor: '#ffe6a8', forma: 'mota',
    raio: [emPoke(0.018), emPoke(0.045)], velocidade: [6, 16], angulo: -Math.PI / 2 + 0.4,
    espalhamento: 1.1, alpha: 0.6, bamboleio: 12, aditivo: true,
    filtro: '#ffb347', filtroAlpha: 0.17, vinheta: 0.1, raios: true,
  },
  // Pedra dura, quase vertical e RAPIDA. O contraste alto e proposital: granizo
  // e o clima que machuca, e ele tem que parecer agressivo ao lado da neve, que
  // nao machuca e e macia.
  granizo: {
    quantidade: 110, cor: '#f2fdff', forma: 'pedra',
    raio: [emPoke(0.035), emPoke(0.09)], velocidade: [520, 820], angulo: Math.PI / 2 + 0.1,
    espalhamento: 0.05, alpha: 0.95, bamboleio: 2, rastro: 4.5, contorno: 'rgba(18,58,92,0.65)',
    filtro: '#7fc6dd', filtroAlpha: 0.22, vinheta: 0.18,
  },
  // Floco grande, lento, com deriva larga. O filtro CLAREIA: neve reflete luz
  // por todos os lados e apaga a sombra da cena. E o oposto do granizo de
  // proposito — os dois convivem no bioma de gelo e o jogador precisa
  // distinguir de relance qual dos dois esta tirando o HP dele.
  neve: {
    quantidade: 92, cor: '#ffffff', forma: 'cristal',
    raio: [emPoke(0.032), emPoke(0.09)], velocidade: [30, 74], angulo: Math.PI / 2 + 0.16,
    espalhamento: 0.3, alpha: 0.95, bamboleio: 26, contorno: 'rgba(60,96,130,0.55)',
    filtro: '#dbeeff', filtroAlpha: 0.2, filtroClareia: true, vinheta: 0.1,
  },
  // Horizontal e em RAJADAS. A tempestade de areia e a unica que muda de
  // intensidade sozinha: sem a rajada ela vira um chuveiro lateral constante.
  areia: {
    quantidade: 150, cor: '#f0dcac', forma: 'risco',
    raio: [emPoke(0.25), emPoke(0.65)], velocidade: [700, 1250], angulo: 0.1,
    espalhamento: 0.09, alpha: 0.62, bamboleio: 6,
    filtro: '#a8763a', filtroAlpha: 0.24, vinheta: 0.16, rajada: true,
  },
  // Bancos enormes, lentissimos e quase transparentes, em varias camadas. A
  // nevoa nao tem particula visivel — ela e VOLUME. Alpha baixo com raio grande
  // e o que produz volume; alpha alto com raio pequeno produz bolinha cinza.
  nevoa: {
    quantidade: 26, cor: '#cfd6dc', forma: 'banco',
    raio: [emPoke(1.6), emPoke(4.2)], velocidade: [5, 16], angulo: 0.06,
    espalhamento: 0.5, alpha: 0.18, bamboleio: 10,
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
  /**
   * Rotacao acumulada, em radianos. So o cristal de neve usa.
   *
   * Floco de neve real tomba enquanto cai. Sem o giro, o cristal vira um
   * simbolo carimbado sempre na mesma orientacao — e ai ele lê como icone, nao
   * como neve.
   */
  angulo: number
  /** Velocidade do giro, em radianos por segundo. Sinal = sentido. */
  giro: number
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
/** Gotas que pousam (PH-232). Null pra todo clima que nao seja chuva. */
let gotas: EstadoDeGotas | null = null
/**
 * O gerador local desta camada, VIVO entre quadros.
 *
 * Antes do PH-232 a reciclagem (`reciclar`) usava `Math.random` direto,
 * contrariando o proprio cabecalho do arquivo ("Sorteio local, igual
 * `ambiente.ts`"). Nao dessincronizava o servidor — nao passa pelo `Rng` do
 * mundo — mas fazia a camada ser diferente entre sessoes sem motivo, e
 * `ambiente.test.ts` proibe exatamente isso no arquivo irmao. Guardar o
 * gerador aqui fecha o furo sem mudar nada do que aparece na tela.
 */
let rand: () => number = () => 0.5

/** Teto do passo. Aba em segundo plano devolve delta gigante ao voltar. */
const DELTA_MAXIMO = 0.5
/** Quantas particulas passam NA FRENTE das entidades. Poucas, e grandes. */
const QUANTIDADE_NA_FRENTE = 7
/**
 * Teto de respingos vivos ao mesmo tempo.
 *
 * Regime medido no papel pra chuva no desktop: 58 gotas, 55% pousando, queda
 * media de ~0,4s numa janela de ~470 unidades de altura, respingo vivendo
 * ~0,39s — da algo entre 28 e 32 impactos vivos. 72 e mais que o dobro. O pool
 * existe pra nao alocar um objeto por impacto a 60 quadros por segundo (ver
 * `criarEstadoDeGotas`), nao pra racionar.
 */
const RESPINGOS_DA_CHUVA = 72
/** Intervalo entre relampagos, em segundos, [min, max]. */
const RELAMPAGO_INTERVALO: [number, number] = [7, 18]
/** Duracao do clarao. Curtissimo — relampago longo lê como bug de render. */
const RELAMPAGO_DURACAO = 0.16
/**
 * Abaixo desta profundidade o floco de neve e desenhado como PONTO, e nao como
 * cristal.
 *
 * Nao e economia: e o que o olho faz. Floco distante nao tem braco resolvivel —
 * desenhar o cristal em todos deixa a nevasca com aparencia de adesivo repetido,
 * e mata a profundidade que as tres camadas constroem. Perto ve-se a estrela,
 * longe ve-se o ponto.
 */
const NEVE_CRISTAL_A_PARTIR_DE = 0.45
/** Braços do cristal. Seis, como floco de verdade. */
const NEVE_BRACOS = 6
/** Onde a farpa sai do braço, em fracao do comprimento. */
const NEVE_FARPA_EM = 0.58
/** Comprimento da farpa, em fracao do braço. */
const NEVE_FARPA_TAMANHO = 0.36
/** Giro do floco, em radianos por segundo, [min, max]. */
const NEVE_GIRO: [number, number] = [0.25, 0.95]

/**
 * Semente a partir do NOME do clima (FNV-1a), e nao do comprimento dele.
 *
 * A conta anterior era `clima.length * 7919 + 104729`, e ela COLIDE: `chuva`,
 * `areia` e `nevoa` tem cinco letras, entao os tres partiam da mesma sequencia
 * de sorteio. O efeito era invisivel (receitas diferentes consomem a sequencia
 * de jeitos diferentes) e continua cosmetico, mas desde o PH-232 esse mesmo
 * gerador tambem decide onde cada gota pousa — vale ter uma semente que de
 * fato distinga os climas, em vez de uma que distinga o tamanho do nome.
 */
function semeteDoClima(clima: string): number {
  let h = 2166136261
  for (let i = 0; i < clima.length; i++) {
    h ^= clima.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

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
    angulo: r() * Math.PI * 2,
    // Sentido sorteado: nevasca em que todo floco gira pro mesmo lado lê como
    // animacao em loop, nao como neve.
    giro: (receita.forma === 'cristal' ? entre(r, NEVE_GIRO) : 0) * (r() < 0.5 ? -1 : 1),
  }
}

function reconstruir(clima: ClimaTipo, janela: JanelaDeClima, compacto: boolean): void {
  const receita = RECEITAS[clima]
  // O gerador fica no estado do modulo, e nao local: `reciclar` roda a cada
  // quadro e precisa dele. Ver `rand`.
  rand = sorteioLocal(semeteDoClima(clima))
  const r = rand
  const total = Math.max(1, Math.round(receita.quantidade * (compacto ? 0.5 : 1)))
  particulas = Array.from({ length: total }, () => semearParticula(r, receita, janela, false))
  frente = Array.from(
    { length: compacto ? Math.ceil(QUANTIDADE_NA_FRENTE / 2) : QUANTIDADE_NA_FRENTE },
    () => semearParticula(r, receita, janela, true),
  )
  climaAtual = clima
  proximoRelampago = entre(r, RELAMPAGO_INTERVALO)
  relampagoAtivo = 0
  if (receita.gotas) {
    gotas = criarEstadoDeGotas(RESPINGOS_DA_CHUVA)
    povoarGotas(
      gotas, receita.gotas.config, janela, r,
      Math.max(1, Math.round(receita.gotas.quantidade * (compacto ? 0.5 : 1))),
    )
  } else {
    gotas = null
  }
}

/** Recicla quem saiu da janela, mantendo a densidade constante. */
function reciclar(p: ParticulaDeClima, janela: JanelaDeClima, folga: number): void {
  if (p.vy > 0 && p.y - folga > janela.y + janela.h) { p.y = janela.y - folga; p.x = janela.x + rand() * janela.w }
  else if (p.vy < 0 && p.y + folga < janela.y) { p.y = janela.y + janela.h + folga; p.x = janela.x + rand() * janela.w }
  if (p.vx > 0 && p.x - folga > janela.x + janela.w) { p.x = janela.x - folga; p.y = janela.y + rand() * janela.h }
  else if (p.vx < 0 && p.x + folga < janela.x) { p.x = janela.x + janela.w + folga; p.y = janela.y + rand() * janela.h }
}

function avancar(
  lista: ParticulaDeClima[], janela: JanelaDeClima, delta: number, multiplicadorDeVelocidade: number,
): void {
  for (const p of lista) {
    p.x += p.vx * delta * multiplicadorDeVelocidade
    p.y += p.vy * delta * multiplicadorDeVelocidade
    p.fase += delta * 1.4
    p.angulo += p.giro * delta
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
      // Espessura em fracao do COMPRIMENTO, com piso proprio.
      //
      // Antes do PH-232 o fator era 0,09 sobre um comprimento de ate 58 — 5,2
      // unidades de espessura, mais grosso que um grao de poeira e largo o
      // bastante pra ler como corda. Com o comprimento agora em 7 a 16, o
      // MESMO fator da 0,9 a 1,4: a conta nunca esteve errada, o comprimento
      // e que estava.
      //
      // O piso de 0,9 nao e enfeite. Medido na bancada com 0,5: no zoom padrao
      // isso da 0,75px, e a chuva SUMIU por completo sobre a floresta. Risco de
      // chuva e borrao de luz, nao um objeto — abaixo de ~1,3px de tela ele nao
      // sobrevive ao antialias.
      ctx.lineWidth = Math.max(0.9, p.raio * 0.09)
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
      // Contorno escuro por baixo, pelo mesmo motivo do floco de neve: pedra
      // quase branca sobre montanha de gelo (que e branca e azul-clara) some.
      // Medido na bancada do PH-232: em `ice-mountain` o granizo era
      // indistinguivel do fundo, e ele e um dos dois climas que TIRAM HP — o
      // que menos pode ficar invisivel.
      if (receita.contorno) {
        ctx.strokeStyle = receita.contorno
        ctx.lineWidth = Math.max(1, p.raio * 0.45)
        ctx.stroke()
        ctx.strokeStyle = receita.cor
      }
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
    case 'cristal': {
      // Longe, ponto. O cristal so aparece quando ha tamanho pra ele existir —
      // ver NEVE_CRISTAL_A_PARTIR_DE.
      if (p.profundidade < NEVE_CRISTAL_A_PARTIR_DE) {
        // O ponto distante tambem leva contorno: e ele que segura o floco
        // contra a caverna de gelo, que e clara como ele.
        if (receita.contorno) {
          ctx.strokeStyle = receita.contorno
          ctx.lineWidth = Math.max(0.8, p.raio * 0.3)
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.raio * 0.5, 0, Math.PI * 2)
          ctx.stroke()
          ctx.strokeStyle = receita.cor
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.raio * 0.5, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      // Nucleo pequeno: sem ele o centro do floco fica vazado e a estrela
      // parece um asterisco solto.
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.raio * 0.2, 0, Math.PI * 2)
      ctx.fill()
      // O caminho da estrela e montado UMA vez e percorrido DUAS: contorno
      // grosso por baixo, traco claro por cima. `stroke()` nao limpa o caminho,
      // entao o segundo passe reusa o mesmo — e nao ha `Path2D` no meio, que
      // deixaria o desenho invisivel pro espiao dos testes.
      ctx.beginPath()
      for (let i = 0; i < NEVE_BRACOS; i++) {
        const a = p.angulo + (i * Math.PI * 2) / NEVE_BRACOS
        const cos = Math.cos(a)
        const sen = Math.sin(a)
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x + cos * p.raio, p.y + sen * p.raio)
        // As farpas saem em V, uma pra cada lado do braco.
        const bx = p.x + cos * p.raio * NEVE_FARPA_EM
        const by = p.y + sen * p.raio * NEVE_FARPA_EM
        const farpa = p.raio * NEVE_FARPA_TAMANHO
        for (const desvio of [0.9, -0.9]) {
          ctx.moveTo(bx, by)
          ctx.lineTo(bx + Math.cos(a + desvio) * farpa, by + Math.sin(a + desvio) * farpa)
        }
      }
      // Traco fino em relacao ao raio: floco com traco grosso vira recorte de
      // papel. O contorno e mais grosso, e so ele encosta no cenario.
      const traco = Math.max(0.8, p.raio * 0.16)
      if (receita.contorno) {
        ctx.strokeStyle = receita.contorno
        ctx.lineWidth = traco * 2.4
        ctx.stroke()
        ctx.strokeStyle = receita.cor
      }
      ctx.lineWidth = traco
      ctx.stroke()
      break
    }
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
    if (particulas.length) { particulas = []; frente = []; climaAtual = null; gotas = null }
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

  // Gotas que pousam (PH-232), DEPOIS dos riscos de fundo: elas sao a chuva
  // perto da camera e o respingo delas mora no chao pintado, entao passam por
  // cima da chuva distante. Continua tudo atras das entidades — quem desenha
  // na frente e `desenharClimaFrente`, e respingo de chao ali daria a
  // impressao de agua batendo no ar na altura do peito do POKE.
  if (gotas && receita.gotas) {
    avancarGotas(gotas, receita.gotas.config, janela, delta, rand)
    desenharGotas(ctx, gotas, receita.gotas.config)
  }
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
  gotas = null
  ultimoInstante = 0
  fase = 0
  proximoRelampago = 0
  relampagoAtivo = 0
}
