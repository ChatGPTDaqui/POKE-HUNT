// Arte de CONDICAO para o selo do HUD, por tipo elemental.
//
// O QUE ESTE MODULO ERA, E O QUE SOBROU DELE (PH-416)
// -----------------------------------------------------------------------------
// Ele nasceu como a arte de todo golpe de STATUS no mundo — 32 GIFs, 16 tipos
// elementais x 2 direcoes (`aumenta`/`diminui`), escolhidos por tipo do POKE e
// direcao do efeito.
//
// Aquele eixo nunca respondeu QUAL atributo mudou: Ataque caindo e Velocidade
// caindo desenhavam a mesma coisa. A arte de mudanca de atributo saiu daqui pra
// `estagioVfx.ts`, que varia por ATRIBUTO e recebe a cor do tipo no desenho.
//
// SOBROU UM CONSUMIDOR, e e outro assunto: `StatusEffectsBar` usa a arte de
// `diminui` do TIPO PRIMARIO DO PROPRIO POKE como fundo do selo de condicao
// (veneno, queimadura, sono...). Nao e efeito de golpe e nao tem direcao — o
// selo pega `diminui` porque condicao e sempre algo ruim.
//
// Por isso as 16 tiras de `aumenta/` FORAM REMOVIDAS: elas ficaram sem nenhum
// consumidor. As de `diminui/` continuam, com um consumidor so e documentado.
//
// DIVIDA CONHECIDA, FORA DO ESCOPO DESTA BRANCH: o selo de condicao seria melhor
// servido pela arte da PH-416 (`TIRA_POR_CONDICAO_NO_CORPO`), que tem simbolo
// POR CONDICAO — caveira pra veneno, floco pra congelamento. Hoje o selo desenha
// a mesma coisa pros seis status e o unico diferenciador e o rotulo. Trocar isso
// e mexer no HUD de condicao, que nao e o assunto desta issue, e precisa da
// propria verificacao visual. Registrado, nao esquecido.
import type { ElementType } from './generated/types'

const RAIZ = 'assets/move-vfx/status'

// FLYING e DRAGON ficam de fora de proposito: o catalogo de origem nao tem
// nenhum arquivo pra esses dois tipos (0 no `status.json`). Cai no fallback
// procedural existente, nao um erro.
const TIPOS_COM_ARTE = new Set<ElementType>([
  'NORMAL', 'FIRE', 'WATER', 'ELECTRIC', 'GRASS', 'ICE', 'FIGHTING', 'POISON',
  'GROUND', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST', 'DARK', 'STEEL', 'FAIRY',
])

const ARQUIVO: Partial<Record<ElementType, string>> = {
  NORMAL: 'normal', FIRE: 'fire', WATER: 'water', ELECTRIC: 'electric',
  GRASS: 'grass', ICE: 'ice', FIGHTING: 'fighting', POISON: 'poison',
  GROUND: 'ground', PSYCHIC: 'psychic', BUG: 'bug', ROCK: 'rock',
  GHOST: 'ghost', DARK: 'dark', STEEL: 'steel', FAIRY: 'fairy',
}

/**
 * A arte de condicao do tipo, pro selo do HUD.
 *
 * Sem parametro de direcao desde a PH-416: o unico chamador sempre pediu
 * `diminui`, e manter o parametro sugeria que existe uma variante `aumenta` —
 * ela foi removida junto com os arquivos.
 */
export function statusVfxUrl(tipo: ElementType | null | undefined): string | null {
  if (!tipo || !TIPOS_COM_ARTE.has(tipo)) return null
  const nome = ARQUIVO[tipo]
  return nome ? `${RAIZ}/diminui/${nome}.gif` : null
}

/** Toda URL que este modulo serve — usado pelo preload. */
export function todosOsVfxDeStatus(): string[] {
  const saida: string[] = []
  for (const tipo of TIPOS_COM_ARTE) saida.push(`${RAIZ}/diminui/${ARQUIVO[tipo]}.gif`)
  return saida
}
