// Gota que cai e SE CHOCA COM O CHAO (PH-232).
//
// ---------------------------------------------------------------------------
// POR QUE ISTO E UM MODULO PROPRIO, E NAO MAIS UM PRESET DE CADA LADO
// ---------------------------------------------------------------------------
// Duas camadas diferentes precisam da mesma coisa:
//
//   - `climaVisual.ts`, na chuva: a precipitacao passou a POUSAR em vez de
//     atravessar a janela e reciclar na borda de baixo.
//   - `ambiente.ts`, no gotejo de selva e de caverna: pingo de teto que cai de
//     um ponto fixo do mundo, bate no chao e recomeca.
//
// Sao o mesmo comportamento com numeros diferentes, e escrever duas vezes
// significaria corrigir duas vezes o mesmo bug de reciclagem. Aqui e uma
// implementacao so, dirigida por `ConfigDeGota`.
//
// ---------------------------------------------------------------------------
// POR QUE A GOTA PRECISA POUSAR — o ponto inteiro da issue
// ---------------------------------------------------------------------------
// Ate o PH-232, NENHUMA particula do jogo tinha fim: ela atravessava a janela e
// renascia na borda oposta. Sem contato com o solo a particula flutua em
// espaco de tela, e o olho nao tem contra o que aferir o tamanho dela — e por
// isso que uma gota grande demais nao "parece grande", so parece um risco.
//
// O respingo resolve isso de graca: ele acontece EM CIMA do chao pintado, com
// o mesmo achatamento de perspectiva que o anel de agua do PH-113 ja usa,
// entao ele ancora a gota no plano do cenario. Depois disso o tamanho da gota
// passa a ser lido em relacao ao chao, e nao em relacao a tela.
//
// ---------------------------------------------------------------------------
// ONDE FICA O "CHAO", JA QUE NAO EXISTE UM
// ---------------------------------------------------------------------------
// A camera e de cima com inclinacao e a arte de fundo e UMA imagem sem
// metadado de profundidade (mesma limitacao registrada no cabecalho de
// `ambiente.ts`). Nao ha linha de horizonte a consultar.
//
// Mas nessa projecao TODO pixel do fundo E chao: a cena inteira e o solo visto
// de cima. Entao a gota sorteia um `yChao` dentro da janela ao nascer e
// desaparece ali. Isso nao e aproximacao preguicosa — e a leitura correta da
// projecao: numa vista de cima, chuva cai sobre a area inteira, nao sobre uma
// unica reta na base da tela.
//
// ---------------------------------------------------------------------------
// O QUE ESTE ARQUIVO NAO PODE FAZER
// ---------------------------------------------------------------------------
// Nao toca `world.rng`, nao importa nada de `@/engine`, nao usa `Math.random`.
// Ele nem tem gerador proprio: quem chama passa o sorteio local dele. Ver o
// cabecalho de `ambiente.ts` pra a classe de bug que essa regra evita (PH-37).

/** Quantas microgotas, no maximo, um respingo lanca. Dimensiona o pool. */
export const MAXIMO_DE_MICROGOTAS = 4

