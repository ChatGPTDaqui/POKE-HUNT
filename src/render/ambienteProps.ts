// PROPS DE AMBIENTE: as fontes de vida FIXAS do cenario (PH-254).
//
// ---------------------------------------------------------------------------
// O QUE ISTO E, E POR QUE NAO E MAIS UMA PARTICULA
// ---------------------------------------------------------------------------
// `ambiente.ts` desenha uma populacao ANONIMA e ITINERANTE: folha, brasa,
// poeira, floco. A particula nasce em qualquer lugar da janela, atravessa a
// cena e recicla. Isso resolve "o mapa esta parado" e nao resolve mais nada —
// nenhuma das artes tem a fumaca saindo DA chamine, o fogo aceso NA fogueira,
// a espuma batendo NA queda d'agua.
//
// Prop e o contrario em toda dimensao: e UM, tem lugar, e nao anda. A camada
// olha a ancora cadastrada em `data/ancorasDeAmbiente.ts` (ou uma celula de
// mascara, pra lava e agua), e desenha ali a coisa que aquele ponto do desenho
// promete.
//
// ---------------------------------------------------------------------------
// A MESMA INVARIANTE DA CAMADA IRMA, PELO MESMO MOTIVO
// ---------------------------------------------------------------------------
// Nada aqui toca `world.rng` nem escreve no `WorldState`. Aquele gerador e
// AUTORITATIVO e compartilhado com o resim do servidor — uma chamada a mais no
// cliente desloca a sequencia inteira e faz o flush divergir do que o jogador
// viu (a classe de bug do PH-37, que nao da erro, so faz o jogo mentir). Esta
// camada tem gerador PROPRIO, semeado pela URL da arte, e o unico estado dela
// morre junto com a troca de arte.
//
// ---------------------------------------------------------------------------
// SO DUAS COISAS AQUI SAO ARTE, E ISSO FOI MEDIDO
// ---------------------------------------------------------------------------
// O acervo de onde saem as tiras de golpe (`data/vfxTiras.ts`) tem ~14 mil
// efeitos. Quinze candidatos a prop foram exportados e conferidos SOBRE O FUNDO
// REAL, no tamanho de jogo, por `scripts/harness/provar-props-no-fundo.py`.
// Passaram dois:
//
//   chama.png          ninja/effect 801, 9 quadros. Le como fogo a 26 unidades
//                      de mundo, e o pixel art dela casa com o pixel art dos
//                      fundos — que sao mapas em pixel, nao pintura.
//   agua-caustica.png  ninja/item 629, 16 quadros. Peca de CHAO animada: um
//                      quadrado de 32 costurado com ele mesmo, feito pra ser
//                      superficie de agua. Entra como brilho, nao como textura.
//
// Reprovaram, e o motivo importa mais que a lista: no tamanho de jogo a arte
// de fumaca do acervo virou VULTO BRANCO com forma de bicho, a de faisca
// eletrica virou COMETA AMARELO (a classe 'electric' do catalogo separa por
// matiz, e amarelo de fogo cai nela), e a de respingo virou BOLHA AZUL que
// sumia dentro da agua. As tres viraram procedural — que e o oposto de
// "desistir": baforada, zigue-zague e espuma sao formas simples, e forma
// simples desenhada em codigo nao tem estilo pra brigar com a arte de fundo.
//
// ---------------------------------------------------------------------------
// O QUE ISTO CUSTA POR QUADRO
// ---------------------------------------------------------------------------
// Medido no navegador, canvas de 1200x800, com a janela aberta de proposito pra
// caber TODOS os props da arte (o pior caso; em jogo a camera mostra menos):
//
//   slum      24 props   0,79 ms   (dez plumas de chamine — o caso mais caro)
//   dragon    21 props   0,39 ms
//   volcano   17 props   0,32 ms
//   sea       14 props   0,07 ms
//
// O orcamento de 60 quadros por segundo e 16,7 ms. O pior caso e ~5% dele, e
// quem domina e o gradiente radial da pluma (cinco por chamine, por quadro).
// Se isso um dia apertar, o corte certo e o numero de BAFORADAS, nao o de
// ancoras: ancora e uma coisa que o desenho promete.
//
// ---------------------------------------------------------------------------
// ORDEM DE DESENHO
// ---------------------------------------------------------------------------
// Chamada de dentro de `desenharAmbiente`, ANTES do laco de particulas e antes
// dos dois desligamentos que aquela funcao faz (preset 'nenhum' e clima que
// cala o preset). Os dois estao certos pra particula e errados pra prop: uma
// fogueira nao para de queimar porque comecou a nevar, e uma arte sem preset de
// ambiente ainda pode ter uma chamine. O UNICO desligamento que vale pros dois
// e o ajuste `vidaNoCenario` do jogador.
import { ANCORAS_POR_ARTE, type AncoraDeAmbiente, type TipoDeProp } from '@/data/ancorasDeAmbiente'
import { COLISAO_POR_ARTE } from '@/data/generated/subBiomaCollision.generated'
import { AGUA_POR_ARTE } from '@/data/generated/aguaMask.generated'
import { LAVA_POR_ARTE } from '@/data/generated/lavaMask.generated'
import { emPoke, TETO_DO_CORPO_DE_AMBIENTE } from './escalaDoMundo'
import { ventoAgora } from './vento'
import { readyImage } from './sprites'

