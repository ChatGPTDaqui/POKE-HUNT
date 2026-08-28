// Vida ambiente do cenario (PH-96): folha caindo, cintilancia de agua, faisca,
// poeira, neve, areia soprando, fiapo urbano e gotejo que respinga no chao.
//
// A ESCALA de tudo isto vem de `escalaDoMundo.ts` (PH-232) e a SILHUETA de
// cada preset esta no bloco "AS SILHUETAS", mais abaixo. Os dois existem pelo
// mesmo motivo: antes deles a camada desenhava a mesma bolinha grande demais
// em quase todo bioma.
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
import { LAVA_POR_ARTE } from '@/data/generated/lavaMask.generated'
import { emPoke } from './escalaDoMundo'
import {
  avancarGotas, criarEstadoDeGotas, desenharGotas, povoarGotas,
  type ConfigDeGota, type EstadoDeGotas,
} from './gotas'

export type PresetAmbiente =
  | 'folha' // floresta, campo, mato alto — folha caindo em deriva + feixe de luz
  | 'selva' // selva — folha da copa + gotejo que respinga no chao
  | 'agua' // mar, lago, praia, ilha, pantano — cintilancia de superficie
  | 'brasa' // vulcao, caverna vulcanica — faisca subindo
  | 'poeira' // ruinas, templo, dojo, covil — poeira SECA em suspensao
  | 'caverna' // gruta e abismo — poeira fina + pingo de teto que respinga
  | 'neve' // montanha e caverna de gelo — neve caindo com deriva
  | 'areia' // deserto, ermos, terra devastada — areia soprando rasteira
  | 'cidade' // urbano — fiapo/cinza em suspensao, mais ralo que a poeira
  | 'nenhum'

// A regua de escala vem de `escalaDoMundo.ts` (PH-232): todo raio daqui e
// declarado em FRACAO da altura de um POKE, e a fracao fica visivel na propria
// linha da receita. Ver aquele arquivo pra os numeros que motivaram a mudanca
// e pra por que a referencia e 40 unidades.

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
  // Selva e o unico mapa de vegetacao FECHADA do acervo: agua fica parada na
  // copa e pinga depois. Floresta temperada e campo aberto nao pingam — dar
  // gotejo aos cinco de uma vez seria "chove em todo mapa verde", que e o
  // oposto do que separar os biomas quer dizer.
  'assets/hunt-backgrounds/jungle.jpg': 'selva',
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

  // SECO fica em `poeira`; gruta fechada, onde a agua escorre pela rocha,
  // ganha o gotejo. Ruina a ceu aberto, templo, dojo e covil de dragao sao
  // secos — pingo ali seria goteira sem telhado.
  'assets/hunt-backgrounds/ruins.jpg': 'poeira',
  'assets/hunt-backgrounds/temple.jpg': 'poeira',
  'assets/hunt-backgrounds/dragon.jpg': 'poeira',
  'assets/hunt-backgrounds/dojo.jpg': 'poeira',
  'assets/hunt-backgrounds/fairy-cave.jpg': 'caverna',
  'assets/hunt-backgrounds/abyss.jpg': 'caverna',

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

export interface Receita {
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
  /**
   * A SILHUETA da particula (PH-232).
   *
   * Antes disto a forma saia de tres booleanos soltos (`risco`, `girar`,
   * `faisca`) e o default — nenhum deles ligado — era o circulo cheio. Quatro
   * dos sete presets caiam nesse default: agua sem mascara, poeira, cidade e
   * brasa desenhavam exatamente o mesmo `arc`, variando so cor e raio. Um
   * campo obrigatorio resolve pela estrutura: nao ha mais "default silencioso"
   * onde cair, e adicionar preset novo obriga a escolher a silhueta.
   *
   * Ver `desenharParticula` pra o que cada uma emite; `silhuetaPorPreset.
   * test.ts` reprova se dois presets voltarem a emitir a mesma coisa.
   */
  forma: FormaDeParticula
  /** Feixe de luz difuso atravessando a cena, para as artes de floresta. */
  feixes?: boolean
  /**
   * Ondulacao de superficie: parte das particulas viram ANEL achatado que abre
   * e desmancha, em vez de ponto. So com mascara de agua (ver `receitaDe`) —
   * anel em cima de terra seria o pior dos dois mundos.
   */
  ondular?: boolean
  /**
   * Neve: UM sorteio controla tamanho, velocidade e alpha de cada floco.
   *
   * Sorteados de forma independente, aparecia floco grande e lento e floco
   * pequeno e rapido — que e o contrario do que a profundidade faz. Amarrados,
   * floco grande cai mais rapido e mais opaco (esta perto) e floco pequeno cai
   * devagar e apagado (esta longe), e a nevasca ganha camadas.
   */
  profundidade?: boolean
  /**
   * Brilho pulsante rente a BASE da janela (PH-195) — poucos focos de luz
   * quente por baixo da brasa que sobe, tipo vulcao/lava respirando. So
   * `brasa` pede: nenhum outro preset tem "fonte" no chao pra brilhar.
   */
  brilhoDoChao?: boolean
  /**
   * Folha: ganha rajada de vento periodica (PH-188) — bamboleio e velocidade
   * de queda sobem durante a rajada e voltam ao normal depois. So faz sentido
   * pra preset que representa vegetacao; agua/poeira/brasa/etc nao pedem vento.
   */
  vento?: boolean
  /**
   * Fracao do ALTO da janela onde a particula pode NASCER (PH-188). `0.4` =
   * so no topo 40%. Undefined = janela inteira (todo preset sem isto).
   *
   * So a folha usa: sem isto ela nascia espalhada por qualquer altura da
   * tela, inclusive rente ao chao — lendo como confete solto, nao como algo
   * caindo da copa. Nao ha marcacao de ONDE a arvore esta em cada arte (a
   * mesma limitacao que a agua tinha antes da mascara do PH-113), entao isto
   * e aproximacao: assume que copa fica na faixa de cima da cena, sem saber
   * a posicao real de nenhuma arvore. A RECICLAGEM (`nascer` com
   * `aoEntrar`) ja entra por uma linha logo acima da janela — nao precisa
   * dessa faixa, so a primeira populacao precisa.
   */
  faixaOrigemY?: number
  /**
   * Gotejo (PH-232): populacao SEPARADA de gotas que caem de um ponto fixo do
   * mundo e RESPINGAM no chao. Ver `gotas.ts`.
   *
   * Nao e uma forma de particula, e uma segunda camada: as gotas tem ciclo de
   * vida proprio (esperam no teto, caem, morrem no impacto) que nao cabe no
   * laco de reciclagem por borda que as outras usam.
   */
  gotejo?: { quantidade: number; config: ConfigDeGota }
}

