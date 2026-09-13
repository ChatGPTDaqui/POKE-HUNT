import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as pvpRpc from '@/data/remote/pvpRpc'
import type { HistoricoPvp, SessaoPvp } from '@/data/remote/pvpRpc'
import { servidor } from '@/data/remote/servidor'
import { useAuthStore } from '@/stores/authStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorldStore } from '@/stores/worldStore'
import { criarMundoPvpReplay } from './pvpWorld'

type PapelPvp = 'anfitriao' | 'convidado'

export interface EstadoDoPvp {
  carregando: boolean
  sessao: SessaoPvp | null
  historico: HistoricoPvp[]
  papel: PapelPvp | null
  outroId: string | null
  ocupado: boolean
  resolvendo: boolean
  convidarPorNick: (nick: string) => Promise<void>
  aceitar: (usarTimeSalvo: boolean) => Promise<void>
  recusarOuCancelar: () => Promise<void>
  recarregar: () => Promise<void>
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
  const [resolvendo, setResolvendo] = useState(false)
  const resolvidoRef = useRef<string | null>(null)

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

  // Duelo aceito (estado 'aberta') resolve sozinho — sem batalha ao vivo, o
  // servidor decide o resultado assim que os dois times estao prontos.
  // Idempotente do lado do servidor (`aplicar_resultado_pvp` so age em
  // sessao 'aberta'), entao nao ha problema em anfitriao E convidado
  // dispararem a mesma chamada quase ao mesmo tempo. Ao voltar, monta o
  // mundo de REPLAY (PH-532) com os eventos — a mesma tela que mostrava o
  // duelo ao vivo (`PvpOverlay`) agora so reproduz o que ja aconteceu.
  useEffect(() => {
    if (!sessao || sessao.estado !== 'aberta' || !meuId) return
    if (resolvidoRef.current === sessao.id) return
    resolvidoRef.current = sessao.id
    const meuLado = sessao.anfitriaoId === meuId ? 'anfitriao' : 'convidado'
    const nomeDoRival = sessao.anfitriaoId === meuId ? 'oponente' : 'anfitriao'
    setResolvendo(true)
    void servidor.resolverPvp(sessao.id)
      .then((res) => {
        setSessao(null)
        if (!res.eventos || res.eventos.length === 0) return
        const resultadoFinal = res.vencedorId == null
          ? 'empate'
          : res.vencedorId === meuId ? 'vitoria' : 'derrota'
        useWorldStore.getState().setWorld(criarMundoPvpReplay(res.eventos, meuLado, resultadoFinal, nomeDoRival))
        useUiStore.getState().closeScreen()
      })
      .catch((e) => avisarErro(e))
      .finally(() => { setResolvendo(false); void recarregar() })
  }, [sessao, meuId, recarregar])

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
      const alvo = await pvpRpc.buscarTreinadorPorNick(nick)
      if (!alvo) throw new Error('Treinador não encontrado.')
      if (alvo.userId === meuId) throw new Error('Você não pode se convidar para PvP.')
      const nova = await pvpRpc.abrirPvpTime(alvo.userId)
      setSessao(nova)
      await recarregar()
    } catch (e) {
      avisarErro(e)
    } finally {
      setOcupado(false)
    }
  }, [meuId, ocupado, recarregar])

  // `usarTimeSalvo`: true pega o time de PvP salvo (aba Build), false usa o
  // time atual de aventura — so o client sabe qual e o atual (gameStateStore),
  // por isso o array de ids vai explicito, nao "escolha no servidor".
  const aceitar = useCallback(async (usarTimeSalvo: boolean) => {
    if (!sessao) return
    await agir(async () => {
      const ids = usarTimeSalvo
        ? (await pvpRpc.meuTimePvp())?.pokemonIds ?? []
        : useGameStateStore.getState().team.map((p) => p.uid)
      if (ids.length === 0) {
        throw new Error(usarTimeSalvo ? 'Seu time de PvP está vazio — monte um na aba Build.' : 'Sua equipe de aventura está vazia.')
      }
      return pvpRpc.aceitarPvpTime(sessao.id, ids)
    })
  }, [agir, sessao])

  const recusarOuCancelar = useCallback(async () => {
    if (!sessao) return
    await agir(() => pvpRpc.encerrarPvp(sessao.id))
  }, [agir, sessao])

  return {
    carregando,
    sessao,
    historico,
    papel,
    outroId,
    ocupado,
    resolvendo,
    convidarPorNick,
    aceitar,
    recusarOuCancelar,
    recarregar,
  }
}
