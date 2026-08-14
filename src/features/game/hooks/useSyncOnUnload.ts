import { useEffect } from 'react'
import { useGameStateStore, forceSave } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { syncActivePokeToGameState } from '@/engine/simulation'

// O `zustand/persist` ja grava a cada mudanca do gameState, mas o HP/EXP do
// POKE em campo vive no worldStore durante a hunt (ver nota de arquitetura em
// engine/controller.ts) — sem isso, fechar a aba no meio de uma luta perderia
// o progresso desde o ultimo sync periodico.
export function useSyncOnUnload(): void {
  useEffect(() => {
    function onUnload() {
      syncActivePokeToGameState(useWorldStore.getState(), useGameStateStore.getState())
      forceSave()
    }
    // `pagehide` junto com `beforeunload` de proposito: iOS/Android
    // frequentemente encerram a pagina sem disparar `beforeunload` nenhum, e
    // e nesses aparelhos que "o farm offline nao funciona" aparecia.
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('pagehide', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('pagehide', onUnload)
    }
  }, [])
}
