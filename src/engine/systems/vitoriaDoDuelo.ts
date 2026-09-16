// Comemoracao ao vencer o duelo.
//
// Achado ao vivo: fora da arena PvP (que ja congela tudo em `stepArena` quando
// `arena.resultado !== 'lutando'`), vencer um duelo (Lance zerado, covil de
// lendario resolvido) nao tem estado de "fim de luta" nenhum — `stepWorld`
// continua rodando `updateMovement` normalmente, e o jogador sem ninguem pra
// engajar cai no ramo `wander` de `movementSystem.ts`: o POKE sai andando sem
// rumo pelo mapa vazio ate o jogador clicar em voltar.
//
// A pedido do dono, o POKE para e repete a pose de COMEMORACAO em vez de
// vagar — a mesma usada no level-up (`Hop`: 10 quadros, 100% de cobertura no
// acervo, recomendada em docs/18-animacoes-do-pmd-disponiveis.md#comemoracao-
// de-nivel-e-de-cura e ja importada pela PH-552 pra pose de ameaca). Vale
// tanto pro sprite de batalha (`animOverride`, mesmo campo que a abertura do
// duelo usa) quanto pra FACE do HUD — `useFaceDoPoke` le `duelVencido` pelo
// mesmo motivo que le level-up, ver hooks/useFaceDoPoke.ts.
import { isDead } from '../entity'
import type { WorldState } from '../types'

/** Pose de comemoracao — igual level-up e cura (ver nota acima). */
export const POSE_DE_VITORIA = 'Hop' as const

/**
 * O jogador venceu um duelo (`mapDef.encarada`) e nao ha mais ninguem vindo
 * pra lutar? PURA: le o mundo, nao escreve nada.
 *
 * - Arena PvP: `arena.resultado === 'vitoria'` e o proprio estado ja existe.
 * - Campeao Lance: `sequenceCleared` — os 6 POKEs da sequencia cairam.
 * - Covil de lendario (BOSS): sem sequencia, sem respawn (`noRespawn`) e
 *   ninguem vivo do lado inimigo. O gap ENTRE membros da sequencia do Lance
 *   (proximo ainda nao nasceu) tambem bate "sem inimigo vivo" e `noRespawn`,
 *   e e por isso que este ramo exige `!mapDef.sequence` — sem a guarda, o
 *   POKE "comemoraria" nos poucos ticks de espera entre um Dragonite e o
 *   proximo, no meio do proprio duelo.
 */
export function duelVencido(world: Pick<WorldState, 'mapDef' | 'player' | 'enemies' | 'sequenceCleared' | 'arena'>): boolean {
  const { mapDef, player } = world
  if (!mapDef?.encarada || !player || isDead(player)) return false
  if (world.arena) return world.arena.resultado === 'vitoria'
  if (world.sequenceCleared) return true
  if (mapDef.noRespawn && !mapDef.sequence) return !world.enemies.some((e) => !isDead(e))
  return false
}

/**
 * Arma/desarma `player.animOverride` pra pose de vitoria. So mexe no valor
 * que ELA mesma armou (`POSE_DE_VITORIA`) — a abertura do duelo tem o campo
 * pra si durante a apresentacao, e os dois nunca coexistem (a abertura acaba
 * antes de haver "duelo vencido" pra medir). Chamar todo tick e barato e
 * idempotente.
 */
export function tickVitoriaDoDuelo(world: WorldState): void {
  const player = world.player
  if (!player) return
  if (duelVencido(world)) {
    player.animOverride = POSE_DE_VITORIA
  } else if (player.animOverride === POSE_DE_VITORIA) {
    delete player.animOverride
  }
}
