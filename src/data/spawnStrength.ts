// Qual e a zona mais cedo em que uma especie pode aparecer.
//
// O PROBLEMA QUE ISTO RESOLVE (medido no dado real, antes desta leva):
//
//   Johto Zona 0 · Bosque  [Lv 1-10]  tinha Scizor(500), Heracross(500)
//   Kanto Zona 0 · Bosque  [Lv 1-10]  tinha Scyther(500), Pinsir(500)
//   Johto Zona 0 · Floresta[Lv 1-10]  tinha Meganium(525)
//   Kanto Zona 0 · Floresta[Lv 1-10]  tinha Venusaur(525)
//   Johto Zona 1 · Costa   [Lv 11-20] tinha Kingdra(540), Feraligatr(530)
//   Kanto Zona 1 · Costa   [Lv 11-20] tinha Gyarados(540), Lapras(535), Blastoise(530)
//   Johto Zona 2 · Caverna [Lv 21-30] tinha Tyranitar(600)
//
// A causa e estrutural, nao um dado errado: `huntSpawnOverrides` monta o pool
// de cada hunt pelo TIPO PRIMARIO, e cada tipo existe em exatamente UMA zona
// por regiao. Entao toda especie de tipo GRASS — do Bellsprout ao Venusaur —
// caia na mesma hunt de Lv 1-10, porque Floresta e a zona de GRASS. Nao havia
// nenhum eixo de FORCA na decisao.
//
// Este modulo e esse eixo. Ele nao move a especie de bioma (isso quebraria a
// coerencia tematica que o mundo inteiro usa); ele diz em que ZONA daquele
// bioma ela pode nascer. `huntSpawnOverrides` usa isso pra criar, sob demanda,
// a versao avancada de um bioma — "Johto Zona 5 · Bosque" existe porque
// Scizor e Heracross precisam de um lugar, nao porque alguem escreveu a hunt
// a mao.
import { SPECIES_DATA } from './generated/pokes.generated'
import { evolutionStage } from './evolutionStage'

/** Soma dos 6 atributos base — a medida de forca usada em toda a serie. */
export function baseStatTotal(speciesId: string): number {
  const b = SPECIES_DATA[speciesId]?.base
  if (!b) return 0
  return b.hp + b.atkFis + b.atkEsp + b.def + b.defEsp + b.speed
}

/**
 * Faixas de forca -> zona minima.
 *
 * Os cortes saem da distribuicao real do elenco (226 especies): 300-349 e a
 * moda (49 especies), 450-499 vem logo atras (41), e so 14 passam de 550. Nao
 * sao numeros redondos escolhidos a esmo — sao os degraus onde a populacao
 * realmente muda de patamar.
 *
 * Zona 3 e o primeiro degrau acima de Lv 30, que e o piso pedido
 * explicitamente ("restrinja o spawn deles estritamente para zonas com faixa
 * de level 30+"): toda especie com 425 de total ou mais cai nele ou acima.
 */
const FAIXAS: { bstMinimo: number; zona: number }[] = [
  { bstMinimo: 525, zona: 7 }, // Lv 71-80 — Tyranitar, Dragonite, Snorlax, Venusaur
  { bstMinimo: 475, zona: 5 }, // Lv 51-60 — Scizor, Heracross, Gengar, Machamp
  { bstMinimo: 425, zona: 3 }, // Lv 31-40 — primeiro degrau acima de 30
  { bstMinimo: 350, zona: 1 }, // Lv 11-20
  { bstMinimo: 0, zona: 0 },
]

/**
 * Piso por estagio de evolucao, indexado por `evolutionStage` (1 = forma base).
 *
 * Existe porque BST sozinho deixa passar forma final fraca: Butterfree (395) e
 * Beedrill (395) sao 3as evolucoes e cairiam na Zona 1 junto com o Caterpie
 * que virou eles. Uma forma evoluida na zona de estreia le como bug mesmo
 * quando o numero permite.
 */
const PISO_POR_ESTAGIO = [0, 0, 1, 2]

export function zonaMinimaDaEspecie(speciesId: string): number {
  const bst = baseStatTotal(speciesId)
  const porForca = FAIXAS.find((f) => bst >= f.bstMinimo)?.zona ?? 0
  const estagio = Math.min(evolutionStage(speciesId), PISO_POR_ESTAGIO.length - 1)
  return Math.max(porForca, PISO_POR_ESTAGIO[estagio])
}

/**
 * "Forte" no sentido do pedido: nao pode aparecer no comeco da jornada.
 *
 * Exportado pro teste — e a forma de perguntar "este POKE esta numa hunt cedo
 * demais?" sem repetir o corte de BST em dois lugares.
 */
export const ZONA_MINIMA_DOS_FORTES = 3

export function especieForte(speciesId: string): boolean {
  return zonaMinimaDaEspecie(speciesId) >= ZONA_MINIMA_DOS_FORTES
}
