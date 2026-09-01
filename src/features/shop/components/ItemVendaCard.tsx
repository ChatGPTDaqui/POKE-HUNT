// A transacao de venda de UM item da Loja.
//
// A LINHA que ficava aqui (`ItemVendaCard`, com a variante compacta e a ampla)
// saiu no PH-118: a coluna VENDER passou a listar em grade quadriculada, e um
// slot de sprite substitui a linha de identidade nos dois regimes. O que sobrou
// e a ficha — o que aparece DEPOIS de escolher, em sheet no compacto e inline no
// amplo.
import { LockSimple, LockSimpleOpen } from '@phosphor-icons/react'
import type { AnyItem } from '@/data/items'
import { GameButton, GameIconButton } from '@/components/game/controls'
import { fmt, fmtCurto } from '../utils'
import { QtyInput, AtalhosDeTransacao } from './shared'

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

function BotaoTrava({ locked, onToggleLock }: Pick<AcoesVenda, 'locked' | 'onToggleLock'>) {
  return (
    <GameIconButton
      variant="ghost"
      title={locked ? 'Destrancar' : 'Trancar (nunca será vendido)'}
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
