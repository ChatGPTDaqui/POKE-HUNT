// Taxas de farm da sessao (Ouro/h, XP/h, Mobs/h, Shinys).
//
// Duas apresentacoes do MESMO dado, escolhidas por breakpoint no GameShell:
// `RatesCard` (coluna, ao lado do POKE ativo) some em telas estreitas e da
// lugar ao `RatesChip` (linha unica, dentro do bloco central) — sem o chip, a
// unica leitura de "estou ganhando quanto por hora" desapareceria no celular.
//
// Re-renderiza num timer proprio de 1s em vez de a cada frame: o denominador e
// tempo decorrido, que avanca sozinho mesmo sem kill nenhum, mas so muda de
// forma perceptivel nessa escala.
import { useEffect, useState } from 'react'
import { getPerfStats } from '@/engine/systems/statsTracker'
import { useGameStateStore } from '@/stores/gameStateStore'
import { controller } from '@/engine/controller'
import { useUiStore } from '@/stores/uiStore'
import { ChartLineUp } from '@phosphor-icons/react'
import { GameButton } from '@/components/game/controls'

// Ouro/H e XP/H passam facil das centenas de milhares em nivel alto — abreviar
// mantem o painel legivel. O ".0" final e removido: um numero redondo de
// milhares nao precisa da casa decimal.
function formatRate(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(value)
}

function useRates() {
  const perfStats = useGameStateStore((s) => s.perfStats)
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return getPerfStats({ perfStats } as Parameters<typeof getPerfStats>[0])
}

export function RatesCard() {
  const stats = useRates()
  const abrirAnalyzer = useUiStore((s) => s.setAnalyzerOpen)
  return (
    // O corpo do card e clicavel e abre o Hunt Analyzer (pedido explicito de
    // "estatisticas de caca clicaveis"). O botao "Resetar" fica FORA da area
    // clicavel: ele e destrutivo (zera a amostra) e nao pode ser acionado por
    // engano por quem so queria ver os detalhes.
    <div className="hud-surface pointer-events-auto flex flex-col gap-[.2em] rounded-lg border border-n800 px-[.8em] py-[.6em] text-[.75em] text-n300">
      <button
        type="button"
        data-keep-open
        title="Abrir o Hunt Analyzer"
        onClick={() => abrirAnalyzer(true)}
        className="flex cursor-pointer flex-col gap-[.2em] rounded-[.35em] text-left font-[inherit] text-[inherit] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        <Row label="Gold/h" value={formatRate(stats.goldPerHour)} color="var(--color-gold)" />
        <Row label="XP/h" value={formatRate(stats.xpPerHour)} />
        <Row label="Mobs/h" value={String(stats.mobsPerHour)} />
        <Row label="Shinys" value={String(stats.shinys)} color="var(--color-shiny)" />
        <span className="mt-[.1em] flex items-center gap-[.25em] text-[.9em] text-n500">
          <ChartLineUp /> detalhes
        </span>
      </button>
      <GameButton
        variant="ghost"
        className="mt-[.2em] justify-center text-[.9em]"
        onClick={() => controller.resetPerfStats()}
      >
        Resetar
      </GameButton>
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between gap-[1em]">
      <span className="text-n500">{label}</span>
      <b className="font-medium tabular-nums" style={color ? { color } : undefined}>
        {value}
      </b>
    </div>
  )
}

export function RatesChip() {
  const stats = useRates()
  const abrirAnalyzer = useUiStore((s) => s.setAnalyzerOpen)
  return (
    <button
      type="button"
      data-keep-open
      title="Abrir o Hunt Analyzer"
      onClick={() => abrirAnalyzer(true)}
      className="flex cursor-pointer items-center gap-[.8em] rounded-full border border-n800 bg-background/80 px-[.8em] py-[.4em] font-[inherit] text-[.72em] text-n400">
      <span>
        Gold/h <b className="font-medium text-gold">{formatRate(stats.goldPerHour)}</b>
      </span>
      <span>
        XP/h <b className="font-medium text-n200">{formatRate(stats.xpPerHour)}</b>
      </span>
      <span>
        Mobs/h <b className="font-medium text-n200">{stats.mobsPerHour}</b>
      </span>
    </button>
  )
}
