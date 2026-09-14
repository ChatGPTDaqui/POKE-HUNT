// PH-533: "modo duelo" — Campeao Lance e lutas de lendario, resolvidos
// server-side no mesmo molde do PvP (ver authority/src/appDuelo.ts). O
// cliente so pede, monta o replay e credita a recompensa ao final — nunca
// decide vitoria/derrota sozinho.
import { BOSS_MAPS_DATA, LANCE_MAP_ID } from '@/data/nightmareMaps'
import { GRUPOS_DO_LANCE } from '@/data/biomas'
import { createEnemyEntity } from '@/engine/entity'
import type { WorldState } from '@/engine/types'
import { criarMundoDuelo } from '@/features/pvp/pvpWorld'
import { servidor } from '@/data/remote/servidor'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorldStore } from '@/stores/worldStore'

export function ehMapaDeDuelo(mapId: string): boolean {
  return Boolean(BOSS_MAPS_DATA[mapId])
}

function nomeDoDuelo(mapId: string): string {
  return BOSS_MAPS_DATA[mapId]?.name ?? 'Boss'
}

/**
 * Entra num duelo de boss: resolve no servidor, monta o replay e fecha o
 * menu — mesmo padrão de `usePvp.ts`/`usePvpRanked.ts`. Devolve `false`
 * (com toast de erro) quando o servidor recusa (gate de área, equipe
 * desmaiada) em vez de deixar a tela travada esperando algo que não vem.
 */
export async function entrarEmDuelo(mapId: string): Promise<boolean> {
  try {
    const res = await servidor.resolverDuelo(mapId)
    if (!res.eventos || res.eventos.length === 0) {
      useToastStore.getState().pushToast('Não foi possível iniciar o duelo.', 'error', 'world')
      return false
    }
    const resultadoFinal = res.vencedor === 'jogador' ? 'vitoria' : res.vencedor === 'boss' ? 'derrota' : 'empate'
    useWorldStore.getState().setWorld(
      criarMundoDuelo(res.eventos, resultadoFinal, mapId, res.timeDoBoss, nomeDoDuelo(mapId)),
    )
    useUiStore.getState().closeScreen()
    return true
  } catch (e) {
    useToastStore.getState().pushToast(
      e instanceof Error ? e.message : 'Não foi possível iniciar o duelo.', 'error', 'world',
    )
    return false
  }
}

/**
 * Chamada pelo PvpOverlay quando o replay de um duelo termina em vitória:
 * credita XP/ouro/captura/Pokédex por cada POKE do boss — reaproveitando
 * `handleEnemyDefeated`, a MESMA função que qualquer abate no mapa aberto
 * usa, em vez de reimplementar a conta. Derrota não credita nada (como um
 * treino contra Líder/Campeão nos jogos da série).
 */
export async function creditarVitoriaDeDuelo(world: WorldState): Promise<void> {
  const mapId = world.pvp?.mapId
  const bossTeam = world.pvp?.bossTeam
  if (!mapId || !bossTeam || !world.player) return
  const mapDef = BOSS_MAPS_DATA[mapId]
  if (!mapDef) return
  const gameState = useGameStateStore.getState()
  // Import tardio de proposito: `@/engine/simulation` e o motor inteiro do
  // "modo livre" (tempo real), pesado pra puxar no grafo eager de boot so
  // porque `PvpOverlay` (montado sempre, HUD global) importa este arquivo.
  // So precisa existir no instante em que um duelo termina em vitoria.
  const { handleEnemyDefeated } = await import('@/engine/simulation')

  for (const poke of bossTeam) {
    const enemy = createEnemyEntity(world.counters, {
      // `mapId` cru NUNCA foi um id de encontro registrado (bug real,
      // achado testando PH-535 em staging): lendario registra
      // `${mapId}_encounter`, Lance registra `${mapId}_0`..`${mapId}_5`
      // (um por membro do time, `nightmareMaps.ts`). `createEnemyEntity`
      // so usa isto pra `aggroRadius` (irrelevante aqui — a entidade
      // nunca anda), entao qualquer encontro JA REGISTRADO do proprio
      // mapa serve, mesmo truque usado no resolvedor headless
      // (`authority/src/appDuelo.ts`).
      poke, x: world.player.x, y: world.player.y, encounterId: mapDef.enemyPool[0],
    })
    // `mapDef` real (nao a arena de renderizacao do replay) pra
    // noCatch/itemDrops/noRewards baterem com a hunt de verdade.
    handleEnemyDefeated(
      { ...world, mapDef: { ...mapDef, collisionGrid: mapDef.collisionGrid ?? null }, enemies: [enemy] },
      enemy, gameState, { silent: false },
    )
  }

  if (mapId === LANCE_MAP_ID) {
    for (const grupo of GRUPOS_DO_LANCE) gameState.unlockContinent(grupo)
    useToastStore.getState().pushToast(
      'Você derrotou o Campeão Lance! Novas áreas desbloqueadas.', 'success', 'world',
    )
  }
}