/**
 * As silhuetas. Cada uma emite uma sequencia PROPRIA de primitivas de canvas —
 * e essa sequencia que `silhuetaPorPreset.test.ts` compara entre presets.
 *
 *   folha    elipse achatada que TOMBA no eixo enquanto cai (PH-115)
 *   grao     ponto cheio, sem pulso — poeira e neve
 *   fiapo    fibra DOBRADA (dois segmentos) que rola devagar — cinza urbana
 *   risco    um segmento reto na direcao do vento — areia soprando
 *   faisca   rastro curto na direcao do movimento + nucleo que pulsa — brasa
 *   cintilo  cruz de quatro pontas com nucleo quente — reflexo em agua
 *   anel     elipse VAZADA que abre e desmancha — ondulacao de agua (PH-113)
 *
 * `anel` nao aparece em receita nenhuma: ele e sorteado dentro do preset
 * `agua` quando ha mascara (ver `receitaDe`), e convive com `cintilo` no
 * mesmo laco.
 */
export type FormaDeParticula = 'folha' | 'grao' | 'fiapo' | 'risco' | 'faisca' | 'cintilo'

/**
 * Gotejo de vegetacao fechada: agua que ficou parada na copa e cai depois.
 *
 * Verde-claro e nao azul: o que pinga da mata leva a cor da folha que a
 * segurou. Azul de agua limpa ali leria como chuva, e chuva e clima — quem
 * decide isso e o servidor, nao a arte do mapa.
 */
const GOTEJO_DE_SELVA: ConfigDeGota = {
  cor: '#bfe6d8', corDoRespingo: '#eafff8',
  comprimento: [3.0, 6.0], espessura: [0.5, 0.9],
  velocidade: [150, 240], inclinacao: 0.05, espalhamento: 0.06, alpha: 0.55,
  raioDoRespingo: [2.4, 4.2], vidaDoRespingo: [0.34, 0.52], microgotas: 3, alphaDoRespingo: 0.9,
  fracaoQuePousa: 1, origemFixa: true, espera: [0.8, 3.4],
}

/**
 * Gotejo de gruta: pingo de teto, mais lento, mais raro e ADITIVO.
 *
 * Aditivo porque caverna e o cenario mais escuro do acervo — agua desenhada
 * por cima some, agua que SOMA luz aparece. E o mesmo motivo pelo qual a brasa
 * e aditiva desde o PH-96.
 */
const GOTEJO_DE_CAVERNA: ConfigDeGota = {
  cor: '#a8d8e8', corDoRespingo: '#dff4ff',
  comprimento: [2.6, 5.2], espessura: [0.45, 0.85],
  velocidade: [130, 210], inclinacao: 0, espalhamento: 0.04, alpha: 0.6,
  raioDoRespingo: [2.0, 3.6], vidaDoRespingo: [0.38, 0.58], microgotas: 3, alphaDoRespingo: 0.9,
  fracaoQuePousa: 1, origemFixa: true, espera: [1.0, 4.0], aditivo: true,
}

