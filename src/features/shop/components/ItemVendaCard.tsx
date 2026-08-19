import { LockSimple, LockSimpleOpen } from '@phosphor-icons/react'
import type { AnyItem } from '@/data/items'
import { ItemTooltip } from '@/components/shared/ItemTooltip'
import { GameButton, GameCard, GameIconButton } from '@/components/game/controls'
import { fmt, fmtCurto } from '../utils'
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
    // Duas faixas, como no ItemCompraCard: identidade + "vender tudo" em cima,
    // transacao em baixo. "Tudo" subiu porque a linha de cima so tinha texto e
    // um icone de trava, e a de baixo ja carregava campo, tres atalhos e o
    // botao de confirmar.
    <GameCard className="flex flex-col gap-[.35em] p-[.45em]">
      <div className="flex items-center gap-[.45em]">
        <ItemTooltip item={item}>
          <span className="cursor-help">
            <ItemIcon itemId={itemId} name={item.name} />
          </span>
        </ItemTooltip>
        {/* Nome sozinho na primeira linha, com `truncate`: com a quantidade
            junto, "Awakening x99999" quebrava em duas e o card de um item
            ficava 20px mais alto que o do vizinho. Agora toda linha da lista
            tem a mesma altura. */}
        <div className="min-w-[5em] flex-1">
          <div className="truncate font-medium">{item.name}</div>
          <div className="truncate text-[.78em] text-n500">
            x{fmt.format(owned)} · <span className="text-gold">{fmt.format(item.sellPrice)}</span> cada
          </div>
        </div>
        {/* "Vender tudo" POR ITEM (pedido explicito). O "Vender Tudo" global do
            topo esvazia a mochila inteira — sao coisas diferentes e a confusao
            entre elas custa caro. */}
        {!locked && (
          <GameButton
            variant="accent"
            disabled={ocupado}
            title={`Vender as ${owned} unidades por ${fmt.format(item.sellPrice * owned)} de ouro`}
            onClick={onVenderTudo}
            className="min-w-0 shrink justify-center px-[.4em]"
          >
            <span className="min-w-0 truncate">Tudo · {fmtCurto(item.sellPrice * owned)}</span>
          </GameButton>
        )}
        <GameIconButton
          variant="ghost"
          title={locked ? 'Destrancar' : 'Trancar'}
          aria-label={locked ? 'Destrancar' : 'Trancar'}
          className={locked ? 'text-gold' : undefined}
          onClick={onToggleLock}
        >
          {locked ? <LockSimple weight="fill" /> : <LockSimpleOpen />}
        </GameIconButton>
      </div>
      {!locked && (
        <div className="flex items-center gap-[.35em]">
          <QtyInput value={qty} max={owned} onChange={onQtyChange} />
          <AtalhosDeTransacao max={owned} verbo="Vender" ocupado={ocupado} onExecutar={onExecutarAtalho} />
          {/* Quanto entra no bolso vai DENTRO do rotulo. `flex-1 min-w-0` e nao
              `block`: `block` e `w-full` e, numa fileira com os atalhos, a soma
              passa de 100% e o botao vaza pela borda do card. */}
          <GameButton
            variant="primary"
            disabled={ocupado}
            onClick={onVender}
            className="min-w-0 flex-1 justify-center overflow-hidden px-[.4em]"
          >
            <span className="min-w-0 truncate">Vender {fmt.format(qty)} · {fmt.format(item.sellPrice * qty)}</span>
          </GameButton>
        </div>
      )}
    </GameCard>
  )
}
