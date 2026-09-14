// Arena no cliente (PH-540): monta o mesmo mundo que o servidor resolveu
// (mesma semente, mesmos snapshots) e deixa o loop normal rodar — HUD,
// renderer e combate sao os de qualquer hunt. O veredito do servidor e o que
// vale; o que a tela mostra e a mesma luta reproduzida pelo motor.
import { create } from 'zustand'
import { criarMundoArena, type ResultadoDaArena } from '@/engine/arena'
import { controller } from '@/engine/controller'
import type { PokeInstance } from '@/data/pokes'
import { useUiStore } from '@/stores/uiStore'
import { useWorldStore } from '@/stores/worldStore'

export type VereditoDaArena = Exclude<ResultadoDaArena, 'lutando'>

interface EstadoDaArenaNoCliente {
  /** Veredito oficial (servidor). `null` = duelo local sem stakes. */
  veredito: VereditoDaArena | null
  nomeDoRival: string
  aoSair: (() => void) | null
}

export const useArenaStore = create<EstadoDaArenaNoCliente>(() => ({ veredito: null, nomeDoRival: '', aoSair: null }))

export interface EntradaNaArena {
  semente: number
  meuTime: PokeInstance[]
  rivalTime: PokeInstance[]
  nomeDoRival: string
  veredito: VereditoDaArena | null
  aoSair?: () => void
}

export function entrarNaArena({ semente, meuTime, rivalTime, nomeDoRival, veredito, aoSair }: EntradaNaArena): void {
  const world = criarMundoArena({ semente, meuTime, rivalTime, nomeDoRival })
  useArenaStore.setState({ veredito, nomeDoRival, aoSair: aoSair ?? null })
  useWorldStore.getState().setWorld(world)
  useUiStore.getState().closeScreen()
}

export function sairDaArena(): void {
  const { aoSair } = useArenaStore.getState()
  useArenaStore.setState({ veredito: null, nomeDoRival: '', aoSair: null })
  controller.returnToHospital({ x: 0, y: 0 })
  aoSair?.()
}

/**
 * O que mostrar ao final: o veredito do servidor quando existe. Se a
 * reproducao local discordar, e bug de determinismo — fica no console, e a
 * tela mostra o oficial.
 */
export function vereditoParaTela(local: ResultadoDaArena, oficial: VereditoDaArena | null): VereditoDaArena | null {
  if (local === 'lutando') return null
  if (oficial && oficial !== local) {
    console.warn(`[arena] reproducao local (${local}) divergiu do veredito do servidor (${oficial}); vale o servidor.`)
    return oficial
  }
  return oficial ?? local
}
