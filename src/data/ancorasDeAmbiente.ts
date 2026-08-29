// ONDE, EM CADA ARTE DE FUNDO, O CENARIO TEM UMA FONTE DE VIDA (PH-254).
//
// ---------------------------------------------------------------------------
// POR QUE UMA TABELA ESCRITA A MAO, E NAO DERIVACAO
// ---------------------------------------------------------------------------
// A camada ambiente (`render/ambiente.ts`) cobre o jogo inteiro sem saber onde
// nada esta: ela espalha particula pela janela e pronto. Duas mascaras foram
// abertas depois pra corrigir isso onde deu (agua no PH-113, lava no PH-195), e
// as duas custaram referencia pintada a mao — porque cor NAO separa agua de
// vegetacao neste acervo, e o script de agua tem o cabecalho inteiro dedicado a
// medir isso.
//
// Uma chamine, uma fogueira, um poste de luz e uma queda d'agua sao PONTOS, nao
// regioes. Derivar ponto por cor seria a mesma classe de erro com menos margem:
// "amarelo pequeno e brilhante" acha o lampiao E a flor E o reflexo na agua. A
// tabela e explicita pelo mesmo motivo que `PRESET_POR_ARTE` e explicita — arte
// nao cadastrada nao ganha nada, que e melhor que ganhar prop no lugar errado.
//
// ---------------------------------------------------------------------------
// A COORDENADA E DA ARTE, NAO DO MUNDO
// ---------------------------------------------------------------------------
// `u` e `v` sao fracao da imagem de fundo (0..1, v crescendo pra baixo), e nao
// unidade de mundo. A conversao usa `COLISAO_POR_ARTE[arte].arte` (`escala`,
// `x`, `y`), que e o MESMO retangulo que `drawMapBackground` desenha — a mesma
// ponte que `build-agua-mask.js` usa pra casar referencia pintada com celula de
// mundo. Guardar mundo aqui quebraria toda vez que o enquadramento da arte
// mudasse; guardar fracao da arte nao quebra nunca, porque o prop esta preso ao
// DESENHO e nao ao mapa.
//
// ---------------------------------------------------------------------------
// COMO AUTORAR UMA ANCORA NOVA
// ---------------------------------------------------------------------------
//   py scripts/harness/grade-de-ancoras.py --artes volcano
//
// escreve a arte com uma grade de decimos por cima, em
// `scripts/harness/ancoras-grade/`. Ler a posicao vira contar linha e coluna.
// Depois:
//
//   py scripts/harness/mapa-de-ancoras.py --artes volcano
//
// devolve a arte com um marcador em cada ancora JA CADASTRADA, que e como se
// confere se o par foi escrito certo. Nao pular esse segundo passo: um erro de
// 0,05 poe a fumaca ao lado da chamine, e no jogo isso nao le como bug, le como
// arte ruim.
//
// ---------------------------------------------------------------------------
// O QUE NAO ENTRA AQUI
// ---------------------------------------------------------------------------
// Prop de REGIAO. Foco de chama na lava e cintilancia na agua saem das mascaras
// (`lavaMask.generated.ts`, `aguaMask.generated.ts`) dentro de
// `render/ambienteProps.ts`, sem ancora nenhuma — regiao ja tem representacao
// propria e duplicar aqui seria duas fontes pra mesma verdade.

/**
 * O que o prop E, e por tabela o que ele desenha.
 *
 * O tipo escolhe a rotina de desenho; `escala` e `cor` so afinam. Tipos que
 * compartilham rotina estao agrupados no comentario porque e assim que
 * `ambienteProps.ts` os trata.
 */
