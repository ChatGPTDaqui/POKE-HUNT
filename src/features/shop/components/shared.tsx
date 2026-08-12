import { itemIconUrl, itemIconBorderColor } from '@/data/sprites'
import { GameButton, GameInput } from '@/components/game/controls'

export function ItemIcon({ itemId, name }: { itemId: string; name: string }) {
  const url = itemIconUrl(itemId)
  const borderColor = itemIconBorderColor(itemId)
  if (!url) return null
  return (
    <img
      src={url}
      alt={name}
      className="h-[2.2em] w-[2.2em] shrink-0 rounded-[.4em] object-contain"
      style={borderColor ? { border: `3px solid ${borderColor}` } : undefined}
    />
  )
}

// Atalhos de quantidade. Pedido explicito: o rotulo virou "+N" e o clique
// EXECUTA a transacao na hora, sem passar pelo botao de confirmar.
//
// O campo numerico + o botao "Comprar"/"Vender" continuam existindo: eles sao o
// caminho pra uma quantidade qualquer (37 pocoes) e pra conferir o total antes
// de pagar. Os atalhos cobrem o caso comum; o campo cobre o resto.
export const ATALHOS_QTD = [10, 100, 1000] as const

export function QtyInput({
  value, max, onChange,
}: {
  value: number
  max: number
  onChange: (v: number) => void
}) {
  const limita = (v: number) => Math.max(1, Math.min(max, Math.floor(v)))
  return (
    <span className="flex items-center gap-[.25em]">
      <GameInput
        type="number"
        min={1}
        max={max}
        value={value}
        onChange={(e) => onChange(limita(Number(e.target.value) || 1))}
        className="w-[4.2em] text-center"
      />
      {/* min-h em px (nao em): padding do GameButton e em `em`, entao com
          text-[.75em] ele encolhia pra ~22px de alvo de toque — abaixo do
          minimo de 44px (WCAG 2.5.5). Fixo em px pra nao depender do
          font-size do botao. */}
      <GameButton
        variant="ghost"
        className="min-h-[44px] px-[.4em] text-[.75em]"
        onClick={() => onChange(limita(max))}
      >
        Max
      </GameButton>
    </span>
  )
}

/**
 * `+10 / +100 / +1000` — um clique, uma transacao.
 *
 * `disabled` quando o atalho nao cabe (ouro insuficiente ou estoque menor):
 * executar "+1000" comprando 340 seria uma quantidade que o jogador nao pediu,
 * e executar nada sem dizer por que parece botao quebrado — dai o `title`
 * explicando o limite.
 */
export function AtalhosDeTransacao({
  max, verbo, ocupado, onExecutar,
}: {
  max: number
  verbo: 'Comprar' | 'Vender'
  ocupado: boolean
  onExecutar: (qtd: number) => void
}) {
  return (
    <span className="flex items-center gap-[.25em]">
      {ATALHOS_QTD.map((n) => (
        <GameButton
          key={n}
          variant="accent"
          className="min-h-[44px] px-[.45em] text-[.75em]"
          disabled={ocupado || max < n}
          title={max < n ? `Só dá para ${verbo.toLowerCase()} ${max} agora` : `${verbo} ${n} agora`}
          onClick={() => onExecutar(n)}
        >
          +{n}
        </GameButton>
      ))}
    </span>
  )
}
