// Ginasios (23/10/2026): leitura do estado, desafiar, definir equipe do lider
// e resolver (rota do servidor do jogo). Quem valida tudo e o banco/servidor.
import { supabase } from '@/lib/supabase'
import type { PokeDeGinasio, TipoDeDuelo } from '@/data/ginasios'
import type { SlotDeEquipe } from '@/components/montador/MontadorDeEquipe'
import { ErroServidor, servidor, type RespostaResolverGinasio } from './servidor'

const db = supabase as unknown as {
  rpc: (nome: string, params?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

async function chamar<T>(nome: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(nome, params)
  if (error) throw new ErroServidor(409, error.message)
  return data as T
}

export interface GinasioNoEstado {
  id: string
  tipo: string
  faixa: number
  taxa: number
  liderId: string | null
  liderNome: string
  equipe: PokeDeGinasio[]
  mandatoAte: string
  /** So vem pro proprio lider. */
  ganhos: number | null
  /** Defesa (referencias) — so vem pro proprio lider. */
  defesa: { pokemon_id: string; golpes?: string[] | null; rotacao?: boolean | null }[] | null
  candidatoNome: string | null
  candidatoTicks: number | null
}

export interface EstadoDosGinasios {
  ginasios: GinasioNoEstado[]
  insignias: string[]
  desafiosHoje: number
  pendentes: string[]
}

export interface DesafioCriado {
  desafioId: string
  teto: number
  liderNome: string
  liderId: string | null
  equipeDesafiante: PokeDeGinasio[]
  equipeLider: PokeDeGinasio[]
  /** Ouro do jogador depois da taxa. */
  gold: number
}

export const lerEstadoDosGinasios = () => chamar<EstadoDosGinasios>('ginasios_estado')
export const desafiarGinasio = (ginasioId: string, tipo: TipoDeDuelo, slots: SlotDeEquipe[]) =>
  chamar<DesafioCriado>('desafiar_ginasio', {
    p_ginasio: ginasioId,
    p_tipo: tipo,
    p_slots: slots.map((s) => ({ pokemon_id: s.pokemonId, golpes: s.golpes, rotacao: s.rotacao })),
  })
export const definirDefesaDoGinasio = (ginasioId: string, slots: SlotDeEquipe[]) =>
  chamar<{ mensagem: string }>('definir_defesa_do_ginasio', {
    p_ginasio: ginasioId,
    p_slots: slots.map((s) => ({ pokemon_id: s.pokemonId, golpes: s.golpes, rotacao: s.rotacao })),
  })

export const slotsDaDefesa = (d: GinasioNoEstado['defesa']): SlotDeEquipe[] =>
  (d ?? []).map((s) => ({ pokemonId: s.pokemon_id, golpes: s.golpes ?? [], rotacao: s.rotacao === true }))
export const resolverDesafio = (desafioId: string): Promise<RespostaResolverGinasio> => servidor.resolverGinasio(desafioId)

export interface DesafioNoHistorico {
  desafiante: string
  lider: string
  liderHumano: boolean
  duelo: TipoDeDuelo
  /** Do ponto de vista de quem desafiou. */
  resultado: 'vitoria' | 'derrota' | 'empate'
  ticks: number | null
  /** Ouro que o lider humano recebeu (so quando venceu). */
  repasse: number
  quando: string
}

export const historicoDoGinasio = (ginasioId: string) =>
  chamar<DesafioNoHistorico[]>('historico_do_ginasio', { p_ginasio: ginasioId })
