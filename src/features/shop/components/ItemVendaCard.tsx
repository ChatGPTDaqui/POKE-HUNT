// Um item da coluna VENDER. Mesma forma dupla do `ItemCompraCard`: linha
// compacta + sheet no celular (onde a coluna tem ~170px), card inteiro no
// amplo. A nota longa sobre o porque esta la.
import { LockSimple, LockSimpleOpen } from '@phosphor-icons/react'
import type { AnyItem } from '@/data/items'
import { ItemTooltip } from '@/components/shared/ItemTooltip'
import { GameButton, GameCard, GameIconButton } from '@/components/game/controls'
import { useDeviceMode } from '@/stores/uiStore'
import { fmt, fmtCurto } from '../utils'
import { ItemIcon, QtyInput, AtalhosDeTransacao } from './shared'

export interface AcoesVenda {
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
}

function Identidade({ itemId, item, owned }: { itemId: string; item: AnyItem; owned: number }) {
  return (
    <>
      <ItemTooltip item={item}>
        <span className="cursor-help">
          <ItemIcon itemId={itemId} name={item.name} />
        </span>
      </ItemTooltip>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.name}</div>
        <div className="truncate text-[.78em] text-n500">
          x{fmt.format(owned)} · <span className="text-gold">{fmt.format(item.sellPrice)}</span> cada
        </div>
      </div>
    </>
  )
}

function BotaoTrava({ locked, onToggleLock }: Pick<AcoesVenda, 'locked' | 'onToggleLock'>) {
  return (
    <GameIconButton
      variant="ghost"
      title={locked ? 'Destrancar' : 'Trancar (nunca sera vendido)'}
      aria-label={locked ? 'Destrancar' : 'Trancar'}
      className={locked ? 'text-gold' : undefined}
      onClick={(e) => {
        e.stopPropagation()
        onToggleLock()
      }}
    >
      {locked ? <LockSimple weight="fill" /> : <LockSimpleOpen />}
    </GameIconButton>
  )
}

export function TransacaoVenda({
  item, owned, qty, ocupado, onQtyChange, onExecutarAtalho, onVender, onVenderTudo,
}: AcoesVenda) {
  return (
    <div className="flex flex-wrap items-center gap-[.35em]">
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
      {/* "Vender tudo" POR ITEM (pedido explicito). O "Tudo" do topo da coluna
          esvazia a mochila inteira — sao coisas diferentes e a confusao entre
          elas custa caro. O valor sai abreviado: com 99.998 antidotos o rotulo
          inteiro empurrava o resto da fileira pra fora. */}
      <GameButton
        variant="accent"
        disabled={ocupado}
        title={`Vender as ${owned} unidades por ${fmt.format(item.sellPrice * owned)} de ouro`}
        onClick={onVenderTudo}
        className="min-w-0 shrink justify-center px-[.4em]"
      >
        <span className="min-w-0 truncate">Tudo · {fmtCurto(item.sellPrice * owned)}</span>
      </GameButton>
    </div>
  )
}

export function FichaVenda(props: AcoesVenda) {
  const { item, owned, locked } = props
  return (
    <div className="flex flex-col gap-[.5em]">
      <div className="flex items-center justify-between gap-[.5em]">
        <span className="text-[.85em] text-n400">
          x{fmt.format(owned)} · <span className="text-gold">{fmt.format(item.sellPrice)}</span> cada
        </span>
        <BotaoTrava {...props} />
      </div>
      {locked
        ? <p className="text-[.85em] text-n400">Item trancado — destranque para vender.</p>
        : <TransacaoVenda {...props} />}
    </div>
  )
}

export function ItemVendaCard({ onAbrir, ...props }: AcoesVenda & { onAbrir: () => void }) {
  // `mode === 'compacto'` e nao o booleano `compacto`: o que decide a forma aqui
  // e a LARGURA DA COLUNA, nao o dedo. Deitado (844x390) tambem e `compacto`
  // pra fins de sheet-vs-janela, mas cada coluna tem ~470px — a transacao
  // inteira cabe inline e mandar o jogador abrir um sheet ali seria um toque
  // cobrado por nada.
  const estreito = useDeviceMode().mode === 'compacto'
  const { itemId, item, owned, locked } = props

  if (estreito) {
    return (
      <GameCard
        onClick={onAbrir}
        title={`Vender ${item.name}`}
        className={`flex min-h-[44px] items-center gap-[.35em] p-[.3em] ${locked ? 'border-gold/40' : ''}`}
      >
        <Identidade itemId={itemId} item={item} owned={owned} />
        {/* Trancado: so o SINAL na linha, sem alvo de toque. O botao de
            destrancar mora no sheet — na coluna de 170px ele roubaria a largura
            do nome de TODOS os itens por causa de uns poucos travados. */}
        {locked && <LockSimple weight="fill" className="shrink-0 text-[1.1em] text-gold" />}
      </GameCard>
    )
  }

  return (
    <GameCard className={`flex flex-col gap-[.35em] p-[.45em] ${locked ? 'border-gold/40' : ''}`}>
      <div className="flex items-center gap-[.45em]">
        <Identidade itemId={itemId} item={item} owned={owned} />
        <BotaoTrava {...props} />
      </div>
      {!locked && <TransacaoVenda {...props} />}
    </GameCard>
  )
}