// ---------------------------------------------------------------------------
// AS RECEITAS
// ---------------------------------------------------------------------------
// Os raios sao declarados em `emPoke(fracao)` de proposito: e a fracao, e nao
// o numero de unidades, que diz se a particula tem o tamanho da coisa que ela
// representa. Comparativo com o que havia antes do PH-232, em DIAMETRO sobre a
// altura de um POKE:
//
//   poeira  24% -> 6%      cidade  19% -> 5,5%
//   neve    30% -> 11%     brasa   27% -> 4,5% (nucleo; o rastro e movimento)
//   agua    22% -> 8,5%    folha   17% -> 10%
//
// A CONTRAPARTIDA e a quantidade: particula menor precisa aparecer em maior
// numero pra a camada continuar sendo notada. Poeira foi de 26 pra 62, cidade
// de 18 pra 40. Custa mais laco e menos pixel — e a troca certa, porque o que
// incomodava era area coberta, nao contagem.
export const RECEITAS: Record<Exclude<PresetAmbiente, 'nenhum'>, Receita> = {
  folha: {
    // Ambar, e nao o amarelo-esverdeado de antes (`#e8f0a8`): folha que CAI e
    // folha seca, e todo mapa deste preset e verde. Uma folha na mesma matiz do
    // fundo desaparece por mais que se aumente o alpha — o que faltava era
    // contraste de COR, nao de tamanho. Conferido no jogo, sala Relvado.
    quantidade: 30, cor: '#d9a44e', raio: [emPoke(0.0225), emPoke(0.05)], velocidade: [16, 34],
    angulo: Math.PI / 2 + 0.35, espalhamento: 0.3, alpha: 0.75, bamboleio: 16, feixes: true,
    forma: 'folha', vento: true, faixaOrigemY: 0.4,
  },
  // Selva: folha um pouco maior e mais escura que a de floresta temperada, com
  // menos feixe (a copa e fechada) e o gotejo por baixo.
  selva: {
    quantidade: 26, cor: '#c9a84a', raio: [emPoke(0.026), emPoke(0.0575)], velocidade: [13, 28],
    angulo: Math.PI / 2 + 0.28, espalhamento: 0.34, alpha: 0.7, bamboleio: 14, feixes: true,
    forma: 'folha', vento: true, faixaOrigemY: 0.4,
    gotejo: { quantidade: 6, config: GOTEJO_DE_SELVA },
  },
  agua: {
    quantidade: 44, cor: '#eaf8ff', raio: [emPoke(0.018), emPoke(0.0425)], velocidade: [4, 11],
    angulo: -Math.PI / 2, espalhamento: 1.2, alpha: 0.55, bamboleio: 5, aditivo: true,
    forma: 'cintilo',
  },
  brasa: {
    quantidade: 40, cor: '#ffb057', raio: [emPoke(0.010), emPoke(0.0225)], velocidade: [18, 40],
    angulo: -Math.PI / 2, espalhamento: 0.4, alpha: 0.85, bamboleio: 11, aditivo: true,
    forma: 'faisca', brilhoDoChao: true,
  },
  poeira: {
    quantidade: 62, cor: '#e2dcc8', raio: [emPoke(0.0135), emPoke(0.034)], velocidade: [3, 9],
    angulo: Math.PI / 2, espalhamento: 1.5, alpha: 0.6, bamboleio: 8,
    forma: 'grao',
  },
  // Caverna: mesma poeira, ainda mais fina, com o pingo de teto por cima.
  caverna: {
    quantidade: 52, cor: '#cfd8dc', raio: [emPoke(0.0125), emPoke(0.03)], velocidade: [2, 7],
    angulo: Math.PI / 2, espalhamento: 1.6, alpha: 0.55, bamboleio: 9,
    forma: 'grao',
    gotejo: { quantidade: 5, config: GOTEJO_DE_CAVERNA },
  },
  neve: {
    quantidade: 60, cor: '#ffffff', raio: [emPoke(0.0225), emPoke(0.055)], velocidade: [22, 46],
    angulo: Math.PI / 2 + 0.22, espalhamento: 0.22, alpha: 0.9, bamboleio: 14,
    forma: 'grao', profundidade: true,
  },
  areia: {
    quantidade: 54, cor: '#e8d2a4', raio: [emPoke(0.0125), emPoke(0.03)], velocidade: [70, 140],
    angulo: 0.12, espalhamento: 0.16, alpha: 0.6, bamboleio: 4,
    forma: 'risco',
  },
  cidade: {
    quantidade: 40, cor: '#ded9d0', raio: [emPoke(0.014), emPoke(0.0325)], velocidade: [3, 8],
    angulo: 0.5, espalhamento: 1.6, alpha: 0.55, bamboleio: 6,
    forma: 'fiapo',
  },
}

// ---------------------------------------------------------------------------
// AS SILHUETAS (PH-115, refeitas no PH-232)
// ---------------------------------------------------------------------------
// O PH-96 desenhou tudo como circulo cheio, com `risco` (areia) como unica
// excecao. O PH-115 tirou folha, neve e areia desse molde, mas quatro presets
// ficaram: agua sem mascara, poeira, cidade e brasa continuaram sendo o mesmo
// `arc` em cores diferentes — e sao justamente quatro dos nove biomas.
//
// Agora cada silhueta emite uma sequencia PROPRIA de primitivas, e a diferenca
// nao e cosmetica: e o formato que diz ao olho o que a coisa e. Fiapo de cinza
// urbana e uma fibra DOBRADA porque fibra nao e reta; faisca e um rastro
// porque brasa viaja; cintilancia e uma cruz porque reflexo especular tem
// pontas. Nenhuma delas e um circulo.

/** Razao vertical da folha. Achatada, senao ela gira e ninguem percebe. */
const FOLHA_ACHATAMENTO = 0.45
/** Faixa do giro da folha, em radianos por unidade de fase. */
const FOLHA_GIRO = [0.8, 2.4] as const
/** Frequencia do pisca da faisca. Alta de proposito — brasa nao tem brilho constante. */
const FAISCA_PISCA = 2.6
/** Quanto do raio a faisca perde no fundo do pulso. */
const FAISCA_PULSO = 0.4
/** Comprimento do rastro da faisca, em multiplos do raio do nucleo. */
const FAISCA_RASTRO = 6
/** Espessura do rastro da faisca, em fracao do raio do nucleo. */
const FAISCA_TRACO = 0.8
/**
 * Comprimento do risco de areia, em segundos de deslocamento.
 *
 * A conta e proporcional a VELOCIDADE, e nao um numero fixo: risco de vento e
 * borrao de movimento, entao grao rapido tem que deixar rastro mais longo que
 * grao lento. Antes do PH-232 o comprimento era `velocidade * 0,05` com
 * espessura ate 5 unidades — 4,4 de comprimento por 5 de espessura, ou seja,
 * mais grosso que longo. Isso nao e um risco, e uma bolha, e era exatamente
 * assim que aparecia na tela.
 */
