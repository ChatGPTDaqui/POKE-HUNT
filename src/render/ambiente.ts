// Vida ambiente do cenario (PH-96): folha caindo, brilho de agua, brasa,
// poeira, neve, areia soprando.
//
// ---------------------------------------------------------------------------
// POR QUE E UMA CAMADA, E NAO ANIMACAO DA ARTE
// ---------------------------------------------------------------------------
// O fundo de cada hunt e UMA imagem por sub-bioma
// (`sprites.ts#drawMapBackground`), sem tilemap e sem nenhum metadado de onde
// e agua ou copa de arvore. Nao existe o que animar por regiao sem antes
// autorar essa marcacao em cada uma das 31 artes.
//
// Decidido com o usuario: a camada ambiente cobre o jogo inteiro de uma vez,
// sem arte nova e sem autoria por mapa. Marcar regiao de agua/folhagem arte por
// arte fica como trabalho separado, se e quando fizer sentido.
//
// A LIMITACAO QUE ISSO DEIXA, dita em voz alta: os biomas de agua ganham
// BRILHO DE SUPERFICIE que nao sabe onde a agua esta, entao ele passa por cima
// de terra tambem. Por isso o preset de agua e o mais discreto de todos —
// pontos pequenos, esparsos e de alpha baixo, que leem como cintilancia de luz
// em qualquer superficie. Ondulacao de agua de verdade exige a marcacao por
// regiao.
//
// ---------------------------------------------------------------------------
// O QUE NAO PODE ACONTECER AQUI, EM NENHUMA CIRCUNSTANCIA
// ---------------------------------------------------------------------------
// Nada disto pode tocar `world.rng` nem escrever no `WorldState`.
//
// Aquele gerador e AUTORITATIVO e compartilhado com o resim do servidor: uma
// unica chamada de sorteio a mais no cliente desloca a sequencia inteira, e o
// flush passa a divergir do que o jogador viu na tela. E a classe de bug do
// PH-37 (level-up exibido que o servidor nunca confirmava), e ela nao da erro —
// so faz o jogo mentir.
//
// Entao esta camada tem gerador PROPRIO (LCG local, semeado pela URL da arte),
// vive so neste modulo, e o unico estado dela e um array de particulas que
// morre junto com a troca de arte. O motor nao sabe que ela existe.
import { useUiStore } from '@/stores/uiStore'
import { AGUA_POR_ARTE } from '@/data/generated/aguaMask.generated'

export type PresetAmbiente =
  | 'folha' // floresta, selva, mato alto — folha caindo em deriva + feixe de luz
  | 'agua' // mar, lago, praia, ilha, pantano — cintilancia de superficie
  | 'brasa' // vulcao, caverna vulcanica — brasa subindo
  | 'poeira' // caverna, ruinas, templo, gruta — poeira em suspensao
  | 'neve' // montanha e caverna de gelo — neve caindo com deriva
  | 'areia' // deserto, ermos, terra devastada — areia soprando rasteira
  | 'cidade' // urbano — poeira fina, mais rala que a de caverna
  | 'nenhum'

/**
 * Preset por ARTE, e nao por chave de bioma.
 *
 * Mesma razao que fez o walk-block passar a ser propriedade do desenho (ver o
 * cabecalho de `scripts/build-sub-bioma-collision.js`): quem decide o que
 * aparece na tela e a imagem. Sub-bioma sem arte propria mostra a do bioma e
 * herda o ambiente dela; hunt sem sistema de salas (Modo Pesadelo, BOSS,
 * Campeao Lance, treino) tambem — sem precisar cadastrar nada em lugar nenhum.
 *
 * Tabela EXPLICITA em vez de adivinhar por palavra no nome do arquivo: um
 * `includes('cave')` classificaria `cave-volcanic` como caverna e daria poeira
 * a um mapa de lava, em silencio. Arte que nao esteja aqui cai em 'nenhum' —
 * fica parada como hoje, que e melhor que ganhar o ambiente errado.
 */
