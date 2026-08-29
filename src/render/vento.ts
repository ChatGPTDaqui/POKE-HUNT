// O VENTO DA CENA (PH-233). Um só, para todas as camadas de enfeite.
//
// ---------------------------------------------------------------------------
// O QUE ISTO VEIO CONSERTAR
// ---------------------------------------------------------------------------
// Antes desta issue existiam TRES ventos diferentes na mesma tela:
//
//   1. `intensidadeDoVento` em `ambiente.ts` (PH-188), boa e bem calibrada,
//      dirigindo exclusivamente os presets `folha` e `selva`.
//   2. A rajada da areia em `climaVisual.ts`: `1 + sin(fase * 0.5) * 0.45`.
//      Seno unico, periodo regular, sem relacao nenhuma com a de cima.
//   3. Inclinacao FIXA na receita de todo o resto — a chuva caindo sempre no
//      mesmo angulo, o floco derivando sempre igual.
//
// Numa floresta com chuva, isso dava folha entrando em rajada enquanto a chuva
// continuava reta; num deserto com tempestade, a areia do cenario e a areia do
// clima acelerando em ritmos diferentes. Cada camada parecia um protetor de
// tela proprio rodando por cima do outro, e nenhuma delas parecia clima.
//
// ---------------------------------------------------------------------------
// POR QUE O RELOGIO E ABSOLUTO, E NAO ACUMULADO
// ---------------------------------------------------------------------------
// `ambiente.ts` e `climaVisual.ts` tem, cada um, o proprio acumulador de fase
// com o proprio `ultimoInstante`. Mesmo que os dois passassem a chamar a mesma
// funcao de rajada, eles a chamariam com fases DIFERENTES — o vento seria "o
// mesmo" no codigo e continuaria diferente na tela, que e o bug original com
// mais uma camada de indireção por cima.
//
// A saida e o vento nao ter acumulador nenhum: `sincronizarVento(agora)` ATRIBUI
// a fase (`agora / 1000`), nao soma nela. Consequencias, todas desejaveis:
//
//   - ordem de chamada entre as camadas nao importa;
//   - chamar duas vezes no mesmo quadro nao adianta o vento (idempotente);
//   - camada que entra depois (o clima aparece no meio da luta) nasce na fase
//     certa em vez de comecar do zero;
//   - aba em segundo plano que volta com minutos de atraso pega o vento na fase
//     nova, sem integrar nada. Isso e seguro AQUI e nao seria numa particula:
//     posicao integrada com delta gigante teleporta, mas uma oscilacao limitada
//     em [0, 1] so continua de outro ponto do ciclo.
//
// ---------------------------------------------------------------------------
// O QUE ESTE ARQUIVO NAO PODE FAZER
// ---------------------------------------------------------------------------
// Nao toca `world.rng`, nao importa de `@/engine`, nao usa `Math.random`. Ele
// nem sorteia: e uma funcao determinística do relogio. Ver o cabecalho de
// `ambiente.ts` pra a classe de bug que essa regra evita (PH-37).

// ---------------------------------------------------------------------------
// A RAJADA (PH-188, movida pra ca no PH-233)
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
 * Intensidade do vento em [0, 1], funcao PURA da fase em segundos.
 *
 * Exportada com a fase por parametro pra ser testada direto, sem depender de
 * mockar relogio nenhum: `ventoNaFolhagem.test.ts` varre 600 segundos com ela.
 */
export function intensidadeDoVento(fase: number): number {
  const onda = VENTO_FREQ.reduce(
    (soma, freq, i) => soma + Math.sin(fase * freq + VENTO_FASE[i]) * VENTO_PESO[i],
    0,
  )
  return ((onda + 1) / 2) ** 3
}

/** Fase corrente, em segundos. Atribuida por `sincronizarVento`, nunca somada. */
let fase = 0

/**
 * Poe o vento no instante `agora` (o mesmo `performance.now()` que a camada ja
 * leu pra medir o proprio quadro). ATRIBUI, nao acumula — ver o cabecalho.
 */
export function sincronizarVento(agora: number): void {
  fase = agora / 1000
}

/** Intensidade do vento AGORA, em [0, 1]. O que as camadas consultam. */
export function ventoAgora(): number {
  return intensidadeDoVento(fase)
}

/** A fase corrente. Existe pros testes poderem afirmar a idempotencia. */
export function faseDoVento(): number {
  return fase
}

/**
 * Solta o estado. Sem isto um caso de teste herda a fase do anterior e mede
 * o vento no ponto errado do ciclo — a mesma classe de vazamento que
 * `reiniciarAmbiente` e `reiniciarClimaVisual` resolvem nas camadas.
 */
export function reiniciarVento(): void {
  fase = 0
}

// ---------------------------------------------------------------------------
// COMO CADA CAMADA USA ISTO
// ---------------------------------------------------------------------------
// A receita declara `empuxoDoVento`: quantas unidades de mundo por segundo o
// vento empurra AQUELA particula no pico da rajada. Quem nao declara nao e
// empurrada, e isso e a parte importante do desenho — nao ha default.
//
// A direcao e a mesma pra tudo, e nao ha eixo Y: o acervo inteiro ja sopra pra
// DIREITA (a folha cai em PI/2+0.35, a areia corre em 0.1, a chuva inclina
// +0.26). Um sistema de direcao variavel nao acrescentaria nada que o olho
// leia e obrigaria a re-tunar nove receitas.
//
// LUGAR FECHADO NAO TEM VENTO. Gruta (`caverna`), ruina/templo/dojo (`poeira`)
// e a cintilancia de superficie da agua ficam de fora POR OMISSAO deliberada:
// sopro dentro de uma caverna selada e pior que a incoerencia que esta issue
// veio corrigir. `ventoCompartilhado.test.ts` tranca essa lista.

/** Empurrao horizontal, em unidades de mundo, no passo `delta`. */
export function empurraoDoVento(empuxo: number | undefined, delta: number): number {
  return empuxo ? empuxo * ventoAgora() * delta : 0
}
