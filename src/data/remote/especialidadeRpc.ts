// Especialidade como missao (17/10/2026): o progresso da PROXIMA missao de cada
// (tipo, trilha), avaliado no servidor pelo mesmo motor das conquistas.
//
// O texto de cada requisito NAO vem daqui: ele mora no catalogo do cliente
// (`data/especialidadeMissoes.ts`), na mesma ordem da tabela
// `especialidade_missao` — o teste do catalogo garante que os dois batem.
import { supabase } from '@/lib/supabase'
import { ErroServidor } from './servidor'
import type { ElementType } from '../generated/types'
import type { EspecialidadeTrilha } from '../especialidades'

const db = supabase as unknown as {
  rpc: (nome: string, params?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

export interface ProgressoDeMissao {
  tipo: ElementType
  trilha: EspecialidadeTrilha
  /** O nivel que a missao libera. */
  nivel: number
  /** Um por requisito, na ordem do catalogo. */
  requisitos: { valor: number; alvo: number }[]
}

export async function minhasMissoesDeEspecialidade(): Promise<ProgressoDeMissao[]> {
  const { data, error } = await db.rpc('minhas_missoes_especialidade')
  if (error) throw new ErroServidor(409, error.message)
  return ((data ?? []) as ProgressoDeMissao[]).map((m) => ({
    ...m,
    requisitos: (m.requisitos ?? []).map((r) => ({ valor: Number(r.valor) || 0, alvo: Number(r.alvo) || 0 })),
  }))
}
