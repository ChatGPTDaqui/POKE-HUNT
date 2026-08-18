// Icone do slot de golpe, por tipo elemental.
//
// Antes, o slot mostrava as 3 primeiras letras do nome do golpe ("EMB", "FLA")
// sobre um quadrado da cor do tipo. Isso trocou por arte de verdade (icones de
// magia — notas em
// assets/move-vfx/NOTAS.txt), um por tipo.
//
// Por TIPO e nao por GOLPE de proposito: sao 223 golpes no dataset e o
// repositorio de origem nao tem equivalente pra cada um. Mapear "os que dao"
// deixaria a maioria dos slots sem icone e a barra visualmente incoerente —
// que e exatamente o oposto do pedido. O nome do golpe continua no tooltip, e
// o dano base continua na faixa do rodape do slot.
import type { ElementType } from './generated/types'

const RAIZ = 'assets/ability-icons'

const ARQUIVO: Record<ElementType, string> = {
  NORMAL: 'normal',
  FIRE: 'fire',
  WATER: 'water',
  ELECTRIC: 'electric',
  GRASS: 'grass',
  ICE: 'ice',
  FIGHTING: 'fighting',
  POISON: 'poison',
  GROUND: 'ground',
  FLYING: 'flying',
  PSYCHIC: 'psychic',
  BUG: 'bug',
  ROCK: 'rock',
  GHOST: 'ghost',
  DRAGON: 'dragon',
  DARK: 'dark',
  STEEL: 'steel',
  // `jinxbite` do Crawl (enchantment/) — literalmente uma fada alada, entao
  // nao colide visualmente com nenhum dos outros 17. Ver
  // assets/move-vfx/NOTAS.txt.
  FAIRY: 'fairy',
}

/**
 * URL do icone do tipo, ou `null` se o tipo nao tiver arte.
 *
 * O `null` nao e teorico: `ability.type` vem do catalogo gerado e um tipo novo
 * (ou um golpe sem tipo) cairia aqui. Quem chama volta pro rotulo de 3 letras
 * nesse caso, entao nenhum slot fica vazio.
 */
export function abilityIconUrl(tipo: string | null | undefined): string | null {
  if (!tipo) return null
  const nome = ARQUIVO[tipo as ElementType]
  return nome ? `${RAIZ}/${nome}.png` : null
}

/** Toda URL de icone — usado pelo preload. */
export function todosOsIconesDeHabilidade(): string[] {
  return Object.values(ARQUIVO).map((n) => `${RAIZ}/${n}.png`)
}
