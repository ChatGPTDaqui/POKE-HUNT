// Brasao de ginasio (23/10/2026, design aprovado pelo dono): escudo na cor do
// tipo com o SIMBOLO proprio do tipo (forma propria, nunca so recolorir) e
// MOLDURA de metal da liga — bronze, prata, ouro, platina, prisma. Metal e de
// proposito: as gemas (ambar..diamante) sao dos titulos. O mesmo desenho e a
// insignia do estojo e da comemoracao. SVG em codigo, sem asset.
import { useId, type ReactNode } from 'react'
import type { ElementType } from '@/data/generated/types'
import { colorForType } from '@/data/typeColors'
import { SUFIXO_DO_TIPO } from '@/data/titulos'
import './ginasios.css'

export interface MetalDaLiga {
  nome: string
  /** Paradas do degrade da moldura. */
  degrade: readonly string[]
  /** Texto e contorno da aba. */
  cor: string
  ornamento: 'nenhum' | 'coroa' | 'coroa-asas'
  /** Moldura com brilho animado (so aceso). */
  prisma: boolean
}

export const METAL_DA_LIGA: Record<number, MetalDaLiga> = {
  100: { nome: 'Bronze', degrade: ['#e3a46b', '#9a5a2c', '#e3a46b'], cor: '#e3a46b', ornamento: 'nenhum', prisma: false },
  200: { nome: 'Prata', degrade: ['#f2f4f8', '#8c94a3', '#f2f4f8'], cor: '#c8ced9', ornamento: 'nenhum', prisma: false },
  300: { nome: 'Ouro', degrade: ['#fff1a8', '#c98f12', '#fff1a8'], cor: '#f5c542', ornamento: 'coroa', prisma: false },
  400: { nome: 'Platina', degrade: ['#e9fbff', '#7fb6d6', '#e9fbff'], cor: '#bfe6f7', ornamento: 'coroa-asas', prisma: false },
  500: { nome: 'Prisma', degrade: ['#ff7ad9', '#7ad7ff', '#b6ff7a', '#ffd27a', '#ff7ad9'], cor: '#ff9ae3', ornamento: 'coroa-asas', prisma: true },
}

export const nomeDoGinasio = (tipo: ElementType) => `Ginásio ${SUFIXO_DO_TIPO[tipo]}`

/** Tom claro do simbolo, por tipo (contraste sobre a cor do tipo). */
const CLARO: Record<ElementType, string> = {
  NORMAL: '#f4f1e0', FIRE: '#ffe08a', WATER: '#e6f7ff', ELECTRIC: '#fff8d6', GRASS: '#d8f5c8', ICE: '#f0fbff',
  FIGHTING: '#ffe1d6', POISON: '#e8c8f5', GROUND: '#f5e6c8', FLYING: '#f2fbff', PSYCHIC: '#ffe3ee', BUG: '#e7f6cf',
  ROCK: '#e6d3c8', GHOST: '#e6dcf0', DRAGON: '#dfe4ff', DARK: '#e0dcf5', STEEL: '#eef3f6', FAIRY: '#fff0f6',
}