export interface JanelaDeProps { x: number; y: number; w: number; h: number }

// ---------------------------------------------------------------------------
// ARTE
// ---------------------------------------------------------------------------
// Mesmo formato das tiras de golpe: quadro N ocupa `[N*L, N*L+L)` na
// horizontal, altura cheia, e `L` sai de `naturalWidth / quadros` em vez de ser
// escrito aqui (um numero a menos pra errar quando a arte for regerada).
//
// COMO REGERAR:
//   py POKE/PXG_2026/objectbuilder/tira_efeito.py 801 --projeto ninja \
//      --recortar --out assets/ambiente-props/chama.png
//   (a caustica e copia direta de
//    POKE/PXG_2026/objectbuilder/mapas/ninja/chao/ninja_i000629_32x32_v1_f16.png)
// e depois quantizar pra PNG-8 (255 cores, FASTOCTREE) — as duas juntas dao
// 9 kB, contra os 3,3 MB de `assets/move-vfx`.
export const TIRA_DE_CHAMA = { url: 'assets/ambiente-props/chama.png', quadros: 9 } as const
export const TIRA_DE_CAUSTICA = { url: 'assets/ambiente-props/agua-caustica.png', quadros: 16 } as const

/** Toda arte que esta camada pode desenhar. Consumida pelo preload. */
export function todasAsTirasDeProps(): string[] {
  return [TIRA_DE_CHAMA.url, TIRA_DE_CAUSTICA.url]
}

/** Quadros por segundo das duas tiras. Fogo pisca rapido; agua ondula devagar. */
const FPS_DA_CHAMA = 11
const FPS_DA_CAUSTICA = 7

// ---------------------------------------------------------------------------
// TAMANHO
// ---------------------------------------------------------------------------
// Tudo medido contra a altura de um POKE (`escalaDoMundo.ts`), pela mesma razao
// do PH-232: numero solto na receita nao tem com o que ser comparado, e foi
// assim que a poeira de caverna virou polen com um quarto da altura de um
// Pokemon. Aqui o risco e o oposto — prop grande demais vira cenario novo em
// cima do cenario —, e a regua serve pros dois lados.
const TAMANHO: Record<TipoDeProp, number> = {
  fogueira: emPoke(0.70), // 28 — a chama de acampamento, quase a altura de um POKE
  tocha: emPoke(0.38), // 15 — cabe no lampiao que a arte ja desenhou
  chamine: emPoke(1.50), // 60 — altura ATE onde a fumaca sobe, nao tamanho de baforada
  fumarola: emPoke(1.25),
  gas: emPoke(0.85),
  orbe: emPoke(0.45), // raio do brilho
  cascata: emPoke(0.75), // largura da batida de espuma
  correnteza: emPoke(0.45),
  quebraMar: emPoke(1.10),
  eletrica: emPoke(0.50),
  vagalume: emPoke(1.15), // raio do enxame
  petala: emPoke(1.50),
}

