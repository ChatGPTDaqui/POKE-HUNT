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
import { GameWindow } from '@/components/game/GameWindow'
import { GameButton, SectionLabel } from '@/components/game/controls'

const MAX_CAPTURES_SHOWN = 40
const fmt = new Intl.NumberFormat('pt-BR')

function formatDuration(totalSeconds: number): string {
  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes}min`
  if (minutes <= 0) return `${hours}h`
  return `${hours}h ${minutes}min`
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between gap-[1em]">
      <span className="text-n400">{label}</span>
      <b className="font-medium" style={color ? { color } : undefined}>{value}</b>
    </div>
  )
}

function ItemList({ itemsMap }: { itemsMap: Record<string, number> }) {
  const entries = Object.entries(itemsMap).filter(([, qty]) => qty > 0)
  if (entries.length === 0) return null
  return (
    <div className="flex flex-col gap-[.15em]">
      {entries.map(([itemId, qty]) => {
        const item = ITEMS[itemId]
        const name = item ? item.name : itemId
        const url = itemIconUrl(itemId)
        return (
          <div key={itemId} className="flex items-center gap-[.4em]">
            {url && <img src={url} alt="" className="h-[1.3em] w-[1.3em] object-contain" />}
            <span>{name} x{qty}</span>
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
    <div className="flex flex-col gap-[.35em]">
      <SectionLabel>CAPTURAS</SectionLabel>
      <div className="grid grid-cols-2 gap-[.35em]">
        {shown.map((c, i) => {
          const species = SPECIES[c.speciesId]
          if (!species) return null
          const url = spriteUrl(c.speciesId, c.isShiny)
          return (
            <div key={i} className="flex items-center gap-[.4em] overflow-hidden rounded-[.35em] border border-n800 px-[.4em] py-[.25em] text-[.8em]">
              {url && <img src={url} alt="" className="h-[1.6em] w-[1.6em] shrink-0 object-contain" />}
              <span className="truncate">
                <PokeNameTag poke={c} species={species} /> Lv{c.level}
              </span>
            </div>
          )
        })}
      </div>
      {captures.length > MAX_CAPTURES_SHOWN && (
        <div className="text-n500">+{captures.length - MAX_CAPTURES_SHOWN} outro(s)...</div>
      )}
    </div>
  )
}

export function OfflineFarmModal({ summary, onClose }: { summary: OfflineSimSummary; onClose: () => void }) {
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
    <GameWindow
      winKey="offline"
      widthEm={26}
      defaultTop="9vh"
      zIndex={51}
      backdrop={{ zIndex: 50 }}
      onClose={onClose}
      header={
        <div className="border-b border-n800 p-[1em]">
          <div className="text-[1.05em] font-medium">Bem-vindo de volta!</div>
          <div className="text-[.8em] text-n400">
            Voce ficou fora por {formatDuration(summary.requestedSeconds)}.
          </div>
        </div>
      }
      footer={
        <div className="flex justify-end">
          <GameButton variant="primary" onClick={onClose}>Fechar</GameButton>
        </div>
      }
    >
      <div className="flex flex-col gap-[.5em]">
        {capNote && <div className="text-n500">{capNote}</div>}
        {summary.stoppedEarly && (
          <div className="text-warn">
            Seu POKE desmaiou e ficou sem Revive para reanimar automaticamente — a farm parou antes do tempo acabar.
          </div>
        )}
        {/* A simulacao tem orcamento de tempo real pra nao travar (nem fazer o
            navegador matar) um aparelho lento replayando horas de combate —
            quando esse orcamento acaba, o relatorio diz isso em vez de so
            mostrar menos progresso do que o tempo fora sugeria. */}
        {summary.truncated && (
          <div className="text-warn">
            A simulacao foi interrompida para nao travar o dispositivo — parte do tempo fora nao foi processada.
          </div>
        )}

        {summary.kills === 0 ? (
          <div className="text-n500">Nada aconteceu enquanto voce esteve fora.</div>
        ) : (
          <>
            <div className="flex flex-col gap-[.15em]">
              {summary.gold > 0 && <StatRow label="Ouro ganho" value={`+${fmt.format(summary.gold)}`} color="var(--color-gold)" />}
              {summary.xp > 0 && <StatRow label="EXP ganho" value={`+${fmt.format(summary.xp)}`} />}
              {summary.pokeLeveledUp && <StatRow label="POKE ativo" value="Subiu de nivel!" color="#7dd3fc" />}
              {summary.trainerLeveledUp && <StatRow label="Treinador" value="Subiu de nivel!" color="#7dd3fc" />}
              {summary.captures.length > 0 && (
                <StatRow label="POKEs capturados" value={String(summary.captures.length)} color="var(--color-ok)" />
              )}
              {summary.shinySeen > 0 && <StatRow label="Shinys avistados" value={String(summary.shinySeen)} color="var(--color-shiny)" />}
              {summary.shinyCaptured > 0 && <StatRow label="Shinys capturados" value={String(summary.shinyCaptured)} color="var(--color-shiny)" />}
            </div>

            <Captures captures={summary.captures} />

            {hasGained && (
              <div className="flex flex-col gap-[.35em]">
                <SectionLabel>ITENS OBTIDOS</SectionLabel>
                <ItemList itemsMap={summary.itemsGained} />
              </div>
            )}

            {hasConsumed && (
              <div className="flex flex-col gap-[.35em]">
                <SectionLabel>CONSUMIVEIS GASTOS ({totalConsumed})</SectionLabel>
                <ItemList itemsMap={summary.itemsConsumed} />
              </div>
            )}

            {(gainedValue > 0 || spentValue > 0) && (
              <div className="flex flex-col gap-[.15em] border-t border-n800 pt-[.5em]">
                <SectionLabel>BALANCO ESTIMADO</SectionLabel>
                {gainedValue > 0 && (
                  <StatRow label="Ganho (ouro + itens + POKEs)" value={`+${fmt.format(Math.round(gainedValue))}`} />
                )}
                {spentValue > 0 && <StatRow label="Gasto (consumiveis)" value={`-${fmt.format(Math.round(spentValue))}`} />}
                <StatRow
                  label="Saldo"
                  value={`${balance >= 0 ? '+' : ''}${fmt.format(Math.round(balance))}`}
                  color={balance >= 0 ? 'var(--color-ok)' : 'var(--color-bad)'}
                />
              </div>
            )}
          </>
        )}
      </div>
    </GameWindow>
  )
}
