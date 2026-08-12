import { LockSimple, LockSimpleOpen } from '@phosphor-icons/react'
import type { AnyItem } from '@/data/items'
import { ItemTooltip } from '@/components/shared/ItemTooltip'
import { GameButton, GameCard, GameIconButton } from '@/components/game/controls'
import { fmt } from '../utils'
import { ItemIcon, QtyInput, AtalhosDeTransacao } from './shared'

export function ItemVendaCard({
  itemId, item, owned, locked, qty, ocupado, onQtyChange, onToggleLock, onExecutarAtalho, onVender, onVenderTudo,
}: {
  itemId: string
  item: AnyItem
  owned: number
  locked: boolean
  qty: number
  ocupado: boolean
  onQtyChange: (v: number) => void
  onToggleLock: () => void
  onExecutarAtalho: (qtd: number) => void
  onVender: () => void
  onVenderTudo: () => void
}) {
  return (
    <GameCard className="flex flex-wrap items-center gap-[.45em] p-[.55em]">
      <ItemTooltip item={item}>
        <span className="cursor-help">
          <ItemIcon itemId={itemId} name={item.name} />
        </span>
      </ItemTooltip>
      <div className="min-w-[6em] flex-1">
        <div className="font-medium">
          {item.name} <span className="text-n400">x{owned}</span>
        </div>
        <div className="text-[.78em] text-n500">
          Venda: <span className="text-gold">{fmt.format(item.sellPrice)} ouro</span>
        </div>
      </div>
      <GameIconButton
        variant="ghost"
        title={locked ? 'Destrancar' : 'Trancar'}
        aria-label={locked ? 'Destrancar' : 'Trancar'}
        className={locked ? 'text-gold' : undefined}
        onClick={onToggleLock}
      >
        {locked ? <LockSimple weight="fill" /> : <LockSimpleOpen />}
      </GameIconButton>
      {!locked && (
        <>
          <QtyInput value={qty} max={owned} onChange={onQtyChange} />
          <AtalhosDeTransacao max={owned} verbo="Vender" ocupado={ocupado} onExecutar={onExecutarAtalho} />
          <span className="w-full text-[.78em] text-n400 sm:w-auto">
            Recebe: <b className="text-gold">{fmt.format(item.sellPrice * qty)}</b>
          </span>
          <GameButton disabled={ocupado} onClick={onVender}>
            Vender
          </GameButton>
          {/* "Vender tudo" POR ITEM (pedido explicito). O "Vender Tudo"
              global do topo esvazia a mochila inteira — sao coisas
              diferentes e a confusao entre elas custa caro. */}
          <GameButton
            variant="accent"
            disabled={ocupado}
            title={`Vender as ${owned} unidades por ${fmt.format(item.sellPrice * owned)} de ouro`}
            onClick={onVenderTudo}
          >
            Vender tudo ({fmt.format(item.sellPrice * owned)})
          </GameButton>
        </>
      )}
    </GameCard>
  )
}
