// Titulos do treinador (21/10/2026, design aprovado pelo dono): um catalogo so
// com os titulos de CONQUISTA (Ouro/Impossivel/Platina, que ja existiam) e os
// 54 de ESPECIALIDADE (Aprendiz nv 3, Especialista nv 7, Mestre nv 10, por
// tipo). Cada titulo tem uma GEMA, a raridade visual dele — paleta propria,
// separada da raridade dos POKE (pedido do dono).
//
// O servidor confere a posse em `definir_titulo` (migration
// 20261021130000_titulos_de_especialidade): conquista desbloqueada OU nivel de
// Especialidade alcancado. `titulos.test.ts` tranca degraus, ids e o SQL.
import { CATALOGO_DE_CONQUISTAS } from './generated/conquistas.generated'
import type { NivelDeConquista } from './conquistas'
import type { ElementType } from './generated/types'
import type { EspecialidadeNiveis } from './especialidades'

export type Gema = 'ambar' | 'jade' | 'safira' | 'rubi' | 'diamante'
export const GEMAS: readonly Gema[] = ['ambar', 'jade', 'safira', 'rubi', 'diamante']

/** Cores e efeitos de cada gema — lidos pelo CSS (perfil) e pelo canvas (campo). */
export const VISUAL_DA_GEMA: Record<Gema, {
  nome: string
  /** Cor solida (lista, ranking, contorno). */
  cor: string
  /** Paradas do degrade animado; uma so = texto chapado. */
  degrade: readonly string[]
  /** Brilho em volta do texto (0 = nenhum). */
  brilho: number
  /** Ornamento nas pontas (Rubi ✦, Diamante ✧). */
  ornamento: string | null
  /** Particulas no campo. */
  particulas: 'nenhuma' | 'faiscas' | 'orbita'
  /** Moldura em volta do texto (so Diamante). */
  moldura: boolean
}> = {
  ambar: { nome: 'Âmbar', cor: '#d9a35b', degrade: ['#d9a35b'], brilho: 0, ornamento: null, particulas: 'nenhuma', moldura: false },
  jade: { nome: 'Jade', cor: '#4fd1a5', degrade: ['#4fd1a5'], brilho: 6, ornamento: null, particulas: 'nenhuma', moldura: false },
  safira: { nome: 'Safira', cor: '#5b9bff', degrade: ['#3d7bff', '#7fd6ff', '#3d7bff'], brilho: 4, ornamento: null, particulas: 'nenhuma', moldura: false },
  rubi: { nome: 'Rubi', cor: '#ff5470', degrade: ['#ff3b5c', '#ffb199', '#ff3b5c'], brilho: 8, ornamento: '✦', particulas: 'faiscas', moldura: false },
  diamante: { nome: 'Diamante', cor: '#d8f6ff', degrade: ['#ffffff', '#b9f3ff', '#ffd6f6', '#fff6c2', '#ffffff'], brilho: 10, ornamento: '✧', particulas: 'orbita', moldura: true },
}

export const GEMA_DA_CONQUISTA: Partial<Record<NivelDeConquista, Gema>> = {
  ouro: 'safira', impossivel: 'rubi', platina: 'diamante',
}

/** Degraus de Especialidade que dao titulo (maior nivel entre dano e defesa). */
export const DEGRAUS_DE_ESPECIALIDADE = [
  { nivel: 3, prefixo: 'Aprendiz', gema: 'ambar' },
  { nivel: 7, prefixo: 'Especialista', gema: 'jade' },
  { nivel: 10, prefixo: 'Mestre', gema: 'safira' },
] as const satisfies readonly { nivel: number; prefixo: string; gema: Gema }[]

export const SUFIXO_DO_TIPO: Record<ElementType, string> = {
  NORMAL: 'da Tradição', FIRE: 'das Chamas', WATER: 'das Marés', ELECTRIC: 'dos Trovões',
  GRASS: 'da Relva', ICE: 'do Gelo', FIGHTING: 'do Combate', POISON: 'do Veneno',
  GROUND: 'da Terra', FLYING: 'dos Céus', PSYCHIC: 'da Mente', BUG: 'dos Insetos',
  ROCK: 'das Rochas', GHOST: 'dos Espectros', DRAGON: 'dos Dragões', DARK: 'da Escuridão',
  STEEL: 'do Aço', FAIRY: 'das Fadas',
}

export interface Titulo {
  id: string
  nome: string
  gema: Gema
  origem: 'conquista' | 'especialidade'
}

export const idDoTituloDeEspecialidade = (tipo: ElementType, nivel: number) => `esp:${tipo}:${nivel}`

const TITULOS: Titulo[] = [
  ...CATALOGO_DE_CONQUISTAS
    .filter((c) => GEMA_DA_CONQUISTA[c.nivel])
    .map((c) => ({ id: c.id, nome: c.nome, gema: GEMA_DA_CONQUISTA[c.nivel]!, origem: 'conquista' as const })),
  ...(Object.keys(SUFIXO_DO_TIPO) as ElementType[]).flatMap((tipo) =>
    DEGRAUS_DE_ESPECIALIDADE.map((d) => ({
      id: idDoTituloDeEspecialidade(tipo, d.nivel),
      nome: `${d.prefixo} ${SUFIXO_DO_TIPO[tipo]}`,
      gema: d.gema as Gema,
      origem: 'especialidade' as const,
    }))),
]
const POR_ID = new Map(TITULOS.map((t) => [t.id, t]))

export function todosOsTitulos(): readonly Titulo[] {
  return TITULOS
}

export function tituloPorId(id: string | null | undefined): Titulo | null {
  return id ? POR_ID.get(id) ?? null : null
}

/** Titulos que o jogador tem, do mais raro pro menos. */
export function titulosDisponiveis(
  conquistasDesbloqueadas: Record<string, unknown>,
  especialidades: EspecialidadeNiveis | undefined,
): Titulo[] {
  const meus = TITULOS.filter((t) => {
    if (t.origem === 'conquista') return Boolean(conquistasDesbloqueadas[t.id])
    const [, tipo, nivel] = t.id.split(':')
    const p = especialidades?.[tipo as ElementType]
    return p != null && Math.max(p.dano, p.defesa) >= Number(nivel)
  })
  return meus.sort((a, b) => GEMAS.indexOf(b.gema) - GEMAS.indexOf(a.gema) || a.nome.localeCompare(b.nome))
}
