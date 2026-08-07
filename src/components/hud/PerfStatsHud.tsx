// Port de js/ui/panels/PerfStatsHUD.js — painel inferior-esquerdo com as
// taxas de farm da sessao atual. `getPerfStats` deriva as taxas por hora dos
// totais acumulados em gameState.perfStats (persistido).
//
// Re-renderiza num timer proprio de 1s em vez de a cada frame: o valor so
// muda de forma perceptivel nessa escala (e o denominador e tempo decorrido,
// que avanca sozinho mesmo sem kill nenhum), entao 60fps aqui seria puro
// desperdicio.
import { useEffect, useState } from 'react'
import { getPerfStats } from '@/engine/systems/statsTracker'
import { useGameStateStore } from '@/stores/gameStateStore'
import { controller } from '@/engine/controller'
import { Button } from '@/components/ui/button'

// Ouro/H e XP/H passam facil das dezenas/centenas de milhares em nivel alto —
// abreviar com k/M mantem o painel legivel (10000 -> "10k", 1250000 ->
// "1.3M"). O ".0" final e removido: um numero redondo de milhares nao precisa
// da casa decimal.
function formatRate(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(value)
}

export function PerfStatsHud() {
  const perfStats = useGameStateStore((s) => s.perfStats)
  const [, forceTick] = useState(0)

  // O tempo decorrido entra no calculo, entao o painel precisa recalcular
  // mesmo quando `perfStats` (os totais) nao mudou.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const stats = getPerfStats({ perfStats } as Parameters<typeof getPerfStats>[0])

  return (
    <div className="pointer-events-auto w-40 rounded-lg border bg-background/85 px-2.5 py-2 text-xs shadow-lg backdrop-blur-sm">
      <Row label="Ouro/H" value={formatRate(stats.goldPerHour)} />
      <Row label="XP/H" value={formatRate(stats.xpPerHour)} />
      <Row label="Mobs/H" value={String(stats.mobsPerHour)} />
      <Row label="Shinys" value={String(stats.shinys)} />
      <Button
        variant="outline"
        size="sm"
        className="mt-1.5 h-6 w-full text-[11px]"
        onClick={() => controller.resetPerfStats()}
      >
        Resetar
      </Button>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