export interface ConfigDeGota {
  cor: string
  /** Cor do anel e das microgotas. Separada da gota: agua no ar e mais escura
   *  que agua espirrando, que pega luz por todos os lados. */
  corDoRespingo: string
  /** Comprimento do risco da gota, em unidades de mundo, [min, max]. */
  comprimento: [number, number]
  /** Espessura do risco, em unidades de mundo, [min, max]. */
  espessura: [number, number]
  /** Velocidade de queda, em unidades de mundo por segundo, [min, max]. */
  velocidade: [number, number]
  /** Inclinacao em relacao a vertical, em radianos. 0 = cai reta. */
  inclinacao: number
  /** Desvio de inclinacao por gota, em radianos. */
  espalhamento: number
  alpha: number
  /** Raio FINAL do anel do respingo, em unidades de mundo, [min, max]. */
  raioDoRespingo: [number, number]
  /**
   * Alpha de PICO do respingo. Omitido, herda o `alpha` da gota.
   *
   * Existe separado porque o respingo apaga com o QUADRADO do tempo restante
   * (ver `desenharGotas`): o alpha medio ao longo da vida dele e cerca de um
   * terco do de pico, enquanto o da gota e constante. Com o mesmo numero nos
   * dois, o anel sumia sobre a floresta clara enquanto o risco continuava
   * evidente — medido na bancada — e o contato com o chao e justamente a
   * metade que esta issue veio criar.
   */
  alphaDoRespingo?: number
  /** Duracao do respingo em segundos, [min, max]. */
  vidaDoRespingo: [number, number]
  /** Microgotas lancadas por respingo. 0 = so o anel. Teto MAXIMO_DE_MICROGOTAS. */
  microgotas: number
  /**
   * Fracao das gotas que POUSA na janela; o resto atravessa e recicla embaixo.
   *
   * Existe pra a chuva forte nao ferver o chao: com 1.0, toda gota vira
   * respingo e o solo inteiro pisca. Com fracao < 1, parte das gotas le como
   * "caiu fora do que da pra ver", que e o que acontece de verdade.
   */
  fracaoQuePousa: number
  /**
   * A gota volta sempre pro MESMO ponto do mundo (pingo de teto), em vez de
   * nascer numa posicao nova a cada ciclo.
   *
   * E o que separa "esta chovendo" de "esta pingando": pingo de estalactite
   * cai do mesmo lugar dezenas de vezes. Sem isto o gotejo de caverna leria
   * como chuva rala dentro de uma caverna fechada.
   */
  origemFixa?: boolean
  /** So com `origemFixa`: pausa entre uma gota e a proxima, em segundos. */
  espera?: [number, number]
  /** `lighter` — respingo que soma luz, pra gotejo em caverna escura. */
  aditivo?: boolean
}

export interface JanelaDeGota { x: number; y: number; w: number; h: number }

interface Microgota {
  x: number
  y: number
  vx: number
  vy: number
}

interface Gota {
  x: number
  y: number
  vx: number
  vy: number
  comprimento: number
  espessura: number
  alpha: number
  /** Y de mundo onde esta gota some e vira respingo. */
  yChao: number
  /** Falso = atravessa a janela sem respingar (ver `fracaoQuePousa`). */
  pousa: boolean
  /** So com `origemFixa`: x/y de onde ela recomeca todo ciclo. */
  origemX: number
  origemY: number
  /** Segundos ate a proxima queda. > 0 = parada no teto, nao desenha. */
  espera: number
}

interface Respingo {
  x: number
  y: number
  idade: number
  /** 0 = slot livre. */
  vida: number
  raio: number
  alpha: number
  /** Quantas posicoes de `micro` estao em uso neste respingo. */
  ativas: number
  micro: Microgota[]
}

export interface EstadoDeGotas {
  gotas: Gota[]
  /** Pool de tamanho FIXO. Ver `emitirRespingo`. */
  respingos: Respingo[]
  /** Proximo slot do pool a ser sobrescrito (rodizio). */
  proximoSlot: number
}

/**
 * Achatamento vertical do anel do respingo.
 *
 * Mesmo motivo do `ANEL_ACHATAMENTO` da agua (PH-113): a camera e de cima com
 * inclinacao, e circulo perfeito no chao leria como bolha vista de cima, num
 * angulo que a arte de fundo nao tem. Achatar poe o respingo no mesmo plano
 * que o cenario ja esta desenhado.
 */
const RESPINGO_ACHATAMENTO = 0.4
/** Espessura do traco do anel, em unidades de mundo. */
const RESPINGO_TRACO = 0.9
/** Raio da microgota, em unidades de mundo. */
const MICROGOTA_RAIO = 0.7
/**
 * "Gravidade" que puxa a microgota de volta pro chao, em unidades/s².
 *
 * Nao e fisica: numa vista de cima nao existe eixo vertical na tela. O que
 * ela faz e curvar a trajetoria pra baixo, que e o unico jeito de o olho ler
 * "a agua subiu e caiu" numa projecao sem altura.
 */