/** Cor de quem nao declara `cor` na ancora. */
const COR_PADRAO: Record<TipoDeProp, string> = {
  fogueira: '#ffb057', tocha: '#ffc06a', chamine: '#8d8b86', fumarola: '#e8f0f4',
  gas: '#a9d06a', orbe: '#ffd58a', cascata: '#f2fbff', correnteza: '#eaf8ff',
  quebraMar: '#ffffff', eletrica: '#fff2a8', vagalume: '#ffe27a', petala: '#ffc2dd',
}

// ---------------------------------------------------------------------------
// ESTADO
// ---------------------------------------------------------------------------
// Modulo, e nao WorldState: e cosmetico, nao entra no save, nao e resimulado e
// nao pode viajar pro servidor. Reconstruido quando a arte troca.
interface PropVivo {
  x: number
  y: number
  tipo: TipoDeProp
  tamanho: number
  cor: string
  /** Deslocamento de fase, em segundos. Ver `AncoraDeAmbiente.fase`. */
  fase: number
  /** Sorteios estaveis por prop, pra o desenho nao sortear a cada quadro. */
  ruido: number[]
  /**
   * Veio de uma celula de MASCARA, e nao de uma ancora escrita.
   *
   * Muda o que o mesmo tipo desenha: `correnteza` ancorada e um respingo num
   * rio; `correnteza` de regiao e um dos catorze pontos sorteados dentro do
   * mar, e catorze respingos no mar leem como chuva. Guardar a origem no prop
   * (e nao perguntar "esta arte tem mascara?" na hora do desenho) e o que
   * mantem a decisao correta quando uma arte tiver as duas coisas.
   */
  deRegiao: boolean
}

let arteAtual: string | null = null
let compactoAtual = false
let props: PropVivo[] = []

/** LCG minusculo — nao precisa de qualidade estatistica, precisa NAO ser o
 *  `world.rng`. Ver o cabecalho deste arquivo. */