export type TipoDeProp =
  // — arte em tira (`assets/ambiente-props/chama.png`)
  | 'fogueira' // fogo de acampamento, brasero de arena: chama grande e brilho quente no chao
  | 'tocha' // poste, lampiao, tocha de parede: chama pequena sobre o desenho que ja esta la
  // — pluma procedural (baforada que sobe, cresce e apaga)
  | 'chamine' // fumaca cinza de telhado
  | 'fumarola' // vapor branco de fenda quente / geiser
  | 'gas' // baforada colorida (pantano, caldeirao, cano vazando)
  // — brilho procedural pulsante
  | 'orbe' // cristal, cogumelo luminoso, runa, letreiro de neon
  // — espuma procedural
  | 'cascata' // batida constante na base de uma queda d'agua
  | 'correnteza' // respingo esparso em rio ou lagoa
  | 'quebraMar' // onda arrebentando na areia
  // — faisca procedural
  | 'eletrica' // curto em fiacao/transformador
  // — enxame procedural
  | 'vagalume' // pontos que sobem e flutuam
  | 'petala' // pontos que caem girando

export interface AncoraDeAmbiente {
  /** Fracao da LARGURA da arte de fundo, 0..1. */
  u: number
  /** Fracao da ALTURA da arte de fundo, 0..1, crescendo pra baixo. */
  v: number
  tipo: TipoDeProp
  /** Multiplica o tamanho padrao do tipo. Ausente = 1. */
  escala?: number
  /**
   * Cor do prop, quando o tipo aceita uma (`orbe`, `gas`, `petala`,
   * `vagalume`). Ausente = a cor padrao do tipo em `ambienteProps.ts`.
   */
  cor?: string
  /**
   * Desloca a FASE da animacao, em segundos. Existe porque prop repetido na
   * mesma arte (doze tochas de `slum`) sincronizado le como pisca-pisca de
   * natal: todas acendem e apagam no mesmo quadro. O valor nao precisa ser
   * bonito, precisa ser diferente — e ele e sorteado por posicao quando
   * ausente, entao so vale escrever pra forcar um caso.
   */
  fase?: number
}

/**
 * Ancoras por ARTE, e nao por chave de bioma — mesma razao de
 * `PRESET_POR_ARTE` em `render/ambiente.ts`: quem decide o que aparece na tela
 * e a imagem, e sub-bioma sem arte propria herda a do bioma junto com tudo que
 * ela carrega.
 *
 * Arte fora desta tabela nao ganha prop nenhum e continua exatamente como
 * estava — o mesmo contrato do preset.
 */