const PRESET_POR_ARTE: Record<string, PresetAmbiente> = {
  'assets/hunt-backgrounds/forest.jpg': 'folha',
  'assets/hunt-backgrounds/jungle.jpg': 'folha',
  'assets/hunt-backgrounds/tall-grass.jpg': 'folha',
  'assets/hunt-backgrounds/meadow.jpg': 'folha',
  'assets/hunt-backgrounds/plains.jpg': 'folha',
  'assets/hunt-backgrounds/burnt-forest.jpg': 'areia', // arvore queimada nao solta folha; o que sobe ali e cinza

  'assets/hunt-backgrounds/sea.jpg': 'agua',
  'assets/hunt-backgrounds/lake.jpg': 'agua',
  'assets/hunt-backgrounds/beach.jpg': 'agua',
  'assets/hunt-backgrounds/island.jpg': 'agua',
  'assets/hunt-backgrounds/swamp.jpg': 'agua',

  'assets/hunt-backgrounds/volcano.jpg': 'brasa',
  'assets/hunt-backgrounds/cave-volcanic.jpg': 'brasa',

  'assets/hunt-backgrounds/ruins.jpg': 'poeira',
  'assets/hunt-backgrounds/temple.jpg': 'poeira',
  'assets/hunt-backgrounds/fairy-cave.jpg': 'poeira',
  'assets/hunt-backgrounds/abyss.jpg': 'poeira',
  'assets/hunt-backgrounds/dragon.jpg': 'poeira',
  'assets/hunt-backgrounds/dojo.jpg': 'poeira',

  'assets/hunt-backgrounds/ice-cave.jpg': 'neve',
  'assets/hunt-backgrounds/ice-mountain.jpg': 'neve',
  'assets/hunt-backgrounds/mountain.jpg': 'neve',

  'assets/hunt-backgrounds/desert.jpg': 'areia',
  'assets/hunt-backgrounds/badlands.jpg': 'areia',
  'assets/hunt-backgrounds/wasteland.jpg': 'areia',

  'assets/hunt-backgrounds/town.jpg': 'cidade',
  'assets/hunt-backgrounds/town-night.jpg': 'cidade',
  'assets/hunt-backgrounds/metropolis.jpg': 'cidade',
  'assets/hunt-backgrounds/slum.jpg': 'cidade',
  'assets/hunt-backgrounds/industrial.jpg': 'cidade',
  'assets/hunt-backgrounds/construction-site.jpg': 'cidade',
}

interface Receita {
  /** Quantas particulas em tela cheia no desktop. O compacto usa metade. */
  quantidade: number
  cor: string
  /** Raio em unidades de mundo, faixa [min, max]. */
  raio: [number, number]
  /** Velocidade em unidades de mundo por segundo, faixa [min, max]. */
  velocidade: [number, number]
  /** Direcao dominante, em radianos (0 = pra direita, PI/2 = pra baixo). */
  angulo: number
  /** Quanto o angulo de cada particula desvia do dominante, em radianos. */
  espalhamento: number
  /** Alpha maximo. A particula pulsa entre 0 e este valor. */
  alpha: number
  /** Amplitude do bamboleio lateral, em unidades de mundo. */
  bamboleio: number
  /** `lighter` faz brasa e cintilancia somarem luz em vez de tapar o cenario. */
  aditivo?: boolean
  /** Desenha como risco horizontal (areia soprando) em vez de ponto. */
  risco?: boolean
  /** Feixe de luz difuso atravessando a cena, para as artes de floresta. */
  feixes?: boolean
  /**
   * Ondulacao de superficie: parte das particulas viram ANEL achatado que abre
   * e desmancha, em vez de ponto. So com mascara de agua (ver `receitaDe`) —
   * anel em cima de terra seria o pior dos dois mundos.
   */
  ondular?: boolean
  /**
   * Folha: elipse que GIRA enquanto cai, em vez de circulo.
   *
   * Todo preset desenhava o mesmo circulo cheio, variando so cor e tamanho —
   * folha de floresta lia como ponto amarelo descendo de lado. Uma folha de
   * verdade e achatada e tomba no ar, e e o tombo (nao a cor) que faz o cerebro
   * ler "folha".
   */
  girar?: boolean
  /**
   * Brasa: pisca rapido e o raio pulsa, em vez de alpha suave e raio fixo.
   *
   * Faisca de fogo nao tem brilho constante: ela apaga e reacende. O pulso de
   * raio junto com o de alpha e o que separa "faisca" de "ponto laranja".
   */
  faisca?: boolean
  /**
   * Neve: UM sorteio controla tamanho, velocidade e alpha de cada floco.
   *
   * Sorteados de forma independente, aparecia floco grande e lento e floco
   * pequeno e rapido — que e o contrario do que a profundidade faz. Amarrados,
   * floco grande cai mais rapido e mais opaco (esta perto) e floco pequeno cai
   * devagar e apagado (esta longe), e a nevasca ganha camadas.
   */
  profundidade?: boolean
}

