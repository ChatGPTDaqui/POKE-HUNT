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
  | 'borboleta' // 2-3 borboletas batendo asa em volta da ancora (canteiro de flor)
  // — corpo OPACO procedural (le em cena clara, onde brilho somado some)
  | 'nevoa' // mancha de nevoa grande e suave derivando devagar
  | 'fogoFatuo' // duas chamas fantasmas flutuando (cemiterio, torre assombrada)

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
   * `vagalume`, `borboleta`, `nevoa`, `fogoFatuo`). Ausente = a cor padrao do tipo em `ambienteProps.ts`.
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
    // Borboletas nos canteiros de flor (24/10/2026): campina de cima (lilas),
    // capim florido do meio (azul, contraste com a flor amarela) e a moita florida da direita.
    { u: 0.650, v: 0.150, tipo: 'borboleta', cor: '#c9a7ff' },
    { u: 0.520, v: 0.590, tipo: 'borboleta', cor: '#7fd3ff', fase: 3 },
    { u: 0.890, v: 0.490, tipo: 'borboleta', cor: '#ffffff', fase: 6 },
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

  // -------------------------------------------------------------------------
  // CAMPINA (24/10/2026, vida nos mapas — mapa 2). Rio e lago ondulam pela
  // mascara de agua (scripts/pintar-ref-agua.js); aqui so o que e ponto: a
  // queda d'agua do canto e as borboletas nos canteiros de flor.
  // -------------------------------------------------------------------------
  'assets/hunt-backgrounds/meadow.jpg': [
    { u: 0.888, v: 0.150, tipo: 'cascata', escala: 0.8 },
    { u: 0.435, v: 0.340, tipo: 'borboleta', cor: '#fff3b0' },
    { u: 0.560, v: 0.610, tipo: 'borboleta', cor: '#ffb0d0', fase: 2 },
    { u: 0.270, v: 0.780, tipo: 'borboleta', cor: '#7fd3ff', fase: 4 },
    { u: 0.860, v: 0.800, tipo: 'borboleta', cor: '#ffffff', fase: 6 },
  ],

  // PLANICIE (mapa 3). Rio e laguinho ondulam pela mascara; sem fogo nem luz
  // no desenho, o que sobra e vida de campo: borboletas nos canteiros.
  'assets/hunt-backgrounds/plains.jpg': [
    { u: 0.265, v: 0.210, tipo: 'borboleta', cor: '#ffb0d0' },
    { u: 0.310, v: 0.410, tipo: 'borboleta', cor: '#fff3b0', fase: 2 },
    { u: 0.220, v: 0.760, tipo: 'borboleta', cor: '#7fd3ff', fase: 4 },
    { u: 0.770, v: 0.710, tipo: 'borboleta', cor: '#ffffff', fase: 6 },
  ],

  // FAZENDA (mapa 4). Escala propria 0,5 (o desenho era o dobro do resto:
  // ver ESCALA_POR_ARTE em scripts/build-sub-bioma-collision.js). Palha
  // soltando dos montes de feno, agua mexendo no cocho e borboletas no pasto.
  'assets/hunt-backgrounds/farm.jpg': [
    { u: 0.310, v: 0.130, tipo: 'petala', cor: '#f2d36b', escala: 0.7 },
    { u: 0.665, v: 0.130, tipo: 'petala', cor: '#f2d36b', escala: 0.7, fase: 3 },
    { u: 0.190, v: 0.565, tipo: 'correnteza', escala: 0.5 },
    { u: 0.250, v: 0.720, tipo: 'borboleta', cor: '#ffffff' },
    { u: 0.500, v: 0.470, tipo: 'borboleta', cor: '#ffb0d0', fase: 3 },
    { u: 0.800, v: 0.760, tipo: 'borboleta', cor: '#fff3b0', fase: 5 },
  ],

  // FLORESTA QUEIMADA (lote 2, Sombrio). A arte ja pinta fio de fumaca e
  // brasa laranja nos tocos: aqui eles passam a subir e piscar. O rio e cinza
  // de cinza — mesma cor do chao de cinzas, sem mascara possivel.
  'assets/hunt-backgrounds/burnt-forest.jpg': [
    { u: 0.155, v: 0.045, tipo: 'chamine', escala: 0.7 },
    { u: 0.717, v: 0.025, tipo: 'chamine', escala: 0.5, fase: 1 },
    { u: 0.474, v: 0.190, tipo: 'chamine', escala: 0.5, fase: 2 },
    { u: 0.474, v: 0.195, tipo: 'tocha', escala: 0.45 },
    { u: 0.530, v: 0.190, tipo: 'chamine', escala: 0.45, fase: 3 },
    { u: 0.572, v: 0.215, tipo: 'tocha', escala: 0.4, fase: 1 },
    { u: 0.735, v: 0.335, tipo: 'chamine', escala: 0.5, fase: 4 },
    { u: 0.815, v: 0.370, tipo: 'tocha', escala: 0.6, fase: 2 },
    { u: 0.022, v: 0.335, tipo: 'tocha', escala: 0.45, fase: 3 },
    { u: 0.223, v: 0.745, tipo: 'chamine', escala: 0.45, fase: 5 },
    { u: 0.223, v: 0.755, tipo: 'tocha', escala: 0.4, fase: 4 },
    { u: 0.523, v: 0.785, tipo: 'chamine', escala: 0.5, fase: 6 },
    { u: 0.556, v: 0.835, tipo: 'tocha', escala: 0.4, fase: 5 },
    { u: 0.223, v: 0.822, tipo: 'orbe', cor: '#ff7a3c', escala: 0.5 },
  ],

  // MONTE PYRE (lote 2, Sombrio). Cemiterio na nevoa, cena CLARA: brilho
  // somado some, entao vida aqui e corpo opaco — nevoa derivando nos
  // patamares, fogo-fatuo entre as lapides e incenso nas lanternas/altar.
  'assets/hunt-backgrounds/mt-pyre.jpg': [
    { u: 0.300, v: 0.300, tipo: 'nevoa' },
    { u: 0.700, v: 0.450, tipo: 'nevoa', fase: 7 },
    { u: 0.350, v: 0.620, tipo: 'nevoa', fase: 13 },
    { u: 0.750, v: 0.780, tipo: 'nevoa', fase: 21 },
    { u: 0.500, v: 0.900, tipo: 'nevoa', fase: 30 },
    { u: 0.250, v: 0.470, tipo: 'fogoFatuo' },
    { u: 0.800, v: 0.580, tipo: 'fogoFatuo', cor: '#7fc8ff', fase: 4 },
    { u: 0.450, v: 0.700, tipo: 'fogoFatuo', fase: 8 },
    { u: 0.448, v: 0.185, tipo: 'chamine', escala: 0.35 },
    { u: 0.551, v: 0.185, tipo: 'chamine', escala: 0.35, fase: 2 },
    { u: 0.730, v: 0.360, tipo: 'chamine', escala: 0.35, fase: 4 },
  ],

  // TORRE QUEIMADA (lote 2, Sombrio). Escura: brasa nos pontos que a arte
  // pinta de laranja, fumaca fina do toco e do monte de cinza, e brilho nos
  // dois montes de brasa (rocha da esquerda e cinza da direita/baixo).
  'assets/hunt-backgrounds/burned-tower.jpg': [
    { u: 0.129, v: 0.176, tipo: 'tocha', escala: 0.35 },
    { u: 0.280, v: 0.205, tipo: 'tocha', escala: 0.35, fase: 1 },
    { u: 0.199, v: 0.223, tipo: 'tocha', escala: 0.35, fase: 2 },
    { u: 0.088, v: 0.230, tipo: 'tocha', escala: 0.3, fase: 3 },
    { u: 0.916, v: 0.264, tipo: 'tocha', escala: 0.35, fase: 4 },
    { u: 0.919, v: 0.331, tipo: 'tocha', escala: 0.35, fase: 5 },
    { u: 0.875, v: 0.362, tipo: 'tocha', escala: 0.3, fase: 6 },
    { u: 0.862, v: 0.484, tipo: 'tocha', escala: 0.3, fase: 7 },
    { u: 0.180, v: 0.160, tipo: 'chamine', escala: 0.45 },
    { u: 0.575, v: 0.165, tipo: 'chamine', escala: 0.4, fase: 3 },
    { u: 0.104, v: 0.556, tipo: 'orbe', cor: '#ff7a3c', escala: 0.6 },
    { u: 0.906, v: 0.688, tipo: 'orbe', cor: '#ff7a3c', escala: 0.6, fase: 2 },
    { u: 0.285, v: 0.862, tipo: 'orbe', cor: '#ff7a3c', escala: 0.7, fase: 4 },
  ],

  // NAVIO ABANDONADO (lote 2, Sombrio). Sem mascara: tabua esverdeada do
  // conves tem a cor do mar. Nevoa rolando nas bordas do casco e fogo-fatuo
  // azulado vagando pelo conves.
  'assets/hunt-backgrounds/abandoned-ship.jpg': [
    { u: 0.060, v: 0.500, tipo: 'nevoa', cor: '#d8eef0' },
    { u: 0.940, v: 0.450, tipo: 'nevoa', cor: '#d8eef0', fase: 9 },
    { u: 0.300, v: 0.950, tipo: 'nevoa', cor: '#d8eef0', fase: 17 },
    { u: 0.720, v: 0.950, tipo: 'nevoa', cor: '#d8eef0', fase: 25 },
    { u: 0.450, v: 0.550, tipo: 'fogoFatuo', cor: '#7fe0ff' },
    { u: 0.250, v: 0.760, tipo: 'fogoFatuo', cor: '#7fe0ff', fase: 5 },
    { u: 0.760, v: 0.330, tipo: 'fogoFatuo', cor: '#7fe0ff', fase: 10 },
  ],

  // TORRE POKEMON (lote 2, Sombrio). Escala propria 0,6 (vela quase da altura
  // do treinador). As quatro tochas da parede, chama pequena em cada monte de
  // vela, nevoa roxa andando por cima da que a arte ja pinta e dois fogos-fatuos.
  'assets/hunt-backgrounds/pokemon-tower.jpg': [
    { u: 0.176, v: 0.100, tipo: 'tocha', escala: 0.6 },
    { u: 0.373, v: 0.103, tipo: 'tocha', escala: 0.6, fase: 1 },
    { u: 0.624, v: 0.103, tipo: 'tocha', escala: 0.6, fase: 2 },
    { u: 0.823, v: 0.100, tipo: 'tocha', escala: 0.6, fase: 3 },
    { u: 0.130, v: 0.220, tipo: 'tocha', escala: 0.28, fase: 0 },
    { u: 0.435, v: 0.165, tipo: 'tocha', escala: 0.28, fase: 1 },
    { u: 0.870, v: 0.210, tipo: 'tocha', escala: 0.28, fase: 2 },
    { u: 0.122, v: 0.360, tipo: 'tocha', escala: 0.28, fase: 3 },
    { u: 0.872, v: 0.360, tipo: 'tocha', escala: 0.28, fase: 4 },
    { u: 0.124, v: 0.510, tipo: 'tocha', escala: 0.28, fase: 5 },
    { u: 0.877, v: 0.565, tipo: 'tocha', escala: 0.28, fase: 6 },
    { u: 0.124, v: 0.670, tipo: 'tocha', escala: 0.28, fase: 7 },
    { u: 0.875, v: 0.715, tipo: 'tocha', escala: 0.28, fase: 8 },
    { u: 0.140, v: 0.870, tipo: 'tocha', escala: 0.28, fase: 9 },
    { u: 0.373, v: 0.865, tipo: 'tocha', escala: 0.28, fase: 10 },
    { u: 0.626, v: 0.865, tipo: 'tocha', escala: 0.28, fase: 11 },
    { u: 0.828, v: 0.870, tipo: 'tocha', escala: 0.28, fase: 12 },
    { u: 0.250, v: 0.420, tipo: 'nevoa', cor: '#b9a0e0' },
    { u: 0.600, v: 0.250, tipo: 'nevoa', cor: '#b9a0e0', fase: 11 },
    { u: 0.400, v: 0.650, tipo: 'nevoa', cor: '#b9a0e0', fase: 19 },
    { u: 0.800, v: 0.780, tipo: 'nevoa', cor: '#b9a0e0', fase: 27 },
    { u: 0.470, v: 0.500, tipo: 'fogoFatuo' },
    { u: 0.700, v: 0.450, tipo: 'fogoFatuo', fase: 6 },
  ],

  // PORTO (lote 3, Urbano). A doca ondula pela mascara (a agua satura acima
  // de 0,5, o conteiner azul nao). Aqui so a chamine do cargueiro.
  'assets/hunt-backgrounds/harbor.jpg': [
    { u: 0.652, v: 0.072, tipo: 'chamine', escala: 0.7 },
  ],

  // ESGOTO (lote 3, Urbano). Escuro: as seis lampadas pulsam, a agua verde
  // ondula pela mascara e os canos soltam vapor.
  'assets/hunt-backgrounds/underground.jpg': [
    { u: 0.175, v: 0.100, tipo: 'orbe', cor: '#ffe28a', escala: 0.8, fase: 0 },
    { u: 0.618, v: 0.100, tipo: 'orbe', cor: '#ffe28a', escala: 0.8, fase: 1 },
    { u: 0.836, v: 0.100, tipo: 'orbe', cor: '#ffe28a', escala: 0.8, fase: 2 },
    { u: 0.108, v: 0.370, tipo: 'orbe', cor: '#ffe28a', escala: 0.8, fase: 3 },
    { u: 0.108, v: 0.635, tipo: 'orbe', cor: '#ffe28a', escala: 0.8, fase: 4 },
    { u: 0.892, v: 0.627, tipo: 'orbe', cor: '#ffe28a', escala: 0.8, fase: 5 },
    { u: 0.260, v: 0.150, tipo: 'fumarola', escala: 0.4 },
    { u: 0.680, v: 0.140, tipo: 'fumarola', escala: 0.4, fase: 3 },
    { u: 0.940, v: 0.760, tipo: 'fumarola', escala: 0.35, fase: 5 },
  ],

  // ESCONDERIJO ROCKET (lote 3, Urbano). Escuro: sirenes vermelhas girando
  // (orbe vermelho pulsando) e telas de terminal com brilho verde.
  'assets/hunt-backgrounds/rocket-hideout.jpg': [
    { u: 0.124, v: 0.067, tipo: 'orbe', cor: '#ff3b3b', escala: 0.6, fase: 0 },
    { u: 0.425, v: 0.067, tipo: 'orbe', cor: '#ff3b3b', escala: 0.6, fase: 0.3 },
    { u: 0.874, v: 0.067, tipo: 'orbe', cor: '#ff3b3b', escala: 0.6, fase: 0.6 },
    { u: 0.274, v: 0.110, tipo: 'orbe', cor: '#ff3b3b', escala: 0.6, fase: 0.8999999999999999 },
    { u: 0.575, v: 0.105, tipo: 'orbe', cor: '#ff3b3b', escala: 0.6, fase: 1.2 },
    { u: 0.725, v: 0.110, tipo: 'orbe', cor: '#ff3b3b', escala: 0.6, fase: 1.5 },
    { u: 0.224, v: 0.383, tipo: 'orbe', cor: '#ff3b3b', escala: 0.6, fase: 1.7999999999999998 },
    { u: 0.874, v: 0.383, tipo: 'orbe', cor: '#ff3b3b', escala: 0.6, fase: 2.1 },
    { u: 0.174, v: 0.660, tipo: 'orbe', cor: '#ff3b3b', escala: 0.6, fase: 2.4 },
    { u: 0.874, v: 0.660, tipo: 'orbe', cor: '#ff3b3b', escala: 0.6, fase: 2.6999999999999997 },
    { u: 0.924, v: 0.920, tipo: 'orbe', cor: '#ff3b3b', escala: 0.6, fase: 3 },
    { u: 0.174, v: 0.090, tipo: 'orbe', cor: '#7dffb0', escala: 0.4, fase: 5 },
    { u: 0.124, v: 0.375, tipo: 'orbe', cor: '#7dffb0', escala: 0.4, fase: 6 },
    { u: 0.174, v: 0.370, tipo: 'orbe', cor: '#7dffb0', escala: 0.4, fase: 7 },
    { u: 0.824, v: 0.415, tipo: 'orbe', cor: '#7dffb0', escala: 0.4, fase: 8 },
    { u: 0.074, v: 0.710, tipo: 'orbe', cor: '#7dffb0', escala: 0.4, fase: 9 },
    { u: 0.124, v: 0.705, tipo: 'orbe', cor: '#7dffb0', escala: 0.4, fase: 10 },
    { u: 0.824, v: 0.795, tipo: 'orbe', cor: '#7dffb0', escala: 0.4, fase: 11 },
  ],

  // MANSAO CELADON (lote 3, Urbano). Escala propria 0,5 (banco 3,5x o
  // treinador). Fonte jorrando e borboletas no jardim.
  'assets/hunt-backgrounds/celadon-mansion.jpg': [
    { u: 0.710, v: 0.445, tipo: 'cascata', escala: 0.5 },
    { u: 0.700, v: 0.495, tipo: 'correnteza', escala: 0.6 },
    { u: 0.600, v: 0.360, tipo: 'borboleta', cor: '#ffb0d0' },
    { u: 0.850, v: 0.270, tipo: 'borboleta', cor: '#fff3b0', fase: 3 },
    { u: 0.790, v: 0.760, tipo: 'borboleta', cor: '#7fd3ff', fase: 5 },
  ],

  // CONCURSO DE INSETOS (lote 3). Proporcao boa. Fonte jorrando no centro e
  // borboletas nos cantos floridos dos quatro canteiros.
  'assets/hunt-backgrounds/bug-contest.jpg': [
    { u: 0.500, v: 0.470, tipo: 'cascata', escala: 0.45 },
    { u: 0.500, v: 0.495, tipo: 'correnteza', escala: 0.5 },
    { u: 0.230, v: 0.230, tipo: 'borboleta', cor: '#ffb0d0' },
    { u: 0.770, v: 0.230, tipo: 'borboleta', cor: '#fff3b0', fase: 2 },
    { u: 0.230, v: 0.760, tipo: 'borboleta', cor: '#c9a7ff', fase: 4 },
    { u: 0.770, v: 0.760, tipo: 'borboleta', cor: '#ffffff', fase: 6 },
  ],

  // MATO ALTO (lote 4, Mata). Mata escura com brejo roxo: bolha verde subindo
  // dos tres pocos, cogumelo luminoso pulsando e vaga-lume verde.
  'assets/hunt-backgrounds/tall-grass.jpg': [
    { u: 0.200, v: 0.215, tipo: 'gas', cor: '#7dff7a', escala: 0.7 },
    { u: 0.720, v: 0.590, tipo: 'gas', cor: '#7dff7a', escala: 0.7, fase: 3 },
    { u: 0.560, v: 0.880, tipo: 'gas', cor: '#7dff7a', escala: 0.7, fase: 6 },
    { u: 0.645, v: 0.160, tipo: 'orbe', cor: '#7dff9a', escala: 0.5 },
    { u: 0.820, v: 0.245, tipo: 'orbe', cor: '#7dff9a', escala: 0.5, fase: 2 },
    { u: 0.535, v: 0.430, tipo: 'orbe', cor: '#7dff9a', escala: 0.4, fase: 4 },
    { u: 0.690, v: 0.800, tipo: 'orbe', cor: '#7dff9a', escala: 0.5, fase: 6 },
    { u: 0.300, v: 0.450, tipo: 'vagalume', cor: '#c8f07a' },
    { u: 0.780, v: 0.380, tipo: 'vagalume', cor: '#c8f07a', fase: 5 },
  ],

  // CLAREIRA DOS COGUMELOS (lote 4, Mata). Escala propria 0,55 (cogumelo grande
  // ~3x o treinador). Esporo caindo dos cogumelos grandes e borboletas nos
  // circulos de fada.
  'assets/hunt-backgrounds/mushroom-glade.jpg': [
    { u: 0.730, v: 0.160, tipo: 'petala', cor: '#e6c75a', escala: 0.5 },
    { u: 0.435, v: 0.440, tipo: 'petala', cor: '#e6c75a', escala: 0.5, fase: 3 },
    { u: 0.570, v: 0.400, tipo: 'petala', cor: '#e6c75a', escala: 0.4, fase: 5 },
    { u: 0.255, v: 0.270, tipo: 'borboleta', cor: '#ffb0d0' },
    { u: 0.760, v: 0.640, tipo: 'borboleta', cor: '#fff3b0', fase: 3 },
    { u: 0.230, v: 0.680, tipo: 'borboleta', cor: '#7fd3ff', fase: 5 },
  ],

  // BOSQUE DE ILEX (lote 4, Mata). Noite de mata fechada: nevoa andando por
  // cima da que a arte pinta, vaga-lumes, luz no santuario e respingo nas pocas.
  'assets/hunt-backgrounds/ilex-forest.jpg': [
    { u: 0.250, v: 0.470, tipo: 'nevoa', cor: '#cfe8dc' },
    { u: 0.720, v: 0.460, tipo: 'nevoa', cor: '#cfe8dc', fase: 9 },
    { u: 0.300, v: 0.700, tipo: 'nevoa', cor: '#cfe8dc', fase: 18 },
    { u: 0.680, v: 0.640, tipo: 'nevoa', cor: '#cfe8dc', fase: 27 },
    { u: 0.350, v: 0.350, tipo: 'vagalume', cor: '#d8f08a' },
    { u: 0.600, v: 0.560, tipo: 'vagalume', cor: '#d8f08a', fase: 4 },
    { u: 0.780, v: 0.720, tipo: 'vagalume', cor: '#d8f08a', fase: 8 },
    { u: 0.700, v: 0.295, tipo: 'orbe', cor: '#ffd58a', escala: 0.6 },
    { u: 0.455, v: 0.495, tipo: 'correnteza', escala: 0.5 },
    { u: 0.520, v: 0.605, tipo: 'correnteza', escala: 0.5, fase: 2 },
    { u: 0.760, v: 0.715, tipo: 'correnteza', escala: 0.5, fase: 4 },
  ],

  // COPA DAS ARVORES (lote 4, Mata). Escala propria 0,6 (barril e porta grandes
  // demais). O vao azul entre as copas e ceu: nuvem passando por ele. A folha
  // caindo e o pingo ja vem do preset 'selva'.
  'assets/hunt-backgrounds/treetops.jpg': [
    { u: 0.170, v: 0.300, tipo: 'nevoa', cor: '#ffffff' },
    { u: 0.720, v: 0.400, tipo: 'nevoa', cor: '#ffffff', fase: 10 },
    { u: 0.300, v: 0.640, tipo: 'nevoa', cor: '#ffffff', fase: 20 },
    { u: 0.640, v: 0.720, tipo: 'nevoa', cor: '#ffffff', fase: 30 },
  ],

  // OBRA (lote 5, Industrial). Proporcao boa. Fumaca de escape das tres
  // maquinas, poeira levantando do monte de terra e faisca de solda no
  // portico de canos.
  'assets/hunt-backgrounds/construction-site.jpg': [
    { u: 0.632, v: 0.425, tipo: 'chamine', escala: 0.4 },
    { u: 0.160, v: 0.305, tipo: 'chamine', escala: 0.35, fase: 2 },
    { u: 0.640, v: 0.745, tipo: 'chamine', escala: 0.35, fase: 4 },
    { u: 0.560, v: 0.370, tipo: 'nevoa', cor: '#c9a77a', escala: 0.45 },
    { u: 0.500, v: 0.490, tipo: 'nevoa', cor: '#c9a77a', escala: 0.4, fase: 12 },
    { u: 0.855, v: 0.375, tipo: 'eletrica', escala: 0.6 },
    { u: 0.855, v: 0.555, tipo: 'eletrica', escala: 0.6, fase: 3 },
  ],

  // FERRO-VELHO (lote 5, Industrial). Escala propria 0,5 (carro ~8x o
  // treinador; 0,5 e o menor que nao aperta a caca). Fumaca do guindaste,
  // faisca no cabo da garra e poeira rodando nas duas ruas de terra.
  'assets/hunt-backgrounds/junkyard.jpg': [
    { u: 0.875, v: 0.165, tipo: 'chamine', escala: 0.5 },
    { u: 0.700, v: 0.200, tipo: 'eletrica', escala: 0.6 },
    { u: 0.300, v: 0.500, tipo: 'nevoa', cor: '#b58a5a', escala: 0.45 },
    { u: 0.520, v: 0.700, tipo: 'nevoa', cor: '#b58a5a', escala: 0.45, fase: 14 },
    { u: 0.780, v: 0.500, tipo: 'nevoa', cor: '#b58a5a', escala: 0.4, fase: 25 },
  ],

  // SILPH CO. (lote 5, Industrial). Laboratorio claro: brilho somado some, entao
  // vida aqui e faisca nos racks de servidor (vapor claro sumiu no piso branco).
  'assets/hunt-backgrounds/silph-co.jpg': [
    { u: 0.200, v: 0.115, tipo: 'eletrica', escala: 0.35 },
    { u: 0.510, v: 0.115, tipo: 'eletrica', escala: 0.35, fase: 2 },
    { u: 0.830, v: 0.115, tipo: 'eletrica', escala: 0.35, fase: 4 },
    { u: 0.065, v: 0.470, tipo: 'eletrica', escala: 0.35, fase: 6 },
    { u: 0.910, v: 0.510, tipo: 'eletrica', escala: 0.35, fase: 8 },
  ],

  // TRILHA DE FOGO (lote 6, Igneo). Vapor saindo das dez chamines de pedra e
  // brilho pulsando nas rachaduras de lava.
  'assets/hunt-backgrounds/fiery-path.jpg': [
    { u: 0.474, v: 0.171, tipo: 'fumarola', escala: 0.45 },
    { u: 0.880, v: 0.176, tipo: 'fumarola', escala: 0.45, fase: 1 },
    { u: 0.274, v: 0.274, tipo: 'fumarola', escala: 0.45, fase: 2 },
    { u: 0.725, v: 0.274, tipo: 'fumarola', escala: 0.45, fase: 3 },
    { u: 0.626, v: 0.318, tipo: 'fumarola', escala: 0.45, fase: 4 },
    { u: 0.124, v: 0.313, tipo: 'fumarola', escala: 0.45, fase: 5 },
    { u: 0.875, v: 0.533, tipo: 'fumarola', escala: 0.45, fase: 6 },
    { u: 0.124, v: 0.569, tipo: 'fumarola', escala: 0.45, fase: 7 },
    { u: 0.323, v: 0.668, tipo: 'fumarola', escala: 0.45, fase: 8 },
    { u: 0.673, v: 0.668, tipo: 'fumarola', escala: 0.45, fase: 9 },
    { u: 0.176, v: 0.228, tipo: 'orbe', cor: '#ff7a3c', escala: 0.45 },
    { u: 0.171, v: 0.274, tipo: 'orbe', cor: '#ff7a3c', escala: 0.45, fase: 1 },
    { u: 0.626, v: 0.225, tipo: 'orbe', cor: '#ff7a3c', escala: 0.45, fase: 2 },
    { u: 0.826, v: 0.220, tipo: 'orbe', cor: '#ff7a3c', escala: 0.45, fase: 3 },
    { u: 0.176, v: 0.523, tipo: 'orbe', cor: '#ff7a3c', escala: 0.45, fase: 4 },
    { u: 0.124, v: 0.875, tipo: 'orbe', cor: '#ff7a3c', escala: 0.45, fase: 5 },
    { u: 0.176, v: 0.875, tipo: 'orbe', cor: '#ff7a3c', escala: 0.45, fase: 6 },
    { u: 0.176, v: 0.927, tipo: 'orbe', cor: '#ff7a3c', escala: 0.45, fase: 7 },
    { u: 0.176, v: 0.976, tipo: 'orbe', cor: '#ff7a3c', escala: 0.45, fase: 8 },
    { u: 0.828, v: 0.929, tipo: 'orbe', cor: '#ff7a3c', escala: 0.45, fase: 9 },
    { u: 0.823, v: 0.973, tipo: 'orbe', cor: '#ff7a3c', escala: 0.45, fase: 10 },
  ],

  // MONTE EMBER (lote 6, Igneo). Fumaca nas fendas que a arte pinta, chama
  // baixa nos rios de lava dos cantos e brilho nas rochas rachadas.
  'assets/hunt-backgrounds/mt-ember.jpg': [
    { u: 0.326, v: 0.129, tipo: 'fumarola', escala: 0.4 },
    { u: 0.673, v: 0.166, tipo: 'fumarola', escala: 0.45, fase: 2 },
    { u: 0.124, v: 0.357, tipo: 'fumarola', escala: 0.4, fase: 4 },
    { u: 0.181, v: 0.373, tipo: 'fumarola', escala: 0.4, fase: 6 },
    { u: 0.272, v: 0.378, tipo: 'fumarola', escala: 0.4, fase: 8 },
    { u: 0.626, v: 0.559, tipo: 'fumarola', escala: 0.4, fase: 10 },
    { u: 0.771, v: 0.792, tipo: 'fumarola', escala: 0.4, fase: 12 },
    { u: 0.251, v: 0.052, tipo: 'fogueira', escala: 0.6 },
    { u: 0.031, v: 0.699, tipo: 'fogueira', escala: 0.55, fase: 1 },
    { u: 0.129, v: 0.942, tipo: 'fogueira', escala: 0.55, fase: 2 },
    { u: 0.714, v: 0.947, tipo: 'fogueira', escala: 0.6, fase: 3 },
    { u: 0.947, v: 0.818, tipo: 'fogueira', escala: 0.55, fase: 4 },
    { u: 0.823, v: 0.150, tipo: 'fogueira', escala: 0.45, fase: 5 },
    { u: 0.228, v: 0.414, tipo: 'orbe', cor: '#ff7a3c', escala: 0.5 },
    { u: 0.911, v: 0.523, tipo: 'orbe', cor: '#ff7a3c', escala: 0.45, fase: 2 },
    { u: 0.202, v: 0.776, tipo: 'orbe', cor: '#ff7a3c', escala: 0.5, fase: 4 },
    { u: 0.797, v: 0.776, tipo: 'orbe', cor: '#ff7a3c', escala: 0.5, fase: 6 },
    { u: 0.973, v: 0.233, tipo: 'orbe', cor: '#ff7a3c', escala: 0.45, fase: 8 },
  ],

  // CAMPO DE CINZAS (lote 6, Igneo). Fumaca da chamine da casa, cinza caindo
  // das arvores e poeira de cinza rolando nas trilhas.
  'assets/hunt-backgrounds/ash-field.jpg': [
    { u: 0.805, v: 0.150, tipo: 'chamine', escala: 0.6 },
    { u: 0.259, v: 0.129, tipo: 'petala', cor: '#bdbab2', escala: 0.7 },
    { u: 0.569, v: 0.129, tipo: 'petala', cor: '#bdbab2', escala: 0.7, fase: 3 },
    { u: 0.031, v: 0.311, tipo: 'petala', cor: '#bdbab2', escala: 0.7, fase: 5 },
    { u: 0.963, v: 0.414, tipo: 'petala', cor: '#bdbab2', escala: 0.7, fase: 7 },
    { u: 0.217, v: 0.362, tipo: 'nevoa', cor: '#d6d2c8', escala: 0.5 },
    { u: 0.621, v: 0.404, tipo: 'nevoa', cor: '#d6d2c8', escala: 0.5, fase: 12 },
    { u: 0.362, v: 0.673, tipo: 'nevoa', cor: '#d6d2c8', escala: 0.55, fase: 24 },
    { u: 0.725, v: 0.647, tipo: 'nevoa', cor: '#d6d2c8', escala: 0.5, fase: 36 },
  ],

  // RECIFE DE CORAL (lote 7, Marinho). Lagoa ondula pela mascara; bolhas
  // subindo das anemonas.
  'assets/hunt-backgrounds/coral-reef.jpg': [
    { u: 0.424, v: 0.269, tipo: 'gas', cor: '#e8fbff', escala: 0.35 },
    { u: 0.626, v: 0.179, tipo: 'gas', cor: '#e8fbff', escala: 0.35, fase: 2 },
    { u: 0.875, v: 0.267, tipo: 'gas', cor: '#e8fbff', escala: 0.35, fase: 4 },
    { u: 0.173, v: 0.619, tipo: 'gas', cor: '#e8fbff', escala: 0.35, fase: 6 },
    { u: 0.624, v: 0.621, tipo: 'gas', cor: '#e8fbff', escala: 0.35, fase: 8 },
    { u: 0.223, v: 0.854, tipo: 'gas', cor: '#e8fbff', escala: 0.35, fase: 10 },
    { u: 0.875, v: 0.619, tipo: 'gas', cor: '#e8fbff', escala: 0.35, fase: 12 },
  ],

  // ILHAS REDEMOINHO (lote 7, Marinho). Pocas ondulam pela mascara; onda
  // arrebentando na espuma das bordas e nevoa de maresia.
  'assets/hunt-backgrounds/whirl-islands.jpg': [
    { u: 0.129, v: 0.523, tipo: 'quebraMar', escala: 0.6 },
    { u: 0.854, v: 0.518, tipo: 'quebraMar', escala: 0.6, fase: 2 },
    { u: 0.248, v: 0.807, tipo: 'quebraMar', escala: 0.6, fase: 4 },
    { u: 0.673, v: 0.813, tipo: 'quebraMar', escala: 0.6, fase: 6 },
    { u: 0.362, v: 0.455, tipo: 'nevoa', cor: '#c9d4e6', escala: 0.6 },
    { u: 0.595, v: 0.569, tipo: 'nevoa', cor: '#c9d4e6', escala: 0.6, fase: 15 },
  ],

  // ARQUIPELAGO LARANJA (lote 7, Marinho). Mar do cais ondula pela mascara;
  // onda batendo na areia e borboletas nos canteiros floridos.
  'assets/hunt-backgrounds/orange-archipelago.jpg': [
    { u: 0.207, v: 0.849, tipo: 'quebraMar', escala: 0.6 },
    { u: 0.725, v: 0.844, tipo: 'quebraMar', escala: 0.6, fase: 3 },
    { u: 0.098, v: 0.414, tipo: 'quebraMar', escala: 0.5, fase: 5 },
    { u: 0.911, v: 0.569, tipo: 'quebraMar', escala: 0.5, fase: 7 },
    { u: 0.445, v: 0.331, tipo: 'borboleta', cor: '#ffb0d0' },
    { u: 0.668, v: 0.362, tipo: 'borboleta', cor: '#fff3b0', fase: 3 },
    { u: 0.362, v: 0.678, tipo: 'borboleta', cor: '#7fd3ff', fase: 5 },
    { u: 0.688, v: 0.688, tipo: 'borboleta', cor: '#ffffff', fase: 7 },
  ],

  // TORRE SPROUT (lote 8, Sagrado). Interior a luz de lampiao: incenso subindo
  // dos dez queimadores e luz pulsando nas quatro lanternas.
  'assets/hunt-backgrounds/sprout-tower.jpg': [
    { u: 0.575, v: 0.160, tipo: 'chamine', escala: 0.35 },
    { u: 0.228, v: 0.259, tipo: 'chamine', escala: 0.35, fase: 1 },
    { u: 0.774, v: 0.259, tipo: 'chamine', escala: 0.35, fase: 2 },
    { u: 0.127, v: 0.414, tipo: 'chamine', escala: 0.35, fase: 3 },
    { u: 0.875, v: 0.414, tipo: 'chamine', escala: 0.35, fase: 4 },
    { u: 0.127, v: 0.559, tipo: 'chamine', escala: 0.35, fase: 5 },
    { u: 0.875, v: 0.559, tipo: 'chamine', escala: 0.35, fase: 6 },
    { u: 0.228, v: 0.756, tipo: 'chamine', escala: 0.35, fase: 7 },
    { u: 0.774, v: 0.756, tipo: 'chamine', escala: 0.35, fase: 8 },
    { u: 0.355, v: 0.106, tipo: 'orbe', cor: '#ffc06a', escala: 0.7 },
    { u: 0.637, v: 0.106, tipo: 'orbe', cor: '#ffc06a', escala: 0.7, fase: 2 },
    { u: 0.173, v: 0.815, tipo: 'orbe', cor: '#ffc06a', escala: 0.7, fase: 4 },
    { u: 0.673, v: 0.870, tipo: 'orbe', cor: '#ffc06a', escala: 0.7, fase: 6 },
  ],

  // PILAR DO CEU (lote 8, Sagrado). Nuvem passando pelos buracos do piso e
  // pelas bordas, e as runas turquesa pulsando.
  'assets/hunt-backgrounds/sky-pillar.jpg': [
    { u: 0.331, v: 0.321, tipo: 'nevoa', cor: '#ffffff', escala: 0.5 },
    { u: 0.704, v: 0.440, tipo: 'nevoa', cor: '#ffffff', escala: 0.5, fase: 10 },
    { u: 0.342, v: 0.647, tipo: 'nevoa', cor: '#ffffff', escala: 0.5, fase: 20 },
    { u: 0.642, v: 0.626, tipo: 'nevoa', cor: '#ffffff', escala: 0.55, fase: 30 },
    { u: 0.725, v: 0.280, tipo: 'orbe', cor: '#5fe0c8', escala: 0.9 },
    { u: 0.549, v: 0.290, tipo: 'orbe', cor: '#5fe0c8', escala: 0.6, fase: 2 },
    { u: 0.745, v: 0.678, tipo: 'orbe', cor: '#5fe0c8', escala: 0.8, fase: 4 },
    { u: 0.217, v: 0.647, tipo: 'orbe', cor: '#5fe0c8', escala: 0.5, fase: 6 },
  ],

  // SANTUARIO DE MEDITACAO (lote 8, Sagrado). Lago das carpas ondula pela mascara;
  // petalas de glicinia caindo e borboletas nos canteiros de flor.
  'assets/hunt-backgrounds/meditation-shrine.jpg': [
    { u: 0.373, v: 0.166, tipo: 'petala', cor: '#c9a6f0', escala: 0.6 },
    { u: 0.921, v: 0.259, tipo: 'petala', cor: '#c9a6f0', escala: 0.6, fase: 3 },
    { u: 0.127, v: 0.523, tipo: 'petala', cor: '#c9a6f0', escala: 0.6, fase: 5 },
    { u: 0.688, v: 0.818, tipo: 'petala', cor: '#c9a6f0', escala: 0.6, fase: 7 },
    { u: 0.466, v: 0.362, tipo: 'borboleta', cor: '#ffffff' },
    { u: 0.776, v: 0.776, tipo: 'borboleta', cor: '#fff3b0', fase: 3 },
    { u: 0.259, v: 0.751, tipo: 'borboleta', cor: '#c9a6f0', fase: 5 },
    { u: 0.569, v: 0.921, tipo: 'borboleta', cor: '#ffb0d0', fase: 7 },
  ],

  // MANSAO POKEMON (lote 8, Sagrado). Ruina assombrada: poeira subindo dos buracos
  // do assoalho, fogo-fatuo rondando as estatuas e fumaca dos frascos do laboratorio.
  'assets/hunt-backgrounds/pokemon-mansion.jpg': [
    { u: 0.248, v: 0.352, tipo: 'nevoa', cor: '#8a7a70', escala: 0.45 },
    { u: 0.751, v: 0.290, tipo: 'nevoa', cor: '#8a7a70', escala: 0.5, fase: 12 },
    { u: 0.751, v: 0.735, tipo: 'nevoa', cor: '#8a7a70', escala: 0.5, fase: 24 },
    { u: 0.155, v: 0.171, tipo: 'fogoFatuo', cor: '#a8c8ff' },
    { u: 0.652, v: 0.171, tipo: 'fogoFatuo', cor: '#a8c8ff', fase: 3 },
    { u: 0.901, v: 0.414, tipo: 'fogoFatuo', cor: '#c0a8ff', fase: 5 },
    { u: 0.098, v: 0.430, tipo: 'fogoFatuo', cor: '#c0a8ff', fase: 7 },
    { u: 0.409, v: 0.373, tipo: 'chamine', escala: 0.25 },
    { u: 0.714, v: 0.611, tipo: 'chamine', escala: 0.25, fase: 3 },
    { u: 0.259, v: 0.792, tipo: 'chamine', escala: 0.25, fase: 6 },
  ],

  // DESERTO (lote 9, Arido). Ja tem areia soprando pelo preset; aqui redemoinhos de
  // poeira nas trilhas abertas e brisa fria saindo das bocas de caverna.
  'assets/hunt-backgrounds/desert.jpg': [
    { u: 0.321, v: 0.569, tipo: 'nevoa', cor: '#e2c48a', escala: 0.45 },
    { u: 0.699, v: 0.518, tipo: 'nevoa', cor: '#e2c48a', escala: 0.45, fase: 12 },
    { u: 0.290, v: 0.880, tipo: 'nevoa', cor: '#e2c48a', escala: 0.45, fase: 24 },
    { u: 0.673, v: 0.217, tipo: 'nevoa', cor: '#e2c48a', escala: 0.4, fase: 36 },
    { u: 0.161, v: 0.096, tipo: 'nevoa', cor: '#8a7466', escala: 0.25 },
    { u: 0.886, v: 0.362, tipo: 'nevoa', cor: '#8a7466', escala: 0.25, fase: 8 },
    { u: 0.136, v: 0.484, tipo: 'nevoa', cor: '#8a7466', escala: 0.25, fase: 16 },
    { u: 0.462, v: 0.766, tipo: 'nevoa', cor: '#8a7466', escala: 0.25, fase: 24 },
  ],

  // TERRAS ARIDAS (lote 9, Arido). Poeira levantando do leito seco do rio, areia
  // soprando da crista das dunas e brisa saindo das duas cavernas.
  'assets/hunt-backgrounds/badlands.jpg': [
    { u: 0.233, v: 0.207, tipo: 'nevoa', cor: '#b49a7a', escala: 0.45 },
    { u: 0.595, v: 0.362, tipo: 'nevoa', cor: '#b49a7a', escala: 0.45, fase: 12 },
    { u: 0.362, v: 0.699, tipo: 'nevoa', cor: '#b49a7a', escala: 0.45, fase: 24 },
    { u: 0.155, v: 0.880, tipo: 'nevoa', cor: '#b49a7a', escala: 0.45, fase: 36 },
    { u: 0.880, v: 0.331, tipo: 'nevoa', cor: '#e8c88e', escala: 0.4, fase: 6 },
    { u: 0.673, v: 0.880, tipo: 'nevoa', cor: '#e8c88e', escala: 0.4, fase: 18 },
    { u: 0.823, v: 0.104, tipo: 'nevoa', cor: '#7a5a4a', escala: 0.25 },
    { u: 0.098, v: 0.647, tipo: 'nevoa', cor: '#7a5a4a', escala: 0.25, fase: 10 },
  ],

  // TERRA DEVASTADA (lote 9, Arido). Poeira rodando pela praca em ruinas e pela
  // estrada de pedra, brisa saindo do templo e da passagem sob a ponte.
  'assets/hunt-backgrounds/wasteland.jpg': [
    { u: 0.543, v: 0.466, tipo: 'nevoa', cor: '#e2c48a', escala: 0.5 },
    { u: 0.699, v: 0.569, tipo: 'nevoa', cor: '#e2c48a', escala: 0.45, fase: 12 },
    { u: 0.259, v: 0.673, tipo: 'nevoa', cor: '#c8b08a', escala: 0.45, fase: 24 },
    { u: 0.414, v: 0.233, tipo: 'nevoa', cor: '#c8b08a', escala: 0.4, fase: 36 },
    { u: 0.880, v: 0.854, tipo: 'nevoa', cor: '#e2c48a', escala: 0.4, fase: 18 },
    { u: 0.802, v: 0.342, tipo: 'nevoa', cor: '#6a4e3e', escala: 0.25 },
    { u: 0.678, v: 0.849, tipo: 'nevoa', cor: '#6a4e3e', escala: 0.25, fase: 10 },
    { u: 0.678, v: 0.455, tipo: 'fogoFatuo', cor: '#ffe6a0', fase: 2 },
  ],

  // CANION (lote 9, Arido). Poeira rodando pela trilha clara do fundo do canion e
  // brisa saindo das tocas nas paredes de rocha.
  'assets/hunt-backgrounds/canyon.jpg': [
    { u: 0.497, v: 0.155, tipo: 'nevoa', cor: '#f0c898', escala: 0.4 },
    { u: 0.414, v: 0.492, tipo: 'nevoa', cor: '#f0c898', escala: 0.45, fase: 12 },
    { u: 0.595, v: 0.647, tipo: 'nevoa', cor: '#f0c898', escala: 0.45, fase: 24 },
    { u: 0.497, v: 0.906, tipo: 'nevoa', cor: '#f0c898', escala: 0.4, fase: 36 },
    { u: 0.173, v: 0.179, tipo: 'nevoa', cor: '#6a3a2e', escala: 0.22 },
    { u: 0.132, v: 0.471, tipo: 'nevoa', cor: '#6a3a2e', escala: 0.22, fase: 8 },
    { u: 0.916, v: 0.523, tipo: 'nevoa', cor: '#6a3a2e', escala: 0.22, fase: 16 },
    { u: 0.722, v: 0.137, tipo: 'nevoa', cor: '#6a3a2e', escala: 0.2, fase: 24 },
  ],

  // CANION DO VOVO (lote 9, Arido). Sitio de escavacao: poeira subindo das quatro
  // valas de fossil e redemoinho na estrada central.
  'assets/hunt-backgrounds/grampa-canyon.jpg': [
    { u: 0.243, v: 0.280, tipo: 'nevoa', cor: '#a07850', escala: 0.3 },
    { u: 0.735, v: 0.321, tipo: 'nevoa', cor: '#a07850', escala: 0.35, fase: 10 },
    { u: 0.274, v: 0.745, tipo: 'nevoa', cor: '#a07850', escala: 0.35, fase: 20 },
    { u: 0.714, v: 0.683, tipo: 'nevoa', cor: '#a07850', escala: 0.3, fase: 30 },
    { u: 0.497, v: 0.466, tipo: 'nevoa', cor: '#e8b878', escala: 0.45, fase: 6 },
    { u: 0.497, v: 0.828, tipo: 'nevoa', cor: '#e8b878', escala: 0.4, fase: 18 },
    { u: 0.497, v: 0.129, tipo: 'nevoa', cor: '#e8b878', escala: 0.35, fase: 28 },
  ],

  // OASIS (lote 9, Arido). Lagoa turquesa ondula pela mascara; borboletas no verde
  // em volta da agua e poeira rodando no areal e na trilha de entrada.
  'assets/hunt-backgrounds/oasis.jpg': [
    { u: 0.362, v: 0.466, tipo: 'borboleta', cor: '#fff3b0' },
    { u: 0.663, v: 0.647, tipo: 'borboleta', cor: '#ffffff', fase: 3 },
    { u: 0.217, v: 0.269, tipo: 'borboleta', cor: '#ffb0d0', fase: 5 },
    { u: 0.699, v: 0.362, tipo: 'borboleta', cor: '#7fd3ff', fase: 7 },
    { u: 0.248, v: 0.699, tipo: 'nevoa', cor: '#e2c48a', escala: 0.4 },
    { u: 0.751, v: 0.725, tipo: 'nevoa', cor: '#e2c48a', escala: 0.4, fase: 12 },
    { u: 0.497, v: 0.880, tipo: 'nevoa', cor: '#e2c48a', escala: 0.35, fase: 24 },
  ],

  // MONTANHA DE GELO (lote 10, Gelido). Ja neva pelo preset; aqui a cascata batendo
  // nos dois patamares, respingo na poca funda e mar de nuvens passando pelas bordas.
  'assets/hunt-backgrounds/ice-mountain.jpg': [
    { u: 0.833, v: 0.530, tipo: 'cascata', escala: 0.7 },
    { u: 0.841, v: 0.754, tipo: 'cascata', escala: 0.8 },
    { u: 0.789, v: 0.829, tipo: 'correnteza' },
    { u: 0.861, v: 0.909, tipo: 'correnteza', fase: 3 },
    { u: 0.781, v: 0.949, tipo: 'correnteza', fase: 6 },
    { u: 0.072, v: 0.702, tipo: 'nevoa', cor: '#ffffff', escala: 0.6 },
    { u: 0.949, v: 0.239, tipo: 'nevoa', cor: '#ffffff', escala: 0.6, fase: 15 },
    { u: 0.096, v: 0.199, tipo: 'nevoa', cor: '#ffffff', escala: 0.5, fase: 30 },
    { u: 0.957, v: 0.797, tipo: 'nevoa', cor: '#ffffff', escala: 0.5, fase: 45 },
  ],

  // TUNDRA (lote 10, Gelido). Ja neva pelo preset; cenario quase todo branco, entao
  // so rajada de neve azulada varrendo os lagos congelados e a trilha.
  'assets/hunt-backgrounds/tundra.jpg': [
    { u: 0.761, v: 0.259, tipo: 'nevoa', cor: '#b8cce8', escala: 0.45 },
    { u: 0.259, v: 0.714, tipo: 'nevoa', cor: '#b8cce8', escala: 0.45, fase: 12 },
    { u: 0.725, v: 0.714, tipo: 'nevoa', cor: '#b8cce8', escala: 0.5, fase: 24 },
    { u: 0.497, v: 0.880, tipo: 'nevoa', cor: '#b8cce8', escala: 0.4, fase: 36 },
    { u: 0.466, v: 0.466, tipo: 'nevoa', cor: '#c8d8f0', escala: 0.5, fase: 6 },
  ],

  // CUME DO MONTE PRATEADO (lote 10, Gelido). Ja neva pelo preset; nuvem passando
  // sobre os penhascos das bordas e rajada azulada no plato do cume.
  'assets/hunt-backgrounds/mt-silver-summit.jpg': [
    { u: 0.119, v: 0.155, tipo: 'nevoa', cor: '#ffffff', escala: 0.6 },
    { u: 0.880, v: 0.388, tipo: 'nevoa', cor: '#ffffff', escala: 0.6, fase: 15 },
    { u: 0.093, v: 0.621, tipo: 'nevoa', cor: '#ffffff', escala: 0.6, fase: 30 },
    { u: 0.828, v: 0.854, tipo: 'nevoa', cor: '#ffffff', escala: 0.6, fase: 45 },
    { u: 0.290, v: 0.336, tipo: 'nevoa', cor: '#b8cce8', escala: 0.45, fase: 8 },
    { u: 0.673, v: 0.647, tipo: 'nevoa', cor: '#b8cce8', escala: 0.45, fase: 20 },
    { u: 0.497, v: 0.880, tipo: 'nevoa', cor: '#b8cce8', escala: 0.4, fase: 32 },
  ],

  // ILHAS ESPUMA (lote 10, Gelido). Canais correm pela mascara; lanternas da parede e
  // os dois cristais grandes pulsando, e ar gelado saindo das bocas de caverna.
  'assets/hunt-backgrounds/seafoam-islands.jpg': [
    { u: 0.241, v: 0.067, tipo: 'orbe', cor: '#d8f0a0', escala: 0.7 },
    { u: 0.789, v: 0.072, tipo: 'orbe', cor: '#d8f0a0', escala: 0.7, fase: 3 },
    { u: 0.124, v: 0.145, tipo: 'orbe', cor: '#7ff0e0', escala: 0.8, fase: 1 },
    { u: 0.810, v: 0.782, tipo: 'orbe', cor: '#7ff0e0', escala: 0.8, fase: 4 },
    { u: 0.497, v: 0.088, tipo: 'nevoa', cor: '#e8f6ff', escala: 0.3 },
    { u: 0.497, v: 0.968, tipo: 'nevoa', cor: '#e8f6ff', escala: 0.3, fase: 10 },
    { u: 0.111, v: 0.642, tipo: 'nevoa', cor: '#e8f6ff', escala: 0.2, fase: 20 },
  ],

  // VILA NATALINA DA JYNX (lote 10, Gelido). Ja neva pelo preset; fumaca nas tres
  // chamines, estrela da arvore central pulsando e postes de luz acesos.
  'assets/hunt-backgrounds/jynx-holiday.jpg': [
    { u: 0.489, v: 0.150, tipo: 'chamine', escala: 0.5 },
    { u: 0.254, v: 0.567, tipo: 'chamine', escala: 0.5, fase: 2 },
    { u: 0.841, v: 0.562, tipo: 'chamine', escala: 0.5, fase: 4 },
    { u: 0.499, v: 0.393, tipo: 'orbe', cor: '#ffe066', escala: 0.8 },
    { u: 0.559, v: 0.256, tipo: 'orbe', cor: '#ffc06a', escala: 0.45, fase: 1 },
    { u: 0.300, v: 0.432, tipo: 'orbe', cor: '#ffc06a', escala: 0.45, fase: 2 },
    { u: 0.732, v: 0.411, tipo: 'orbe', cor: '#ffc06a', escala: 0.45, fase: 3 },
    { u: 0.436, v: 0.655, tipo: 'orbe', cor: '#ffc06a', escala: 0.45, fase: 4 },
    { u: 0.562, v: 0.652, tipo: 'orbe', cor: '#ffc06a', escala: 0.45, fase: 5 },
    { u: 0.436, v: 0.919, tipo: 'orbe', cor: '#ffc06a', escala: 0.45, fase: 6 },
    { u: 0.562, v: 0.919, tipo: 'orbe', cor: '#ffc06a', escala: 0.45, fase: 7 },
  ],
}
