// PH-533: "modo duelo" — Campeao Lance e lutas de lendario, resolvidos
// server-side no mesmo molde do PvP (ver authority/src/appDuelo.ts). O
// cliente so pede, monta o replay e credita a recompensa ao final — nunca
// decide vitoria/derrota sozinho.
import { BOSS_MAPS_DATA, LANCE_MAP_ID } from '@/data/nightmareMaps'
import { GRUPOS_DO_LANCE } from '@/data/biomas'
import { createRng, randomSeed } from '@/core/rng'
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
  // Import tardio de proposito: `@/engine/simulation` e o motor inteiro do
  // "modo livre" (tempo real), pesado pra puxar no grafo eager de boot so
  // porque `PvpOverlay` (montado sempre, HUD global) importa este arquivo.
  // So precisa existir no instante em que um duelo termina em vitoria.
  const { handleEnemyDefeated } = await import('@/engine/simulation')

  // `world` aqui e `useWorldStore.getState()` (PvpOverlay.tsx) — um
  // snapshot CONGELADO pelo Immer. `handleEnemyDefeated` foi escrito pra
  // rodar dentro de um producer do Immer (mutavel de verdade); chamado com
  // o snapshot direto ele muta `counters.entity`, `player.poke`,
  // `effects` (push) e `rng` (sorteios), e QUALQUER um desses e um
  // "Cannot assign to read only property" — bugs reais achados testando
  // PH-535/536 em staging, um de cada vez, cada um mascarando o proximo
  // (o do encounterId disparava antes de qualquer mutacao acontecer; uma
  // vez corrigido, a mutacao em `counters` apareceu; corrigida essa, a
  // mutacao em `player` apareceu). Em vez de caçar landmine por landmine,
  // clona tudo que a funcao pode tocar: `player` PERSISTE fora do loop de
  // proposito (o mesmo POKE ganha XP de CADA abate do time do boss, igual
  // uma sequencia de kills numa hunt de verdade — clonar de novo a cada
  // iteracao perderia o XP acumulado).
  const playerLocal = { ...world.player }
  const worldLocal: WorldState = {
    ...world,
    mapDef: { ...mapDef, collisionGrid: mapDef.collisionGrid ?? null },
    player: playerLocal,
    effects: [...world.effects],
    rng: createRng(randomSeed()),
    counters: { ...world.counters },
    enemies: [],
  }
  for (const poke of bossTeam) {
    const enemy = createEnemyEntity(worldLocal.counters, {
      // `mapId` cru NUNCA foi um id de encontro registrado (bug real,
      // achado testando PH-535 em staging): lendario registra
      // `${mapId}_encounter`, Lance registra `${mapId}_0`..`${mapId}_5`
      // (um por membro do time, `nightmareMaps.ts`). `createEnemyEntity`
      // so usa isto pra `aggroRadius` (irrelevante aqui — a entidade
      // nunca anda), entao qualquer encontro JA REGISTRADO do proprio
      // mapa serve, mesmo truque usado no resolvedor headless
      // (`authority/src/appDuelo.ts`).
      poke, x: playerLocal.x, y: playerLocal.y, encounterId: mapDef.enemyPool[0],
    })
    worldLocal.enemies = [enemy]
    // Re-busca A CADA abate, nao uma vez fora do loop: `handleEnemyDefeated`
    // grava via `set()` (zustand), mas `recordPokedexKill`/`grantExp` LEEM
    // do objeto `gameState` que foi passado — uma referencia so, capturada
    // antes do loop, nunca veria as escritas dos abates anteriores. Bug
    // real achado pelo teste automatizado: Lance tem 3 Dragonite no time, e
    // sem isto os 3 abates pisavam um no outro (Pokedex terminava com
    // "Abates: 1" em vez de 3 — cada `recordPokedexKill` lia o MESMO
    // `entry` inicial, undefined, e escrevia {normal:1} tres vezes).
    handleEnemyDefeated(worldLocal, enemy, useGameStateStore.getState(), { silent: false })
  }

  if (mapId === LANCE_MAP_ID) {
    const gameState = useGameStateStore.getState()
    for (const grupo of GRUPOS_DO_LANCE) gameState.unlockContinent(grupo)
    useToastStore.getState().pushToast(
      'Você derrotou o Campeão Lance! Novas áreas desbloqueadas.', 'success', 'world',
    )
  }
}
