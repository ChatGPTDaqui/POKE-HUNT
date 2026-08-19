import type { GeneratedItem } from '@/data/items'
import { ItemTooltip } from '@/components/shared/ItemTooltip'
import { GameButton, GameCard } from '@/components/game/controls'
import { fmt } from '../utils'
import { ItemIcon, QtyInput, AtalhosDeTransacao } from './shared'

export function ItemCompraCard({
  item, owned, gold, qty, ocupado, isPending, onQtyChange, onExecutarAtalho, onComprar,
}: {
  item: GeneratedItem
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

  const semOuro = custo > gold

  return (
    // DUAS faixas: identidade / transacao. Eram tres, e a do meio (quantidade)
    // usava 192px dos 343 disponiveis — 150px de vidro vazio ao lado dos
    // atalhos enquanto o botao de confirmar gastava uma faixa inteira de 44px
    // logo abaixo.
    <GameCard className="flex flex-col gap-[.35em] p-[.45em]">
      <div className="flex items-center gap-[.45em]">
        <ItemTooltip item={item}>
          <span className="cursor-help">
            <ItemIcon itemId={item.id} name={item.name} />
          </span>
        </ItemTooltip>
        <div className="min-w-[5em] flex-1">
          <div className="truncate font-medium">{item.name}</div>
          <div className="truncate text-[.78em] text-n500">tem {fmt.format(owned)}</div>
        </div>
        <span className="shrink-0 text-[.82em] text-gold">{fmt.format(item.buyPrice)}</span>
      </div>

      <div className="flex items-center gap-[.35em]">
        <QtyInput value={qty} max={maxAffordable} onChange={onQtyChange} />
        <AtalhosDeTransacao
          max={Math.floor(gold / item.buyPrice)}
          verbo="Comprar"
          ocupado={ocupado}
          onExecutar={onExecutarAtalho}
        />
        {/* O total vai DENTRO do rotulo: o jogador le o quanto vai pagar no
            mesmo lugar em que confirma. `flex-1 min-w-0` e nao `block`
            (`w-full`) — numa fileira com os atalhos, `w-full` empurraria o
            botao pra fora do card. Com x1000 o rotulo passa de 6 digitos, e o
            `truncate` corta o texto em vez de esticar a fileira. */}
        <GameButton
          variant={semOuro ? 'secondary' : 'primary'}
          carregando={isPending}
          disabled={ocupado || semOuro}
          onClick={onComprar}
          className="min-w-0 flex-1 justify-center overflow-hidden px-[.4em]"
        >
          <span className="min-w-0 truncate">
            {semOuro ? 'Sem ouro' : `Comprar ${fmt.format(qty)} · ${fmt.format(custo)}`}
          </span>
        </GameButton>
      </div>
    </GameCard>
  )
}
