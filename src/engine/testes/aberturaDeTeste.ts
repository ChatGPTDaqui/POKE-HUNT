// Passa a abertura do duelo (PH-552) num teste que quer medir a LUTA.
//
// Desde a PH-552 todo combate duelo (`mapDef.encarada`) comeca com a
// apresentacao — bola, pose de ameaca, habilidade de entrada, 2 s por etapa,
// dos dois lados — e nada anda nem bate ate ela acabar. Um teste de encarada,
// de round ou de troca por desmaio que comece a contar ticks do zero mediria
// 8 a 12 s de tela parada antes do que ele quer ver. Este helper roda a
// abertura DE VERDADE (com os hooks de entrada disparando onde devem), em vez
// de apagar `world.aberturaDoDuelo` na mao — apagar pularia o Intimidate.
//
// Fora de um `.test.ts` pelo mesmo motivo de `inimigoDeTeste.ts`.
import { stepArena } from '../arena'
import { stepWorld } from '../simulation'
import type { GameStateStore } from '@/stores/gameStateStore'
import type { WorldState } from '../types'

const PASSO = 0.1
const TETO_DE_TICKS = 600

/**
 * Avanca o mundo (silencioso) ate `aberturaDoDuelo` ficar nula. Com
 * `gameState` passa por `stepWorld`; sem ele, so a arena (`stepArena`).
 */
export function pularAbertura(world: WorldState, gameState?: GameStateStore, passo = PASSO): void {
  for (let i = 0; i < TETO_DE_TICKS && world.aberturaDoDuelo; i++) {
    if (gameState) stepWorld(world, passo, gameState, { silent: true })
    else stepArena(world, passo, { silent: true })
  }
  if (world.aberturaDoDuelo) throw new Error('a abertura do duelo não terminou em 60 s simulados')
}
