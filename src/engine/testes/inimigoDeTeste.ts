// Inimigo montado A MAO pra teste de combate.
//
// POR QUE NAO USAR O SPAWN DE VERDADE: o inimigo que a simulacao cria vem com
// `globalCooldown` zerado, IA ligada e movimento proprio — ele revida, anda e
// escolhe golpe, e um teste de mecanica passa a medir a IA junto. Este aqui
// nasce parado (`globalCooldown: 999`, `moveSpeed: 0`, raios de aggro em 0), e
// so o hit que o teste injeta acontece.
//
// Fora de um arquivo `.test.ts` de proposito: dois arquivos de teste ja
// precisavam dele, e importar de um `.test.ts` faria a suite daquele arquivo
// rodar de novo dentro do outro.
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { TURNO_SEGUNDOS } from '@/data/abilities'
import type { EnemyEntity, WorldState } from '../types'

export function criarInimigoDeTeste(
  world: Pick<WorldState, 'counters'>,
  speciesId: string,
  level: number,
  junto: { x: number; y: number },
): EnemyEntity {
  const enemyPoke = createPokeInstance(createRng(2), speciesId, level)
  return {
    id: `entity-${world.counters.entity++}`,
    kind: 'enemy',
    poke: enemyPoke,
    x: junto.x, y: junto.y,
    facing: { x: 0, y: 1 },
    radius: 15,
    state: 'engaged',
    cooldowns: {},
    globalCooldown: 999, // trava a propria acao -- so o hit injetado pelo teste resolve
    targetId: null,
    deathHandled: false,
    flashTimer: 0,
    lastDamageTaken: { physical: { amount: 0, age: Infinity }, special: { amount: 0, age: Infinity } },
    battleAnim: null,
    animFrame: 0,
    animElapsed: 0,
    attackAnim: null,
    attackAnimTimer: 0,
    effectLanes: [],
    statusVolatil: null,
    estagios: {},
    imunidadeDeStatus: 0,
    proximoTurnoDeStatus: TURNO_SEGUNDOS,
    pathWaypoints: null,
    pathIndex: 0,
    pathRecalcTimer: 0,
    pathTargetX: null,
    pathTargetY: null,
    pathStuckSeconds: 0,
    encounterId: 'teste',
    spawnPoint: { x: junto.x, y: junto.y },
    moveSpeed: 0,
    wanderTarget: null,
    wanderPause: 0,
    aggroRadius: 0,
    wanderRadius: 0,
    leashRadius: 0,
    deathRemovalTimer: null,
  }
}
