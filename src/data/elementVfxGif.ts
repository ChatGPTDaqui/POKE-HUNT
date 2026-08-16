// Arte real de impacto de golpe, por tipo elemental — os 8 tipos que
// `elementVfx.ts` (lote PNG-sequence, Dungeon Crawl) nao cobre. Origem e
// criterio de escolha em assets/move-vfx-gif/CREDITOS.txt.
//
// GIF, nao array de PNGs: a arte ja vem animada e `drawImage` num canvas
// que redesenha a cada frame pega sozinho o quadro atual do GIF — mesma
// tecnica de data/statusVfx.ts. Um arquivo so por tipo, reusado pra
// single-target E area (a area so desenha maior, no diametro real do
// splash — mesma regra que o lote PNG ja segue).
import type { ElementType } from './generated/types'

const RAIZ = 'assets/move-vfx-gif'

const ARQUIVO: Partial<Record<ElementType, string>> = {
  ICE: 'ice', POISON: 'poison', GROUND: 'ground', PSYCHIC: 'psychic',
  GHOST: 'ghost', DARK: 'dark', STEEL: 'steel', FAIRY: 'fairy',
}

export function elementoVfxGifUrl(tipo: ElementType | null | undefined): string | null {
  if (!tipo) return null
  const nome = ARQUIVO[tipo]
  return nome ? `${RAIZ}/${nome}.gif` : null
}

/** Toda URL de GIF de impacto — usado pelo preload. */
export function todosOsGifsDeImpacto(): string[] {
  return Object.values(ARQUIVO).map((nome) => `${RAIZ}/${nome}.gif`)
}
