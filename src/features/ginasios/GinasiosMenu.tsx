// Ginasios (23/10/2026, entrega 4 do design de 19/10). Abas por liga, grade
// dos 18 tipos e o detalhe do ginasio escolhido: lider, equipe dele (visivel
// antes de pagar), taxa, mandato, melhor tempo de destronar e os dois duelos.
// Desafiar cobra a taxa e congela as equipes; o servidor roda a luta e o
// jogador assiste a mesma luta ao vivo na arena.
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Check, Crown, Medal, Users } from '@phosphor-icons/react'
import {
  DESAFIOS_POR_DIA, FAIXAS_DE_GINASIO, REPASSE_DO_LIDER, equipeDoGinasio, partesDoGinasio,
  type TipoDeDuelo,
} from '@/data/ginasios'
import type { ElementType } from '@/data/generated/types'
import { SPECIES } from '@/data/pokes'
import { faceIconUrl } from '@/data/sprites'
import { colorForType } from '@/data/typeColors'
import { sementeDaSessao } from '@/engine/arena'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useAuthStore } from '@/stores/authStore'
import { useToastStore } from '@/stores/toastStore'
import { useConfirmDialogStore } from '@/stores/confirmDialogStore'
import { useUiStore } from '@/stores/uiStore'
import {
  desafiarGinasio, lerEstadoDosGinasios, resolverDesafio,
  type EstadoDosGinasios, type GinasioNoEstado,
} from '@/data/remote/ginasiosRpc'
import { entrarNaArena } from '@/features/arena/arena'
import { create } from 'zustand'
import { BrasaoDeGinasio, METAL_DA_LIGA, nomeDoGinasio } from './BrasaoDeGinasio'
import { DefesaDoGinasio } from './DefesaDoGinasio'
import { EquipeDoDesafio } from './EquipeDoDesafio'
import { HistoricoDoGinasio } from './HistoricoDoGinasio'
import { queryClient } from '@/lib/query-client'
import type { SlotDeEquipe } from '@/components/montador/MontadorDeEquipe'
import { cn } from '@/lib/utils'

const fmt = new Intl.NumberFormat('pt-BR')
const toast = (m: string, tipo: 'success' | 'error' | 'info' = 'info') => useToastStore.getState().pushToast(m, tipo, 'world')