export const RISCO_SEGUNDOS = 0.11
/** Angulo da dobra do fiapo, em radianos. Fibra reta leria como risco de areia. */
const FIAPO_DOBRA = 1.15
/** Velocidade do rolamento do fiapo, em radianos por unidade de fase. */
const FIAPO_ROLAGEM = 0.45
/** Meio-comprimento da ponta longa da cruz de cintilancia, em multiplos do raio. */
const CINTILO_PONTA = 2.2
/** Razao da ponta CURTA da cruz. Cruz de pontas iguais le como simbolo, nao como brilho. */
const CINTILO_RAZAO_CURTA = 0.45
/** Expoente do pisca da cintilancia. Alto = a maior parte do tempo apagada, com estalos. */
const CINTILO_EXPOENTE = 3
/** Frequencia do pisca da cintilancia, em radianos por unidade de fase. */
const CINTILO_PISCA = 1.9

// ---------------------------------------------------------------------------
// RAJADA DE VENTO NA FOLHAGEM (PH-188)
// ---------------------------------------------------------------------------
// Vento de verdade nao sopra constante: vem em rajada e some. Um multiplicador
// senoidal simples (`sin(fase * f)`) leria como respiracao regular, nao vento —
// metade do tempo em alta, metade em baixa. Somar tres senos de frequencia
// incomensuravel e elevar o resultado ao cubo estreita os picos: a maior parte
// do tempo o vento fica perto de zero, com rajadas esporadicas que sobem e
// caem rapido — o padrao que le como natural, nao mecanico.
const VENTO_FREQ: readonly [number, number, number] = [0.11, 0.23, 0.05]
const VENTO_FASE: readonly [number, number, number] = [0, 2.1, 4.7]
const VENTO_PESO: readonly [number, number, number] = [0.5, 0.3, 0.2]

/**
 * Intensidade do vento em [0, 1], funcao pura de `faseGlobal` (segundos).
 *
 * Exportada pra ser testada direto, sem depender de mockar relogio e RNG do
 * sorteio local so pra reproduzir a fase de rajada.
 */
export function intensidadeDoVento(fase: number): number {
  const onda = VENTO_FREQ.reduce(
    (soma, freq, i) => soma + Math.sin(fase * freq + VENTO_FASE[i]) * VENTO_PESO[i],
    0,
  )
  return ((onda + 1) / 2) ** 3
}

/** Quanto o bamboleio (deriva lateral) aumenta no pico da rajada. */
const VENTO_BAMBOLEIO_PICO = 2.4
/** Quanto a queda acelera no pico da rajada — vento tambem empurra pra baixo. */
const VENTO_QUEDA_PICO = 0.5

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
// MASCARA DE REGIAO (agua PH-113, lava PH-195)
// ---------------------------------------------------------------------------
// O cabecalho do arquivo registra a limitacao que o PH-96 deixou: a camada
// "nao sabe onde a agua/lava esta, entao passa por cima de terra tambem", e
// por isso os presets nasceram discretos, sem se prender a lugar nenhum.
//
// `aguaMask.generated.ts` (PH-113) e `lavaMask.generated.ts` (PH-195) resolvem
// isso pra as artes que tem referencia — pintada a mao pra agua (agua e
// vegetacao coincidem em matiz/saturacao/luminancia/textura neste acervo, sem
// plano separador por cor), derivada por COR pra lava em `volcano` (o nucleo
// dela separa por uma margem grande do resto, ver o cabecalho de
// `scripts/pintar-ref-lava.js` — `cave-volcanic` NAO entrou, mesma classe de
// falha da agua: cristal grande demais no mesmo ponto de cor).
//
// Arte sem referencia (de qualquer um dos dois) nao muda em NADA — mesmo
// comportamento discreto/livre de antes. As duas mascaras tem o MESMO
// formato de grade (celula 20, '1' = regiao) e as mesmas funcoes de consulta
// abaixo servem pra qualquer uma — a particula que usa a mascara (agua ondula
// na dela, brasa nasce/vive na dela) nao precisa de logica separada pra achar
// "estou dentro?".

interface MascaraViva { celula: number; grid: string[] }

/** A arte que esta na tela tem mascara pro preset dela (agua ou lava)? */
function mascaraDaArte(preset: Exclude<PresetAmbiente, 'nenhum'>, imagem: string): MascaraViva | null {
  if (preset === 'agua') return AGUA_POR_ARTE[imagem] ?? null
  if (preset === 'brasa') return LAVA_POR_ARTE[imagem] ?? null
  return null
}

/** O ponto de MUNDO (x,y) cai numa celula marcada na mascara? */
function dentroDaMascara(mascara: MascaraViva, x: number, y: number): boolean {
  // Fora da grade conta como fora da regiao: a grade cobre o retangulo do
  // mundo, e o que passa dela e borda de arte, onde o efeito nao faz sentido.
  if (x < 0 || y < 0) return false
  const linha = mascara.grid[Math.floor(y / mascara.celula)]
  return !!linha && linha[Math.floor(x / mascara.celula)] === '1'
}

