// Aleatoriedade DETERMINISTICA do desenho.
//
// Nunca `Math.random` numa coreografia: ela e redesenhada do zero a cada
// quadro, e com `Math.random` cada faisca pularia pra um lugar novo 60 vezes por
// segundo. Semeado pelo id do efeito, o mesmo golpe desenha as mesmas faiscas
// do inicio ao fim — e dois golpes iguais seguidos saem diferentes.
//
// Tambem NUNCA o rng do mundo (`world.rng`): consumir dele no desenho mudaria
// a sequencia do combate so por ter tela ligada.

/** Hash FNV-1a de 32 bits. */
export function hashTexto(texto: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: 4 linhas, periodo 2^32, suficiente pra enfeite. */
export function rngSemeado(semente: number): () => number {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
