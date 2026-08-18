import { Coin, Diamond } from '@phosphor-icons/react'
import { itemIconUrl, itemIconBorderColor } from '@/data/sprites'
import { cn } from '@/lib/utils'
import { fmt } from '../utils'

export function IconeItem({ itemId }: { itemId: string }) {
  const url = itemIconUrl(itemId)
  const borda = itemIconBorderColor(itemId)
  if (!url) return null
  return (
    <img
      src={url}
      alt=""
      className="h-[1.9em] w-[1.9em] shrink-0 rounded-[.35em] object-contain"
      style={borda ? { border: `2px solid ${borda}` } : undefined}
    />
  )
}

// Reexportado do controle compartilhado — a copia que vivia aqui era a unica
// do jogo, e telas fora do mercado (perfil, correio) acabavam escrevendo a
// sua propria string solta.
export { Carregando } from '@/components/game/controls'

export function Moeda({ valor, tipo }: { valor: number; tipo: 'gold' | 'diamond' }) {
  return (
    <span className={cn('inline-flex items-center gap-[.25em]', tipo === 'gold' ? 'text-gold' : 'text-diamond')}>
      {tipo === 'gold' ? <Coin weight="fill" /> : <Diamond weight="fill" />}
      {fmt.format(valor)}
    </span>
  )
}