const MICROGOTA_GRAVIDADE = 220
/** Velocidade de lancamento da microgota, em fracao da velocidade da gota. */
const MICROGOTA_IMPULSO = 0.16

function entre(rand: () => number, faixa: [number, number]): number {
  return faixa[0] + rand() * (faixa[1] - faixa[0])
}

/**
 * Cria o estado com o pool de respingos JA ALOCADO.
 *
 * Pool fixo, e nao array que cresce: em chuva forte nascem ~120 respingos por
 * segundo, e alocar um objeto (mais o array de microgotas) por impacto poria
 * o coletor de lixo pra trabalhar a 60 quadros por segundo — o tipo de custo
 * que aparece como engasgo periodico, nao como queda de fps.
 */
export function criarEstadoDeGotas(capacidadeDeRespingo: number): EstadoDeGotas {
  return {
    gotas: [],
    respingos: Array.from({ length: Math.max(1, capacidadeDeRespingo) }, () => ({
      x: 0, y: 0, idade: 0, vida: 0, raio: 0, alpha: 0, ativas: 0,
      micro: Array.from({ length: MAXIMO_DE_MICROGOTAS }, () => ({ x: 0, y: 0, vx: 0, vy: 0 })),
    })),
    proximoSlot: 0,
  }
}

/**
 * (Re)nasce uma gota.
 *
 * `primeiraVez` espalha a populacao pela janela inteira; sem isso a camada
 * entra como uma cortina descendo do topo, todas as gotas na mesma altura.
 */
function nascerGota(
  g: Gota, cfg: ConfigDeGota, janela: JanelaDeGota, rand: () => number, primeiraVez: boolean,
): void {
  const ang = Math.PI / 2 + cfg.inclinacao + (rand() - 0.5) * cfg.espalhamento
  const vel = entre(rand, cfg.velocidade)
  g.vx = Math.cos(ang) * vel
  g.vy = Math.sin(ang) * vel
  g.comprimento = entre(rand, cfg.comprimento)
  g.espessura = entre(rand, cfg.espessura)
  g.alpha = cfg.alpha * (0.6 + rand() * 0.4)
  g.pousa = rand() < cfg.fracaoQuePousa

  if (cfg.origemFixa) {
    // Reaproveita a origem enquanto ela continuar visivel: e ela que faz o
    // pingo cair sempre do mesmo ponto. Fora da janela (a camera andou), a
    // estalactite antiga nao existe mais pro jogador — sorteia outra.
    const dentro = g.origemX >= janela.x && g.origemX <= janela.x + janela.w
      && g.origemY >= janela.y && g.origemY <= janela.y + janela.h
    if (!dentro) {
      g.origemX = janela.x + rand() * janela.w
      // O pingo nasce no terco de cima: e de la que o olho espera teto.
      g.origemY = janela.y + rand() * janela.h * 0.34
    }
    g.x = g.origemX
    g.y = g.origemY
    g.espera = cfg.espera ? entre(rand, cfg.espera) : 0
    // Pousa SEMPRE abaixo da origem, e a distancia minima existe pra a gota
    // ter tempo de ser vista caindo — pingo que nasce e respinga no mesmo
    // quadro le como cintilacao, nao como queda.
    const restante = janela.y + janela.h - g.origemY
    g.yChao = g.origemY + Math.max(janela.h * 0.12, rand() * restante)
    g.pousa = true
    return
  }

  g.espera = 0
  g.x = janela.x + rand() * janela.w
  g.y = primeiraVez ? janela.y + rand() * janela.h : janela.y - g.comprimento - rand() * janela.h * 0.2
  // O ponto de impacto tem que satisfazer DUAS coisas ao mesmo tempo, e errar
  // qualquer uma delas poe o respingo onde ninguem ve:
  //
  //   1. ABAIXO da posicao atual, com folga. Sorteado livremente na janela,
  //      metade das gotas nasceria ja passada do proprio ponto de impacto e
  //      respingaria no primeiro quadro, todas juntas.
  //   2. DENTRO da janela. Sorteado como "um trecho a frente da gota", a gota
  //      reciclada — que nasce ACIMA do topo — receberia um chao acima do topo
  //      tambem, e respingaria fora da tela. Falha silenciosa: o efeito so
  //      parece mais fraco do que foi configurado.
  //
  // O piso e o maior dos dois limites; o sorteio acontece ENTRE ele e o
  // rodape. Se o piso ja passou do rodape (gota da primeira populacao que
  // nasceu colada embaixo), nao ha trecho onde pousar: ela sai pela borda sem
  // respingar, e o ciclo seguinte ja entra pelo topo com a janela inteira pela
  // frente.
  const piso = Math.max(g.y + janela.h * 0.06, janela.y + janela.h * 0.05)
  const rodape = janela.y + janela.h
  if (piso > rodape) {
    g.pousa = false
    g.yChao = rodape
    return
  }
  g.yChao = piso + rand() * (rodape - piso)
}

