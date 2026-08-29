// Onde o desenho REALMENTE comeca dentro do quadro da battle sprite — o par de
// cima do `spriteFootOffsets.ts`, que ja fazia isso pro pe (PH-189).
//
// Os quadros do PMD Sprite Collab tem padding vazio em volta pra animacao de
// bounce, e o padding de cima varia por especie: medido em
// `scripts/harness/vao-do-rotulo.mjs`, o vao entre a cabeca e o rotulo ia de 0
// a 11px conforme a especie. Esse vao vazio e exatamente a faixa que o texto de
// combate do POKE vizinho invade, e a variacao faz o mesmo layout ler bem numa
// cena e mal na seguinte.
//
// O dado e gerado offline (`npm run sprites:topo`) porque medir alfa de 1.266
// folhas PNG em tempo de jogo esta fora de cogitacao — mesma decisao do
// `spriteFootOffsets.ts`.
import { TOPO_OPACO_POR_ANIM } from './generated/spriteTopOffsets.generated'

/**
 * Zero como padrao, e isso e deliberado: quem nao esta na tabela cai no
 * comportamento ANTIGO (ancorar no topo da moldura). Uma especie sem medicao
 * fica com um vao maior que o dos vizinhos — feio, e visivelmente diferente.
 * Um padrao "medio" chutado seria pior: colaria o rotulo dentro da cabeca de
 * quem tem pouco padding, que e dano, nao so feiura.
 */
const SEM_MEDICAO = 0

/**
 * Fracao de `frameHeight` entre o topo da moldura e o primeiro pixel opaco,
 * pra esta especie nesta animacao virada pra esta fileira de direcao.
 *
 * `fileira` fora do que foi medido (folha com menos fileiras que as 8 direcoes,
 * caso do Sleep de varias especies) cai na fileira 0 — que e a unica que existe
 * nessas folhas, e e tambem a que o renderer desenha por causa do mesmo clamp
 * em `currentFrameSource`.
 */
export function topoOpacoFraction(speciesId: string, animName: string, fileira: number): number {
  const linhas = TOPO_OPACO_POR_ANIM[speciesId]?.[animName]
  if (!linhas || linhas.length === 0) return SEM_MEDICAO
  return linhas[Math.min(linhas.length - 1, Math.max(0, fileira))] ?? SEM_MEDICAO
}
