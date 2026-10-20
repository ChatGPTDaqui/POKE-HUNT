// Arte do ovo (20/10/2026): pixel art autoral, desenhada numa grade 14x17 pra
// conversar com os sprites do jogo. A casca e creme; as PINTAS levam a cor da
// raridade do ovo; o Lendario ganha casca dourada; o ovo shiny pisca estrelas.
import { RARITIES } from '@/data/rarity'
import type { RaridadeDoOvo } from '@/data/ovos'
import { cn } from '@/lib/utils'

// O contorno, F casca, H brilho, S pinta, D sombra.
const MAPA = [
  '.....OOOO.....',
  '...OOFFFFOO...',
  '..OFFHHFFFFO..',
  '..OFHHFFFFFO..',
  '.OFFHFFSSFFFO.',
  '.OFFFFFSSFFFO.',
  'OFFSSFFFFFFFFO',
  'OFFSSFFFFFSSFO',
  'OFFFFFFFFFSSFO',
  'OFFFFFSSFFFFFO',
  'OFFFFFSSFFFFFO',
  'OFSSFFFFFFFFDO',
  '.OSSFFFFFFFDO.',
  '.OFFFFFFFDDDO.',
  '..OFFFFDDDDO..',
  '...OODDDDOO...',
  '.....OOOO.....',
]
export const LARGURA_DO_OVO = 14
export const ALTURA_DO_OVO = 17

function paleta(raridade: RaridadeDoOvo) {
  const pinta = RARITIES[raridade].color
  if (raridade === 'legendary') {
    return { O: '#3b2a06', F: '#f7d774', H: '#fff7d6', S: '#b8860b', D: '#d4a017' }
  }
  return { O: '#2b2620', F: '#f4ead2', H: '#ffffff', S: pinta, D: '#d6c8a6' }
}

/** Retangulos do ovo, prontos pra um <svg viewBox="0 0 14 17">. Exportado pra a revelacao partir o ovo. */
export function pixelsDoOvo(raridade: RaridadeDoOvo, linhas?: [number, number]) {
  const cores = paleta(raridade)
  const [de, ate] = linhas ?? [0, MAPA.length]
  const rects: { x: number; y: number; cor: string }[] = []
  for (let y = de; y < ate; y++) {
    const linha = MAPA[y]
    for (let x = 0; x < linha.length; x++) {
      const c = linha[x] as keyof typeof cores | '.'
      if (c !== '.') rects.push({ x, y, cor: cores[c] })
    }
  }
  return rects
}

export function OvoArte({
  raridade, shiny = false, tamanho = 3, className, titulo,
}: {
  raridade: RaridadeDoOvo
  shiny?: boolean
  /** Altura em `em`. */
  tamanho?: number
  className?: string
  titulo?: string
}) {
  return (
    <span className={cn('ovo-arte relative inline-block shrink-0', shiny && 'ovo-arte-shiny', className)}
      style={{ height: `${tamanho}em`, width: `${(tamanho * LARGURA_DO_OVO) / ALTURA_DO_OVO}em` }}>
      <svg viewBox={`0 0 ${LARGURA_DO_OVO} ${ALTURA_DO_OVO}`} shapeRendering="crispEdges" className="h-full w-full"
        role="img" aria-label={titulo ?? `Ovo ${RARITIES[raridade].label.toLowerCase()}${shiny ? ' shiny' : ''}`}>
        {pixelsDoOvo(raridade).map((r) => <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={1} height={1} fill={r.cor} />)}
      </svg>
      {shiny && (
        <>
          <span className="ovo-estrela" style={{ top: '-8%', right: '-6%' }} aria-hidden>✦</span>
          <span className="ovo-estrela ovo-estrela-2" style={{ bottom: '12%', left: '-10%' }} aria-hidden>✦</span>
        </>
      )}
    </span>
  )
}
