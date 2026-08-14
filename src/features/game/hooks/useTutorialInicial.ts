import { useEffect, useRef } from 'react'
import { useTutorialStore, TUTORIAL_BOT } from '@/stores/tutorialStore'

// Tutorial do Bot no primeiro contato.
//
// Dispara depois de o jogador ter um inicial — antes disso a tela de escolha
// ocupa tudo e um modal por cima dela so atrapalha. Uma vez so por aparelho: o
// controle de "ja viu" mora no localStorage (ver tutorialStore), nao no save,
// porque o save e sobrescrito pelo servidor a cada flush.
export function useTutorialInicial(hasStarter: boolean): void {
  const jaDisparou = useRef(false)
  useEffect(() => {
    if (!hasStarter || jaDisparou.current) return
    jaDisparou.current = true
    useTutorialStore.getState().abrirSeInedito(TUTORIAL_BOT)
  }, [hasStarter])
}
