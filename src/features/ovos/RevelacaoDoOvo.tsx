// O "video" de chocar (20/10/2026, pedido do dono): o ovo treme cada vez mais,
// trinca, brilha, explode num clarao e revela o POKE com raios na cor da
// raridade. A chamada ao servidor (`chocar_ovo`) corre DURANTE o tremor; a
// abertura so acontece quando o tremor acabou E o resultado chegou, entao o
// suspense nunca mostra um resultado que o servidor ainda nao decidiu.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { SPECIES } from '@/data/pokes'
import { RARITIES } from '@/data/rarity'
import { gen5SpriteUrl } from '@/data/gen5Sprites'
import type { Ovo } from '@/data/ovos'
import type { Nascimento } from '@/data/remote/muralRpc'
import { GameButton } from '@/components/game/controls'
import { cn } from '@/lib/utils'
import { ALTURA_DO_OVO, LARGURA_DO_OVO, pixelsDoOvo } from './OvoArte'
import './ovos.css'

const TREMOR_MS = 2300
const ABERTURA_MS = 1100
const LINHA_DO_CORTE = 8

type Fase = 'tremer' | 'abrir' | 'final'

export function RevelacaoDoOvo({ ovo, promessa, onFechar }: {
  ovo: Ovo
  promessa: Promise<Nascimento>
  onFechar: () => void
}) {
  const [fase, setFase] = useState<Fase>('tremer')
  const [resultado, setResultado] = useState<Nascimento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [tremeu, setTremeu] = useState(false)

  useEffect(() => {
    let vivo = true
    promessa.then((r) => { if (vivo) setResultado(r) }, (e) => { if (vivo) setErro(e instanceof Error ? e.message : String(e)) })
    const t = setTimeout(() => setTremeu(true), TREMOR_MS)
    return () => { vivo = false; clearTimeout(t) }
  }, [promessa])

  useEffect(() => {
    if (tremeu && resultado && fase === 'tremer') setFase('abrir')
  }, [tremeu, resultado, fase])

  // Efeito proprio, so com `fase`: no mesmo efeito de cima a troca pra 'abrir'
  // refazia o efeito e o cleanup cancelava este timer — a revelacao parava sem
  // o texto e sem o Fechar.
  useEffect(() => {
    if (fase !== 'abrir') return
    const t = setTimeout(() => setFase('final'), ABERTURA_MS)
    return () => clearTimeout(t)
  }, [fase])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && (fase === 'final' || erro)) onFechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [fase, erro, onFechar])

  const corDoOvo = RARITIES[ovo.raridade].color
  const cor = resultado ? RARITIES[resultado.rarity].color : corDoOvo
  const especie = resultado ? SPECIES[resultado.speciesId] : SPECIES[ovo.speciesId]
  const pular = () => { if (resultado) setFase('final') }

  return createPortal(
    <div className={cn('revelacao', `fase-${fase}`)} style={{ ['--cor' as string]: fase === 'tremer' ? corDoOvo : cor }}
      role="dialog" aria-modal="true" aria-label="Chocando o ovo">
      <div className="revelacao-palco">
        <div className="revelacao-raios" aria-hidden />
        <div className="revelacao-brilho" aria-hidden />
        <div className="revelacao-ovo" aria-hidden>
          <svg viewBox={`0 0 ${LARGURA_DO_OVO} ${ALTURA_DO_OVO}`} shapeRendering="crispEdges">
            <g className="revelacao-metade-cima" style={{ transformOrigin: '7px 8px', transformBox: 'view-box' }}>
              {pixelsDoOvo(ovo.raridade, [0, LINHA_DO_CORTE]).map((r) => <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={1} height={1} fill={r.cor} />)}
            </g>
            <g className="revelacao-metade-baixo" style={{ transformOrigin: '7px 12px', transformBox: 'view-box' }}>
              {pixelsDoOvo(ovo.raridade, [LINHA_DO_CORTE, ALTURA_DO_OVO]).map((r) => <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={1} height={1} fill={r.cor} />)}
            </g>
            <polyline className="revelacao-trinca" points="0.5,8 2.5,7 4.5,9 6.5,7 8.5,9 10.5,7 13.5,8.2"
              fill="none" stroke="#1d150c" strokeWidth={0.45} strokeDasharray={40} strokeDashoffset={40} shapeRendering="auto" />
          </svg>
        </div>
        {resultado && especie && (
          <img className="revelacao-pokemon" src={gen5SpriteUrl(especie.id, resultado.isShiny)} alt={especie.name} />
        )}
        <div className="revelacao-flash" aria-hidden />
      </div>

      {resultado && especie && (
        <div className="revelacao-texto" role="status">
          <span className="revelacao-raridade">{RARITIES[resultado.rarity].label}{resultado.isShiny ? ' ✨ SHINY' : ''}</span>
          <span className="text-[1.15em] font-semibold">{especie.name} nasceu!</span>
          <span className="text-[.85em] opacity-75">
            {resultado.local === 'team' ? 'Ele já está na sua equipe.' : 'Ele foi para a Mochila.'}
          </span>
          <GameButton variant="primary" className="mt-[.4em] min-w-[8em]" onClick={onFechar}>Fechar</GameButton>
        </div>
      )}

      {erro && (
        <div className="revelacao-texto" role="alert" style={{ opacity: 1 }}>
          <span className="text-[1em] font-semibold">Não foi possível chocar</span>
          <span className="max-w-[22em] text-[.85em] opacity-80">{erro}</span>
          <GameButton variant="primary" className="mt-[.4em]" onClick={onFechar}>Fechar</GameButton>
        </div>
      )}

      {fase !== 'final' && !erro && (
        <button type="button" onClick={pular} disabled={!resultado}
          className="absolute top-[1em] right-[1em] rounded-full border border-white/30 px-[.8em] py-[.25em] text-[.8em] text-white/80 disabled:opacity-30">
          Pular
        </button>
      )}
    </div>,
    document.body,
  )
}