export function povoarGotas(
  estado: EstadoDeGotas, cfg: ConfigDeGota, janela: JanelaDeGota, rand: () => number, quantidade: number,
): void {
  estado.gotas = []
  for (let i = 0; i < quantidade; i++) {
    const g: Gota = {
      x: 0, y: 0, vx: 0, vy: 0, comprimento: 0, espessura: 0, alpha: 0,
      yChao: 0, pousa: true, origemX: NaN, origemY: NaN, espera: 0,
    }
    nascerGota(g, cfg, janela, rand, true)
    estado.gotas.push(g)
  }
  for (const r of estado.respingos) { r.vida = 0; r.idade = 0; r.ativas = 0 }
  estado.proximoSlot = 0
}

/**
 * Ocupa um slot do pool. Cheio, sobrescreve o mais antigo (rodizio).
 *
 * Sobrescrever e melhor que ignorar o impacto: o pool e dimensionado pra o
 * regime normal, e quando ele estoura o que se perde e o FIM de um respingo
 * antigo (ja quase apagado), nao o comeco de um novo. Ignorar faria o
 * contrario — o chao pararia de responder justo no pico da chuva.
 */
function emitirRespingo(
  estado: EstadoDeGotas, cfg: ConfigDeGota, x: number, y: number, velocidade: number, rand: () => number,
): void {
  const r = estado.respingos[estado.proximoSlot]
  estado.proximoSlot = (estado.proximoSlot + 1) % estado.respingos.length
  r.x = x
  r.y = y
  r.idade = 0
  r.vida = entre(rand, cfg.vidaDoRespingo)
  r.raio = entre(rand, cfg.raioDoRespingo)
  r.alpha = cfg.alphaDoRespingo ?? cfg.alpha
  r.ativas = Math.min(MAXIMO_DE_MICROGOTAS, Math.max(0, cfg.microgotas))
  for (let i = 0; i < r.ativas; i++) {
    const m = r.micro[i]
    // Leque pra os dois lados, sempre com componente pra cima: agua que bate
    // no chao sobe. Angulo entre -160° e -20°, ou seja, o semicirculo de cima.
    const ang = -Math.PI + 0.35 + rand() * (Math.PI - 0.7)
    const forca = velocidade * MICROGOTA_IMPULSO * (0.6 + rand() * 0.8)
    m.x = x
    m.y = y
    m.vx = Math.cos(ang) * forca
    // Achatado no eixo Y pelo mesmo motivo do anel: perspectiva de cima.
    m.vy = Math.sin(ang) * forca * RESPINGO_ACHATAMENTO
  }
}

