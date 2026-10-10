// Diário na HUD: login do mês e metas do dia (10/10/2026).
//
// A faixa segue a regra do topo da tela, "um objetivo por vez": durante os
// Primeiros Passos ela só aparece quando há prêmio para coletar; depois da
// cadeia, mostra também a meta do dia em andamento. Tocar abre o Diário
// (calendário do mês e as três metas).
import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, Check, Gift } from '@phosphor-icons/react'
import { DIAS_ESPECIAIS, METAS_DO_DIA, diaDeBrasilia, recompensaDaMeta, recompensaDoLogin, type ItemDoDiario } from '@/data/diario'
import { PRIMEIROS_PASSOS, type RecompensaDoPasso } from '@/data/primeirosPassos'
import { useDiarioStore } from '@/stores/diarioStore'
import { usePassosStore } from '@/stores/passosStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'
import { pedirAcao, liquidar } from '@/data/remote/autoridade'
import { servidorAtivo } from '@/data/remote/servidor'
import { Meter } from '@/components/game/controls'
import { Sheet } from '@/components/game/Sheet'
import { cn } from '@/lib/utils'
import { textoDaRecompensa } from './CartaoDoPasso'

const DIAS_DO_CALENDARIO = 28

function useAbatesHoje(): number {
  const base = useDiarioStore(s => s.abatesBase)
  const total = useGameStateStore(s => Object.values(s.pokedexKills).reduce((n, k) => n + (k?.normal ?? 0) + (k?.shiny ?? 0), 0))
  return Math.max(0, total - base)
}

async function coletar(item: ItemDoDiario, recompensa: RecompensaDoPasso): Promise<void> {
  // Metas leem os abates GRAVADOS: liquidar a caçada antes põe no banco os da tela.
  if (item !== 'login') await liquidar().catch(() => {})
  const ok = await pedirAcao({ tipo: 'coletarDiario', item }, () => {})
  // Recarrega sempre: em sucesso para marcar, em recusa ("já coletado" de outra
  // aba, virada do dia) para a tela parar de oferecer o que não vale mais.
  await useDiarioStore.getState().abrir()
  if (ok) useToastStore.getState().pushToast(`Diário: ${textoDaRecompensa(recompensa)}`, 'success', 'world')
}

/** O que a faixa oferece agora: login, meta pronta, ou a meta em andamento. */
function useOferta() {
  const coletados = useDiarioStore(s => s.coletados)
  const loginsNoMes = useDiarioStore(s => s.loginsNoMes)
  const nivel = useGameStateStore(s => s.trainer.level)
  const abates = useAbatesHoje()
  return useMemo(() => {
    if (!coletados.has('login')) {
      const k = loginsNoMes + 1
      return { tipo: 'pronto' as const, item: 'login' as const, titulo: `Login do mês: dia ${k}`, recompensa: recompensaDoLogin(k, nivel) }
    }
    const pronta = METAS_DO_DIA.find(m => !coletados.has(m.id) && abates >= m.alvo)
    if (pronta) return { tipo: 'pronto' as const, item: pronta.id, titulo: `Meta do dia: ${pronta.alvo} abates`, recompensa: recompensaDaMeta(pronta.id, nivel) }
    const proxima = METAS_DO_DIA.find(m => !coletados.has(m.id))
    if (proxima) return { tipo: 'andando' as const, item: proxima.id, titulo: `Meta do dia: ${proxima.alvo} abates`, alvo: proxima.alvo, abates, recompensa: recompensaDaMeta(proxima.id, nivel) }
    return null
  }, [coletados, loginsNoMes, nivel, abates])
}

