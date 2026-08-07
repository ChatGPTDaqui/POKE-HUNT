// Port de js/ui/panels/offlineFarmModal.js — relatorio mostrado uma vez no
// boot quando o Farm Offline detecta que o save ficou fechado por um tempo
// relevante. Toda linha do corpo some quando o valor e 0 (pedido explicito do
// usuario) em vez de mostrar uma parede de zeros.
import { SPECIES } from '@/data/pokes'
import { ITEMS } from '@/data/items'
import { spriteUrl, itemIconUrl } from '@/data/sprites'
import { pokemonSellValue } from '@/engine/systems/economySystem'
import type { OfflineSimSummary } from '@/engine/systems/offlineSimSystem'
import { PokeNameTag } from '@/components/shared/PokeNameTag'
import { useDraggable } from '@/hooks/useDraggable'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const MAX_CAPTURES_SHOWN = 40

function formatDuration(totalSeconds: number): string {
  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes}min`
  if (minutes <= 0) return `${hours}h`
  return `${hours}h ${minutes}min`
}

function StatRow({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={valueClassName}>{value}</span>
    </div>
  )
}

function ItemList({ itemsMap }: { itemsMap: Record<string, number> }) {
  const entries = Object.entries(itemsMap).filter(([, qty]) => qty > 0)
  if (entries.length === 0) return null
  return (
    <div className="space-y-0.5">
      {entries.map(([itemId, qty]) => {
        const item = ITEMS[itemId]
        const name = item ? item.name : itemId
        const url = itemIconUrl(itemId)
        return (
          <div key={itemId} className="flex items-center gap-1.5">
            {url && <img src={url} alt={name} className="h-4 w-4 object-contain" />}
            <span>
              {name} x{qty}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function estimatedValueGained(summary: OfflineSimSummary): number {
  const itemsValue = Object.entries(summary.itemsGained).reduce(
    (sum, [id, qty]) => sum + (ITEMS[id]?.sellPrice ?? 0) * qty,
    0,
  )
  const pokeValue = summary.captures.reduce((sum, c) => {
    const species = SPECIES[c.speciesId]
    return species ? sum + pokemonSellValue(c.level, species.baseExp, c.rarity) : sum
  }, 0)
  return summary.gold + itemsValue + pokeValue
}

// Stones (data/stones.ts) nao tem `buyPrice` — nunca sao compraveis, so
// dropam. O JS original lia `ITEMS[id]?.buyPrice || 0` e engolia isso como 0
// silenciosamente; aqui o narrow e explicito, mesmo resultado.
function buyPriceOf(itemId: string): number {
  const item = ITEMS[itemId]
  return item && 'buyPrice' in item ? item.buyPrice : 0
}

function estimatedValueSpent(summary: OfflineSimSummary): number {
  return Object.entries(summary.itemsConsumed).reduce((sum, [id, qty]) => sum + buyPriceOf(id) * qty, 0)
}

function Captures({ captures }: { captures: OfflineSimSummary['captures'] }) {
  if (captures.length === 0) return null
  const shown = captures.slice(0, MAX_CAPTURES_SHOWN)
  return (
    <div className="space-y-1">
      <div className="text-[10px] tracking-wider text-muted-foreground">CAPTURAS</div>
      <div className="grid grid-cols-2 gap-1">
        {shown.map((c, i) => {
          const species = SPECIES[c.speciesId]
          if (!species) return null
          const url = spriteUrl(c.speciesId, c.isShiny)
          return (
            <div key={i} className="flex items-center gap-1.5 rounded-md border px-1.5 py-1">
              {url && <img src={url} alt={species.name} className="h-6 w-6 object-contain" />}
              <span className="truncate text-[11px]">
                <PokeNameTag poke={c} species={species} /> Lv{c.level}
              </span>
            </div>
          )
        })}
      </div>
      {captures.length > MAX_CAPTURES_SHOWN && (
        <div className="text-muted-foreground">+{captures.length - MAX_CAPTURES_SHOWN} outro(s)...</div>
      )}
    </div>
  )
}

export function OfflineFarmModal({ summary, onClose }: { summary: OfflineSimSummary; onClose: () => void }) {
  const { elementRef, handleRef } = useDraggable<HTMLDivElement, HTMLDivElement>()

  const capNote =
    !summary.stoppedEarly && !summary.truncated && summary.requestedSeconds > summary.simulatedSeconds + 1
      ? `Limitado a ${formatDuration(summary.simulatedSeconds)} de simulacao (o resto do tempo fora nao gerou progresso).`
      : null

  const gainedValue = estimatedValueGained(summary)
  const spentValue = estimatedValueSpent(summary)
  const balance = gainedValue - spentValue
  const totalConsumed = Object.values(summary.itemsConsumed).reduce((a, b) => a + b, 0)
  const hasGained = Object.values(summary.itemsGained).some((q) => q > 0)
  const hasConsumed = totalConsumed > 0

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent ref={elementRef} className="max-h-[85vh] overflow-y-auto text-xs sm:max-w-md">
        <div ref={handleRef} className="cursor-move">
          <DialogTitle>Bem-vindo de volta!</DialogTitle>
          <div className="text-muted-foreground">Voce ficou fora por {formatDuration(summary.requestedSeconds)}.</div>
        </div>

        {capNote && <div className="text-muted-foreground">{capNote}</div>}
        {summary.stoppedEarly && (
          <div className="text-orange-400">
            Seu POKE desmaiou e ficou sem Revive para reanimar automaticamente — a farm parou antes do tempo acabar.
          </div>
        )}
        {/* A simulacao tem orcamento de tempo real pra nao travar (nem fazer
            o navegador matar) um aparelho lento replayando horas de combate —
            quando esse orcamento acaba, o relatorio diz isso em vez de so
            mostrar menos progresso do que o tempo fora sugeria. */}
        {summary.truncated && (
          <div className="text-orange-400">
            A simulacao foi interrompida para nao travar o dispositivo — parte do tempo fora nao foi processada.
          </div>
        )}

        {summary.kills === 0 ? (
          <div className="text-muted-foreground">Nada aconteceu enquanto voce esteve fora.</div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-0.5">
              {summary.gold > 0 && <StatRow label="Ouro ganho" value={`+${summary.gold}`} />}
              {summary.xp > 0 && <StatRow label="EXP ganho" value={`+${summary.xp}`} />}
              {summary.pokeLeveledUp && <StatRow label="POKE ativo" value="Subiu de nivel!" />}
              {summary.trainerLeveledUp && <StatRow label="Treinador" value="Subiu de nivel!" />}
              {summary.captures.length > 0 && (
                <StatRow label="POKEs capturados" value={String(summary.captures.length)} />
              )}
              {summary.shinySeen > 0 && <StatRow label="Shinys avistados" value={String(summary.shinySeen)} />}
              {summary.shinyCaptured > 0 && <StatRow label="Shinys capturados" value={String(summary.shinyCaptured)} />}
            </div>

            <Captures captures={summary.captures} />

            {hasGained && (
              <div className="space-y-1">
                <div className="text-[10px] tracking-wider text-muted-foreground">ITENS OBTIDOS</div>
                <ItemList itemsMap={summary.itemsGained} />
              </div>
            )}

            {hasConsumed && (
              <div className="space-y-1">
                <div className="text-[10px] tracking-wider text-muted-foreground">
                  CONSUMIVEIS GASTOS ({totalConsumed})
                </div>
                <ItemList itemsMap={summary.itemsConsumed} />
              </div>
            )}

            {(gainedValue > 0 || spentValue > 0) && (
              <div className="space-y-0.5">
                <div className="text-[10px] tracking-wider text-muted-foreground">BALANCO ESTIMADO</div>
                {gainedValue > 0 && (
                  <StatRow label="Ganho (ouro + itens + POKEs)" value={`+${Math.round(gainedValue)}`} />
                )}
                {spentValue > 0 && <StatRow label="Gasto (consumiveis)" value={`-${Math.round(spentValue)}`} />}
                <StatRow
                  label="Saldo"
                  value={`${balance >= 0 ? '+' : ''}${Math.round(balance)}`}
                  valueClassName={balance >= 0 ? 'text-emerald-400' : 'text-destructive'}
                />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
