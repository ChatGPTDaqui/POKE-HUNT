// Um item da coluna COMPRAR.
//
// Duas formas, uma arvore. Onde ha largura (`amplo`), o card mostra tudo de uma
// vez: identidade em cima, transacao embaixo. No celular a Loja passou a
// mostrar as duas colunas ao mesmo tempo, e cada coluna ficou com ~170px — nao
// cabe campo de quantidade, tres atalhos e o botao de confirmar em 170px sem
// derrubar todo alvo de toque abaixo do minimo. Entao ali a linha e so
// identidade e a transacao abre num sheet (montado pelo `ItensTab`, ver a nota
// la sobre por que ele NAO mora dentro da linha).
//
// Isso melhora o alvo de toque em vez de piorar: inline, `+10` tem 27px de
// largura; no sheet ele passa dos 44px.
import type { GeneratedItem } from '@/data/items'
import { ItemTooltip } from '@/components/shared/ItemTooltip'
import { GameButton, GameCard } from '@/components/game/controls'
import { useDeviceMode } from '@/stores/uiStore'
import { fmt } from '../utils'
import { ItemIcon, QtyInput, AtalhosDeTransacao } from './shared'

export interface AcoesCompra {
  item: GeneratedItem
  owned: number
  gold: number
  qty: number
  ocupado: boolean
  isPending: boolean
  onQtyChange: (v: number) => void
  onExecutarAtalho: (qtd: number) => void
  onComprar: () => void
}

function Identidade({ item, owned }: { item: GeneratedItem; owned: number }) {
  return (
    <>
      <ItemTooltip item={item}>
        <span className="cursor-help">
          <ItemIcon itemId={item.id} name={item.name} />
        </span>
      </ItemTooltip>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.name}</div>
        <div className="truncate text-[.78em] text-n500">
          tem {fmt.format(owned)} · <span className="text-gold">{fmt.format(item.buyPrice)}</span>
        </div>
      </div>
    </>
  )
}

/** Campo, atalhos e confirmar. Usada inline no amplo e dentro do sheet no dedo. */
export function TransacaoCompra({
  item, gold, qty, ocupado, isPending, onQtyChange, onExecutarAtalho, onComprar,
}: AcoesCompra) {
  const maxAffordable = Math.max(1, Math.floor(gold / item.buyPrice))
  const custo = item.buyPrice * qty
  const semOuro = custo > gold
  return (
    // `flex-wrap`: no sheet a largura sobra e tudo fica numa linha, mas numa
    // janela estreita do desktop os atalhos descem em vez de vazar.
    <div className="flex flex-wrap items-center gap-[.35em]">
      <QtyInput value={qty} max={maxAffordable} onChange={onQtyChange} />
      <AtalhosDeTransacao
        max={Math.floor(gold / item.buyPrice)}
        verbo="Comprar"
        ocupado={ocupado}
        onExecutar={onExecutarAtalho}
      />
      {/* O total vai DENTRO do rotulo: o jogador le o quanto vai pagar no mesmo
          lugar em que confirma. Nao e `block` (`w-full`) — numa fileira com os
          atalhos, `w-full` empurraria o botao pra fora do card. Com x1000 o
          rotulo passa de 6 digitos e o `truncate` corta o texto em vez de
          esticar a fileira.

          PH-294: `basis-[7em] grow` no lugar de `flex-1`. `flex-1` inclui
          `basis-0`, entao o botao aceitava QUALQUER largura que sobrasse e
          nunca disparava o `flex-wrap` do pai — na coluna COMPRAR sobravam
          85px depois do campo de quantidade e dos tres atalhos, e o rotulo mais
          CURTO ("Comprar 1 · 60") pede 96px. Como o texto e centralizado, era
          comido dos DOIS lados: sumia o "C" na esquerda e, com preco maior,
          digito na direita — justamente o numero que o botao existe pra
          mostrar. Medido no DOM: os quatro primeiros itens da loja cortavam.

          Com base de 7em ele fica na mesma linha quando cabe e QUEBRA pra linha
          propria quando nao cabe, que e o que o `flex-wrap` do pai ja prometia.
          O `truncate` continua ali pro caso que ele foi escrito pra cobrir. */}
      <GameButton
        variant={semOuro ? 'secondary' : 'primary'}
        carregando={isPending}
        disabled={ocupado || semOuro}
        onClick={onComprar}
        className="min-w-0 grow basis-[7em] justify-center overflow-hidden px-[.4em]"
      >
        <span className="min-w-0 truncate">
          {semOuro ? 'Sem ouro' : `Comprar ${fmt.format(qty)} · ${fmt.format(custo)}`}
        </span>
      </GameButton>
    </div>
  )
}

/** Corpo do sheet: o titulo ja diz o nome, aqui vai so o que a decisao pede. */
export function FichaCompra(props: AcoesCompra) {
  return (
    <div className="flex flex-col gap-[.5em]">
      <div className="text-[.85em] text-n400">
        tem {fmt.format(props.owned)} ·{' '}
        <span className="text-gold">{fmt.format(props.item.buyPrice)}</span> cada
      </div>
      <TransacaoCompra {...props} />
    </div>
  )
}

export function ItemCompraCard({ onAbrir, ...props }: AcoesCompra & { onAbrir: () => void }) {
  // `mode === 'compacto'` e nao o booleano `compacto`: o que decide a forma aqui
  // e a LARGURA DA COLUNA, nao o dedo. Deitado (844x390) tambem e `compacto`
  // pra fins de sheet-vs-janela, mas cada coluna tem ~470px — a transacao
  // inteira cabe inline e mandar o jogador abrir um sheet ali seria um toque
  // cobrado por nada.
  const estreito = useDeviceMode().mode === 'compacto'
  const { item, owned } = props

  if (estreito) {
    return (
      <GameCard
        onClick={onAbrir}
        title={`Comprar ${item.name}`}
        className="flex min-h-[44px] items-center gap-[.35em] p-[.3em]"
      >
        <Identidade item={item} owned={owned} />
      </GameCard>
    )
  }

  return (
    <GameCard className="flex flex-col gap-[.35em] p-[.45em]">
      <div className="flex items-center gap-[.45em]">
        <Identidade item={item} owned={owned} />
      </div>
      <TransacaoCompra {...props} />
    </GameCard>
  )
}