const RECEITAS: Record<Exclude<PresetAmbiente, 'nenhum'>, Receita> = {
  folha: {
    quantidade: 34, cor: '#e8f0a8', raio: [3.4, 7.0], velocidade: [16, 34],
    angulo: Math.PI / 2 + 0.35, espalhamento: 0.3, alpha: 0.72, bamboleio: 16, feixes: true,
    girar: true,
  },
  agua: {
    quantidade: 30, cor: '#eaf8ff', raio: [2.2, 4.4], velocidade: [4, 11],
    angulo: -Math.PI / 2, espalhamento: 1.2, alpha: 0.5, bamboleio: 5, aditivo: true,
  },
  brasa: {
    quantidade: 30, cor: '#ffb057', raio: [2.6, 5.4], velocidade: [18, 40],
    angulo: -Math.PI / 2, espalhamento: 0.4, alpha: 0.8, bamboleio: 11, aditivo: true,
    faisca: true,
  },
  poeira: {
    quantidade: 26, cor: '#e2dcc8', raio: [2.2, 4.8], velocidade: [3, 9],
    angulo: Math.PI / 2, espalhamento: 1.5, alpha: 0.44, bamboleio: 8,
  },
  neve: {
    quantidade: 46, cor: '#ffffff', raio: [2.8, 6.0], velocidade: [22, 46],
    angulo: Math.PI / 2 + 0.22, espalhamento: 0.22, alpha: 0.9, bamboleio: 14,
    profundidade: true,
  },
  areia: {
    quantidade: 32, cor: '#e8d2a4', raio: [2.4, 5.0], velocidade: [46, 88],
    angulo: 0.12, espalhamento: 0.16, alpha: 0.46, bamboleio: 4, risco: true,
  },
  cidade: {
    quantidade: 18, cor: '#ded9d0', raio: [1.8, 3.8], velocidade: [3, 8],
    angulo: 0.5, espalhamento: 1.6, alpha: 0.34, bamboleio: 6,
  },
}

// ---------------------------------------------------------------------------
// AS TRES FORMAS QUE NAO SAO O CIRCULO (PH-115)
// ---------------------------------------------------------------------------
// O PH-96 desenhou tudo como circulo cheio, com `risco` (areia) como unica
// excecao. Cor e tamanho separavam os presets no codigo, mas nao na tela: folha,
// brasa, neve, poeira e poeira de cidade eram o mesmo ponto em cores diferentes.

/** Razao vertical da folha. Achatada, senao ela gira e ninguem percebe. */
const FOLHA_ACHATAMENTO = 0.45
/** Faixa do giro da folha, em radianos por unidade de fase. */
const FOLHA_GIRO = [0.8, 2.4] as const
/** Frequencia do pisca da faisca. Alta de proposito — brasa nao tem brilho constante. */
const FAISCA_PISCA = 2.6
/** Quanto do raio a faisca perde no fundo do pulso. */
const FAISCA_PULSO = 0.4

interface Particula {
  x: number
  y: number
  vx: number
  vy: number
  raio: number
  alphaMax: number
  /** Fase do bamboleio e do pulso de alpha. */
  fase: number
  bamboleio: number
  /** Segundos vividos. So o anel usa — ponto nao envelhece, recicla ao sair. */
  idade: number
  /** Duracao do anel em segundos. 0 = nao e anel. */
  vida: number
  /** Desenha como anel de ondulacao em vez de ponto. */
  anel: boolean
  /**
   * Velocidade e sentido do tombo, em radianos por unidade de fase. 0 = nao
   * gira (todo preset que nao e folha).
   */
  giro: number
}

