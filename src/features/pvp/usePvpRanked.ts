// Ranqueado assincrono (PH-565): "Atacar" pareia NA HORA com a defesa salva
// de um jogador de MMR proximo (online ou nao) — ou com um bot —, dispara a
// resolucao server-side (`/pvp/resolver`) e entra na ARENA (PH-540) com a
// semente devolvida. Sem fila, sem polling. Nunca reporta o proprio vencedor.
import { useCallback, useEffect, useRef, useState } from 'react'
import * as pvpRpc from '@/data/remote/pvpRpc'
import { servidor, servidorAtivo } from '@/data/remote/servidor'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { entrarNaArena } from '@/features/arena/arena'
import { arenaDaSessao } from './arenaDaSessao'

export interface EstadoRankeado {
  rank: pvpRpc.RankPvp | null
  defesa: pvpRpc.PresetPvp | null
  defesasRecentes: pvpRpc.HistoricoPvp[]
  carregando: boolean
  atacando: boolean
  atacar: () => Promise<void>
  servidorConfigurado: boolean
}

const DEFESAS_NO_CARTAO = 5

export function usePvpRanked(): EstadoRankeado {
  const meuId = useAuthStore((s) => s.user?.id ?? null)
  const [rank, setRank] = useState<pvpRpc.RankPvp | null>(null)
  const [defesa, setDefesa] = useState<pvpRpc.PresetPvp | null>(null)
  const [defesasRecentes, setDefesasRecentes] = useState<pvpRpc.HistoricoPvp[]>([])
  const [carregando, setCarregando] = useState(true)
  const [atacando, setAtacando] = useState(false)
  const vivo = useRef(true)

  const recarregar = useCallback(async () => {
    try {
      const [r, presets, hist] = await Promise.all([
        pvpRpc.meuRankPvp(),
        pvpRpc.meusPresetsPvp(),
        pvpRpc.historicoPvp(50),
      ])
      if (!vivo.current) return
      setRank(r)
      setDefesa(presets.find((p) => p.tipo === 'defesa' && p.ativo) ?? null)
      setDefesasRecentes(hist
        .filter((h) => h.modo === 'ranqueado' && h.convidadoId === meuId)
        .slice(0, DEFESAS_NO_CARTAO))
    } catch (e) {
      useToastStore.getState().pushToast(
        e instanceof Error ? e.message : 'Não foi possível carregar seu rank.', 'error', 'world',
      )
    }
  }, [meuId])

  useEffect(() => {
    vivo.current = true
    void recarregar().finally(() => { if (vivo.current) setCarregando(false) })
    return () => { vivo.current = false }
  }, [recarregar])

  useEffect(() => {
    if (!meuId) return
    return pvpRpc.assinarMeuPvp(meuId, () => { void recarregar() }, '-ranked')
  }, [meuId, recarregar])

  const atacar = useCallback(async () => {
    if (atacando || !meuId) return
    setAtacando(true)
    try {
      const sessao = await pvpRpc.atacarRanqueado()
      const res = await servidor.resolverPvp(sessao.id)
      const entrada = await arenaDaSessao(sessao, meuId, res, 'oponente ranqueado')
      if (entrada) entrarNaArena({ ...entrada, aoSair: () => { void recarregar() } })
      await recarregar()
    } catch (e) {
      useToastStore.getState().pushToast(
        e instanceof Error ? e.message : 'Não foi possível atacar agora.', 'error', 'world',
      )
    } finally {
      if (vivo.current) setAtacando(false)
    }
  }, [atacando, meuId, recarregar])

  return {
    rank,
    defesa,
    defesasRecentes,
    carregando,
    atacando,
    atacar,
    servidorConfigurado: servidorAtivo(),
  }
}