export function avancarGotas(
  estado: EstadoDeGotas, cfg: ConfigDeGota, janela: JanelaDeGota, delta: number, rand: () => number,
): void {
  for (const g of estado.gotas) {
    if (g.espera > 0) {
      g.espera -= delta
      continue
    }
    g.x += g.vx * delta
    g.y += g.vy * delta

    if (g.pousa && g.y >= g.yChao) {
      // A JANELA ANDA: a camera segue o jogador. O ponto de impacto foi
      // sorteado dentro da janela de meio segundo atras, e nesse tempo ela se
      // deslocou — a ~91 unidades/s do POKE, uns 35 numa queda tipica. Um
      // `yChao` que ficou pra tras produziria respingo fora da tela: nao
      // quebra nada, mas e desenho jogado fora, e nenhum teste de janela
      // PARADA veria isso acontecer.
      if (
        g.x >= janela.x && g.x <= janela.x + janela.w
        && g.yChao >= janela.y && g.yChao <= janela.y + janela.h
      ) {
        emitirRespingo(estado, cfg, g.x, g.yChao, Math.hypot(g.vx, g.vy), rand)
      }
      nascerGota(g, cfg, janela, rand, false)
      continue
    }
    // Saiu da janela (por baixo, ou de lado com inclinacao forte): recicla sem
    // respingo. Sem este ramo a gota que nao pousa cairia pra sempre e o
    // `yChao` dela nunca mais seria alcancado.
    const folga = g.comprimento + 8
    if (
      g.y - folga > janela.y + janela.h
      || g.x + folga < janela.x
      || g.x - folga > janela.x + janela.w
    ) {
      nascerGota(g, cfg, janela, rand, false)
    }
  }

  for (const r of estado.respingos) {
    if (r.vida <= 0) continue
    r.idade += delta
    if (r.idade >= r.vida) { r.vida = 0; continue }
    for (let i = 0; i < r.ativas; i++) {
      const m = r.micro[i]
      m.vy += MICROGOTA_GRAVIDADE * RESPINGO_ACHATAMENTO * delta
      m.x += m.vx * delta
      m.y += m.vy * delta
    }
  }
}

/**
 * Desenha respingos e gotas.
 *
 * Respingo PRIMEIRO: ele esta no chao e a gota esta no ar, entao gota por cima
 * de respingo e a unica ordem que nao inverte a profundidade da cena.
 *
 * `ctx.fillStyle`/`strokeStyle` sao definidos aqui dentro porque a cor do
 * respingo e outra — quem chama nao tem como saber disso.
 */
export function desenharGotas(
  ctx: CanvasRenderingContext2D, estado: EstadoDeGotas, cfg: ConfigDeGota,
): void {
  ctx.save()
  if (cfg.aditivo) ctx.globalCompositeOperation = 'lighter'

  ctx.strokeStyle = cfg.corDoRespingo
  ctx.fillStyle = cfg.corDoRespingo
  for (const r of estado.respingos) {
    if (r.vida <= 0) continue
    const t = r.idade / r.vida
    // Raiz do tempo: o anel abre RAPIDO e desacelera, que e o que agua
    // espalhando faz. Linear leria como circulo crescendo em animacao.
    const raio = r.raio * Math.sqrt(t)
    // Queda quadratica do alpha: linear deixa o anel visivel ate o ultimo
    // quadro e sumir de uma vez, o que pisca (mesma licao do anel do PH-113).
    const restante = 1 - t
    ctx.globalAlpha = r.alpha * restante * restante
    ctx.lineWidth = RESPINGO_TRACO
    ctx.beginPath()
    ctx.ellipse(r.x, r.y, raio, raio * RESPINGO_ACHATAMENTO, 0, 0, Math.PI * 2)
    ctx.stroke()
    for (let i = 0; i < r.ativas; i++) {
      const m = r.micro[i]
      ctx.beginPath()
      ctx.arc(m.x, m.y, MICROGOTA_RAIO, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.strokeStyle = cfg.cor
  ctx.lineCap = 'round'
  for (const g of estado.gotas) {
    if (g.espera > 0) continue
    const n = Math.hypot(g.vx, g.vy) || 1
    ctx.globalAlpha = g.alpha
    ctx.lineWidth = g.espessura
    ctx.beginPath()
    ctx.moveTo(g.x, g.y)
    ctx.lineTo(g.x - (g.vx / n) * g.comprimento, g.y - (g.vy / n) * g.comprimento)
    ctx.stroke()
  }
  ctx.restore()
}

/** Quantos respingos estao vivos agora. So os testes usam. */
export function respingosVivos(estado: EstadoDeGotas): number {
  return estado.respingos.reduce((n, r) => n + (r.vida > 0 ? 1 : 0), 0)
}
