// Titulo do treinador com o visual da gema (21/10/2026). Perfil, Perfil
// publico, Ranking e o seletor usam este; o campo de batalha desenha o mesmo
// no canvas (render/tituloNoCampo.ts).
import { tituloPorId, VISUAL_DA_GEMA, type Titulo } from '@/data/titulos'
import { cn } from '@/lib/utils'
import './titulos.css'

export function TituloComGema({ id, titulo, animado = true, className }: {
  id?: string | null
  titulo?: Titulo | null
  /** Ranking desliga: lista longa animada pesa e distrai. */
  animado?: boolean
  className?: string
}) {
  const t = titulo ?? tituloPorId(id)
  if (!t) return null
  const v = VISUAL_DA_GEMA[t.gema]
  const degrade = v.degrade.length > 1
  return (
    <span
      className={cn(
        'titulo-gema',
        degrade && 'titulo-degrade',
        animado && degrade && 'titulo-animado',
        animado && t.gema === 'rubi' && 'titulo-rapido',
        animado && v.ornamento && 'titulo-pisca',
        v.moldura && 'titulo-moldura',
        className,
      )}
      style={{ color: v.cor, filter: v.brilho ? `drop-shadow(0 0 ${v.brilho / 2}px ${v.cor}aa)` : undefined }}
      aria-label={`Título ${t.nome} (${v.nome})`}
    >
      {v.ornamento && <span className="titulo-ornamento" style={{ color: v.cor }} aria-hidden>{v.ornamento}</span>}
      <span className="titulo-texto" style={degrade ? { backgroundImage: `linear-gradient(90deg, ${v.degrade.join(', ')})` } : undefined}>
        {t.nome}
      </span>
      {v.ornamento && <span className="titulo-ornamento" style={{ color: v.cor }} aria-hidden>{v.ornamento}</span>}
    </span>
  )
}