export const ANCORAS_POR_ARTE: Record<string, AncoraDeAmbiente[]> = {
  // -------------------------------------------------------------------------
  // VULCAO — o rio de lava tem mascara (PH-195) e ganha foco de chama por ela.
  // O que entra aqui e o que a mascara NAO sabe: a cratera do cone, as fendas
  // de vapor pintadas no chao e a fileira de lampioes do caminho.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/volcano.jpg': [
    { u: 0.515, v: 0.045, tipo: 'fumarola', escala: 1.5 }, // cratera do cone
    { u: 0.620, v: 0.470, tipo: 'fumarola' },
    { u: 0.700, v: 0.680, tipo: 'fumarola' },
    { u: 0.532, v: 0.165, tipo: 'fogueira', escala: 0.7 },
    { u: 0.642, v: 0.360, tipo: 'fogueira', escala: 0.7 },
    { u: 0.620, v: 0.060, tipo: 'tocha' },
    { u: 0.720, v: 0.340, tipo: 'tocha' },
    { u: 0.870, v: 0.420, tipo: 'tocha' },
    { u: 0.500, v: 0.750, tipo: 'tocha' },
    { u: 0.880, v: 0.720, tipo: 'tocha' },
  ],

  // -------------------------------------------------------------------------
  // CAVERNA VULCANICA — o rio de lava daqui NAO tem mascara (o cristal grande
  // cai no mesmo ponto de cor da lava, ver `pintar-ref-lava.js`), entao os
  // focos dele sao ancorados um a um.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/cave-volcanic.jpg': [
    { u: 0.655, v: 0.060, tipo: 'fogueira', escala: 0.8 },
    { u: 0.755, v: 0.280, tipo: 'fogueira', escala: 0.8 },
    { u: 0.740, v: 0.450, tipo: 'fogueira', escala: 0.8 },
    { u: 0.700, v: 0.600, tipo: 'fogueira', escala: 0.8 },
    { u: 0.600, v: 0.720, tipo: 'fogueira', escala: 0.8 },
    { u: 0.620, v: 0.880, tipo: 'fogueira' },
    { u: 0.530, v: 0.055, tipo: 'tocha' },
    { u: 0.475, v: 0.150, tipo: 'tocha' },
    { u: 0.460, v: 0.365, tipo: 'tocha' },
    { u: 0.645, v: 0.365, tipo: 'tocha' },
    { u: 0.665, v: 0.425, tipo: 'tocha' },
    { u: 0.865, v: 0.470, tipo: 'tocha' },
    { u: 0.350, v: 0.690, tipo: 'tocha' },
    { u: 0.360, v: 0.775, tipo: 'tocha' },
    { u: 0.685, v: 0.660, tipo: 'tocha' },
  ],

  // -------------------------------------------------------------------------
  // COVIL DO DRAGAO — rio de lava, geiseres ja desenhados no chao de pedra e
  // uma parede de tochas. O circulo de invocacao ganha orbe, nao chama: ele e
  // luz fria desenhada, e fogo em cima leria como incendio no piso.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/dragon.jpg': [
    { u: 0.755, v: 0.400, tipo: 'fogueira', escala: 0.8 },
    { u: 0.700, v: 0.550, tipo: 'fogueira', escala: 0.8 },
    { u: 0.640, v: 0.640, tipo: 'fogueira', escala: 0.8 },
    { u: 0.580, v: 0.720, tipo: 'fogueira', escala: 0.8 },
    { u: 0.540, v: 0.850, tipo: 'fogueira' },
    { u: 0.755, v: 0.755, tipo: 'fumarola' },
    { u: 0.830, v: 0.775, tipo: 'fumarola' },
    { u: 0.820, v: 0.865, tipo: 'fumarola' },
    { u: 0.945, v: 0.030, tipo: 'fumarola', escala: 1.3 },
    { u: 0.705, v: 0.290, tipo: 'orbe', cor: '#ff7a3c', escala: 1.6 },
    { u: 0.245, v: 0.100, tipo: 'tocha' },
    { u: 0.135, v: 0.155, tipo: 'tocha' },
    { u: 0.175, v: 0.320, tipo: 'tocha' },
    { u: 0.460, v: 0.265, tipo: 'tocha' },
    { u: 0.535, v: 0.325, tipo: 'tocha' },
    { u: 0.655, v: 0.355, tipo: 'tocha' },
    { u: 0.855, v: 0.475, tipo: 'tocha' },
    { u: 0.520, v: 0.690, tipo: 'tocha' },
    { u: 0.375, v: 0.715, tipo: 'tocha' },
    { u: 0.165, v: 0.790, tipo: 'tocha' },
    { u: 0.235, v: 0.875, tipo: 'fogueira', escala: 0.7 },
  ],

  // -------------------------------------------------------------------------
  // FAVELA — a arte ja desenha fumaca saindo de cada chamine, parada. Aqui ela
  // passa a subir. As tochas de rua sao o outro metade: e um mapa NOTURNO, e
  // luz que pulsa e o que separa noite de "imagem escura".
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/slum.jpg': [
    { u: 0.420, v: 0.100, tipo: 'chamine' },
    { u: 0.665, v: 0.090, tipo: 'chamine' },
    { u: 0.905, v: 0.115, tipo: 'chamine' },
    { u: 0.920, v: 0.285, tipo: 'chamine' },
    { u: 0.320, v: 0.300, tipo: 'chamine' },
    { u: 0.635, v: 0.300, tipo: 'chamine' },
    { u: 0.355, v: 0.645, tipo: 'chamine' },
    { u: 0.660, v: 0.615, tipo: 'chamine' },
    { u: 0.280, v: 0.615, tipo: 'chamine' },
    { u: 0.335, v: 0.885, tipo: 'chamine' },
    { u: 0.265, v: 0.205, tipo: 'fogueira', escala: 0.7 },
    { u: 0.575, v: 0.215, tipo: 'tocha' },
    { u: 0.845, v: 0.265, tipo: 'tocha' },
    { u: 0.160, v: 0.375, tipo: 'tocha' },
    { u: 0.485, v: 0.410, tipo: 'tocha' },
    { u: 0.845, v: 0.410, tipo: 'tocha' },
    { u: 0.290, v: 0.505, tipo: 'tocha' },
    { u: 0.465, v: 0.525, tipo: 'tocha' },
    { u: 0.585, v: 0.505, tipo: 'tocha' },
    { u: 0.165, v: 0.575, tipo: 'tocha' },
    { u: 0.845, v: 0.635, tipo: 'tocha' },
    { u: 0.165, v: 0.735, tipo: 'tocha' },
    { u: 0.455, v: 0.745, tipo: 'tocha' },
    { u: 0.530, v: 0.895, tipo: 'tocha' },
  ],

  // -------------------------------------------------------------------------
  // VILAREJO — duas quedas d'agua, a chamine da casa e a fileira de lampioes.
  // O lago nao tem mascara (a arte nao esta no preset de agua), entao a
  // correnteza dele e ancorada.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/town.jpg': [
    { u: 0.300, v: 0.465, tipo: 'cascata' },
    { u: 0.665, v: 0.455, tipo: 'cascata' },
    { u: 0.805, v: 0.545, tipo: 'chamine' },
    { u: 0.310, v: 0.575, tipo: 'correnteza' },
    { u: 0.380, v: 0.620, tipo: 'correnteza' },
    { u: 0.560, v: 0.780, tipo: 'correnteza' },
    { u: 0.232, v: 0.290, tipo: 'tocha', escala: 0.8 },
    { u: 0.077, v: 0.510, tipo: 'tocha', escala: 0.8 },
    { u: 0.652, v: 0.680, tipo: 'tocha', escala: 0.8 },
    { u: 0.437, v: 0.742, tipo: 'tocha', escala: 0.8 },
    { u: 0.470, v: 0.900, tipo: 'tocha', escala: 0.8 },
  ],

  // -------------------------------------------------------------------------
  // VILAREJO NOTURNO — a arte e uma mata de noite com rio e lagoa, e ja tem
  // vaga-lume PINTADO espalhado pelo campo. O preset dela e 'cidade' (poeira
  // fina), que e o que sobrou de classificar por nome de arquivo; corrigir o
  // preset e outra tarefa, mas as ancoras podem contar a verdade da arte.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/town-night.jpg': [
    { u: 0.300, v: 0.220, tipo: 'vagalume' },
    { u: 0.550, v: 0.450, tipo: 'vagalume' },
    { u: 0.720, v: 0.520, tipo: 'vagalume' },
    { u: 0.130, v: 0.620, tipo: 'vagalume' },
    { u: 0.400, v: 0.800, tipo: 'vagalume' },
    { u: 0.170, v: 0.280, tipo: 'correnteza' },
    { u: 0.360, v: 0.420, tipo: 'correnteza' },
    { u: 0.620, v: 0.660, tipo: 'correnteza' },
    { u: 0.780, v: 0.700, tipo: 'correnteza' },
    { u: 0.755, v: 0.185, tipo: 'orbe', cor: '#7bf5c4' },
    { u: 0.830, v: 0.235, tipo: 'orbe', cor: '#7bf5c4' },
    { u: 0.900, v: 0.500, tipo: 'orbe', cor: '#7bf5c4' },
    { u: 0.060, v: 0.440, tipo: 'orbe', cor: '#7bf5c4' },
  ],

  // -------------------------------------------------------------------------
  // METROPOLE — noite urbana. O letreiro e o unico prop grande; o resto e a
  // fileira de postes. Sem fogo nenhum de proposito: chama em calcada le como
  // incendio, nao como vida de cidade.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/metropolis.jpg': [
    { u: 0.525, v: 0.710, tipo: 'orbe', cor: '#ff5cc8', escala: 2.2 },
    { u: 0.140, v: 0.385, tipo: 'orbe', cor: '#ffd58a', escala: 0.8 },
    { u: 0.305, v: 0.410, tipo: 'orbe', cor: '#ffd58a', escala: 0.8 },
    { u: 0.545, v: 0.410, tipo: 'orbe', cor: '#ffd58a', escala: 0.8 },
    { u: 0.765, v: 0.410, tipo: 'orbe', cor: '#ffd58a', escala: 0.8 },
    { u: 0.055, v: 0.600, tipo: 'orbe', cor: '#ffd58a', escala: 0.8 },
    { u: 0.185, v: 0.765, tipo: 'orbe', cor: '#ffd58a', escala: 0.8 },
    { u: 0.615, v: 0.765, tipo: 'orbe', cor: '#ffd58a', escala: 0.8 },
    { u: 0.735, v: 0.790, tipo: 'orbe', cor: '#ffd58a', escala: 0.8 },
  ],

  // -------------------------------------------------------------------------
  // INDUSTRIAL — a arte ja desenha arco eletrico em sete pontos, parado. E o
  // caso mais direto da issue: o desenho promete curto-circuito e nao pisca.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/industrial.jpg': [
    { u: 0.055, v: 0.035, tipo: 'chamine', escala: 1.4 },
    { u: 0.088, v: 0.045, tipo: 'chamine', escala: 1.4 },
    { u: 0.735, v: 0.130, tipo: 'eletrica' },
    { u: 0.830, v: 0.130, tipo: 'eletrica' },
    { u: 0.550, v: 0.375, tipo: 'eletrica' },
    { u: 0.685, v: 0.440, tipo: 'eletrica' },
    { u: 0.545, v: 0.680, tipo: 'eletrica' },
    { u: 0.710, v: 0.700, tipo: 'eletrica' },
    { u: 0.530, v: 0.750, tipo: 'eletrica' },
    { u: 0.885, v: 0.530, tipo: 'eletrica', escala: 0.7 },
  ],

  // -------------------------------------------------------------------------
  // FLORESTA — o acampamento com panela no fogo e a melhor ancora do acervo
  // inteiro: e a unica coisa na arte que o jogador espera ver se mexendo.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/forest.jpg': [
    { u: 0.350, v: 0.400, tipo: 'fogueira' },
    { u: 0.350, v: 0.382, tipo: 'chamine', escala: 0.7 },
    { u: 0.720, v: 0.200, tipo: 'correnteza' },
    { u: 0.755, v: 0.350, tipo: 'correnteza' },
    { u: 0.700, v: 0.620, tipo: 'correnteza' },
    { u: 0.660, v: 0.720, tipo: 'correnteza' },
    { u: 0.780, v: 0.850, tipo: 'correnteza' },
    { u: 0.475, v: 0.160, tipo: 'tocha', escala: 0.8 },
    { u: 0.535, v: 0.300, tipo: 'tocha', escala: 0.8 },
    { u: 0.655, v: 0.375, tipo: 'tocha', escala: 0.8 },
    { u: 0.375, v: 0.775, tipo: 'tocha', escala: 0.8 },
  ],

  // -------------------------------------------------------------------------
  // SELVA — uma queda d'agua e o rio que corta a arte de cima a baixo.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/jungle.jpg': [
    { u: 0.265, v: 0.395, tipo: 'cascata' },
    { u: 0.100, v: 0.270, tipo: 'correnteza' },
    { u: 0.400, v: 0.470, tipo: 'correnteza' },
    { u: 0.580, v: 0.600, tipo: 'correnteza' },
    { u: 0.620, v: 0.800, tipo: 'correnteza' },
    { u: 0.630, v: 0.930, tipo: 'correnteza' },
    { u: 0.150, v: 0.100, tipo: 'vagalume', cor: '#c8f07a' },
    { u: 0.800, v: 0.550, tipo: 'vagalume', cor: '#c8f07a' },
  ],

  // -------------------------------------------------------------------------
  // TEMPLO MISTICO — luz, nao fogo. Os circulos de invocacao e os braseiros
  // roxos ja sao a linguagem da arte; a chama laranja padrao brigaria com ela,
  // entao ate o que e brasa aqui entra como orbe colorido.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/temple.jpg': [
    { u: 0.085, v: 0.135, tipo: 'orbe', cor: '#e0a6ff', escala: 2.0 },
    { u: 0.455, v: 0.215, tipo: 'orbe', cor: '#e0a6ff', escala: 1.8 },
    { u: 0.790, v: 0.315, tipo: 'orbe', cor: '#e0a6ff', escala: 1.6 },
    { u: 0.165, v: 0.880, tipo: 'orbe', cor: '#e0a6ff', escala: 1.8 },
    { u: 0.440, v: 0.065, tipo: 'orbe', cor: '#c77bff', escala: 1.4 },
    { u: 0.390, v: 0.150, tipo: 'orbe', cor: '#b98cff', escala: 0.8 },
    { u: 0.510, v: 0.150, tipo: 'orbe', cor: '#b98cff', escala: 0.8 },
    { u: 0.420, v: 0.440, tipo: 'orbe', cor: '#b98cff', escala: 0.8 },
    { u: 0.300, v: 0.720, tipo: 'orbe', cor: '#b98cff', escala: 0.8 },
    { u: 0.855, v: 0.790, tipo: 'orbe', cor: '#b98cff', escala: 0.8 },
    { u: 0.700, v: 0.890, tipo: 'orbe', cor: '#b98cff', escala: 0.8 },
    { u: 0.900, v: 0.630, tipo: 'cascata' },
    { u: 0.320, v: 0.345, tipo: 'cascata', escala: 0.7 },
  ],

  // -------------------------------------------------------------------------
  // RUINAS MISTICAS — a mesma linguagem do templo, com um rio de energia no
  // lugar do rio de agua. `correnteza` ali sairia branca e leria como espuma;
  // por isso o rio entra como fileira de orbes, nao como agua.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/ruins.jpg': [
    { u: 0.500, v: 0.480, tipo: 'orbe', cor: '#c9a4ff', escala: 2.2 },
    { u: 0.700, v: 0.140, tipo: 'orbe', cor: '#9a7bff', escala: 1.4 },
    { u: 0.760, v: 0.330, tipo: 'orbe', cor: '#9a7bff', escala: 1.4 },
    { u: 0.820, v: 0.560, tipo: 'orbe', cor: '#9a7bff', escala: 1.4 },
    { u: 0.790, v: 0.780, tipo: 'orbe', cor: '#9a7bff', escala: 1.4 },
    { u: 0.110, v: 0.250, tipo: 'orbe', cor: '#f0c7ff', escala: 0.7 },
    { u: 0.240, v: 0.250, tipo: 'orbe', cor: '#f0c7ff', escala: 0.7 },
    { u: 0.200, v: 0.510, tipo: 'orbe', cor: '#f0c7ff', escala: 0.7 },
    { u: 0.310, v: 0.640, tipo: 'orbe', cor: '#f0c7ff', escala: 0.7 },
    { u: 0.420, v: 0.550, tipo: 'orbe', cor: '#f0c7ff', escala: 0.7 },
    { u: 0.620, v: 0.530, tipo: 'orbe', cor: '#f0c7ff', escala: 0.7 },
    { u: 0.550, v: 0.750, tipo: 'orbe', cor: '#f0c7ff', escala: 0.7 },
    { u: 0.430, v: 0.900, tipo: 'orbe', cor: '#f0c7ff', escala: 0.7 },
    { u: 0.605, v: 0.080, tipo: 'orbe', cor: '#f0c7ff', escala: 0.7 },
  ],

  // -------------------------------------------------------------------------
  // GRUTA FEERICA — queda d'agua, duas lagoas e a arte inteira coberta de
  // brilho pintado. O enxame aqui e o prop principal.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/fairy-cave.jpg': [
    { u: 0.685, v: 0.350, tipo: 'cascata' },
    { u: 0.660, v: 0.400, tipo: 'correnteza' },
    { u: 0.330, v: 0.680, tipo: 'correnteza' },
    { u: 0.600, v: 0.700, tipo: 'correnteza' },
    { u: 0.500, v: 0.520, tipo: 'orbe', cor: '#a8fff0', escala: 1.4 },
    { u: 0.170, v: 0.150, tipo: 'vagalume', cor: '#9ff0ff' },
    { u: 0.320, v: 0.140, tipo: 'vagalume', cor: '#ffb3e6' },
    { u: 0.460, v: 0.420, tipo: 'vagalume', cor: '#9ff0ff' },
    { u: 0.630, v: 0.600, tipo: 'vagalume', cor: '#ffb3e6' },
    { u: 0.860, v: 0.200, tipo: 'vagalume', cor: '#9ff0ff' },
  ],

  // -------------------------------------------------------------------------
  // CAVERNA DE GELO — o cristal do centro e a fonte de luz da arte, e o
  // acampamento no canto superior direito e o unico calor dela.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/ice-cave.jpg': [
    { u: 0.375, v: 0.340, tipo: 'orbe', cor: '#9fe8ff', escala: 2.0 },
    { u: 0.830, v: 0.240, tipo: 'fogueira', escala: 0.7 },
    { u: 0.185, v: 0.055, tipo: 'tocha', escala: 0.7 },
    { u: 0.140, v: 0.410, tipo: 'tocha', escala: 0.7 },
    { u: 0.660, v: 0.185, tipo: 'tocha', escala: 0.7 },
    { u: 0.930, v: 0.310, tipo: 'tocha', escala: 0.7 },
  ],

  // -------------------------------------------------------------------------
  // ABISMO — a arte mais escura do jogo. Cogumelo luminoso, boca de caverna
  // acesa e a rachadura de lava do canto inferior esquerdo.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/abyss.jpg': [
    { u: 0.320, v: 0.130, tipo: 'orbe', cor: '#b98cff', escala: 0.9 },
    { u: 0.110, v: 0.280, tipo: 'orbe', cor: '#b98cff', escala: 0.9 },
    { u: 0.080, v: 0.600, tipo: 'orbe', cor: '#8ad6ff', escala: 0.9 },
    { u: 0.190, v: 0.650, tipo: 'orbe', cor: '#b98cff', escala: 0.9 },
    { u: 0.270, v: 0.600, tipo: 'orbe', cor: '#b98cff', escala: 0.9 },
    { u: 0.420, v: 0.800, tipo: 'orbe', cor: '#b98cff', escala: 0.9 },
    { u: 0.680, v: 0.100, tipo: 'orbe', cor: '#ffcf8a', escala: 1.6 },
    { u: 0.900, v: 0.250, tipo: 'orbe', cor: '#ffcf8a', escala: 1.6 },
    { u: 0.850, v: 0.720, tipo: 'orbe', cor: '#ffcf8a', escala: 1.6 },
    { u: 0.080, v: 0.850, tipo: 'fogueira', escala: 0.6 },
    { u: 0.130, v: 0.780, tipo: 'fogueira', escala: 0.5 },
  ],

  // -------------------------------------------------------------------------
  // DOJO — jardim japones com cerejeiras, lanternas de pedra e um rio de
  // carpas. O preset dele e 'poeira', herdado da familia de templo: poeira num
  // jardim varrido nao existe, petala existe.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/dojo.jpg': [
    { u: 0.290, v: 0.580, tipo: 'petala' },
    { u: 0.520, v: 0.335, tipo: 'petala' },
    { u: 0.915, v: 0.135, tipo: 'petala' },
    { u: 0.470, v: 0.115, tipo: 'tocha', escala: 0.6 },
    { u: 0.460, v: 0.370, tipo: 'tocha', escala: 0.6 },
    { u: 0.650, v: 0.370, tipo: 'tocha', escala: 0.6 },
    { u: 0.530, v: 0.700, tipo: 'tocha', escala: 0.6 },
    { u: 0.860, v: 0.490, tipo: 'tocha', escala: 0.6 },
    { u: 0.755, v: 0.360, tipo: 'correnteza' },
    { u: 0.700, v: 0.500, tipo: 'correnteza' },
    { u: 0.640, v: 0.620, tipo: 'correnteza' },
    { u: 0.600, v: 0.800, tipo: 'correnteza' },
  ],

  // -------------------------------------------------------------------------
  // PRAIA — a arte ja desenha a espuma da arrebentacao ao longo de toda a
  // costa, parada. As ancoras seguem a linha dela.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/beach.jpg': [
    // Esta linha nao foi escrita a olho: a costa e diagonal e vira pro norte no
    // canto direito, e duas leituras minhas seguidas erraram pra dentro da
    // areia (a bancada ao vivo mostrou a espuma caindo em terra seca). O `v` de
    // cada coluna saiu de VARRER a arte procurando o primeiro pixel branco que
    // tem agua logo abaixo — a fronteira espuma/mar, que e onde a onda quebra:
    //
    //   for x in colunas: primeiro y com pixel branco e agua ate 60px abaixo
    //
    // Medir foi mais barato que acertar no olho, e e reproduzivel se a arte
    // mudar.
    { u: 0.050, v: 0.792, tipo: 'quebraMar' },
    { u: 0.150, v: 0.754, tipo: 'quebraMar' },
    { u: 0.280, v: 0.732, tipo: 'quebraMar' },
    { u: 0.420, v: 0.735, tipo: 'quebraMar' },
    { u: 0.550, v: 0.757, tipo: 'quebraMar' },
    { u: 0.660, v: 0.760, tipo: 'quebraMar' },
    { u: 0.760, v: 0.745, tipo: 'quebraMar' },
    { u: 0.840, v: 0.657, tipo: 'quebraMar' },
    { u: 0.900, v: 0.307, tipo: 'quebraMar' },
    { u: 0.940, v: 0.197, tipo: 'quebraMar' },
  ],

  // -------------------------------------------------------------------------
  // PANTANO — a agua tem mascara (PH-113) e ganha cintilancia por ela. O que
  // entra aqui e o gas: brejo que borbulha e a razao de o lugar cheirar mal.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/swamp.jpg': [
    // As seis foram CONFERIDAS contra `AGUA_POR_ARTE` (a mascara pintada do
    // PH-113): gas de brejo tem que sair da agua, e tres delas estavam em
    // cima de raiz, tronco e salgueiro — o tipo de erro que so aparece na
    // arte, porque nenhum numero aqui esta errado.
    { u: 0.208, v: 0.218, tipo: 'gas', cor: '#a9d06a' },
    { u: 0.560, v: 0.260, tipo: 'gas', cor: '#a9d06a' },
    { u: 0.140, v: 0.450, tipo: 'gas', cor: '#a9d06a' },
    { u: 0.724, v: 0.462, tipo: 'gas', cor: '#a9d06a' },
    { u: 0.330, v: 0.790, tipo: 'gas', cor: '#a9d06a' },
    { u: 0.840, v: 0.572, tipo: 'gas', cor: '#a9d06a' },
    { u: 0.470, v: 0.140, tipo: 'vagalume', cor: '#d8f08a' },
    { u: 0.780, v: 0.860, tipo: 'vagalume', cor: '#d8f08a' },
  ],
}
