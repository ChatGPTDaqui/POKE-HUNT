// Ouro e diamante.
//
// Em arquivo proprio desde PH-282 porque ela e usada em DOIS lugares que nao se
// importam mais: dentro do card do treinador (canto superior direito, no amplo)
// e solta no trilho (compacto, onde o card nao existe). Antes vivia dentro de
// `StatusRail.tsx`, e o card levou-a junto ao mudar de casa.
import { useRef } from 'react'
import { Coin, Diamond } from '@phosphor-icons/react'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useAncoraDeVfx, ANCORA } from '@/hooks/useAncoraDeVfx'
import { cn } from '@/lib/utils'

const fmtCheio = new Intl.NumberFormat('pt-BR')

/**
 * Abrevia com k/M/B.
 *
 * Nasceu pro celular: a conta de teste tem 1.002.017.245 de ouro, e 13 digitos
 * empurravam o avatar do treinador pra fora da tela em 390px. Desde PH-279 vale
 * tambem no amplo, porque dentro do card nao ha largura pro valor cheio sem
 * espremer o nome do treinador. O exato continua no `title` e no perfil.
 */
export function fmtCurto(valor: number): string {
  const abs = Math.abs(valor)
  if (abs >= 1_000_000_000) return `${(valor / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
  if (abs >= 1_000_000) return `${(valor / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 10_000) return `${(valor / 1000).toFixed(0)}k`
  return fmtCheio.format(valor)
}

export function Carteira({ abreviada }: { abreviada: boolean }) {
  const gold = useGameStateStore((s) => s.wallet.gold)
  const diamonds = useGameStateStore((s) => s.wallet.diamonds)
  const fmt = abreviada ? fmtCurto : fmtCheio.format.bind(fmtCheio)
  // Ancora da camada de VFX (PH-190): e aqui que o voo de ouro do abate termina
  // (PH-191). Um ref publicado, e nao um `querySelector` por texto ou por
  // classe: seletor por conteudo quebra na primeira mudanca de copy e quebra em
  // SILENCIO — o efeito passaria a mirar no canto (0,0) sem erro nenhum.
  const carteiraRef = useRef<HTMLDivElement>(null)
  useAncoraDeVfx(ANCORA.carteira, carteiraRef)
  return (
    <div
      ref={carteiraRef}
      className={cn(
        'shrink-0 text-[.72em] leading-[1.15] tabular-nums',
        abreviada ? 'flex flex-col items-end' : 'flex items-center gap-[.6em]',
      )}
      title={`${fmtCheio.format(gold)} ouro · ${fmtCheio.format(diamonds)} diamantes`}
    >
      <span className="flex items-center gap-[.25em] font-medium text-gold">
        <Coin weight="fill" /> {fmt(gold)}
      </span>
      <span className="flex items-center gap-[.25em] font-medium text-diamond">
        <Diamond weight="fill" /> {fmt(diamonds)}
      </span>
    </div>
  )
}