export function FaixaDoDiario() {
  const carregado = useDiarioStore(s => s.carregado)
  const dia = useDiarioStore(s => s.dia)
  const passosFeitos = usePassosStore(s => s.reivindicados.size >= PRIMEIROS_PASSOS.length)
  const oferta = useOferta()
  const [coletando, setColetando] = useState(false)

  // Abre o dia no boot e de novo quando vira a meia-noite de Brasília com o
  // jogo aberto — senão o jogador ficaria preso no diário de ontem.
  useEffect(() => {
    if (!servidorAtivo()) return
    if (!carregado) { void useDiarioStore.getState().abrir(); return }
    const id = setInterval(() => { if (diaDeBrasilia() !== useDiarioStore.getState().dia) void useDiarioStore.getState().abrir() }, 60_000)
    return () => clearInterval(id)
  }, [carregado, dia])

  if (!carregado || !oferta) return null
  if (oferta.tipo === 'andando' && !passosFeitos) return null

  return (
    <>
      <div className={cn(
        'pointer-events-auto flex w-[min(100%,24em)] items-center gap-[.4em] rounded-b border-x border-b bg-n900/92 px-[.55em] py-[.3em] text-[.78em]',
        oferta.tipo === 'pronto' ? 'border-ok/60' : 'border-n800',
      )}>
        <button type="button" onClick={() => useDiarioStore.getState().abrirPainel()} className="flex min-w-0 flex-1 items-center gap-[.4em] text-left" aria-label={`Abrir o Diário: ${oferta.titulo}`}>
          <CalendarCheck weight="fill" className="shrink-0 text-[1.2em] text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-[.4em]">
              <span className="truncate font-medium text-n100">{oferta.titulo}</span>
              {oferta.tipo === 'andando' && <span className="ml-auto shrink-0 tabular-nums text-n300">{Math.min(oferta.abates, oferta.alvo)}/{oferta.alvo}</span>}
            </div>
            {oferta.tipo === 'andando' && <Meter pct={oferta.abates / oferta.alvo * 100} height=".28em" color="var(--color-primary)" className="my-[.2em]" />}
            <div className="flex items-center gap-[.3em] text-[.9em] text-n400">
              <Gift weight="fill" className="shrink-0 text-warn" aria-hidden />
              <span className="truncate">{textoDaRecompensa(oferta.recompensa)}</span>
            </div>
          </div>
        </button>
        {oferta.tipo === 'pronto' && (
          <button type="button" disabled={coletando}
            onClick={async () => { setColetando(true); try { await coletar(oferta.item, oferta.recompensa) } finally { setColetando(false) } }}
            className="jogo-botao shrink-0 rounded-[.5em] bg-ok px-[.7em] py-[.45em] font-bold text-n950 disabled:opacity-60">
            {coletando ? '...' : 'Coletar'}
          </button>
        )}
      </div>
    </>
  )
}

/**
 * Quantos prêmios do Diário estão prontos agora (login do dia + metas batidas).
 * Alimenta o selo do item "Diário" no menu Mais e o do próprio botão Mais.
 */
export function usePremiosProntosDoDiario(): number {
  const carregado = useDiarioStore(s => s.carregado)
  const coletados = useDiarioStore(s => s.coletados)
  const abates = useAbatesHoje()
  if (!carregado) return 0
  return Number(!coletados.has('login')) + METAS_DO_DIA.filter(m => !coletados.has(m.id) && abates >= m.alvo).length
}

/**
 * O painel do Diário, montado pela HUD e não pela faixa: a faixa some quando não
 * há nada para coletar durante os Primeiros Passos, e o painel precisa abrir
 * também pelo menu Mais nesse momento.
 */
export function PainelDoDiario() {
  const aberto = useDiarioStore(s => s.painelAberto)
  const carregado = useDiarioStore(s => s.carregado)
  if (!aberto || !carregado) return null
  return <SheetDoDiario onClose={() => useDiarioStore.getState().fecharPainel()} />
}