function sorteioLocal(semente: number): () => number {
  let s = semente || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function sementeDaArte(chave: string): number {
  let h = 2166136261
  for (let i = 0; i < chave.length; i++) {
    h ^= chave.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Quantos props de REGIAO cada mascara rende.
 *
 * Numero fixo e nao proporcional a area: `sea` tem 4.746 celulas de agua e
 * `swamp` tem 370 — proporcional encheria o mar de brilho e deixaria o brejo
 * sem nada. O que importa e quantos aparecem NA JANELA, e a janela e do mesmo
 * tamanho nos dois.
 */
const FOCOS_DE_LAVA = 7
const GLINTS_DE_AGUA = 14

/** Celulas marcadas de uma mascara, em coordenada de MUNDO (centro da celula). */
function celulasDaMascara(mascara: { celula: number; grid: string[] }): Array<[number, number]> {
  const saida: Array<[number, number]> = []
  for (let ly = 0; ly < mascara.grid.length; ly++) {
    const linha = mascara.grid[ly]
    for (let lx = 0; lx < linha.length; lx++) {
      if (linha[lx] === '1') saida.push([lx * mascara.celula + mascara.celula / 2, ly * mascara.celula + mascara.celula / 2])
    }
  }
  return saida
}

/**
 * Converte a ancora (fracao da ARTE) em ponto de MUNDO.
 *
 * Devolve `null` quando a arte ainda nao decodificou: sem `naturalWidth` nao ha
 * como saber o retangulo que ela ocupa, e chutar poria todo prop no canto. Um
 * quadro sem prop e invisivel; um quadro com prop no lugar errado, nao.
 */
function pontoDaAncora(
  a: AncoraDeAmbiente,
  arte: { escala: number; x: number; y: number },
  img: HTMLImageElement,
): { x: number; y: number } {
  return {
    x: arte.x + a.u * img.naturalWidth * arte.escala,
    y: arte.y + a.v * img.naturalHeight * arte.escala,
  }
}

function reconstruir(imagem: string, compacto: boolean): void {
  props = []
  arteAtual = imagem
  compactoAtual = compacto
  const rand = sorteioLocal(sementeDaArte(imagem))
  const col = COLISAO_POR_ARTE[imagem]
  const img = readyImage(imagem)

  const ancoras = ANCORAS_POR_ARTE[imagem] ?? []
  if (col?.arte && img && img.naturalWidth > 0) {
    for (const a of ancoras) {
      const p = pontoDaAncora(a, col.arte, img)
      props.push({
        x: p.x,
        y: p.y,
        tipo: a.tipo,
        tamanho: TAMANHO[a.tipo] * (a.escala ?? 1),
        cor: a.cor ?? COR_PADRAO[a.tipo],
        // Sem fase escrita, uma sorteada: doze tochas em fase igual leem como
        // pisca-pisca. Ver `AncoraDeAmbiente.fase`.
        fase: a.fase ?? rand() * 10,
        ruido: [rand(), rand(), rand(), rand()],
        deRegiao: false,
      })
    }
  }

  // Props de REGIAO: saem da mascara, sem ancora. Escolhidos com o mesmo
  // gerador semeado pela arte, entao a mesma arte da sempre o mesmo cenario.
  const lava = LAVA_POR_ARTE[imagem]
  if (lava) {
    const celulas = celulasDaMascara(lava)
    const quantos = compacto ? Math.ceil(FOCOS_DE_LAVA / 2) : FOCOS_DE_LAVA
    for (let i = 0; i < quantos && celulas.length > 0; i++) {
      const [x, y] = celulas[Math.floor(rand() * celulas.length)]
      props.push({
        x, y, tipo: 'fogueira', tamanho: TAMANHO.fogueira * 0.6,
        cor: COR_PADRAO.fogueira, fase: rand() * 10, ruido: [rand(), rand(), rand(), rand()],
        deRegiao: true,
      })
    }
  }
  const agua = AGUA_POR_ARTE[imagem]
  if (agua) {
    const celulas = celulasDaMascara(agua)
    const quantos = compacto ? Math.ceil(GLINTS_DE_AGUA / 2) : GLINTS_DE_AGUA
    for (let i = 0; i < quantos && celulas.length > 0; i++) {
      const [x, y] = celulas[Math.floor(rand() * celulas.length)]
      props.push({
        x, y, tipo: 'correnteza', tamanho: TAMANHO.correnteza,
        cor: COR_PADRAO.correnteza, fase: rand() * 10, ruido: [rand(), rand(), rand(), rand()],
        deRegiao: true,
      })
    }
  }
}

/**
 * Solta o estado. Existe pelo mesmo motivo que `reiniciarAmbiente` existe: sem
 * isto um caso de teste herda os props do anterior e mede a cena errada.
 */
export function reiniciarPropsDeAmbiente(): void {
  arteAtual = null
  props = []
}

/** Quantos props a arte corrente montou. So os testes leem. */
export function quantidadeDePropsDeAmbiente(): number {
  return props.length
}

// ---------------------------------------------------------------------------
// DESENHO
// ---------------------------------------------------------------------------

/** Folga em volta da janela: prop alto ainda aparece com a base fora da tela. */
const FOLGA = 80

/**
 * Baforada: quantas por pluma. Cinco e o minimo em que a coluna le como
 * CONTINUA — com quatro da pra ver o intervalo entre uma e outra, e a fumaca
 * vira sequencia de bolinhas subindo.
 */
const BAFORADAS = 5
const BAFORADAS_COMPACTO = 3
/** Segundos que uma baforada leva pra subir toda a altura e apagar. */
const DURACAO_DA_BAFORADA = 3.4

function desenharPluma(ctx: CanvasRenderingContext2D, p: PropVivo, t: number, compacto: boolean): void {
  const n = compacto ? BAFORADAS_COMPACTO : BAFORADAS
  const vento = ventoAgora()
  ctx.save()
  for (let i = 0; i < n; i++) {
    // Cada baforada esta num ponto diferente do MESMO ciclo — e isso que faz a
    // coluna, em vez de n baforadas iguais empilhadas.
    const fase = ((t + p.fase) / DURACAO_DA_BAFORADA + i / n) % 1
    const subida = fase * p.tamanho
    // Deriva: o vento empurra mais quem ja subiu mais, que e o que da a
    // inclinacao de fumaca de verdade em vez de uma coluna reta.
    const x = p.x + (0.25 + vento * 1.6) * subida * (0.6 + p.ruido[i % 4] * 0.8)
    const y = p.y - subida
    const raio = p.tamanho * (0.10 + fase * 0.22)
    // Nasce opaca em poucos quadros e apaga devagar: baforada que aparece em
    // fade le como fantasma, nao como fumaca saindo de um buraco.
    const alpha = 0.42 * Math.min(1, fase * 6) * (1 - fase) ** 1.4
    if (alpha <= 0.01) continue
    const g = ctx.createRadialGradient(x, y, 0, x, y, raio)
    g.addColorStop(0, p.cor)
    g.addColorStop(1, 'transparent')
    ctx.globalAlpha = alpha
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(x, y, raio, raio * 0.82, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** Duas ondas incomensuraveis: uma senoide sozinha le como LED piscando. */
function pulso(t: number, a: number, b: number): number {
  return (Math.sin(t * a) * 0.6 + Math.sin(t * b) * 0.4 + 1) / 2
}

function desenharBrilho(ctx: CanvasRenderingContext2D, p: PropVivo, t: number): void {
  const k = pulso(t + p.fase, 1.7 + p.ruido[0], 0.83 + p.ruido[1] * 0.4)
  const raio = p.tamanho * (0.85 + k * 0.3)
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, raio)
  g.addColorStop(0, p.cor)
  g.addColorStop(0.45, p.cor)
  g.addColorStop(1, 'transparent')
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.20 + k * 0.22
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(p.x, p.y, raio, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function desenharChama(
  ctx: CanvasRenderingContext2D, p: PropVivo, t: number, img: HTMLImageElement, compacto: boolean,
): void {
  const lq = img.naturalWidth / TIRA_DE_CHAMA.quadros
  const q = Math.floor((t + p.fase) * FPS_DA_CHAMA) % TIRA_DE_CHAMA.quadros
  const altura = p.tamanho
  const largura = altura * (lq / img.naturalHeight)
  // Brilho no chao antes da chama: e ele que faz o fogo ACENDER o cenario em
  // vez de ficar colado por cima dele. Cai no compacto — e o unico enfeite
  // daqui que da pra tirar sem o prop deixar de existir.
  if (!compacto) {
    const k = pulso(t + p.fase, 3.1, 1.3)
    const raio = altura * (0.75 + k * 0.2)
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, raio)
    g.addColorStop(0, p.cor)
    g.addColorStop(1, 'transparent')
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.16 + k * 0.12
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(p.x, p.y, raio, raio * 0.45, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.save()
  // A tira e pixel art REDUZIDA (96px de arte pra ~28 unidades de mundo).
  // Com suavizacao desligada a reducao serrilha e a chama cintila sozinha, o
  // que le como bug de renderizacao e nao como fogo.
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(img, q * lq, 0, lq, img.naturalHeight, p.x - largura / 2, p.y - altura, largura, altura)
  ctx.restore()
}

/** Periodo entre respingos, em segundos, por tipo de agua. */
const PERIODO_DA_ESPUMA: Partial<Record<TipoDeProp, number>> = {
  cascata: 0.55, // batida constante: quase sem intervalo
  correnteza: 2.6,
  quebraMar: 4.2, // onda de mar tem periodo longo e todo mundo reconhece
}
/** Fracao do periodo em que a espuma esta viva. */
const VIDA_DA_ESPUMA = 0.55

function desenharEspuma(ctx: CanvasRenderingContext2D, p: PropVivo, t: number): void {
  const periodo = PERIODO_DA_ESPUMA[p.tipo] ?? 2.5
  const fase = ((t + p.fase) % periodo) / periodo
  if (fase > VIDA_DA_ESPUMA) return
  const k = fase / VIDA_DA_ESPUMA
  ctx.save()
  ctx.globalAlpha = (1 - k) * 0.75
  ctx.strokeStyle = p.cor
  ctx.lineWidth = Math.max(0.8, p.tamanho * 0.09)
  // Arco ACHATADO e nao circulo: a camera e de cima com inclinacao, e circulo
  // perfeito le como bolha vista de cima — a mesma razao do achatamento do anel
  // de ondulacao no PH-113.
  ctx.beginPath()
  ctx.ellipse(p.x, p.y, p.tamanho * (0.25 + k * 0.85), p.tamanho * (0.25 + k * 0.85) * 0.4, 0, 0, Math.PI * 2)
  ctx.stroke()
  // Gotas subindo em parabola: sem elas o anel sozinho vira ondulacao, e
  // ondulacao ja existe na camada de particula. O que separa "respingo" de
  // "onda" e ter coisa saindo da agua.
  ctx.globalAlpha = (1 - k) * 0.9
  ctx.fillStyle = p.cor
  for (let i = 0; i < 4; i++) {
    const ang = -Math.PI / 2 + (i - 1.5) * 0.5 + (p.ruido[i] - 0.5) * 0.3
    const alcance = p.tamanho * (0.7 + p.ruido[i] * 0.5)
    const x = p.x + Math.cos(ang) * alcance * k
    const y = p.y + Math.sin(ang) * alcance * k + alcance * 0.9 * k * k
    const r = Math.max(0.5, p.tamanho * 0.08 * (1 - k))
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** Periodo entre curtos, em segundos, e quanto dura o clarao. */
const PERIODO_DA_FAISCA = 3.1
const DURACAO_DA_FAISCA = 0.16

function desenharFaisca(ctx: CanvasRenderingContext2D, p: PropVivo, t: number): void {
  const fase = (t + p.fase) % PERIODO_DA_FAISCA
  if (fase > DURACAO_DA_FAISCA) return
  // Sorteio pelo CICLO, e nao por quadro: o mesmo raio precisa ficar parado
  // durante os poucos quadros em que aparece, senao vira chuvisco.
  const ciclo = Math.floor((t + p.fase) / PERIODO_DA_FAISCA)
  const rand = sorteioLocal(sementeDaArte(`${p.x},${p.y},${ciclo}`))
  const k = 1 - fase / DURACAO_DA_FAISCA
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.35 + k * 0.65
  ctx.strokeStyle = p.cor
  ctx.lineWidth = Math.max(0.7, p.tamanho * 0.07)
  ctx.beginPath()
  let x = p.x
  let y = p.y
  ctx.moveTo(x, y)
  const passos = 5
  const ang = rand() * Math.PI * 2
  for (let i = 0; i < passos; i++) {
    x += Math.cos(ang + (rand() - 0.5) * 2.2) * (p.tamanho / passos)
    y += Math.sin(ang + (rand() - 0.5) * 2.2) * (p.tamanho / passos)
    ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

/** Pontos por enxame. */
const PONTOS_DO_ENXAME = 9
const PONTOS_DO_ENXAME_COMPACTO = 5
/**
 * Raio do ponto do enxame, em unidades de mundo.
 *
 * Sai do teto de corpo de particula de ambiente do PH-232 (12% da altura de um
 * POKE, em DIAMETRO), e nao de uma fracao do raio do enxame: petala e
 * vaga-lume sao corpos pequenos, e o enxame ser largo ou estreito nao muda o
 * tamanho de cada um. Amarrar na fracao dava petala de 6,6 unidades de
 * diametro — acima do teto que a issue vizinha existiu pra impor.
 */
const RAIO_DO_PONTO_DE_ENXAME = TETO_DO_CORPO_DE_AMBIENTE / 2

function desenharEnxame(ctx: CanvasRenderingContext2D, p: PropVivo, t: number, compacto: boolean): void {
  const n = compacto ? PONTOS_DO_ENXAME_COMPACTO : PONTOS_DO_ENXAME
  const petala = p.tipo === 'petala'
  ctx.save()
  if (!petala) ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = p.cor
  for (let i = 0; i < n; i++) {
    const s = (i * 2654435761) >>> 0
    const a = (s % 1000) / 1000
    const b = ((s >>> 10) % 1000) / 1000
    const c = ((s >>> 20) % 1000) / 1000
    const tt = t + p.fase
    let x: number
    let y: number
    let alpha: number
    if (petala) {
      // Pétala CAI e volta ao topo do proprio raio: ciclo por ponto, e nao
      // populacao reciclada — enxame ancorado nao tem borda de tela por onde
      // reciclar.
      const q = ((tt * (0.08 + a * 0.05) + b) % 1)
      x = p.x + Math.cos(a * 6.28 + tt * 0.35) * p.tamanho * (0.3 + c * 0.7)
        + ventoAgora() * 14 * q
      y = p.y - p.tamanho * 0.6 + q * p.tamanho * 1.2
      alpha = 0.75 * Math.min(1, q * 5) * (1 - q) ** 0.6
    } else {
      // Vaga-lume: orbita lenta com dois periodos, e o pisca por ponto.
      x = p.x + Math.cos(tt * (0.25 + a * 0.3) + b * 6.28) * p.tamanho * (0.35 + c * 0.65)
      y = p.y + Math.sin(tt * (0.19 + b * 0.26) + a * 6.28) * p.tamanho * 0.55
      alpha = 0.25 + 0.6 * Math.max(0, Math.sin(tt * (1.3 + c) + a * 6.28))
    }
    if (alpha <= 0.02) continue
    ctx.globalAlpha = alpha
    // Vaga-lume e menor que petala de proposito: ele e um PONTO DE LUZ (soma
    // luz, entao ja aparece mais que o tamanho dele sugere) e petala e um
    // corpo opaco, que precisa de area pra ler como petala e nao como sujeira.
    const r = petala ? RAIO_DO_PONTO_DE_ENXAME : RAIO_DO_PONTO_DE_ENXAME * 0.6
    ctx.beginPath()
    if (petala) ctx.ellipse(x, y, r, r * 0.5, tt * (0.9 + a), 0, Math.PI * 2)
    else ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * Cintilancia de superficie: a peca de chao animada desenhada GRANDE e com
 * alpha baixo, somando luz.
 *
 * Nao e textura de agua. Costurar a peca de 32 na regiao inteira seria trocar a
 * arte do fundo por outra, com dois estilos de agua na mesma tela; o que ela
 * faz aqui e o contrario — uma mancha luminosa que anda por cima da agua que ja
 * esta pintada, e some.
 */
function desenharCintilancia(ctx: CanvasRenderingContext2D, p: PropVivo, t: number, img: HTMLImageElement): void {
  const lq = img.naturalWidth / TIRA_DE_CAUSTICA.quadros
  const q = Math.floor((t + p.fase) * FPS_DA_CAUSTICA) % TIRA_DE_CAUSTICA.quadros
  const lado = p.tamanho * 4.5
  const k = pulso(t + p.fase, 0.37, 0.21)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.05 + k * 0.09
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(
    img, q * lq, 0, lq, img.naturalHeight,
    p.x - lado / 2, p.y - lado * 0.2, lado, lado * 0.4,
  )
  ctx.restore()
}

/**
 * Desenha (e avanca) os props da arte que esta na tela.
 *
 * `janela` em coordenada de MUNDO, igual a da camada de particulas. Chamada de
 * dentro de `desenharAmbiente` — ver o cabecalho pra por que ela vem antes dos
 * desligamentos de preset e de clima.
 */
export function desenharPropsDeAmbiente(
  ctx: CanvasRenderingContext2D,
  imagem: string | null | undefined,
  janela: JanelaDeProps,
  compacto: boolean,
  /**
   * `performance.now()` do quadro, LIDO PELO CHAMADOR.
   *
   * Nao e detalhe de estilo: `ambiente.ts` le o relogio uma vez por quadro pra
   * medir o proprio `delta`, e ler de novo aqui adiantaria o tempo do jogo em
   * um passo por quadro sempre que o relogio for um contador — que e
   * exatamente o que os testes de camada fazem (`vi.spyOn(performance, 'now')`
   * devolvendo `agora += 100`). O sintoma seria delta dobrado nas camadas
   * vizinhas, sem nada apontando pra ca.
   */
  agora: number,
): void {
  if (!imagem) {
    if (props.length) reiniciarPropsDeAmbiente()
    return
  }
  const temAncora = !!ANCORAS_POR_ARTE[imagem] || !!LAVA_POR_ARTE[imagem] || !!AGUA_POR_ARTE[imagem]
  if (!temAncora) {
    if (props.length) reiniciarPropsDeAmbiente()
    return
  }
  // Enquanto a arte nao decodificou nao ha retangulo pra converter a ancora, e
  // a reconstrucao sai vazia. Tentar de novo a cada quadro e barato (uma
  // consulta a Map) e e o que faz o prop aparecer assim que a imagem chega.
  // `compacto` entra na conta porque ele decide QUANTOS props de regiao a
  // mascara rende: sem reconstruir na virada, girar o celular deixaria a
  // contagem do modo anterior.
  if (arteAtual !== imagem || compactoAtual !== compacto || props.length === 0) reconstruir(imagem, compacto)
  if (props.length === 0) return

  // Relogio ABSOLUTO, do mesmo jeito que `vento.ts` faz (PH-233): atribuido,
  // nunca acumulado. Aba em segundo plano volta com todo prop na fase certa em
  // vez de precisar recuperar o tempo perdido, e nao ha estado de tempo aqui
  // pra vazar entre um caso de teste e outro.
  const t = agora / 1000

  const chama = readyImage(TIRA_DE_CHAMA.url)
  const caustica = readyImage(TIRA_DE_CAUSTICA.url)
  const chamaPronta = !!chama && chama.complete && chama.naturalWidth > 0
  const causticaPronta = !!caustica && caustica.complete && caustica.naturalWidth > 0

  for (const p of props) {
    if (
      p.x < janela.x - FOLGA || p.x > janela.x + janela.w + FOLGA
      || p.y < janela.y - FOLGA || p.y > janela.y + janela.h + FOLGA
    ) continue
    switch (p.tipo) {
      case 'fogueira':
      case 'tocha':
        if (chamaPronta) desenharChama(ctx, p, t, chama!, compacto)
        break
      case 'chamine':
      case 'fumarola':
      case 'gas':
        desenharPluma(ctx, p, t, compacto)
        break
      case 'orbe':
        desenharBrilho(ctx, p, t)
        break
      case 'cascata':
      case 'quebraMar':
        desenharEspuma(ctx, p, t)
        break
      case 'correnteza':
        // Prop de REGIAO (celula sorteada dentro da mascara de agua) le como
        // brilho de superficie, nao como respingo: catorze respingos no mar
        // viravam chuva. Prop ANCORADO e um ponto escolhido num rio, e ali
        // respingo e a leitura certa.
        //
        // Sem a arte carregada o de regiao nao desenha NADA — nao cai no
        // respingo. Cair seria trocar um efeito que respeita a mascara por
        // outro que espirra gota pra fora dela: `ondulacaoSoNaAgua.test.ts`
        // pegou exatamente isso, 120 desenhos em terra num quadro so.
        if (p.deRegiao) {
          if (causticaPronta) desenharCintilancia(ctx, p, t, caustica!)
        } else {
          desenharEspuma(ctx, p, t)
        }
        break
      case 'eletrica':
        desenharFaisca(ctx, p, t)
        break
      case 'vagalume':
      case 'petala':
        desenharEnxame(ctx, p, t, compacto)
        break
    }
  }
}
