// Acoes que a UI chama (o  do main.js original).
//
// Tudo aqui toca as stores do navegador. O nucleo de simulacao vive em
// simulation.ts justamente pra poder rodar headless no servidor sem arrastar
// isto junto — ver a nota de topo de la.
import { SPECIES, createPokeInstance } from '@/data/pokes'
import { getItem } from '@/data/items'
import { evolvePokeInstance } from './systems/progressionSystem'
import { resetStats } from './systems/statsTracker'
import { isDead, heal } from './entity'
import {
  buildHospitalWorld, buildMapWorld, shinyPrefix, syncActivePokeToGameState,
  STARTER_LEVEL, STARTER_IVS, STARTER_RARITY,
} from './simulation'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { useToastStore } from '@/stores/toastStore'
import type { Point } from './types'
export const controller = {
  returnToHospital(hospitalSpot: Point): void {
    const gameState = useGameStateStore.getState()
    gameState.setCurrentMapId(null)
    const world = buildHospitalWorld(gameState.team[gameState.activeIndex] || null, hospitalSpot, useWorldStore.getState())
    useWorldStore.getState().setWorld(world)
  },

  enterMap(mapId: string): void {
    const gameState = useGameStateStore.getState()
    const activePoke = gameState.team[gameState.activeIndex]
    if (!activePoke) return
    gameState.setCurrentMapId(mapId)
    const world = buildMapWorld(mapId, activePoke, useWorldStore.getState())
    useWorldStore.getState().setWorld(world)
    resetStats(gameState) // painel de taxa de farm reinicia do zero a cada hunt nova
  },

  chooseStarter(speciesId: string, hospitalSpot: Point): void {
    const gameState = useGameStateStore.getState()
    if (gameState.team.length > 0) return
    const poke = useWorldStore.getState().sortear((rng) => createPokeInstance(rng, speciesId, STARTER_LEVEL, { ivs: STARTER_IVS, rarity: STARTER_RARITY }))
    gameState.addPokeToTeam(poke)
    gameState.setActiveIndex(0)
    useWorldStore.getState().setWorld(buildHospitalWorld(poke, hospitalSpot, useWorldStore.getState()))
  },

  resetGame(): void {
    const gameState = useGameStateStore.getState()
    gameState.resetToDefaults()
    useWorldStore.getState().setWorld(buildHospitalWorld(null, { x: 0, y: 0 }))
  },

  healTeam(): void {
    const gameState = useGameStateStore.getState()
    gameState.healTeamFully()
    const world = useWorldStore.getState()
    if (world.player) {
      useWorldStore.getState().update((draft) => {
        if (draft.player) draft.player.poke = { ...draft.player.poke, hp: draft.player.poke.stats.hp }
      })
    }
    useToastStore.getState().pushToast('Equipe curada!', 'success', 'world')
  },

  // Traz a POKE recem-colocada em campo pro topo da lista visivel do time.
  setActiveTeamIndex(index: number): void {
    const gameState = useGameStateStore.getState()
    gameState.moveTeamIndexToFront(index)
    const newActivePoke = useGameStateStore.getState().team[0]
    useWorldStore.getState().update((draft) => {
      if (draft.player) {
        draft.player.poke = newActivePoke
        draft.player.cooldowns = {}
        draft.player.flashTimer = 0
        draft.player.fainted = isDead(draft.player)
        draft.player.state = draft.player.fainted ? 'dead' : 'wander'
        draft.player.targetId = null
      }
    })
  },

  removeFromTeam(pokeUid: string): void {
    const gameState = useGameStateStore.getState()
    const idx = gameState.team.findIndex((p) => p.uid === pokeUid)
    if (idx === -1) return
    if (gameState.team.length <= 1) {
      useToastStore.getState().pushToast('Voce precisa manter ao menos 1 POKE na equipe.', 'error', 'world')
      return
    }
    const wasActive = idx === gameState.activeIndex
    const removed = gameState.moveTeamToBag(pokeUid)
    if (!removed) return
    if (wasActive) {
      const newActivePoke = useGameStateStore.getState().team[useGameStateStore.getState().activeIndex]
      useWorldStore.getState().update((draft) => {
        if (draft.player && newActivePoke) {
          draft.player.poke = newActivePoke
          draft.player.cooldowns = {}
          draft.player.flashTimer = 0
          draft.player.fainted = isDead(draft.player)
          draft.player.state = draft.player.fainted ? 'dead' : 'wander'
          draft.player.targetId = null
        }
      })
    }
    useToastStore.getState().pushToast(`${shinyPrefix(removed.isShiny)}${SPECIES[removed.speciesId].name} foi retirado da equipe.`, 'success', 'world')
  },

  useItem(itemId: string): void {
    const gameState = useGameStateStore.getState()
    const item = getItem(itemId)
    const world = useWorldStore.getState()
    if (!item || !world.player) return

    if (item.kind === 'potion' && item.healAmount != null) {
      if (world.player.fainted) {
        useToastStore.getState().pushToast('POKE desmaiado! Use um Revive ou volte ao Hospital.', 'error', 'world')
      } else if (gameState.removeItem(itemId, 1)) {
        const healAmount = item.healAmount
        useWorldStore.getState().update((draft) => {
          if (draft.player) heal(draft.player, healAmount)
        })
        syncActivePokeToGameState(useWorldStore.getState(), gameState)
        useToastStore.getState().pushToast(`Usou ${item.name}.`, 'success', 'world')
      }
    } else if (item.kind === 'revive' && item.reviveHpPercent != null) {
      if (!world.player.fainted) {
        useToastStore.getState().pushToast('O POKE ja esta consciente.', 'error', 'world')
      } else if (gameState.removeItem(itemId, 1)) {
        const revivePercent = item.reviveHpPercent
        useWorldStore.getState().update((draft) => {
          if (draft.player) {
            draft.player.poke.hp = Math.round(draft.player.poke.stats.hp * revivePercent)
            draft.player.fainted = false
            draft.player.state = 'wander'
          }
        })
        syncActivePokeToGameState(useWorldStore.getState(), gameState)
        useToastStore.getState().pushToast('POKE reanimado!', 'success', 'world')
      }
    }
  },

  evolvePoke(pokeUid: string): void {
    const gameState = useGameStateStore.getState()
    const poke = [...gameState.team, ...gameState.bagPokes].find((p) => p.uid === pokeUid)
    if (!poke) return
    const previousName = SPECIES[poke.speciesId].name
    const result = evolvePokeInstance(poke, gameState)
    if (!result) return
    if ('blocked' in result) {
      const { itemId, count } = result.required
      const have = gameState.items[itemId] || 0
      const item = getItem(itemId)
      useToastStore.getState().pushToast(
        `${previousName} precisa de ${count}x ${item?.name ?? itemId} para evoluir (tem ${have}).`,
        'error', 'world',
      )
      return
    }
    gameState.updatePokeInstance(pokeUid, () => result.updatedPoke)
    // Se a POKE evoluida esta em campo agora, o world tambem precisa
    // refletir a nova especie/stats imediatamente.
    const world = useWorldStore.getState()
    if (world.player && world.player.poke.uid === pokeUid) {
      useWorldStore.getState().update((draft) => {
        if (draft.player) draft.player.poke = result.updatedPoke
      })
    }
    useToastStore.getState().pushToast(`${shinyPrefix(poke.isShiny)}${previousName} evoluiu para ${result.species.name}!`, 'levelup', 'world')
  },

  toast(message: string, type: Parameters<ReturnType<typeof useToastStore.getState>['pushToast']>[1], channel: Parameters<ReturnType<typeof useToastStore.getState>['pushToast']>[2]): void {
    useToastStore.getState().pushToast(message, type, channel)
  },

  resetPerfStats(): void {
    resetStats(useGameStateStore.getState())
  },
}
