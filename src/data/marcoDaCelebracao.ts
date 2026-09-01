// Quando a celebracao e grande, e quando ela e discreta (PH-192).
//
// A REGRA DE FREQUENCIA E O DESENHO DESTA FEATURE, nao o brilho.
//
// Medido no harness da PH-189: 612 abates/hora. Num idle o level-up e evento de
// MINUTO, nao de sessao — splash de tela cheia a cada nivel deixa de ser
// recompensa em dez minutos e passa a ser algo que o jogador aprende a ignorar,
// e que tapa o combate que ele esta tentando ler. Habituacao mata dopamina;
// escassez e o que a sustenta.
//
// Separado do componente pra estas regras serem testaveis sem montar React — e
// porque sao elas, e nao o CSS, que decidem quantas vezes por sessao o jogador
// ve a versao grande.
import type { Celebracao } from '@/stores/celebracaoStoreVanilla'

export type Intensidade = 'discreto' | 'medio' | 'cheio'

/**
 * De quantos em quantos niveis o POKE ganha o cartao central.
 *
 * O botao de frequencia do jogo. Cada degrau muda muito a sensacao a 612
 * abates/hora: 5 e o valor escolhido, 10 deixa mais sobrio, 25 bem mais.
 */
export const PASSO_DO_MARCO = 5

/**
 * O mesmo, pro TREINADOR — e `1` significa "todo nivel e marco".
 *
 * Decisao do usuario: nivel de treinador sempre ganha cartao. Ele sobe bem mais
 * devagar que o do POKE (mesma EXP por abate, curva mais longa), entao "sempre"
 * e sustentavel.
 *
 * Fica como PASSO e nao como booleana pra usar o MESMO mecanismo do POKE
 * (`cruzouMultiplo`): se um dia isso incomodar, virar `5` e trocar um numero, e
 * nao escrever um caminho novo.
 */
export const PASSO_DO_MARCO_DO_TREINADOR = 1

/** Existe multiplo de `passo` no intervalo (de, ate]? */
export function cruzouMultiplo(de: number, ate: number, passo: number): boolean {
  if (ate <= de) return false
  return Math.floor(ate / passo) > Math.floor(de / passo)
}

/**
 * Esta celebracao merece a versao grande?
 *
 * Pro POKE, tres gatilhos, cada um respondendo a uma pergunta diferente:
 *   - golpe novo: mudou o que o POKE PODE FAZER, e ele precisa ir ver a barra
 *   - nivel redondo: marco de progresso que o jogador conta
 *   - nivel 100: teto
 *
 * O TESTE E NO INTERVALO, e nao em `nivel` sozinho. Com cascata (um abate
 * subindo varios niveis) e com coalescencia (abates seguidos no mesmo cartao),
 * `nivel` e so a ponta de cima: um cartao que vai de 33 a 36 ATRAVESSA o 35, e
 * `36 % 5` da 1. O marco se perderia exatamente no caso mais impressionante.
 */
export function ehMarco(c: Celebracao): boolean {
  if (c.tipo === 'evolucao' || c.tipo === 'shiny') return true
  if (c.tipo === 'treinador') {
    return cruzouMultiplo(c.nivelInicial, c.nivel, PASSO_DO_MARCO_DO_TREINADOR)
  }
  if (c.golpesNovos.length > 0) return true
  if (c.nivel >= 100 && c.nivelInicial < 100) return true
  return cruzouMultiplo(c.nivelInicial, c.nivel, PASSO_DO_MARCO)
}

export function intensidadeDe(c: Celebracao): Intensidade {
  if (c.tipo === 'evolucao' || c.tipo === 'shiny') return 'cheio'
  return ehMarco(c) ? 'medio' : 'discreto'
}

/** Quanto tempo cada intensidade fica na tela, em ms. */
export const DURACAO: Record<Intensidade, number> = {
  discreto: 900,
  medio: 1800,
  cheio: 2600,
}

/**
 * Level-up fica 4 SEGUNDOS na tela — pedido explicito do usuario (PH-398).
 *
 * ISSO CONTRARIA A NOTA DO TOPO DESTE ARQUIVO, e o registro fica: a regra de
 * frequencia foi desenhada medindo 612 abates/hora, e o argumento era que
 * celebracao longa e frequente vira algo que o jogador aprende a ignorar. 4s por
 * nivel, com um cartao POR nivel, e o oposto dessa escolha.
 *
 * Foi decisao do dono do projeto, que tambem foi quem tomou a anterior. O que
 * sobrou de defesa contra a parede de cartoes e o `TETO_DA_FILA` do store: no
 * maximo tres esperando, ou seja 16s de fila, e o mais antigo em espera cai.
 *
 * SO LEVEL-UP. Evolucao e shiny ficam nos 2600ms — o pedido nomeia "splashs de
 * lvlup", e sao eles que acontecem toda hora.
 */
export const DURACAO_DE_NIVEL_MS = 4000

/**
 * Quanto tempo ESTA celebracao fica na tela.
 *
 * Uma funcao, e nao `DURACAO[intensidade]` espalhado: a duracao passou a depender
 * do TIPO (level-up) e nao so da intensidade, e o componente tem tres lugares que
 * leem esse numero (o timer, a animacao do chip e a do cartao). Com o mapa cru,
 * um deles ficaria com a duracao antiga e o cartao sumiria antes do timer — ou
 * ficaria parado depois dele.
 */
export function duracaoDe(c: Celebracao): number {
  if (c.tipo === 'nivel' || c.tipo === 'treinador') return DURACAO_DE_NIVEL_MS
  return DURACAO[intensidadeDe(c)]
}

/**
 * Teto de quanto um cartao pode ser ESTENDIDO pela coalescencia, em multiplos
 * da propria duracao.
 *
 * A coalescencia reinicia o temporizador a cada nivel novo que entra. Numa
 * sequencia de abates rapidos — que a 612/hora acontece — sem teto o cartao
 * ficaria na tela indefinidamente, tapando o combate. O defeito seria pior que
 * o que a coalescencia veio consertar.
 */
export const TETO_DE_EXTENSAO = 3