function tempoRestante(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'renovando'
  const h = Math.floor(ms / 3_600_000)
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${Math.floor((ms % 3_600_000) / 60_000)}min`
}
/** Insignia nova: a tela de Ginasios reabre depois da arena e comemora. */
const useComemoracao = create<{ id: string | null }>(() => ({ id: null }))
export const comemorarInsignia = (id: string) => useComemoracao.setState({ id })

const segundosDeLuta = (ticks: number | null) => (ticks == null ? null : Math.round(ticks / 60))

export function GinasiosMenu() {
  const [estado, setEstado] = useState<EstadoDosGinasios | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [faixa, setFaixa] = useState<number>(100)
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const meuId = useAuthStore((s) => s.user?.id ?? null)

  const recarregar = useCallback(async () => {
    try {
      const e = await lerEstadoDosGinasios()
      setEstado(e)
      setErro(null)
      // Desafio que ficou aberto (pagina fechada no meio): resolve sem replay.
      for (const id of e.pendentes) {
        const r = await resolverDesafio(id).catch(() => null)
        if (r) toast(`Desafio pendente resolvido: ${r.resultado === 'vitoria' ? 'vitória' : r.resultado === 'derrota' ? 'derrota' : 'empate'}.`)
      }
      if (e.pendentes.length) setEstado(await lerEstadoDosGinasios())
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    }
  }, [])
  useEffect(() => { void recarregar() }, [recarregar])

  const daFaixa = useMemo(() => (estado?.ginasios ?? []).filter((g) => g.faixa === faixa), [estado, faixa])
  const atual = estado?.ginasios.find((g) => g.id === selecionado) ?? null
  const insignias = useMemo(() => new Set(estado?.insignias ?? []), [estado])
  const comemorando = useComemoracao((s) => s.id)
  useEffect(() => {
    if (!comemorando) return
    const t = setTimeout(() => useComemoracao.setState({ id: null }), 1700)
    return () => clearTimeout(t)
  }, [comemorando])

  if (erro && !estado) return <p className="text-menu-muted">Não foi possível abrir os ginásios: {erro}</p>
  if (!estado) return <p className="text-menu-muted">Carregando ginásios…</p>

  return (
    <div className="relative flex flex-col gap-[.6em]">
      <div className="flex flex-wrap items-center justify-between gap-[.4em] text-[.8em] text-menu-muted">
        <span>Desafios hoje: <b className="text-menu-ink">{estado.desafiosHoje}/{DESAFIOS_POR_DIA}</b></span>
        <span style={{ color: METAL_DA_LIGA[faixa].cor }}><Medal className="inline" weight="fill" aria-hidden /> Insígnias: <b>{estado.insignias.length}/90</b></span>
      </div>
      <div className="flex gap-[.35em] overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Ligas">
        {FAIXAS_DE_GINASIO.map((f) => {
          const metal = METAL_DA_LIGA[f.nivel]
          return (
            <button key={f.nivel} type="button" className="liga-aba" aria-pressed={faixa === f.nivel}
              style={{ '--liga-cor': metal.cor, '--liga-fundo': `linear-gradient(135deg, ${metal.degrade.join(', ')})` } as CSSProperties}
              onClick={() => { setFaixa(f.nivel); setSelecionado(null) }}>
              {f.liga} · {f.nivel}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(4.6em,1fr))] gap-[.3em]">
        {daFaixa.map((g) => {
          const tipoG = g.tipo as ElementType
          const meu = g.liderId != null && g.liderId === meuId
          const tem = insignias.has(g.id)
          const rotulo = meu ? 'Você lidera' : g.liderId ? g.liderNome : tipoG
          return (
            <button key={g.id} type="button" onClick={() => setSelecionado(g.id)} aria-pressed={selecionado === g.id}
              aria-label={`${nomeDoGinasio(tipoG)}, líder ${g.liderNome}${tem ? ', insígnia conquistada' : ''}${meu ? ', você é o líder' : ''}`}
              className={cn('relative flex flex-col items-center gap-[.1em] rounded-[.55em] border p-[.25em] text-[.68em]',
                selecionado === g.id ? 'border-menu-brand bg-menu-wash' : 'border-transparent hover:bg-menu-wash')}>
              <BrasaoDeGinasio tipo={tipoG} faixa={g.faixa} aceso={tem || meu} className="w-[3.4em]" />
              <span className={cn('w-full truncate text-center', meu ? 'text-gold' : tem ? 'text-menu-ink' : 'text-menu-muted')}>{rotulo}</span>
              {tem && (
                <span className="absolute top-[.15em] right-[.15em] flex h-[1.3em] w-[1.3em] items-center justify-center rounded-full bg-[#3fae5a] text-white">
                  <Check weight="bold" aria-hidden />
                </span>
              )}
              {meu && <Crown className="absolute top-[.1em] left-[.2em] text-gold" weight="fill" aria-hidden />}
            </button>
          )
        })}
      </div>

      {atual
        ? <DetalheDoGinasio g={atual} meuId={meuId} desafiosHoje={estado.desafiosHoje} temInsignia={insignias.has(atual.id)} aoMudar={recarregar} />
        : <p className="text-[.8em] text-menu-muted">Escolha um ginásio para ver o líder, a equipe e desafiar.</p>}
      {comemorando && <Comemoracao id={comemorando} />}
    </div>
  )
}

function DetalheDoGinasio({ g, meuId, desafiosHoje, temInsignia, aoMudar }: {
  g: GinasioNoEstado; meuId: string | null; desafiosHoje: number; temInsignia: boolean; aoMudar: () => Promise<void>
}) {
  const ouro = useGameStateStore((s) => s.wallet.gold)
  const [ocupado, setOcupado] = useState(false)
  const faixa = FAIXAS_DE_GINASIO.find((f) => f.nivel === g.faixa)!
  const tipo = g.tipo as ElementType
  const souLider = g.liderId != null && g.liderId === meuId
  const semDesafio = desafiosHoje >= DESAFIOS_POR_DIA
  const semOuro = ouro < g.taxa

  const bloqueio = souLider ? 'Você é o líder deste ginásio.'
    : semDesafio ? 'Você já fez os desafios de hoje.'
      : semOuro ? `Precisa de ${fmt.format(g.taxa)} de ouro.` : null

  async function desafiar(duelo: TipoDeDuelo, slots: SlotDeEquipe[]) {
    setOcupado(true)
    try {
      const d = await desafiarGinasio(g.id, duelo, slots)
      // A taxa ja saiu no servidor: o ouro de la vale antes mesmo da luta resolver.
      useGameStateStore.setState((s) => ({ wallet: { ...s.wallet, gold: Number(d.gold) } }))
      const r = await resolverDesafio(d.desafioId)
      void queryClient.invalidateQueries({ queryKey: ['historico-do-ginasio', g.id] })
      entrarNaArena({
        semente: sementeDaSessao(d.desafioId),
        meuTime: equipeDoGinasio(d.equipeDesafiante, d.teto, `d-${d.desafioId}`),
        rivalTime: equipeDoGinasio(d.equipeLider, d.teto, `l-${d.desafioId}`),
        nomeDoRival: d.liderNome,
        rivalId: d.liderId,
        veredito: r.resultado,
        aoSair: () => {
          const msg = r.resultado === 'vitoria'
            ? (duelo === 'insignia' ? (r.insigniaNova ? `Insígnia ${tipo} (${g.faixa}) conquistada!` : 'Vitória! Você já tinha esta insígnia.')
              : `Vitória em ${segundosDeLuta(r.ticks)}s! Você está na disputa do próximo mandato.`)
            : r.resultado === 'derrota' ? 'Derrota. A taxa não volta.' : 'Empate.'
          toast(msg, r.resultado === 'vitoria' ? 'success' : 'info')
          if (r.resultado === 'vitoria' && duelo === 'insignia' && r.insigniaNova) comemorarInsignia(g.id)
          const ui = useUiStore.getState()
          ui.setHuntContinent('ginasios')
          ui.openScreen('hunts')
        },
      })
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
      await aoMudar()
    } finally {
      setOcupado(false)
    }
  }

  function confirmar(duelo: TipoDeDuelo, slots: SlotDeEquipe[]) {
    useConfirmDialogStore.getState().confirm({
      title: duelo === 'insignia' ? 'Desafiar pela insígnia?' : 'Desafiar para destronar?',
      message: `Taxa de ${fmt.format(g.taxa)} de ouro, que não volta. Se você perder${g.liderId ? `, ${Math.round(REPASSE_DO_LIDER * 100)}% vão para o líder` : ''}. Conta 1 dos ${DESAFIOS_POR_DIA} desafios de hoje.`,
      confirmLabel: 'Desafiar',
      onConfirm: () => void desafiar(duelo, slots),
    })
  }


  return (
    <section className="ginasio-painel flex flex-col gap-[.5em] rounded-[.7em] p-[.6em]" aria-label={`${nomeDoGinasio(tipo)} ${g.faixa}`}
      style={{ '--tipo-cor': colorForType(tipo) } as CSSProperties}>
      <div className="flex items-center gap-[.6em]">
        <BrasaoDeGinasio tipo={tipo} faixa={g.faixa} className="w-[4.2em] shrink-0" />
        <div className="flex min-w-0 flex-col">
          <b className="text-[1.05em]">{nomeDoGinasio(tipo)}</b>
          <span className="text-[.8em]" style={{ color: METAL_DA_LIGA[g.faixa].cor }}>{faixa.liga} · nível {g.faixa}</span>
          {temInsignia && <span className="flex items-center gap-[.2em] text-[.8em] text-gold"><Medal weight="fill" aria-hidden /> Insígnia sua</span>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-[.3em] text-[.8em]">
        <span className="text-menu-muted"><Users className="inline" aria-hidden /> Líder</span>
        <span className="text-right">{g.liderNome}{g.liderId ? '' : ' (NPC)'}</span>
        <span className="text-menu-muted">Taxa</span><span className="text-right text-gold">{fmt.format(g.taxa)}</span>
        <span className="text-menu-muted">Mandato</span><span className="text-right">{tempoRestante(g.mandatoAte)}</span>
        <span className="text-menu-muted">Melhor destronar</span>
        <span className="text-right">{g.candidatoNome ? `${g.candidatoNome} · ${segundosDeLuta(g.candidatoTicks)}s` : '—'}</span>
        {souLider && <><span className="text-menu-muted">Ganhos do mandato</span><span className="text-right text-gold">{fmt.format(g.ganhos ?? 0)}</span></>}
      </div>
      <div>
        <div className="mb-[.25em] text-[.75em] text-menu-muted">{souLider ? 'Sua defesa salva' : 'Equipe do líder'} (POKEs acima de {g.faixa} lutam com os atributos do nível {g.faixa})</div>
        <div className="flex flex-wrap gap-[.3em]">
          {g.equipe.map((p, i) => {
            const url = faceIconUrl(p.species_id, p.is_shiny)
            return (
              <span key={i} className="flex flex-col items-center text-[.65em]">
                {url ? <img src={url} alt={SPECIES[p.species_id]?.name ?? p.species_id} className="h-[2.4em] w-[2.4em] object-contain" />
                  : <span className="h-[2.4em] w-[2.4em] rounded bg-menu-wash" />}
                Lv {Math.min(p.level, g.faixa)}
              </span>
            )
          })}
        </div>
      </div>
      <HistoricoDoGinasio ginasioId={g.id} />
      {souLider
        ? <DefesaDoGinasio g={g} aoSalvar={aoMudar} />
        : <EquipeDoDesafio tipo={tipo} bloqueio={bloqueio} ocupado={ocupado} aoDesafiar={confirmar} />}
    </section>
  )
}

function Comemoracao({ id }: { id: string }) {
  const partes = partesDoGinasio(id)
  if (!partes) return null
  const metal = METAL_DA_LIGA[partes.faixa.nivel]
  return (
    <div className="insignia-comemoracao" role="status" style={{ '--liga-cor': metal.cor } as CSSProperties}>
      <BrasaoDeGinasio tipo={partes.tipo} faixa={partes.faixa.nivel} />
      <p className="text-center font-bold" style={{ color: metal.cor }}>
        Insígnia conquistada<br /><span className="text-[.8em]">{nomeDoGinasio(partes.tipo)} · {partes.faixa.liga}</span>
      </p>
    </div>
  )
}
