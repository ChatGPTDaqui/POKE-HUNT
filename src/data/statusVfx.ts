// Efeito visual de golpe de STATUS (muda atributo ou aplica condicao),
// separado do impacto de dano (`vfxTiras.ts`) porque golpe de status nao
// deveria parecer um soco/queimadura acertando — precedencia: ver
// `assets/move-vfx/status/NOTAS.txt` pra origem e criterio de escolha.
//
// Por TIPO + DIRECAO (aumenta/diminui), nao por golpe: mesmo raciocinio do
// `abilityIconUrl` — sao 180 golpes de status no dataset, arte 1:1 pra cada
// um nao existe em lugar nenhum.
//
// GIF, nao tira de quadros como `vfxTiras.ts`: a arte ja vem animada e o
// navegador anima uma `<img>`/`Image()` apontada pra um GIF sozinho —
// `drawImage` num canvas que redesenha a cada frame (este jogo ja faz isso)
// automaticamente pega o frame atual do GIF, sem precisar fatiar frame a
// frame manualmente como uma tira exige.
import type { ElementType } from './generated/types'
import type { StatChange } from './generated/types'

export type DirecaoStatus = 'aumenta' | 'diminui'

const RAIZ = 'assets/move-vfx/status'

// FLYING e DRAGON ficam de fora de proposito: o catalogo de origem nao tem
// nenhum arquivo pra esses dois tipos (0 no `status.json`). Cai no fallback
// procedural existente (mesmo caminho que os outros 10 tipos sem arte de
// impacto ja usam), nao um erro.
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

export function statusVfxUrl(tipo: ElementType | null | undefined, direcao: DirecaoStatus): string | null {
  if (!tipo || !TIPOS_COM_ARTE.has(tipo)) return null
  const nome = ARQUIVO[tipo]
  return nome ? `${RAIZ}/${direcao}/${nome}.gif` : null
}

/**
 * A direcao do golpe: eleva atributo (`aumenta`) ou baixa/aplica condicao
 * negativa (`diminui`). Deriva do PRIMEIRO `statChanges` com sinal — golpe
 * misto (raro no dataset) usa so o primeiro. Sem `statChanges` (confusao,
 * veneno, sono, ...) cai em `diminui`: nenhum desses 18 status e benefico pra
 * quem recebe.
 */
export function direcaoDoGolpeDeStatus(statChanges: StatChange[] | null | undefined): DirecaoStatus {
  const primeiro = statChanges?.[0]
  return primeiro && primeiro.estagios > 0 ? 'aumenta' : 'diminui'
}

/** Toda URL de VFX de status — usado pelo preload. */
export function todosOsVfxDeStatus(): string[] {
  const saida: string[] = []
  for (const tipo of TIPOS_COM_ARTE) {
    saida.push(`${RAIZ}/aumenta/${ARQUIVO[tipo]}.gif`, `${RAIZ}/diminui/${ARQUIVO[tipo]}.gif`)
  }
  return saida
}