/** Simbolo de cada tipo, no quadro 48x58 do escudo (centro ~24,27). */
function Simbolo({ tipo }: { tipo: ElementType }): ReactNode {
  const c = CLARO[tipo]
  const t = colorForType(tipo)
  switch (tipo) {
    case 'NORMAL': return <><circle cx="24" cy="27" r="10" fill="none" stroke={c} strokeWidth="3" /><circle cx="24" cy="27" r="3.5" fill={c} /></>
    case 'FIRE': return <path d="M24 12 Q35 24 31 34 Q28 41 24 41 Q17 41 16 33 Q15 26 21 21 Q21 28 25 29 Q27 22 24 12 Z" fill={c} />
    case 'WATER': return <><path d="M24 12 Q34 26 33 32 Q31 41 24 41 Q17 41 15 32 Q14 26 24 12 Z" fill={c} /><path d="M20 30 Q20 36 25 37" stroke={t} strokeWidth="2" fill="none" /></>
    case 'ELECTRIC': return <path d="M28 11 L16 29 H24 L19 43 L33 23 H25 Z" fill={c} stroke="#8a6a00" strokeWidth="1.2" strokeLinejoin="round" />
    case 'GRASS': return <><path d="M14 38 Q14 16 34 14 Q36 36 14 38 Z" fill={c} /><path d="M15 37 L30 20" stroke={t} strokeWidth="2" /></>
    case 'ICE': return (
      <g stroke={c} strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M24 14 V40 M13 20 L35 34 M35 20 L13 34" /><path d="M21 16 L24 19 L27 16 M21 38 L24 35 L27 38" />
      </g>
    )
    case 'FIGHTING': return (
      <>
        <rect x="14" y="18" width="20" height="16" rx="5" fill={c} /><rect x="11" y="24" width="7" height="10" rx="3" fill={c} />
        <path d="M19 18 V26 M24 18 V26 M29 18 V26" stroke={t} strokeWidth="1.6" />
        <rect x="16" y="34" width="16" height="6" rx="2" fill={c} opacity=".75" />
      </>
    )
    case 'POISON': return (
      <>
        <circle cx="24" cy="32" r="8" fill={c} /><circle cx="16" cy="20" r="4.5" fill={c} /><circle cx="31" cy="17" r="3" fill={c} />
        <circle cx="21" cy="31" r="2" fill={t} /><circle cx="27" cy="31" r="2" fill={t} />
      </>
    )
    case 'GROUND': return <><path d="M10 38 L20 18 L26 28 L30 22 L38 38 Z" fill={c} /><path d="M12 38 H36" stroke="#7a5a2a" strokeWidth="2" /></>
    case 'FLYING': return <path d="M12 36 Q14 18 36 14 Q32 22 34 24 Q28 26 30 30 Q22 30 22 34 Z" fill={c} />
    case 'PSYCHIC': return (
      <><path d="M10 27 Q24 12 38 27 Q24 42 10 27 Z" fill={c} /><circle cx="24" cy="27" r="6" fill={t} /><circle cx="24" cy="27" r="2.5" fill="#3a0f20" /></>
    )
    case 'BUG': return (
      <>
        <ellipse cx="24" cy="30" rx="10" ry="11" fill={c} /><path d="M24 19 V41" stroke={t} strokeWidth="2" />
        <path d="M20 19 Q17 12 14 12 M28 19 Q31 12 34 12" stroke={c} strokeWidth="2" fill="none" />
      </>
    )
    case 'ROCK': return (
      <><path d="M14 34 L18 18 L30 14 L36 26 L30 40 L18 40 Z" fill={c} /><path d="M18 18 L24 28 L36 26 M24 28 L18 40" stroke={t} strokeWidth="1.6" fill="none" /></>
    )
    case 'GHOST': return (
      <>
        <path d="M14 40 V24 Q14 14 24 14 Q34 14 34 24 V40 L30 36 L27 40 L24 36 L21 40 L18 36 Z" fill={c} />
        <circle cx="20" cy="25" r="2.4" fill="#2a1f35" /><circle cx="28" cy="25" r="2.4" fill="#2a1f35" />
      </>
    )
    case 'DRAGON': return (
      <>
        <path d="M14 40 Q16 24 24 14 Q32 24 34 40 L29 34 L24 40 L19 34 Z" fill={c} />
        <path d="M18 20 L13 13 M30 20 L35 13" stroke={c} strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="21" cy="28" r="1.8" fill="#1d2466" /><circle cx="27" cy="28" r="1.8" fill="#1d2466" />
      </>
    )
    case 'DARK': return (
      <><path d="M28 13 Q14 16 14 27 Q14 39 28 41 Q20 35 20 27 Q20 19 28 13 Z" fill={c} /><circle cx="31" cy="22" r="1.5" fill={c} /><circle cx="33" cy="31" r="1" fill={c} /></>
    )
    case 'STEEL': return (
      <>
        <path d="M24 14 L35 20.5 V33.5 L24 40 L13 33.5 V20.5 Z" fill={c} stroke="#5f6f78" strokeWidth="1.5" />
        <circle cx="24" cy="27" r="5" fill={t} stroke="#5f6f78" strokeWidth="1.5" />
      </>
    )
    case 'FAIRY': return (
      <><path d="M24 12 L27 24 L39 27 L27 30 L24 42 L21 30 L9 27 L21 24 Z" fill={c} /><circle cx="34" cy="16" r="2" fill={c} /><circle cx="14" cy="38" r="1.5" fill={c} /></>
    )
  }
}

const ESCUDO = 'M24 1 L46 9 L44 34 Q37 50 24 56 Q11 50 4 34 L2 9 Z'

export function BrasaoDeGinasio({ tipo, faixa, aceso = true, className, rotulo }: {
  tipo: ElementType
  faixa: number
  /** Apagado = insignia que o jogador ainda nao tem. */
  aceso?: boolean
  className?: string
  /** Sem rotulo, o brasao e decorativo (o botao em volta da o nome). */
  rotulo?: string
}) {
  const id = useId().replace(/:/g, '')
  const metal = METAL_DA_LIGA[faixa] ?? METAL_DA_LIGA[100]
  const moldura = `url(#m${id})`
  const brilha = aceso && metal.prisma
  return (
    <svg viewBox="-8 -10 64 70" className={className} role={rotulo ? 'img' : undefined} aria-label={rotulo} aria-hidden={rotulo ? undefined : true}
      style={{ opacity: aceso ? 1 : 0.62, filter: aceso ? undefined : 'saturate(.6) brightness(.85)' }}>
      <defs>
        <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
          {metal.degrade.map((cor, i) => <stop key={i} offset={i / (metal.degrade.length - 1)} stopColor={cor} />)}
          {brilha && <animateTransform attributeName="gradientTransform" type="rotate" from="0 .5 .5" to="360 .5 .5" dur="6s" repeatCount="indefinite" />}
        </linearGradient>
      </defs>
      {metal.ornamento === 'coroa-asas' && (
        <path d="M2 24 L-6 30 L2 36 M46 24 L54 30 L46 36" fill="none" stroke={moldura} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {metal.ornamento !== 'nenhum' && (
        <path d="M14 3 L17 -6 L22 0 L24 -8 L26 0 L31 -6 L34 3" fill="none" stroke={moldura} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      )}
      <path d={ESCUDO} fill={colorForType(tipo)} stroke={moldura} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M24 5 L42 11.5 L40.5 32" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="1.5" />
      <Simbolo tipo={tipo} />
    </svg>
  )
}
