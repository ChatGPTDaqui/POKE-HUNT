import { create } from 'zustand'
import { useGameStateStore } from '@/stores/gameStateStore'
import { usePassosStore } from '@/stores/passosStore'
import { passoCumprido } from '@/data/primeirosPassos'
import { DESBLOQUEIO_POR_TELA, passoQueLibera, textoDoRequisito, type TelaComCadeado } from '@/data/desbloqueios'
import { useToastStore } from '@/stores/toastStore'

/**
 * Id do passo que ainda tranca esta tela, ou `null` se ela está liberada.
 *
 * Enquanto a lista do que já foi reivindicado não carregou, NADA fica trancado:
 * um veterano não pode ver o Mercado com cadeado por causa de uma leitura lenta.
 */
export function usePassoQueTranca(tela: string | null | undefined): string | null {
  const carregado = usePassosStore(s => s.carregado)
  const reivindicados = usePassosStore(s => s.reivindicados)
  const passo = tela ? passoQueLibera(tela) : null
  return useGameStateStore(s => {
    if (!passo || !carregado) return null
    return passoCumprido(passo, s, reivindicados) ? null : passo
  })
}

/** Versão para listas: devolve a função de consulta (sem um hook por item). */
export function useTrancas(): (tela: string) => string | null {
  const carregado = usePassosStore(s => s.carregado)
  const reivindicados = usePassosStore(s => s.reivindicados)
  // Seleciona uma STRING (as telas trancadas, em ordem), e não o estado: o
  // gameState muda a cada abate, e a doca não pode re-renderizar junto.
  const trancadas = useGameStateStore(s => !carregado ? '' : Object.keys(DESBLOQUEIO_POR_TELA)
    .filter(t => !passoCumprido(DESBLOQUEIO_POR_TELA[t as TelaComCadeado], s, reivindicados)).join(','))
  return (tela) => trancadas.split(',').includes(tela) ? passoQueLibera(tela) : null
}

/**
 * O que o último toque num menu trancado explicou. Mora no cartão de Primeiros
 * Passos, e não só no chat: no meio da caçada o ticker troca de linha a cada
 * abate e o aviso sumia antes de ser lido. No cartão ele fica ao lado do passo
 * que destranca o menu.
 */
export const useAvisoDeCadeado = create<{ texto: string | null; seq: number }>(() => ({ texto: null, seq: 0 }))

/** O toque num menu trancado diz o que falta, em vez de não fazer nada. */
export function avisarTrancado(passoId: string): void {
  const texto = textoDoRequisito(passoId)
  useToastStore.getState().pushToast(texto, 'info', 'world')
  useAvisoDeCadeado.setState(s => ({ texto, seq: s.seq + 1 }))
}
