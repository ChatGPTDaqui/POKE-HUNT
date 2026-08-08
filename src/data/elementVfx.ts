// Arte real de efeito de golpe, por tipo elemental.
//
// O VFX de combate deste jogo e 100% procedural (render/sprites.ts:
// `drawImpactBurst` e `drawAoeRing`, cor vinda de `colorForType`) porque nunca
// houve arte de golpe no repositorio — a nota antiga em CLAUDE.md ja previa o
// ponto de encaixe: "se spritesheets aparecerem, so plugam dentro do desenho".
// Este arquivo E esse encaixe.
//
// Hoje so FOGO tem arte (pedido explicito, quadros do Dungeon Crawl Stone Soup
// — ver assets/move-vfx/CREDITOS.txt). Todo tipo sem entrada aqui continua no
// desenho procedural, que segue sendo o comportamento padrao e nao um "modo
// degradado": ele cobre 16 dos 17 tipos.
//
// Cada quadro e um PNG SOLTO de 32x32 (nao um spritesheet), porque e assim que
// o repositorio de origem publica. Nao ha `AnimData.xml` nem recorte: a
// animacao e a lista, na ordem.
import type { ElementType } from './generated/types'

export interface VfxDeElemento {
  /** Impacto de alvo unico. */
  single: string[]
  /** Area de efeito — desenhado no diametro real do AOE. */
  aoe: string[]
}

const FOGO = 'assets/move-vfx/fire'

export const VFX_POR_ELEMENTO: Partial<Record<ElementType, VfxDeElemento>> = {
  FIRE: {
    single: [`${FOGO}/flame0.png`, `${FOGO}/flame1.png`, `${FOGO}/flame2.png`],
    // Comeca no estouro (`fire_storm`) e termina na nuvem apagando
    // (`cloud_fire` do mais claro pro mais fraco): a leitura e explosao ->
    // queima -> dissipa, que e o que uma area de efeito faz. Na ordem inversa
    // pareceria fogo se acendendo depois do dano.
    aoe: [
      `${FOGO}/fire_storm0.png`,
      `${FOGO}/cloud_fire2.png`,
      `${FOGO}/cloud_fire1.png`,
      `${FOGO}/cloud_fire0.png`,
    ],
  },
}

export function vfxDoElemento(tipo: string | undefined): VfxDeElemento | null {
  if (!tipo) return null
  return VFX_POR_ELEMENTO[tipo as ElementType] ?? null
}

/** Toda URL de quadro que existe — usado pelo preload. */
export function todosOsQuadrosDeVfx(): string[] {
  return Object.values(VFX_POR_ELEMENTO).flatMap((v) => [...v.single, ...v.aoe])
}