function SheetDoDiario({ onClose }: { onClose: () => void }) {
  const coletados = useDiarioStore(s => s.coletados)
  const loginsNoMes = useDiarioStore(s => s.loginsNoMes)
  const nivel = useGameStateStore(s => s.trainer.level)
  const abates = useAbatesHoje()
  const [coletando, setColetando] = useState<string | null>(null)
  const logouHoje = coletados.has('login')

  const acao = (item: ItemDoDiario, recompensa: RecompensaDoPasso) => async () => {
    setColetando(item)
    try { await coletar(item, recompensa) } finally { setColetando(null) }
  }

  return (
    <Sheet winKey="diario" snap="conteudo" zIndex={33} onClose={onClose} title="Diário">
      <h3 className="mb-[.3em] text-[.85em] font-medium text-n200">Login do mês · {loginsNoMes} dia(s) coletado(s)</h3>
      <p className="mb-[.5em] text-[.75em] text-n500">Um prêmio por dia em que você entra. Perder um dia não zera: o próximo prêmio te espera. Recomeça no dia 1 de cada mês.</p>
      <div className="grid grid-cols-7 gap-[.3em]">
        {Array.from({ length: DIAS_DO_CALENDARIO }, (_, i) => {
          const k = i + 1
          const feito = k <= loginsNoMes
          const hoje = !logouHoje && k === loginsNoMes + 1
          const especial = (DIAS_ESPECIAIS as readonly number[]).includes(k)
          return (
            <div key={k} className={cn(
              'flex aspect-square flex-col items-center justify-center rounded-[.4em] border text-[.7em]',
              feito ? 'border-ok/50 bg-ok/15 text-ok' : hoje ? 'border-ok bg-n800 text-n100' : 'border-n800 bg-n900 text-n500',
              especial && !feito && 'border-warn/60 text-warn',
            )}>
              {feito ? <Check weight="bold" aria-label={`Dia ${k} coletado`} /> : especial ? <Gift weight="fill" aria-hidden /> : null}
              <span>{k}</span>
            </div>
          )
        })}
      </div>
      {!logouHoje && (
        <button type="button" disabled={coletando != null}
          onClick={acao('login', recompensaDoLogin(loginsNoMes + 1, nivel))}
          className="jogo-botao mt-[.5em] w-full rounded-[.5em] bg-ok px-[.7em] py-[.45em] text-[.85em] font-bold text-n950 disabled:opacity-60">
          Coletar dia {loginsNoMes + 1}: {textoDaRecompensa(recompensaDoLogin(loginsNoMes + 1, nivel))}
        </button>
      )}
      <p className="mt-[.4em] text-[.72em] text-n500">Dias 7, 14, 21 e 28 têm prêmio especial (o dia 28 dá 100 Ultra Balls e 5 Max Revives).</p>

      <h3 className="mt-[.8em] mb-[.3em] text-[.85em] font-medium text-n200">Metas do dia · {abates} abates hoje</h3>
      <p className="mb-[.4em] text-[.75em] text-n500">Contam os abates desde a sua primeira entrada do dia, inclusive a caçada que roda com o jogo fechado. Viram à meia-noite (Brasília).</p>
      <div className="flex flex-col gap-[.4em]">
        {METAS_DO_DIA.map(m => {
          const feita = coletados.has(m.id)
          const pronta = !feita && abates >= m.alvo
          const r = recompensaDaMeta(m.id, nivel)
          return (
            <div key={m.id} className="rounded-[.5em] border border-n800 p-[.45em] text-[.8em]">
              <div className="flex items-baseline gap-[.4em]">
                <span className="font-medium text-n100">Vença {m.alvo} selvagens</span>
                <span className="ml-auto tabular-nums text-n300">{feita ? 'Coletada' : `${Math.min(abates, m.alvo)}/${m.alvo}`}</span>
              </div>
              <Meter pct={feita ? 100 : abates / m.alvo * 100} height=".28em" color={feita || pronta ? 'var(--color-ok)' : 'var(--color-primary)'} className="my-[.25em]" />
              <div className="flex items-center gap-[.4em]">
                <span className="min-w-0 flex-1 truncate text-[.9em] text-n400">{textoDaRecompensa(r)}</span>
                {pronta && (
                  <button type="button" disabled={coletando != null} onClick={acao(m.id, r)}
                    className="jogo-botao shrink-0 rounded-[.4em] bg-ok px-[.6em] py-[.25em] font-bold text-n950 disabled:opacity-60">
                    {coletando === m.id ? '...' : 'Coletar'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}