/**
 * Dentro da regiao com FOLGA de uma celula em volta.
 *
 * O anel de agua CRESCE depois de nascer — nascido na celula da margem, ele
 * abriria por cima da areia, e o recorte do laco de desenho nao pega isso
 * porque testa o centro da particula, que continua dentro. Nascer no
 * interior e o que impede. A brasa nao cresce, mas usa a MESMA folga: nascer
 * colado na margem faria metade da faisca aparecer fora da lava desde o
 * primeiro quadro.
 */
function dentroComFolga(mascara: MascaraViva, x: number, y: number): boolean {
  const c = mascara.celula
  return dentroDaMascara(mascara, x, y)
    && dentroDaMascara(mascara, x - c, y) && dentroDaMascara(mascara, x + c, y)
    && dentroDaMascara(mascara, x, y - c) && dentroDaMascara(mascara, x, y + c)
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

/** Um foco de brilho, ancorado numa celula real da mascara de lava. Ver `desenharBrilhoDoChao`. */
interface FocoDeBrilho {
  x: number
  y: number
  raio: number
  /** Frequencia/fase da onda RAPIDA do pulso — a que da o "respirar" visivel. */
  freqA: number
  faseA: number
  /** Frequencia/fase da onda LENTA — quebra a periodicidade da rapida, senao
   *  cada foco pisca igual e sincronizado, lendo como luz de LED piscando. */
  freqB: number
  faseB: number
}
let focosDeBrilho: FocoDeBrilho[] = []

/**
 * Estado do gotejo (PH-232). Null quando o preset da vez nao pinga — que e a
 * maioria: so `selva` e `caverna` pedem.
 *
 * Vive fora de `particulas` porque a gota nao recicla por borda: ela morre no
 * impacto, espera no teto e recomeca. Enfiar esse ciclo no laco geral obrigaria
 * todo preset a carregar campos que so dois usam.
 */
let gotejo: EstadoDeGotas | null = null

/**
 * Teto de respingos vivos ao mesmo tempo no gotejo de ambiente.
 *
 * Com 6 gotas e espera de ate 3,4s entre elas, o regime real fica em torno de
 * 2 impactos vivos. 12 e folga de 6x — o pool existe pra nao alocar por
 * impacto (ver `criarEstadoDeGotas`), nao pra racionar.
 */
const RESPINGOS_DO_GOTEJO = 12

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
 * Quantas posicoes sortear procurando a regiao da mascara antes de desistir.
 *
 * Desistir importa: numa janela SEM agua/lava nenhuma (o jogador andou pra
 * dentro da mata do `swamp`, ou a camera esta longe do rio de `volcano`)
 * nenhum sorteio acerta, e insistir travaria o quadro. Ao desistir a
 * particula nasce onde caiu, e o laco de desenho a recicla antes de
 * desenhar — o efeito rarefaz longe da regiao em vez de vazar pra fora dela.
 */
const TENTATIVAS_NA_MASCARA = 12

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
  // Sentido sorteado: folha caindo toda pro mesmo lado le como engrenagem. O
  // fiapo de cidade tambem rola, mas MUITO mais devagar — cinza em suspensao
  // nao tomba, ela roda em torno do proprio eixo enquanto boia.
  const rolagem = r.forma === 'folha' ? 1 : r.forma === 'fiapo' ? FIAPO_ROLAGEM : 0
  p.giro = rolagem === 0
    ? 0
    : (rand() < 0.5 ? -1 : 1) * rolagem
      * (FOLHA_GIRO[0] + rand() * (FOLHA_GIRO[1] - FOLHA_GIRO[0]))

  // Com mascara, a particula nasce DENTRO da regiao e nao na borda da janela
  // — o ponto inteiro do PH-113 (agua) e do PH-195 (lava). Vale tambem na
  // reciclagem: entrar pela borda faria a particula atravessar terra/rocha
  // ate achar a regiao — ou, pra brasa, subir por cima de um mapa inteiro
  // antes de aparecer.
  if (mascara) {
    // Duas rodadas, e nao uma: primeiro procura INTERIOR (folga de uma
    // celula, pra o anel de agua poder abrir sem passar da margem, e pra a
    // brasa nao nascer colada na beira); se nao achar, aceita qualquer
    // celula da regiao. A segunda rodada nao e redundante — canal estreito
    // de `swamp` tem largura de uma celula em varios trechos, e sem ela
    // aquele trecho nao ganharia particula nenhuma.
    for (let i = 0; i < TENTATIVAS_NA_MASCARA; i++) {
      const x = janela.x + rand() * janela.w
      const y = janela.y + rand() * janela.h
      if (dentroComFolga(mascara, x, y)) { p.x = x; p.y = y; return }
    }
    for (let i = 0; i < TENTATIVAS_NA_MASCARA; i++) {
      const x = janela.x + rand() * janela.w
      const y = janela.y + rand() * janela.h
      if (dentroDaMascara(mascara, x, y)) { p.x = x; p.y = y; return }
    }
    p.x = janela.x + rand() * janela.w
    p.y = janela.y + rand() * janela.h
    return
  }

  if (!aoEntrar) {
    // Primeira populacao: espalhada pela janela inteira, senao a camada entra
    // como uma cortina vindo de uma borda so. Com `faixaOrigemY` (so folha),
    // a altura fica restrita ao topo — cai da copa desde o primeiro quadro,
    // em vez de aparecer ja espalhada ate o chao.
    const alturaY = r.faixaOrigemY ? janela.h * r.faixaOrigemY : janela.h
    p.x = janela.x - FOLGA + rand() * (janela.w + FOLGA * 2)
    p.y = janela.y - FOLGA + rand() * (alturaY + FOLGA * 2)
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
  // Focos de brilho (PH-195): um por CELULA REAL da mascara de lava, nao
  // posicao livre — sem mascara, sem foco nenhum (ver o cabecalho da secao
  // de brilho pra por que nao ha fallback "na base da tela"). Reamostrados
  // junto com a arte, mesmo gerador seedado por `chave`.
  focosDeBrilho = []
  if (r.brilhoDoChao && mascara) {
    const celulasDeLava: Array<[number, number]> = []
    for (let ly = 0; ly < mascara.grid.length; ly++) {
      const linha = mascara.grid[ly]
      for (let lx = 0; lx < linha.length; lx++) {
        if (linha[lx] === '1') celulasDeLava.push([lx, ly])
      }
    }
    for (let i = 0; i < N_FOCOS_DE_BRILHO && celulasDeLava.length > 0; i++) {
      const [cx, cy] = celulasDeLava[Math.floor(rand() * celulasDeLava.length)]
      focosDeBrilho.push({
        x: cx * mascara.celula + mascara.celula / 2,
        y: cy * mascara.celula + mascara.celula / 2,
        raio: mascara.celula * (FOCO_RAIO_EM_CELULAS[0] + rand() * (FOCO_RAIO_EM_CELULAS[1] - FOCO_RAIO_EM_CELULAS[0])),
        freqA: FOCO_FREQ_RAPIDA[0] + rand() * (FOCO_FREQ_RAPIDA[1] - FOCO_FREQ_RAPIDA[0]),
        faseA: rand() * Math.PI * 2,
        freqB: FOCO_FREQ_LENTA[0] + rand() * (FOCO_FREQ_LENTA[1] - FOCO_FREQ_LENTA[0]),
        faseB: rand() * Math.PI * 2,
      })
    }
  }
  // Gotejo (PH-232): populacao propria, mesmo gerador local seedado pela arte.
  // Sem `r.gotejo` o estado e SOLTO em vez de ficar parado — a maioria dos
  // presets nao pinga, e um pool alocado que nunca recebe impacto e memoria
  // presa por nada.
  if (r.gotejo) {
    gotejo = criarEstadoDeGotas(RESPINGOS_DO_GOTEJO)
    povoarGotas(
      gotejo, r.gotejo.config, janela, rand,
      Math.max(1, Math.round(r.gotejo.quantidade * (compacto ? 0.5 : 1))),
    )
  } else {
    gotejo = null
  }
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
  // PH-141: a FAMILIA de particula que o clima esta desenhando, ja resolvida
  // pelo chamador. Recebe a familia e nao o `ClimaTipo` de proposito: este
  // arquivo NAO pode importar do motor — `ambiente.test.ts` reprova qualquer
  // import de `@/engine` aqui, e o guard esta certo. Ver o cabecalho.
  familiaDeClima: 'neve' | 'areia' | null = null,
): void {
  const ui = useUiStore.getState()
  if (!ui.vidaNoCenario) {
    // Desligado no ajuste: solta o estado pra a camada nao voltar com
    // particulas velhas (e pra ela nao custar memoria enquanto esta off).
    if (particulas.length) { particulas = []; arteAtual = null; gotejo = null }
    return
  }

  const preset = presetDaArte(imagem)
  if (preset === 'nenhum' || !imagem) {
    if (particulas.length) { particulas = []; arteAtual = null; gotejo = null }
    return
  }

  // PH-141: CLIMA MANDA MAIS QUE ARTE quando os dois desenhariam a mesma coisa.
  //
  // `ice-cave` e `mountain` ja tinham neve DECORATIVA por causa da arte. Com
  // neve-clima por cima, o jogador via neve dobrada e nao tinha como separar "o
  // cenario e nevado" de "esta nevando agora" — e um dos dois mexe no combate.
  // O mesmo vale pra areia no deserto.
  //
  // Cala so a familia COINCIDENTE. Chuva numa floresta continua com folha
  // caindo: sao duas coisas diferentes acontecendo, e as duas sao verdade.
  if (familiaDeClima === preset) {
    if (particulas.length) { particulas = []; arteAtual = null; gotejo = null }
    return
  }

  const mascara = mascaraDaArte(preset, imagem)
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
  if (r.brilhoDoChao) desenharBrilhoDoChao(ctx)

  ctx.fillStyle = r.cor
  ctx.strokeStyle = r.cor
  // Teto do anel em unidades de mundo. Sem mascara nao ha anel, entao nao ha
  // teto a calcular.
  const raioMaximoDoAnel = mascara
    ? mascara.celula * ANEL_RAIO_MAXIMO_EM_CELULAS
    : Number.POSITIVE_INFINITY
  // So folha pede `r.vento` — pra qualquer outro preset `rajada` fica 0 e os
  // multiplicadores abaixo caem em 1, sem mudar nada do comportamento antigo.
  const rajada = r.vento ? intensidadeDoVento(faseGlobal) : 0
  const ventoQueda = 1 + rajada * VENTO_QUEDA_PICO
  const ventoBamboleio = 1 + rajada * VENTO_BAMBOLEIO_PICO
  for (const p of particulas) {
    p.x += p.vx * ventoQueda * delta
    p.y += p.vy * ventoQueda * delta
    p.fase += delta * 1.7
    p.idade += delta

    // Bamboleio perpendicular ao deslocamento: folha e neve nao caem em linha
    // reta, e o desvio lateral e o que separa "particula" de "chuva". Na
    // rajada (so folha) ele amplia — e a rajada que le como "vento na copa".
    const desvio = Math.sin(p.fase) * p.bamboleio * ventoBamboleio * delta
    p.x += -p.vy * desvio * 0.02
    p.y += p.vx * desvio * 0.02

    const foraX = p.x < janela.x - FOLGA * 2 || p.x > janela.x + janela.w + FOLGA * 2
    const foraY = p.y < janela.y - FOLGA * 2 || p.y > janela.y + janela.h + FOLGA * 2
    // Com mascara, SAIR DA REGIAO tambem recicla — senao a onda de agua
    // continuaria subindo depois de passar da margem e apareceria em cima da
    // terra (o que essa mudanca existe pra impedir), e a brasa continuaria
    // subindo por cima de rocha depois de deixar a lava pra tras — o "fim"
    // que da a ela comeco/meio/fim em vez de viver a janela inteira. Cobre
    // tambem a particula que nasceu fora por `TENTATIVAS_NA_MASCARA` ter
    // desistido: ela e reciclada ANTES de ser desenhada.
    // Anel tem VIDA: ele nao sai da tela, ele desmancha onde esta. Sem este
    // ramo o anel travaria no raio maximo e ficaria plantado ate a deriva
    // tira-lo da agua, que e o oposto de ondular.
    const acabou = p.anel && p.idade >= p.vida
    if (foraX || foraY || acabou || (mascara && !dentroDaMascara(mascara, p.x, p.y))) {
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
    desenharParticula(ctx, p, r)
  }

  // Gotejo por ultimo dentro da camada: a gota vem da COPA/TETO, entao ela
  // passa na frente da folha e da poeira que ja estao no ar. (Continua atras
  // das entidades — a camada inteira e desenhada antes delas.)
  if (gotejo && r.gotejo) {
    avancarGotas(gotejo, r.gotejo.config, janela, delta, rand)
    desenharGotas(ctx, gotejo, r.gotejo.config)
  }
  ctx.restore()
}

/**
 * A silhueta de UMA particula. Ver o bloco "AS SILHUETAS" pra por que cada
 * preset tem a sua, e `silhuetaPorPreset.test.ts` pra o que trava isso.
 */
function desenharParticula(ctx: CanvasRenderingContext2D, p: Particula, r: Receita): void {
  // Pisca rapido E o raio pulsa junto (faisca). `Math.abs` do seno em vez do
  // seno cru: com o seno, metade do ciclo fica no alpha minimo e a brasa passa
  // mais tempo apagada que acesa.
  const pulso = r.forma === 'faisca' ? Math.abs(Math.sin(p.fase * FAISCA_PISCA)) : 0
  if (r.forma === 'faisca') {
    ctx.globalAlpha = p.alphaMax * (0.3 + 0.7 * pulso)
  } else if (r.forma === 'cintilo') {
    // Estalo, e nao respiracao: elevar |sen| a uma potencia alta deixa a
    // cintilancia apagada quase o tempo todo, com faiscas curtas de luz. E o
    // que reflexo especular na agua faz — a onda so devolve o sol pro olho
    // quando a inclinacao dela passa pelo angulo certo.
    ctx.globalAlpha = p.alphaMax * Math.abs(Math.sin(p.fase * CINTILO_PISCA)) ** CINTILO_EXPOENTE
  } else if (r.forma === 'folha') {
    // Folha quase NAO pulsa de alpha, e essa e a diferenca entre corpo e luz.
    //
    // O pulso de alpha veio do PH-96, quando toda particula era o mesmo ponto e
    // o pulso era a unica variacao que existia. Numa folha ele esta errado: uma
    // folha e um objeto solido, nao um brilho — o que muda enquanto ela cai e a
    // ORIENTACAO (o tombo), nao a opacidade. Com o pulso cheio a media de alpha
    // caia pra ~0,31, e sobre grama clara isso e o mesmo que nao desenhar
    // (conferido no jogo, sala Relvado de Campo Aberto I).
    ctx.globalAlpha = p.alphaMax * (0.88 + 0.12 * Math.sin(p.fase * 0.8))
  } else {
    ctx.globalAlpha = p.alphaMax * (0.55 + 0.45 * Math.sin(p.fase * 0.8))
  }

  switch (r.forma) {
    case 'risco': {
      // Areia soprando: borrao de movimento na direcao do vento. O comprimento
      // sai da VELOCIDADE (ver RISCO_SEGUNDOS) — grao rapido risca mais longe.
      ctx.lineWidth = p.raio
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - p.vx * RISCO_SEGUNDOS, p.y - p.vy * RISCO_SEGUNDOS)
      ctx.stroke()
      return
    }
    case 'folha': {
      // Elipse achatada girando no proprio eixo. A rotacao sai da fase (que ja
      // avanca com o tempo), entao nao ha estado novo por particula alem da
      // velocidade do tombo.
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, p.raio, p.raio * FOLHA_ACHATAMENTO, p.fase * p.giro, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    case 'fiapo': {
      // Fibra DOBRADA: dois segmentos num V aberto, rolando devagar. A dobra e
      // o que separa cinza urbana do risco de areia — os dois seriam uma linha
      // reta, e uma linha reta parada no ar nao le como nada.
      const a = p.fase * p.giro
      const b = a + FIAPO_DOBRA
      ctx.lineWidth = Math.max(0.5, p.raio * 0.55)
      ctx.beginPath()
      ctx.moveTo(p.x + Math.cos(a) * p.raio, p.y + Math.sin(a) * p.raio)
      ctx.lineTo(p.x, p.y)
      ctx.lineTo(p.x + Math.cos(b) * p.raio, p.y + Math.sin(b) * p.raio)
      ctx.stroke()
      return
    }
    case 'faisca': {
      // Rastro na direcao do movimento + nucleo que pulsa de tamanho.
      const n = Math.hypot(p.vx, p.vy) || 1
      const comprimento = p.raio * FAISCA_RASTRO
      ctx.lineWidth = Math.max(0.3, p.raio * FAISCA_TRACO)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - (p.vx / n) * comprimento, p.y - (p.vy / n) * comprimento)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.raio * (1 - FAISCA_PULSO * (1 - pulso)), 0, Math.PI * 2)
      ctx.fill()
      return
    }
    case 'cintilo': {
      // Cruz de quatro pontas com nucleo quente. As pontas sao desiguais (uma
      // longa, uma curta) porque cruz simetrica le como simbolo desenhado;
      // brilho real tem uma direcao dominante.
      const longa = p.raio * CINTILO_PONTA
      const curta = longa * CINTILO_RAZAO_CURTA
      ctx.lineWidth = Math.max(0.3, p.raio * 0.4)
      ctx.beginPath()
      ctx.moveTo(p.x - longa, p.y)
      ctx.lineTo(p.x + longa, p.y)
      ctx.moveTo(p.x, p.y - curta)
      ctx.lineTo(p.x, p.y + curta)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.raio * 0.45, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    case 'grao':
    default: {
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.raio, 0, Math.PI * 2)
      ctx.fill()
    }
  }
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

// ---------------------------------------------------------------------------
// BRILHO DE LAVA (PH-195)
// ---------------------------------------------------------------------------
// A brasa (PH-96/PH-115) so sobe — nada acontecia perto da FONTE. A primeira
// versao deste efeito colava os focos na base da janela, uma aproximacao
// (nao havia mascara ainda). Com `lavaMask.generated.ts`, os focos nascem em
// CELULAS REAIS da lava — sem mascara (arte sem referencia), nao ha foco
// nenhum: melhor nao mostrar brilho do que mostrar um na base da tela quando
// a lava de verdade pode estar em qualquer lugar da imagem, como e o caso
// aqui (o rio de `volcano` cruza a cena de cima a baixo, nao fica so embaixo).
const N_FOCOS_DE_BRILHO = 4
/** Raio de cada foco, em CELULAS da mascara (a lava real tem largura variavel,
 *  celula da mascara e a unica medida de escala que a camada tem dela). */
const FOCO_RAIO_EM_CELULAS: [number, number] = [2.2, 3.8]
/** Achatamento vertical do foco — mesma razao da perspectiva do anel de agua. */
const FOCO_ACHATAMENTO = 0.32
/** Frequencia da onda rapida do pulso, em radianos/segundo. */
const FOCO_FREQ_RAPIDA: [number, number] = [0.7, 1.3]
/** Frequencia da onda lenta — pequena o bastante pra so desafinar a rapida,
 *  nao pra criar uma rajada (isso e o vento da folha, nao a respiracao da lava). */
const FOCO_FREQ_LENTA: [number, number] = [0.12, 0.22]
/** Alpha maximo no pico do pulso. */
const FOCO_ALPHA_PICO = 0.55

/**
 * Focos de brilho pulsante colados na base da janela — vulcao/lava
 * respirando por baixo da brasa que sobe.
 *
 * Cada foco soma DUAS senoides (uma rapida, uma lenta) em vez de uma so: uma
 * unica senoide pulsa mecanico e todos os focos ficam em fase entre si (cada
 * um comeca com fase propria, mas o PERIODO seria igual) — leria como luz de
 * LED, nao como lava. A soma de duas frequencias por foco quebra a
 * periodicidade aparente sem virar rajada esporadica (isso e o vento da
 * folha, PH-188 — aqui o efeito e uma respiracao continua).
 */
function desenharBrilhoDoChao(ctx: CanvasRenderingContext2D): void {
  if (!focosDeBrilho.length) return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const foco of focosDeBrilho) {
    const onda = 0.5 * Math.sin(faseGlobal * foco.freqA + foco.faseA)
      + 0.5 * Math.sin(faseGlobal * foco.freqB + foco.faseB)
    const pulso = (onda + 1) / 2 // 0..1
    const alpha = FOCO_ALPHA_PICO * (0.35 + 0.65 * pulso)
    const raio = foco.raio * (0.82 + 0.18 * pulso)
    const g = ctx.createRadialGradient(foco.x, foco.y, 0, foco.x, foco.y, raio)
    g.addColorStop(0, `rgba(255, 150, 60, ${alpha})`)
    g.addColorStop(0.55, `rgba(255, 90, 20, ${alpha * 0.45})`)
    g.addColorStop(1, 'rgba(255, 60, 10, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(foco.x, foco.y, raio, raio * FOCO_ACHATAMENTO, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** Solta o estado. Chamado ao sair da hunt, pra a proxima entrada nao herdar
 *  particulas posicionadas na janela de outro mapa. */
export function reiniciarAmbiente(): void {
  particulas = []
  arteAtual = null
  ultimoInstante = 0
  focosDeBrilho = []
  gotejo = null
}
