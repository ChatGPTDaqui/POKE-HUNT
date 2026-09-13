// Fila ranqueada (PH-531): entra, faz polling do pareamento (sem cron — a
// funcao Postgres `tentar_parear_ranqueado` tenta casar a cada chamada) e,
// ao casar, dispara a resolucao server-side (`/pvp/resolver`) e mostra o
// resultado. Nunca reporta o proprio vencedor — o servidor decide tudo.
import { useCallback, useEffect, useRef, useState } from 'react'
import * as pvpRpc from '@/data/remote/pvpRpc'
import { servidor, servidorAtivo } from '@/data/remote/servidor'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorldStore } from '@/stores/worldStore'
import { criarMundoPvpReplay } from './pvpWorld'

const INTERVALO_POLL_MS = 3000

export interface EstadoRankeado {
  rank: pvpRpc.RankPvp | null
  carregando: boolean
  procurando: boolean
  entrarNaFila: () => Promise<void>
  cancelar: () => Promise<void>
  servidorConfigurado: boolean
}

export function usePvpRanked(): EstadoRankeado {
  const meuId = useAuthStore((s) => s.user?.id ?? null)
  const [rank, setRank] = useState<pvpRpc.RankPvp | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [procurando, setProcurando] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const vivo = useRef(true)

  const recarregarRank = useCallback(async () => {
    try {
      setRank(await pvpRpc.meuRankPvp())
    } catch (e) {
      useToastStore.getState().pushToast(
        e instanceof Error ? e.message : 'Não foi possível carregar seu rank.', 'error', 'world',
      )
    }
  }, [])

  useEffect(() => {
    vivo.current = true
    void recarregarRank().finally(() => { if (vivo.current) setCarregando(false) })
    return () => { vivo.current = false }
  }, [recarregarRank])

  const pararPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
  }, [])

  useEffect(() => () => pararPolling(), [pararPolling])

  const entrarNaFila = useCallback(async () => {
    try {
      const rankAtualizado = await pvpRpc.entrarFilaRanqueada()
      setRank(rankAtualizado)
      setProcurando(true)
      pollRef.current = setInterval(async () => {
        try {
          const sessao = await pvpRpc.tentarPearearRanqueado()
          if (!sessao) return
          pararPolling()
          setProcurando(false)
          const res = await servidor.resolverPvp(sessao.id)
          if (meuId && res.eventos && res.eventos.length > 0) {
            const meuLado = sessao.anfitriaoId === meuId ? 'anfitriao' : 'convidado'
            const resultadoFinal = res.vencedorId == null
              ? 'empate'
              : res.vencedorId === meuId ? 'vitoria' : 'derrota'
            useWorldStore.getState().setWorld(criarMundoPvpReplay(res.eventos, meuLado, resultadoFinal, 'oponente ranqueado'))
            useUiStore.getState().closeScreen()
          }
          await recarregarRank()
        } catch (e) {
          pararPolling()
          setProcurando(false)
          useToastStore.getState().pushToast(
            e instanceof Error ? e.message : 'Erro ao parear PvP ranqueado.', 'error', 'world',
          )
        }
      }, INTERVALO_POLL_MS)
    } catch (e) {
      useToastStore.getState().pushToast(
        e instanceof Error ? e.message : 'Não foi possível entrar na fila ranqueada.', 'error', 'world',
      )
    }
  }, [pararPolling, recarregarRank])

  const cancelar = useCallback(async () => {
    pararPolling()
    setProcurando(false)
    try {
      await pvpRpc.sairDaFilaRanqueada()
    } catch (e) {
      useToastStore.getState().pushToast(
        e instanceof Error ? e.message : 'Não foi possível sair da fila.', 'error', 'world',
      )
    }
  }, [pararPolling])

  return {
    rank,
    carregando,
    procurando,
    entrarNaFila,
    cancelar,
    servidorConfigurado: servidorAtivo(),
  }
}
