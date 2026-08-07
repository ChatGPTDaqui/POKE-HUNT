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
import { pedirAcao, abrirSessaoDeHunt, fecharSessaoDeHunt } from '@/data/remote/autoridade'
export const controller = {
  returnToHospital(hospitalSpot: Point): void {
    const gameState = useGameStateStore.getState()
    void fecharSessaoDeHunt()
    gameState.setCurrentMapId(null)
    const world = buildHospitalWorld(gameState.team[gameState.activeIndex] || null, hospitalSpot, useWorldStore.getState())
    useWorldStore.getState().setWorld(world)
  },

  // Devolve se o jogador REALMENTE entrou. Assincrona de proposito: a sessao
  // precisa ser aceita pelo servidor ANTES de trocar a cena.
  //
  // Antes isto era `void abrirSessaoDeHunt(...)` e a cena trocava sem esperar.
  // O resultado era o pior dos dois mundos: com o servidor recusando (hunt
  // trancada, POKE que nao e da equipe, sessao invalida), o jogador entrava,
  // via o combate rodando na tela e nao ganhava nada — sem nenhum aviso, porque
  // a simulacao local continua desenhando normalmente. Um erro que so aparece
  // como "o jogo parou de dar ouro".
  async enterMap(mapId: string): Promise<boolean> {
    const gameState = useGameStateStore.getState()
    const activePoke = gameState.team[gameState.activeIndex]
    if (!activePoke) return false
    if (!(await abrirSessaoDeHunt(mapId, activePoke.uid))) return false
    gameState.setCurrentMapId(mapId)
    const world = buildMapWorld(mapId, activePoke, useWorldStore.getState())
    useWorldStore.getState().setWorld(world)
    resetStats(gameState) // painel de taxa de farm reinicia do zero a cada hunt nova
    return true
  },

  chooseStarter(speciesId: string, hospitalSpot: Point): void {
    const gameState = useGameStateStore.getState()
    if (gameState.team.length > 0) return
    void pedirAcao(
      { tipo: 'escolherStarter', speciesId },
      () => {
        const poke = useWorldStore.getState().sortear((rng) => createPokeInstance(rng, speciesId, STARTER_LEVEL, { ivs: STARTER_IVS, rarity: STARTER_RARITY }))
        gameState.addPokeToTeam(poke)
        gameState.setActiveIndex(0)
      },
    ).then(() => {
      // O mundo e reconstruido DEPOIS, dos dois lados: no caminho do servidor a
      // POKE so existe quando a resposta chega (foi ele quem a criou), e no
      // caminho local ela ja esta na store. Ler de `team[0]` aqui cobre os dois
      // sem duplicar a montagem da cena.
      const poke = useGameStateStore.getState().team[0]
      if (poke) useWorldStore.getState().setWorld(buildHospitalWorld(poke, hospitalSpot, useWorldStore.getState()))
    })
  },

  resetGame(): void {
    const gameState = useGameStateStore.getState()
    void pedirAcao({ tipo: 'reiniciarJogo' }, () => gameState.resetToDefaults()).then(() => {
      // Reconstroi a cena so DEPOIS: no caminho do servidor o estado zerado so
      // chega com a resposta, e montar o mundo antes deixaria o POKE antigo em
      // campo com a conta ja apagada.
      useWorldStore.getState().setWorld(buildHospitalWorld(null, { x: 0, y: 0 }))
    })
  },

  healTeam(): void {
    const gameState = useGameStateStore.getState()
    void pedirAcao({ tipo: 'curarEquipe' }, () => gameState.healTeamFully())
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
    void pedirAcao({ tipo: 'definirAtivo', indice: index }, () => gameState.moveTeamIndexToFront(index))
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
    const removed = gameState.team[idx]
    void pedirAcao({ tipo: 'tirarDaEquipe', pokeUid }, () => { gameState.moveTeamToBag(pokeUid) })
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
      } else if (gameState.hasItem(itemId, 1)) {
        void pedirAcao({ tipo: 'usarItem', itemId }, () => { gameState.removeItem(itemId, 1) })
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
      } else if (gameState.hasItem(itemId, 1)) {
        void pedirAcao({ tipo: 'usarItem', itemId }, () => { gameState.removeItem(itemId, 1) })
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
    void pedirAcao({ tipo: 'evoluirPoke', pokeUid }, () => gameState.updatePokeInstance(pokeUid, () => result.updatedPoke))
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
