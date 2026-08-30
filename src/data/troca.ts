// Troca direta entre dois jogadores (PH-120) — as constantes e os estados da
// MESA, compartilhados entre cliente e servidor.
//
// A troca em si (a oferta, a confirmacao dupla, a execucao atomica) vive nas
// fatias 2 a 4. Este arquivo e a fatia 1: o vocabulario.
//
// POR QUE OS NUMEROS MORAM AQUI E NAO SO NO SQL
// ---------------------------------------------------------------------------
// A tela precisa dizer quanto tempo falta, e o servidor precisa expirar. Dois
// numeros, um em cada lado, divergem no primeiro ajuste — e a divergencia aqui
// nao quebra nada: a tela mostra "faltam 15 min" numa mesa que o banco fecha aos
// 5. `sessaoDeTrocaNoBanco.test.ts` le o SQL e reprova se os dois se separarem,
// que e o mesmo mecanismo de `limiteDeSessaoInativa` (PH-277).

/**
 * Quanto uma mesa vive sem ninguem mexer.
 *
 * 15 minutos e o mesmo prazo em dois momentos diferentes: o convite parado
 * esperando aceite, e a mesa aberta com os dois montando oferta. O relogio
 * REINICIA no aceite — herdar o resto do convite daria dois minutos pra fazer a
 * troca inteira, e o jogador nao teria como saber por que.
 *
 * Curto de proposito: a partir da fatia 2, mesa viva e POKE reservado, e POKE
 * reservado nao pode ser vendido, evoluido nem posto em outra mesa. O custo de
 * expirar cedo demais e reabrir; o de expirar tarde e um POKE preso.
 */
export const TROCA_MINUTOS_ATE_EXPIRAR = 15

/**
 * Os estados da mesa. Os tres ultimos sao terminais.
 *
 * `convidada` e `aberta` sao as unicas VIVAS, e essa distincao e o que faz os
 * indices UNIQUE parciais do banco funcionarem: sem o corte, o jogador ficaria
 * impedido de trocar de novo pra sempre depois da primeira troca.
 */
export const ESTADOS_DE_TROCA = [
  /** Convite enviado, esperando o outro aceitar. */
  'convidada',
  /** Os dois na mesa. E aqui que a oferta e montada (fatia 2). */
  'aberta',
  /** A troca aconteceu (fatia 3). */
  'concluida',
  /** Um dos dois desistiu. Qualquer um dos lados pode, a qualquer momento. */
  'cancelada',
  /** Ninguem mexeu ate `expira_em`. */
  'expirada',
] as const

export type EstadoDeTroca = (typeof ESTADOS_DE_TROCA)[number]

/** Os estados em que a mesa ocupa o lugar do jogador. */
export const ESTADOS_VIVOS: readonly EstadoDeTroca[] = ['convidada', 'aberta']

export function trocaViva(estado: EstadoDeTroca): boolean {
  return ESTADOS_VIVOS.includes(estado)
}
