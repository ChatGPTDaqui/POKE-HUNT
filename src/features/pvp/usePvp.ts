import { useCallback, useEffect, useMemo, useState } from 'react'
import * as pvpRpc from '@/data/remote/pvpRpc'
import type { HistoricoPvp, SessaoPvp } from '@/data/remote/pvpRpc'
import { useAuthStore } from '@/stores/authStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorldStore } from '@/stores/worldStore'
import { criarMundoPvpVisual } from './pvpWorld'

type PapelPvp = 'anfitriao' | 'convidado'

export interface EstadoDoPvp {
  carregando: boolean
  sessao: SessaoPvp | null
  historico: HistoricoPvp[]
  papel: PapelPvp | null
  outroId: string | null
  ocupado: boolean
  convidarPorNick: (nick: string) => Promise<void>
  aceitar: () => Promise<void>
  recusarOuCancelar: () => Promise<void>
  entrarNaArena: (nomeDoRival?: string) => void
  recarregar: () => Promise<void>
}

function meuPokeAtivo() {
  const { team, activeIndex } = useGameStateStore.getState()
  return team[activeIndex] ?? team[0] ?? null
}

function avisarErro(e: unknown): void {
  useToastStore.getState().pushToast(
    e instanceof Error ? e.message : 'Não foi possível atualizar o PvP.',
    'error',
    'world',
  )
}

export function usePvp(): EstadoDoPvp {
  const meuId = useAuthStore((s) => s.user?.id ?? null)
  const [sessao, setSessao] = useState<SessaoPvp | null>(null)
  const [historico, setHistorico] = useState<HistoricoPvp[]>([])
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState(false)

  const recarregar = useCallback(async () => {
    try {
      const [viva, hist] = await Promise.all([
        pvpRpc.meuPvpVivo(),
        pvpRpc.historicoPvp(),
      ])
      setSessao(viva)
      setHistorico(hist)
    } catch (e) {
      avisarErro(e)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { void recarregar() }, [recarregar])

  useEffect(() => {
    if (!meuId) return
    return pvpRpc.assinarMeuPvp(meuId, () => { void recarregar() })
  }, [meuId, recarregar])

  const agir = useCallback(async (acao: () => Promise<SessaoPvp>) => {
    if (ocupado) return
    setOcupado(true)
    try {
      const nova = await acao()
      setSessao(nova.estado === 'convidada' || nova.estado === 'aberta' ? nova : null)
      await recarregar()
    } catch (e) {
      avisarErro(e)
      await recarregar()
    } finally {
      setOcupado(false)
    }
  }, [ocupado, recarregar])

  const papel: PapelPvp | null = useMemo(() => {
    if (!sessao || !meuId) return null
    return sessao.anfitriaoId === meuId ? 'anfitriao' : 'convidado'
  }, [sessao, meuId])
  const outroId = sessao && meuId ? (sessao.anfitriaoId === meuId ? sessao.convidadoId : sessao.anfitriaoId) : null

  const convidarPorNick = useCallback(async (nick: string) => {
    if (ocupado) return
    setOcupado(true)
    try {
      const poke = meuPokeAtivo()
      if (!poke) throw new Error('Escolha um POKE na equipe antes de convidar.')
      const alvo = await pvpRpc.buscarTreinadorPorNick(nick)
      if (!alvo) throw new Error('Treinador não encontrado.')
      if (alvo.userId === meuId) throw new Error('Você não pode se convidar para PvP.')
      const nova = await pvpRpc.abrirPvp(alvo.userId, poke)
      setSessao(nova)
      await recarregar()
    } catch (e) {
      avisarErro(e)
    } finally {
      setOcupado(false)
    }
  }, [meuId, ocupado, recarregar])

  const aceitar = useCallback(async () => {
    const poke = meuPokeAtivo()
    if (!poke) throw new Error('Escolha um POKE na equipe antes de aceitar.')
    if (!sessao) return
    await agir(() => pvpRpc.aceitarPvp(sessao.id, poke))
  }, [agir, sessao])

  const recusarOuCancelar = useCallback(async () => {
    if (!sessao) return
    await agir(() => pvpRpc.encerrarPvp(sessao.id))
  }, [agir, sessao])

  const entrarNaArena = useCallback((nomeDoRival = 'rival') => {
    if (!sessao || !meuId || !papel) return
    const meuPoke = papel === 'anfitriao' ? sessao.anfitriaoPoke : sessao.convidadoPoke
    const rival = papel === 'anfitriao' ? sessao.convidadoPoke : sessao.anfitriaoPoke
    if (!meuPoke || !rival) {
      useToastStore.getState().pushToast('O outro treinador ainda não carregou o POKE do duelo.', 'error', 'world')
      return
    }
    useWorldStore.getState().setWorld({
      ...criarMundoPvpVisual(meuPoke, rival, nomeDoRival),
      pvp: {
        treinador: nomeDoRival,
        estado: 'lutando',
        sessaoId: sessao.id,
        meuId,
        rivalId: outroId ?? undefined,
      },
    })
    useUiStore.getState().closeScreen()
  }, [meuId, outroId, papel, sessao])

  return {
    carregando,
    sessao,
    historico,
    papel,
    outroId,
    ocupado,
    convidarPorNick,
    aceitar,
    recusarOuCancelar,
    entrarNaArena,
    recarregar,
  }
}
