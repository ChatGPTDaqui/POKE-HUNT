// O botão que o Primeiro Passo atual pede pulsa até o jogador tocar nele.
//
// Mostrar em vez de explicar: o passo "Coloque um 2º POKE na Equipe" acende o
// botão Equipe, o de missão acende Tasks. Some no primeiro toque (por passo, por
// aparelho) — depois disso o jogador já sabe onde fica, e um anel piscando para
// sempre vira ruído que ele aprende a ignorar.
import { useMemo } from 'react'
import { create } from 'zustand'
import { situacaoDosPassos, type DestinoDoPasso } from '@/data/primeirosPassos'
import { useGameStateStore } from '@/stores/gameStateStore'
import { usePassosStore } from '@/stores/passosStore'
import { useWorldStore } from '@/stores/worldStore'

const CHAVE = 'novo-poke-idle:setas-vistas'

function lerVistas(): Set<string> {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

const useSetasVistas = create<{ vistas: ReadonlySet<string>; marcar: (id: string) => void }>((set, get) => ({
  vistas: lerVistas(),
  marcar: (id) => {
    if (get().vistas.has(id)) return
    const vistas = new Set(get().vistas).add(id)
    try { localStorage.setItem(CHAVE, JSON.stringify([...vistas])) } catch { /* sem storage: volta a piscar no próximo boot */ }
    set({ vistas })
  },
}))

/** Id do passo atual se ele aponta para `destino` e o anel ainda não foi visto. */
function usePassoQueApontaPara(destino: DestinoDoPasso): string | null {
  const carregado = usePassosStore(s => s.carregado)
  const reivindicados = usePassosStore(s => s.reivindicados)
  const vistas = useSetasVistas(s => s.vistas)
  const emCampo = useWorldStore(s => s.mapDef != null)
  const id = useGameStateStore(s => {
    if (!carregado) return null
    const { atual, pronto } = situacaoDosPassos(s, reivindicados)
    if (!atual || pronto || atual.destino !== destino) return null
    // Passo que se cumpre caçando (o 1º) não aponta pra Hunt de quem já caça.
    return emCampo && atual.dicaEmCampo ? null : atual.id
  })
  return id && !vistas.has(id) ? id : null
}

/**
 * Para o botão de `destino`: a classe do anel (ou '') e o que chamar no toque.
 */
export function useDestaqueDoPasso(destino: DestinoDoPasso): { classe: string; aoTocar: () => void } {
  const id = usePassoQueApontaPara(destino)
  return useMemo(() => ({
    classe: id ? 'destaque-do-passo' : '',
    aoTocar: () => { if (id) useSetasVistas.getState().marcar(id) },
  }), [id])
}
