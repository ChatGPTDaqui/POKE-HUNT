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
    // Mesma logica de 2 linhas do ItemCompraCard: info (icone+nome+trava) na
    // linha de cima, controles de transacao na de baixo — evita 7 elementos
    // competindo pelo mesmo flex-wrap.
    <GameCard className="flex flex-col gap-[.4em] p-[.55em]">
      <div className="flex items-center gap-[.45em]">
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
            unidade <span className="text-gold">{fmt.format(item.sellPrice)}</span>
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
      </div>
      {!locked && (
        <>
          <div className="flex items-center gap-[.35em]">
            <QtyInput value={qty} max={owned} onChange={onQtyChange} />
            <AtalhosDeTransacao max={owned} verbo="Vender" ocupado={ocupado} onExecutar={onExecutarAtalho} />
          </div>
          {/* Quanto entra no bolso vai DENTRO do rotulo, mesmo motivo do card de
              compra: com os alvos em 44px, total e botoes em linhas separadas
              faziam cada item ocupar meia tela de celular. */}
          <div className="flex gap-[.35em]">
            <GameButton
              block
              variant="primary"
              disabled={ocupado}
              onClick={onVender}
              className="justify-center"
            >
              Vender {fmt.format(qty)} · {fmt.format(item.sellPrice * qty)}
            </GameButton>
            {/* "Vender tudo" POR ITEM (pedido explicito). O "Vender Tudo"
                global do topo esvazia a mochila inteira — sao coisas
                diferentes e a confusao entre elas custa caro. */}
            <GameButton
              variant="accent"
              disabled={ocupado}
              title={`Vender as ${owned} unidades por ${fmt.format(item.sellPrice * owned)} de ouro`}
              onClick={onVenderTudo}
              className="justify-center whitespace-nowrap"
            >
              Tudo · {fmt.format(item.sellPrice * owned)}
            </GameButton>
          </div>
        </>
      )}
    </GameCard>
  )
}