/** LCG minusculo — nao precisa de qualidade estatistica, precisa NAO ser o
 *  `world.rng`. Ver o cabecalho deste arquivo. */
function sorteioLocal(semente: number): () => number {
  let s = semente || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function semeteDaArte(chave: string): number {
  let h = 2166136261
  for (let i = 0; i < chave.length; i++) {
    h ^= chave.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export interface JanelaDeAmbiente {
  x: number
  y: number
  w: number
  h: number
}

// ---------------------------------------------------------------------------
// MASCARA DE AGUA (PH-113)
// ---------------------------------------------------------------------------
// O cabecalho acima registra a limitacao que o PH-96 deixou: o preset de agua
// "nao sabe onde a agua esta, entao ele passa por cima de terra tambem", e por
// isso ele nasceu o mais discreto de todos.
//
// `aguaMask.generated.ts` resolve isso pra as artes que tem referencia PINTADA.
// Arte sem referencia nao muda em NADA — mesmo brilho discreto de hoje. Ou seja:
// esta mudanca nao pode piorar mapa nenhum, so melhorar os pintados.
//
// Por que pintado e nao derivado da cor da arte: agua e vegetacao coincidem em
// matiz, saturacao, luminancia E textura neste acervo (medido em PH-113, ver o
// cabecalho de scripts/build-agua-mask.js). Nao ha plano separador.

interface MascaraViva { celula: number; grid: string[] }

/** A arte que esta na tela tem mascara de agua? */
function mascaraDaArte(imagem: string): MascaraViva | null {
  return AGUA_POR_ARTE[imagem] ?? null
}

/** O ponto de MUNDO (x,y) cai numa celula marcada como agua? */
function eAgua(mascara: MascaraViva, x: number, y: number): boolean {
  // Fora da grade e "nao e agua", nao "e agua": a grade cobre o retangulo do
  // mundo, e o que passa dela e borda de arte, onde ondular nao faz sentido.
  if (x < 0 || y < 0) return false
  const linha = mascara.grid[Math.floor(y / mascara.celula)]
  return !!linha && linha[Math.floor(x / mascara.celula)] === '1'
}

/**
 * Agua com FOLGA de uma celula em volta.
 *
 * O anel CRESCE depois de nascer. Nascido na celula da margem, ele abre por
 * cima da areia — e o recorte do laco de desenho nao pega isso, porque ele
 * testa o centro da particula, que continua na agua. Nascer no interior e o que
 * impede, e o teto de raio (`ANEL_RAIO_MAXIMO_EM_CELULAS`) e o que faz uma
 * celula de folga bastar.
 */
function aguaComFolga(mascara: MascaraViva, x: number, y: number): boolean {
  const c = mascara.celula
  return eAgua(mascara, x, y)
    && eAgua(mascara, x - c, y) && eAgua(mascara, x + c, y)
    && eAgua(mascara, x, y - c) && eAgua(mascara, x, y + c)
}

/**
 * Receita do preset, reforcada quando ha mascara.
 *
 * O preset de agua e discreto porque nao sabia onde a agua estava — pontinho
 * esparso de alpha baixo, que le como cintilancia de luz em QUALQUER superficie.
 * Com mascara essa restricao cai: da pra ondular de verdade sem risco de a areia
 * ondular junto.
 *
 * Reforcar sem mascara seria o contrario de uma melhoria: deixaria mais visivel
 * exatamente o efeito que passa por cima da terra. Por isso o reforco e
 * CONDICIONAL, e nao um numero novo no lugar do velho.
 */
function receitaDe(preset: Exclude<PresetAmbiente, 'nenhum'>, mascara: MascaraViva | null): Receita {
  const base = RECEITAS[preset]
  if (preset !== 'agua' || !mascara) return base
  return {
    ...base,
    quantidade: Math.round(base.quantidade * 1.8),
    // Raio de NASCIMENTO — o anel abre sozinho depois (ANEL_CRESCIMENTO), entao
    // esticar o raio inicial como antes so engrossaria o ponto de partida.
    raio: [base.raio[0] * 1.1, base.raio[1] * 1.45],
    alpha: Math.min(1, base.alpha * 1.5),
    // Agua nao SOBE. O preset antigo mandava tudo pra cima (-PI/2) porque
    // cintilancia de luz nao tem direcao e subir dava a impressao de brilho
    // evaporando; com mascara o que se quer e superficie, e superficie CORRE.
    // Deriva lenta em qualquer direcao (espalhamento = PI) le como correnteza.
    angulo: 0,
    espalhamento: Math.PI,
    velocidade: [3, 8],
    bamboleio: base.bamboleio * 2.6,
    ondular: true,
  }
}

// Estado da camada. Modulo, e nao WorldState: e cosmetico, nao entra no save,
// nao e resimulado e nao pode viajar pro servidor.
let arteAtual: string | null = null
let particulas: Particula[] = []
let rand: () => number = sorteioLocal(1)
let ultimoInstante = 0
let faseGlobal = 0

// Teto de tempo por quadro. Aba em segundo plano volta com um `delta` de
// minutos, e integrar isso de uma vez teleportaria toda particula pra fora da
// janela — a camada sumiria por alguns segundos ate reciclar. Meio segundo e
// mais que qualquer engasgo real de quadro.
const DELTA_MAXIMO = 0.5

// Folga em volta da janela visivel onde as particulas nascem e sao recicladas.
// A janela e o retangulo do mundo que a camera mostra; sem folga, a particula
// aparecia e desaparecia exatamente na borda da tela, a vista.
const FOLGA = 60

export function presetDaArte(imagem: string | null | undefined): PresetAmbiente {
  if (!imagem) return 'nenhum'
  return PRESET_POR_ARTE[imagem] ?? 'nenhum'
}

// ---------------------------------------------------------------------------
// O ANEL DE ONDULACAO
// ---------------------------------------------------------------------------
// Fracao das particulas que viram anel; o resto continua ponto. Misturar os
// dois e de proposito: so anel le como chuva na agua (todo anel do mesmo
// tamanho, aparecendo e sumindo em ritmo igual), e so ponto e o brilho antigo,
// que nao lia como movimento nenhum.
const ANEL_FRACAO = 0.62
/** Duracao de um anel, em segundos: nasce, abre e desmancha nesse tempo. */
const ANEL_VIDA: [number, number] = [1.5, 2.8]
/** Quantas vezes o raio de nascimento o anel chega a ter no fim da vida. */
const ANEL_CRESCIMENTO = 3.2
/**
 * Achatamento vertical do anel.
 *
 * A camera e de cima com inclinacao — circulo perfeito le como bolha vista de
 * cima, e a arte de fundo nao e desenhada nesse angulo. Achatar da ao anel a
 * mesma perspectiva que a arte ja tem.
 */
const ANEL_ACHATAMENTO = 0.42
/** Espessura do traco do anel, em unidades de mundo. */
const ANEL_TRACO = 1.4
/**
 * Teto do raio do anel, em fracao da celula da mascara.
 *
 * O recorte do laco de desenho olha o CENTRO da particula: um anel de raio
 * maior que a celula abriria por cima da margem mesmo com o centro dentro da
 * agua, e nenhum teste pega isso. O teto e a segunda metade da defesa — a
 * primeira e nascer com folga (`aguaComFolga`).
 */
const ANEL_RAIO_MAXIMO_EM_CELULAS = 0.8

/**
 * Quantas posicoes sortear procurando agua antes de desistir.
 *
 * Desistir importa: numa janela SEM agua nenhuma (o jogador andou pra dentro da
 * mata do `swamp`) nenhum sorteio acerta, e insistir travaria o quadro. Ao
 * desistir a particula nasce onde caiu, e o laco de desenho a recicla antes de
 * desenhar — o efeito rarefaz longe da agua em vez de vazar pra terra.
 */
const TENTATIVAS_DE_AGUA = 12

function nascer(
  p: Particula,
  r: Receita,
  janela: JanelaDeAmbiente,
  aoEntrar: boolean,
  mascara: MascaraViva | null = null,
): void {
  const ang = r.angulo + (rand() - 0.5) * 2 * r.espalhamento
  // UM sorteio pra tamanho, velocidade e alpha quando a receita pede
  // profundidade; tres sorteios independentes quando nao pede. Ver
  // `Receita.profundidade`.
  const perto = r.profundidade ? rand() : null
  const vel = r.velocidade[0] + (perto ?? rand()) * (r.velocidade[1] - r.velocidade[0])
  p.vx = Math.cos(ang) * vel
  p.vy = Math.sin(ang) * vel
  p.raio = r.raio[0] + (perto ?? rand()) * (r.raio[1] - r.raio[0])
  p.alphaMax = r.alpha * (perto != null ? 0.45 + perto * 0.55 : 0.5 + rand() * 0.5)
  p.fase = rand() * Math.PI * 2
  p.bamboleio = r.bamboleio * (0.4 + rand() * 0.6)
  p.idade = 0
  p.anel = !!r.ondular && rand() < ANEL_FRACAO
  p.vida = p.anel ? ANEL_VIDA[0] + rand() * (ANEL_VIDA[1] - ANEL_VIDA[0]) : 0
  // Sentido sorteado: folha caindo toda pro mesmo lado le como engrenagem.
  p.giro = r.girar
    ? (rand() < 0.5 ? -1 : 1) * (FOLHA_GIRO[0] + rand() * (FOLHA_GIRO[1] - FOLHA_GIRO[0]))
    : 0

  // Com mascara, a particula nasce DENTRO da agua e nao na borda da janela — o
  // ponto inteiro do PH-113. Vale tambem na reciclagem: entrar pela borda faria
  // a onda atravessar a terra ate achar agua.
  if (mascara) {
    // Duas rodadas, e nao uma: primeiro procura INTERIOR (folga de uma celula,
    // pra o anel poder abrir sem passar da margem); se nao achar, aceita
    // qualquer agua. A segunda rodada nao e redundante — canal estreito de
    // `swamp` tem largura de uma celula em varios trechos, e sem ela aquele
    // trecho de agua nao ganharia particula nenhuma.
    for (let i = 0; i < TENTATIVAS_DE_AGUA; i++) {
      const x = janela.x + rand() * janela.w
      const y = janela.y + rand() * janela.h
      if (aguaComFolga(mascara, x, y)) { p.x = x; p.y = y; return }
    }
    for (let i = 0; i < TENTATIVAS_DE_AGUA; i++) {
      const x = janela.x + rand() * janela.w
      const y = janela.y + rand() * janela.h
      if (eAgua(mascara, x, y)) { p.x = x; p.y = y; return }
    }
    p.x = janela.x + rand() * janela.w
    p.y = janela.y + rand() * janela.h
    return
  }

  if (!aoEntrar) {
    // Primeira populacao: espalhada pela janela inteira, senao a camada entra
    // como uma cortina vindo de uma borda so.
    p.x = janela.x - FOLGA + rand() * (janela.w + FOLGA * 2)
    p.y = janela.y - FOLGA + rand() * (janela.h + FOLGA * 2)
    return
  }
  // Reciclagem: entra pela borda OPOSTA a direcao de deslocamento, na
  // travessia mais longa possivel — assim a particula atravessa a cena em vez
  // de reaparecer perto de onde saiu.
  if (Math.abs(p.vx) > Math.abs(p.vy)) {
    p.x = p.vx > 0 ? janela.x - FOLGA : janela.x + janela.w + FOLGA
    p.y = janela.y - FOLGA + rand() * (janela.h + FOLGA * 2)
  } else {
    p.y = p.vy > 0 ? janela.y - FOLGA : janela.y + janela.h + FOLGA
    p.x = janela.x - FOLGA + rand() * (janela.w + FOLGA * 2)
  }
}

function reconstruir(
  chave: string,
  preset: Exclude<PresetAmbiente, 'nenhum'>,
  janela: JanelaDeAmbiente,
  compacto: boolean,
  mascara: MascaraViva | null,
): void {
  const r = receitaDe(preset, mascara)
  rand = sorteioLocal(semeteDaArte(chave))
  // Metade no compacto (celular): o laco de desenho roda a 60/s e esta e a
  // unica coisa aqui que cresce sem limite natural.
  const quantidade = Math.max(1, Math.round(r.quantidade * (compacto ? 0.5 : 1)))
  particulas = []
  for (let i = 0; i < quantidade; i++) {
    const p: Particula = {
      x: 0, y: 0, vx: 0, vy: 0, raio: 0, alphaMax: 0, fase: 0, bamboleio: 0,
      idade: 0, vida: 0, anel: false, giro: 0,
    }
    nascer(p, r, janela, false, mascara)
    particulas.push(p)
  }
  arteAtual = chave
}

/**
 * Desenha (e avanca) a camada ambiente. Chamada entre o fundo e as entidades,
 * dentro da transformacao de camera — as coordenadas aqui sao de MUNDO.
 *
 * `imagem` e a URL da arte que esta na tela; ela e a chave do preset e tambem
 * o sinal de troca de sala (arte diferente = repovoar).
 */
export function desenharAmbiente(
  ctx: CanvasRenderingContext2D,
  imagem: string | null | undefined,
  janela: JanelaDeAmbiente,
): void {
  const ui = useUiStore.getState()
  if (!ui.vidaNoCenario) {
    // Desligado no ajuste: solta o estado pra a camada nao voltar com
    // particulas velhas (e pra ela nao custar memoria enquanto esta off).
    if (particulas.length) { particulas = []; arteAtual = null }
    return
  }

  const preset = presetDaArte(imagem)
  if (preset === 'nenhum' || !imagem) {
    if (particulas.length) { particulas = []; arteAtual = null }
    return
  }

  const mascara = mascaraDaArte(imagem)
  const r = receitaDe(preset, mascara)
  const compacto = ui.viewportWidth > 0 && ui.viewportWidth < 760
  if (arteAtual !== imagem || particulas.length === 0) reconstruir(imagem, preset, janela, compacto, mascara)

  const agora = performance.now()
  // Primeiro quadro apos reconstruir: sem instante anterior, `delta` seria o
  // uptime inteiro da pagina.
  const delta = ultimoInstante === 0 ? 0 : Math.min(DELTA_MAXIMO, (agora - ultimoInstante) / 1000)
  ultimoInstante = agora
  faseGlobal += delta

  ctx.save()
  if (r.aditivo) ctx.globalCompositeOperation = 'lighter'

  if (r.feixes) desenharFeixes(ctx, janela)

  ctx.fillStyle = r.cor
  ctx.strokeStyle = r.cor
  // Teto do anel em unidades de mundo. Sem mascara nao ha anel, entao nao ha
  // teto a calcular.
  const raioMaximoDoAnel = mascara
    ? mascara.celula * ANEL_RAIO_MAXIMO_EM_CELULAS
    : Number.POSITIVE_INFINITY
  for (const p of particulas) {
    p.x += p.vx * delta
    p.y += p.vy * delta
    p.fase += delta * 1.7
    p.idade += delta

    // Bamboleio perpendicular ao deslocamento: folha e neve nao caem em linha
    // reta, e o desvio lateral e o que separa "particula" de "chuva".
    const desvio = Math.sin(p.fase) * p.bamboleio * delta
    p.x += -p.vy * desvio * 0.02
    p.y += p.vx * desvio * 0.02

    const foraX = p.x < janela.x - FOLGA * 2 || p.x > janela.x + janela.w + FOLGA * 2
    const foraY = p.y < janela.y - FOLGA * 2 || p.y > janela.y + janela.h + FOLGA * 2
    // Com mascara, SAIR DA AGUA tambem recicla — senao a onda continuaria
    // subindo depois de passar da margem e apareceria em cima da terra, que e
    // exatamente o que esta mudanca existe pra impedir. Cobre tambem a
    // particula que nasceu em terra por `TENTATIVAS_DE_AGUA` ter desistido:
    // ela e reciclada ANTES de ser desenhada.
    // Anel tem VIDA: ele nao sai da tela, ele desmancha onde esta. Sem este
    // ramo o anel travaria no raio maximo e ficaria plantado ate a deriva
    // tira-lo da agua, que e o oposto de ondular.
    const acabou = p.anel && p.idade >= p.vida
    if (foraX || foraY || acabou || (mascara && !eAgua(mascara, p.x, p.y))) {
      nascer(p, r, janela, true, mascara)
      continue
    }

    if (p.anel) {
      const t = p.idade / p.vida
      const raio = Math.min(raioMaximoDoAnel, p.raio * (1 + t * ANEL_CRESCIMENTO))
      // Queda quadratica: linear deixa o anel visivel ate o ultimo quadro e
      // sumir de uma vez, que pisca. Ao quadrado ele apaga antes do fim da
      // vida e a troca nao aparece.
      const restante = 1 - t
      ctx.globalAlpha = p.alphaMax * restante * restante
      ctx.lineWidth = ANEL_TRACO
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, raio, raio * ANEL_ACHATAMENTO, 0, 0, Math.PI * 2)
      ctx.stroke()
      continue
    }
    // Pisca rapido E o raio pulsa junto (faisca). `Math.abs` do seno em vez do
    // seno cru: com o seno, metade do ciclo fica no alpha minimo e a brasa passa
    // mais tempo apagada que acesa.
    const pulso = r.faisca ? Math.abs(Math.sin(p.fase * FAISCA_PISCA)) : 0
    ctx.globalAlpha = r.faisca
      ? p.alphaMax * (0.3 + 0.7 * pulso)
      : p.alphaMax * (0.55 + 0.45 * Math.sin(p.fase * 0.8))
    if (r.risco) {
      // Areia soprando le melhor como risco na direcao do vento que como ponto.
      ctx.lineWidth = p.raio
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05)
      ctx.stroke()
    } else if (p.giro !== 0) {
      // Folha: elipse achatada girando no proprio eixo. A rotacao sai da fase
      // (que ja avanca com o tempo), entao nao ha estado novo por particula alem
      // da velocidade do tombo.
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, p.raio, p.raio * FOLHA_ACHATAMENTO, p.fase * p.giro, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.raio * (r.faisca ? 1 - FAISCA_PULSO * (1 - pulso) : 1), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

// Feixe de luz difuso das artes de floresta: tres faixas diagonais bem
// transparentes que passeiam devagar. Nao sao particulas (nao reciclam, nao
// tem estado proprio) — a posicao sai de `faseGlobal`, entao custam tres
// `fillRect` e nenhuma alocacao.
function desenharFeixes(ctx: CanvasRenderingContext2D, janela: JanelaDeAmbiente): void {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.rotate(-0.5)
  const largura = janela.w * 0.16
  // O `rotate` gira o eixo, entao o retangulo precisa ser desenhado num
  // intervalo maior que a janela pra cobri-la inteira depois de girada.
  const alcance = (janela.w + janela.h) * 1.5
  for (let i = 0; i < 3; i++) {
    const deriva = ((faseGlobal * 6 + i * alcance * 0.37) % alcance) - alcance * 0.25
    const x = (janela.x + janela.y) * 0.7 + deriva
    const g = ctx.createLinearGradient(x, 0, x + largura, 0)
    g.addColorStop(0, 'rgba(255, 248, 214, 0)')
    g.addColorStop(0.5, 'rgba(255, 248, 214, 0.10)')
    g.addColorStop(1, 'rgba(255, 248, 214, 0)')
    ctx.fillStyle = g
    ctx.fillRect(x, -alcance, largura, alcance * 2)
  }
  ctx.restore()
}

/** Solta o estado. Chamado ao sair da hunt, pra a proxima entrada nao herdar
 *  particulas posicionadas na janela de outro mapa. */
export function reiniciarAmbiente(): void {
  particulas = []
  arteAtual = null
  ultimoInstante = 0
}
