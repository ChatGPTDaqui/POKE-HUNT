// Ranking, Hall da Fama e as metricas do Perfil do Treinador.
//
// Tudo aqui e LEITURA, feita com a `service_role`, e o que volta pro cliente e
// recortado a mao (nome + o numero do criterio). O cliente nao consulta essas
// tabelas direto de proposito: a RLS nao deixa um jogador ler a linha de outro,
// e afrouxar isso pra montar um ranking exporia ouro, itens e equipe de todo
// mundo — o ranking precisa de dois campos, nao da linha inteira.
import { ErroHttp, selecionar, selecionarTudo, type Config } from './db.js'

// Teto de linhas devolvidas. O cliente pede menos; isto e o limite duro pra uma
// query solta nao virar um dump da base.
const LIMITE_MAXIMO = 100
const LIMITE_PADRAO = 50

export const CONQUISTA_LANCE = 'boss_lance'

export type CriterioPoke = 'level' | 'atkFis' | 'atkEsp' | 'hp' | 'def' | 'defEsp' | 'speed'

// Nome do criterio no jogo -> coluna real. Mapa explicito, e nao interpolacao
// do que o cliente mandou: o valor entra numa URL de PostgREST (`order=...`), e
// aceitar texto livre ali e injecao de query.
const COLUNA_POR_CRITERIO: Record<CriterioPoke, string> = {
  level: 'level',
  hp: 'stat_hp',
  atkFis: 'stat_atk_fis',
  atkEsp: 'stat_atk_esp',
  def: 'stat_def',
  defEsp: 'stat_def_esp',
  speed: 'stat_speed',
}

export function ehCriterioPoke(valor: string): valor is CriterioPoke {
  return valor in COLUNA_POR_CRITERIO
}

function limite(valor: string | null): number {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return LIMITE_PADRAO
  return Math.min(Math.floor(n), LIMITE_MAXIMO)
}

interface LinhaTreinador {
  user_id: string
  trainer_name: string
  trainer_level: number
  trainer_exp: number
}

export interface EntradaTreinador {
  userId: string
  nome: string
  nivel: number
  exp: number
}

export async function rankingDeTreinadores(cfg: Config, limiteBruto: string | null): Promise<EntradaTreinador[]> {
  const n = limite(limiteBruto)
  const linhas = await selecionar<LinhaTreinador>(
    cfg,
    `players?select=user_id,trainer_name,trainer_level,trainer_exp&order=trainer_exp.desc,trainer_level.desc&limit=${n}`,
  )
  return linhas.map((l) => ({
    userId: l.user_id,
    nome: l.trainer_name,
    nivel: l.trainer_level,
    exp: Number(l.trainer_exp),
  }))
}

interface LinhaPoke {
  user_id: string
  species_id: string
  level: number
  is_shiny: boolean
  rarity: string
  stat_hp: number
  stat_atk_fis: number
  stat_atk_esp: number
  stat_def: number
  stat_def_esp: number
  stat_speed: number
}

export interface EntradaPoke {
  userId: string
  treinador: string
  speciesId: string
  level: number
  isShiny: boolean
  rarity: string
  valor: number
}

export async function rankingDePokemon(cfg: Config, criterio: CriterioPoke, limiteBruto: string | null): Promise<EntradaPoke[]> {
  const n = limite(limiteBruto)
  const coluna = COLUNA_POR_CRITERIO[criterio]
  const linhas = await selecionar<LinhaPoke>(
    cfg,
    `pokemon_instances?select=user_id,species_id,level,is_shiny,rarity,stat_hp,stat_atk_fis,stat_atk_esp,stat_def,stat_def_esp,stat_speed&order=${coluna}.desc&limit=${n}`,
  )
  const nomes = await nomesDosTreinadores(cfg, linhas.map((l) => l.user_id))
  return linhas.map((l) => ({
    userId: l.user_id,
    treinador: nomes.get(l.user_id) ?? 'Treinador',
    speciesId: l.species_id,
    level: l.level,
    isShiny: l.is_shiny,
    rarity: l.rarity,
    valor: (l as unknown as Record<string, number>)[coluna],
  }))
}

// Uma consulta so pros nomes, em vez de um join do PostgREST: a FK de
// `pokemon_instances` aponta pra `players`, mas embutir o join na URL faria o
// recorte de colunas depender da sintaxe de embed — e o objetivo aqui e
// justamente nao devolver a linha inteira de `players` por acidente.
async function nomesDosTreinadores(cfg: Config, userIds: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(userIds)]
  if (!unicos.length) return new Map()
  const linhas = await selecionar<{ user_id: string; trainer_name: string }>(
    cfg,
    `players?select=user_id,trainer_name&user_id=in.(${unicos.join(',')})`,
  )
  return new Map(linhas.map((l) => [l.user_id, l.trainer_name]))
}

export interface EntradaHall {
  userId: string
  nome: string
  conquistadoEm: string
}

export async function hallDaFama(cfg: Config, conquista: string, limiteBruto: string | null): Promise<EntradaHall[]> {
  const n = limite(limiteBruto)
  const linhas = await selecionar<{ user_id: string; conquistado_em: string }>(
    cfg,
    `hall_da_fama?select=user_id,conquistado_em&conquista=eq.${encodeURIComponent(conquista)}&order=conquistado_em.asc&limit=${n}`,
  )
  const nomes = await nomesDosTreinadores(cfg, linhas.map((l) => l.user_id))
  return linhas.map((l) => ({
    userId: l.user_id,
    nome: nomes.get(l.user_id) ?? 'Treinador',
    conquistadoEm: l.conquistado_em,
  }))
}

export interface Perfil {
  rank: number
  totalJogadores: number
  segundosJogados: number
  contaCriadaEm: string | null
  noHallDaFama: string | null
}

/**
 * Os numeros do Perfil que NAO estao no estado do jogador.
 *
 * `rank` e contado, nao ordenado: "quantos jogadores tem mais EXP que eu, + 1".
 * Ordenar a base inteira pra achar a posicao de um jogador seria caro e daria o
 * mesmo numero.
 */
export async function perfilDoJogador(cfg: Config, userId: string): Promise<Perfil> {
  const [meu] = await selecionar<{ trainer_exp: number; created_at: string }>(
    cfg,
    `players?user_id=eq.${userId}&select=trainer_exp,created_at`,
  )
  if (!meu) throw new ErroHttp(404, 'jogador sem linha em `players`')

  const [acima, todos, sessoes, hall] = await Promise.all([
    selecionar<{ user_id: string }>(cfg, `players?select=user_id&trainer_exp=gt.${Number(meu.trainer_exp)}`),
    selecionar<{ user_id: string }>(cfg, 'players?select=user_id'),
    selecionarTudo<{ simulated_seconds: number | string }>(cfg, `game_sessions?user_id=eq.${userId}&select=simulated_seconds`),
    selecionar<{ conquistado_em: string }>(
      cfg,
      `hall_da_fama?user_id=eq.${userId}&conquista=eq.${CONQUISTA_LANCE}&select=conquistado_em`,
    ),
  ])

  return {
    rank: acima.length + 1,
    totalJogadores: todos.length,
    segundosJogados: sessoes.reduce((soma, s) => soma + Number(s.simulated_seconds || 0), 0),
    contaCriadaEm: meu.created_at ?? null,
    noHallDaFama: hall[0]?.conquistado_em ?? null,
  }
}
