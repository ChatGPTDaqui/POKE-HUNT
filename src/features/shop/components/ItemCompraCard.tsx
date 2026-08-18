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
    // Tres faixas fixas: identidade / quantidade / confirmar. A versao anterior
    // punha total e botao no MESMO flex-wrap dos atalhos, e com os alvos de
    // toque em 44px isso virava uma pilha de cinco linhas por item — um card
    // de ~400px de altura no celular, quatro itens por tela inteira.
    <GameCard className="flex flex-col gap-[.4em] p-[.55em]">
      <div className="flex items-center gap-[.45em]">
        <ItemTooltip item={item}>
          <span className="cursor-help">
            <ItemIcon itemId={item.id} name={item.name} />
          </span>
        </ItemTooltip>
        <div className="min-w-[6em] flex-1">
          <div className="font-medium">{item.name}</div>
          <div className="text-[.78em] text-n500">tem {fmt.format(owned)}</div>
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
      </div>

      {/* O total entrou DENTRO do rotulo. Ele estava numa linha propria porque
          "com x1000 o numero passa de 6 digitos e o rotulo quebrava" — com o
          botao ocupando a largura toda isso deixou de acontecer, e o jogador
          le o quanto vai pagar no mesmo lugar em que confirma. */}
      <GameButton
        block
        variant={semOuro ? 'secondary' : 'primary'}
        carregando={isPending}
        disabled={ocupado || semOuro}
        onClick={onComprar}
        className="justify-center"
      >
        {semOuro ? 'Ouro insuficiente' : `Comprar ${fmt.format(qty)} · ${fmt.format(custo)}`}
      </GameButton>
    </GameCard>
  )
}
