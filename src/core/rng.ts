// PRNG com semente, explicito e serializavel.
//
// POR QUE ISTO EXISTE
// -------------------
// Todo sorteio da simulacao vinha de `Math.random()`, que nao tem estado
// acessivel: nao da pra salvar, nem reproduzir, nem verificar. Com o jogo indo
// pra internet aberta (Fase D — a autoridade migra pro servidor), quem sorteia
// shiny, IV, raridade e crit precisa ser auditavel: o servidor emite a semente,
// e a sequencia de sorteios passa a ser uma funcao dela. Um cliente que reroda
// o proprio `Math.random()` ate sair um shiny deixa de ser invisivel.
//
// De quebra, isso torna bug reproduzivel: mesma semente + mesmas entradas =
// mesma partida.
//
// ESCOPO — o que ISTO garante e o que NAO garante
// -----------------------------------------------
// Garante que a SEQUENCIA DE SORTEIOS e reproduzivel. NAO garante replay
// bit-a-bit da simulacao inteira entre maquinas diferentes: o motor usa
// `Math.sin`/`Math.cos`/`Math.atan2` no movimento, e essas funcoes nao sao
// especificadas bit-a-bit pelo IEEE 754 — engines (e ate versoes da mesma
// engine) podem divergir no ultimo bit. Verificacao no servidor deve se apoiar
// nos sorteios discretos (shiny/IV/raridade/crit/captura), que sao inteiros ou
// comparacoes de limiar, e nao em igualdade exata de coordenadas.
//
// ALGORITMO
// ---------
// mulberry32: estado de 32 bits, ~2^32 de periodo, passa nos testes de
// qualidade usuais pra uso de jogo e — o que importa aqui — o estado inteiro
// cabe num unico numero, entao serializa junto do resto do mundo sem nenhum
// tratamento especial.

export interface Rng {
  /** Estado interno de 32 bits. Avanca a cada sorteio. */
  state: number
  /** Quantos sorteios ja sairam desta sequencia. So diagnostico/checkpoint. */
  draws: number
}

export function createRng(seed: number): Rng {
  return { state: seed | 0, draws: 0 }
}

/**
 * Retoma uma sequencia ja em andamento, a partir do estado que foi persistido.
 *
 * Distinto de `createRng`, que sempre RECOMECA do zero. A diferenca ja custou um
 * bug: o servidor refazia `createRng(seed)` a cada flush de 30s, entao a sessao
 * inteira era a mesma sequencia repetida — mesmos inimigos, mesmos IVs, mesma
 * raridade, indefinidamente (ver server/src/progresso.ts#aplicarFlush).
 *
 * `state | 0` porque o valor pode voltar do banco como string ou como float:
 * mulberry32 so funciona sobre um inteiro de 32 bits com sinal.
 */
export function restoreRng(state: number, draws: number): Rng {
  return { state: state | 0, draws: Number.isFinite(draws) ? draws : 0 }
}

/** Semente nova pra uma sessao. Na Fase D quem emite isto e o servidor. */
export function randomSeed(): number {
  // `crypto.getRandomValues` em vez de `Math.random()`: a semente e a unica
  // coisa que NAO pode ser adivinhavel, senao prever o proximo shiny fica
  // trivial. Existe no navegador e no Node moderno.
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] | 0
}

/**
 * Proximo float em [0, 1). MUTA `rng` — de proposito: o Rng vive dentro do
 * WorldState (draft do immer), entao mutar em lugar e o que faz o estado do
 * sorteio ser salvo/retomado junto com o resto do mundo, sem sincronizacao
 * extra.
 */
export function nextFloat(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) | 0
  let t = Math.imul(rng.state ^ (rng.state >>> 15), 1 | rng.state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  rng.draws += 1
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * Sequencia derivada, independente da principal. Serve pra sortear algo fora do
 * mundo (preview de Pokedex, por exemplo) sem gastar sorteios da sequencia que
 * o servidor verifica — consumir a principal por causa da UI dessincronizaria
 * o replay.
 */
export function deriveRng(seed: number, rotulo: string): Rng {
  let h = seed | 0
  for (let i = 0; i < rotulo.length; i++) h = (Math.imul(h ^ rotulo.charCodeAt(i), 0x01000193) | 0)
  return createRng(h)
}
