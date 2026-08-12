import type { AnyItem } from '@/data/items'
import { ItemTooltip } from '@/components/shared/ItemTooltip'
import { GameButton, GameCard } from '@/components/game/controls'
import { fmt } from '../utils'
import { ItemIcon, QtyInput, AtalhosDeTransacao } from './shared'

export function ItemCompraCard({
  item, owned, gold, qty, ocupado, isPending, onQtyChange, onExecutarAtalho, onComprar,
}: {
  item: AnyItem
  owned: number
  gold: number
  qty: number
  ocupado: boolean
  isPending: boolean
  onQtyChange: (v: number) => void
  onExecutarAtalho: (qtd: number) => void
  onComprar: () => void
}) {
  const maxAffordable = Math.max(1, Math.floor(gold / item.buyPrice))
  const custo = item.buyPrice * qty

  return (
    <GameCard className="flex flex-wrap items-center gap-[.45em] p-[.55em]">
      <ItemTooltip item={item}>
        <span className="cursor-help">
          <ItemIcon itemId={item.id} name={item.name} />
        </span>
      </ItemTooltip>
      <div className="min-w-[6em] flex-1">
        <div className="font-medium">
          {item.name} <span className="text-[.78em] text-n500">(tem: {owned})</span>
        </div>
        <div className="text-[.78em] text-gold">{fmt.format(item.buyPrice)} ouro</div>
      </div>
      <QtyInput value={qty} max={maxAffordable} onChange={onQtyChange} />
      <AtalhosDeTransacao
        max={Math.floor(gold / item.buyPrice)}
        verbo="Comprar"
        ocupado={ocupado}
        onExecutar={onExecutarAtalho}
      />
      {/* Montante final ANTES de confirmar (pedido explicito). Fica em
          linha propria e nao so dentro do botao: com x1000 selecionado o
          numero passa de 6 digitos e o rotulo do botao quebrava. */}
      <span className="w-full text-[.78em] text-n400 sm:w-auto">
        Total: <b className={custo > gold ? 'text-bad' : 'text-gold'}>{fmt.format(custo)}</b>
        {custo > gold && <span className="text-bad"> · ouro insuficiente</span>}
      </span>
      <GameButton disabled={ocupado || custo > gold} onClick={onComprar}>
        {isPending ? '...' : 'Comprar'}
      </GameButton>
    </GameCard>
  )
}
