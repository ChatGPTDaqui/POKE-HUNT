// Ginasios com lider humano (entrega 4 do design de 19/10/2026,
// docs/planos/2026-10-19-ginasios-especialidades-combate-design.md).
//
// 90 ginasios: 18 tipos x 5 faixas de nivel. A luta e 6 contra 6, ao vivo na
// tela do desafiante, com o motor da arena do PvP; o servidor roda a MESMA luta
// (semente do desafio) e e quem decide. Os numeros daqui sao repetidos no SQL
// (migration 20261023140000_ginasios); `ginasios.test.ts` tranca os dois.
import type { ElementType } from './generated/types'
import { SPECIES, computeStatsAtLevel, type PokeInstance, type StatBlock } from './pokes'
import { LEGENDARY_SPECIES_IDS } from './legendaries'
import { TYPE_COLORS } from './typeColors'
import { activeAbilitiesPadrao, golpesAprendidosAte, sanearEscolhaDeGolpes } from './activeAbilities'
import type { NatureKey } from './natures'
import type { RarityKey } from './rarity'

export interface FaixaDeGinasio {
  /** Teto de nivel: POKE acima dele luta com os atributos do teto. */
  nivel: 100 | 200 | 300 | 400 | 500
  liga: string
  taxa: number
  /** Raridade da equipe do lider NPC. */
  raridadeNpc: RarityKey
}

export const FAIXAS_DE_GINASIO: readonly FaixaDeGinasio[] = [
  { nivel: 100, liga: 'Liga Regional', taxa: 50_000, raridadeNpc: 'incomum' },
  { nivel: 200, liga: 'Liga Elite', taxa: 150_000, raridadeNpc: 'raro' },
  { nivel: 300, liga: 'Liga Campeã', taxa: 400_000, raridadeNpc: 'raro' },
  { nivel: 400, liga: 'Liga Lendária', taxa: 1_000_000, raridadeNpc: 'ultra' },
  { nivel: 500, liga: 'Liga Mestra', taxa: 2_500_000, raridadeNpc: 'ultra' },
]

export const TIPOS_DE_GINASIO = Object.keys(TYPE_COLORS) as ElementType[]
export const TAMANHO_DA_EQUIPE_DE_GINASIO = 6
export const MAXIMO_DA_MESMA_ESPECIE = 2
export const DESAFIOS_POR_DIA = 2
export const MANDATO_EM_DIAS = 7
/** Parte da taxa que o lider HUMANO recebe quando vence; o resto sai do jogo. */
export const REPASSE_DO_LIDER = 0.3
/** IVs fixos da equipe do lider NPC. */
export const IV_DO_NPC = 20

export type TipoDeDuelo = 'insignia' | 'destronar'

export const idDoGinasio = (tipo: ElementType, faixa: number) => `${tipo}_${faixa}`
export function partesDoGinasio(id: string): { tipo: ElementType; faixa: FaixaDeGinasio } | null {
  const [tipo, n] = id.split('_')
  const faixa = FAIXAS_DE_GINASIO.find((f) => f.nivel === Number(n))
  return faixa && TIPOS_DE_GINASIO.includes(tipo as ElementType) ? { tipo: tipo as ElementType, faixa } : null
}

/** Um POKE na equipe de ginasio: so o que define o POKE, os atributos saem daqui. */
export interface PokeDeGinasio {
  species_id: string
  level: number
  iv: [number, number, number, number, number, number]
  rarity: RarityKey
  is_shiny: boolean
  nature: string | null
  active_abilities: string[] | null
  golpes_de_maquina: string[] | null
}

const temOTipo = (speciesId: string, tipo: ElementType) => {
  const s = SPECIES[speciesId]
  return Boolean(s && (s.type === tipo || s.type2 === tipo))
}

/**
 * Equipe valida pra duelar? Devolve o motivo da recusa, ou null.
 * `tipo` so no duelo pra destronar e na equipe do lider: todos com o tipo.
 */
export function motivoDeEquipeInvalida(especies: readonly string[], tipo: ElementType | null): string | null {
  if (especies.length !== TAMANHO_DA_EQUIPE_DE_GINASIO) return `A equipe precisa de ${TAMANHO_DA_EQUIPE_DE_GINASIO} POKEs.`
  const contagem = new Map<string, number>()
  for (const e of especies) contagem.set(e, (contagem.get(e) ?? 0) + 1)
  if ([...contagem.values()].some((n) => n > MAXIMO_DA_MESMA_ESPECIE)) {
    return `A mesma espécie pode aparecer no máximo ${MAXIMO_DA_MESMA_ESPECIE} vezes.`
  }
  if (tipo && especies.some((e) => !temOTipo(e, tipo))) return `Todos os POKEs precisam ser do tipo ${tipo}.`
  return null
}

const ivs = (iv: PokeDeGinasio['iv']): StatBlock =>
  ({ hp: iv[0], atkFis: iv[1], atkEsp: iv[2], def: iv[3], defEsp: iv[4], speed: iv[5] })

/**
 * O POKE que luta no ginasio. Acima do teto da faixa, os ATRIBUTOS saem do
 * nivel do teto; golpes e IVs continuam os dele (design de 19/10).
 */
export function pokeDoGinasio(p: PokeDeGinasio, teto: number, uid: string): PokeInstance | null {
  const species = SPECIES[p.species_id]
  if (!species) return null
  const nivel = Math.min(p.level, teto)
  const nature = (p.nature ?? null) as NatureKey | null
  const iv = ivs(p.iv)
  const stats = computeStatsAtLevel(species, nivel, iv, p.rarity, p.is_shiny, nature)
  const golpesDeMaquina = [...new Set(p.golpes_de_maquina ?? [])]
  const conhecidos = [...new Set([...golpesAprendidosAte(species, p.level), ...golpesDeMaquina])]
  const escolha = p.active_abilities ?? activeAbilitiesPadrao(species, p.level)
  return {
    uid,
    speciesId: p.species_id,
    level: nivel,
    exp: 0,
    hp: stats.hp,
    isShiny: p.is_shiny,
    rarity: p.rarity,
    ivs: iv,
    nature: nature ?? undefined,
    stats,
    unlockedAbilities: conhecidos,
    golpesDeMaquina,
    disabledAbilities: {},
    activeAbilities: sanearEscolhaDeGolpes(escolha, conhecidos, species, p.level),
    status: null,
    locked: false,
    capturedAt: new Date(0).toISOString(),
  }
}

export function equipeDoGinasio(equipe: readonly PokeDeGinasio[], teto: number, prefixo: string): PokeInstance[] {
  return equipe.map((p, i) => pokeDoGinasio(p, teto, `${prefixo}-${i}`)).filter((p): p is PokeInstance => p != null)
}

const somaBase = (id: string) => Object.values(SPECIES[id].base).reduce((a, b) => a + b, 0)

/**
 * Equipe do lider NPC: as 6 especies mais fortes do tipo (forma final, sem
 * lendaria), no teto da faixa. Tipo com menos de 6 repete ate 2 vezes.
 */
export function equipeNpc(tipo: ElementType, faixa: FaixaDeGinasio): PokeDeGinasio[] {
  const lendarias = new Set(LEGENDARY_SPECIES_IDS)
  const evoluiPraAlguem = new Set(Object.values(SPECIES).filter((s) => s.evolvesTo).map((s) => s.id))
  const candidatas = Object.keys(SPECIES)
    .filter((id) => temOTipo(id, tipo) && !lendarias.has(id) && !evoluiPraAlguem.has(id))
    .sort((a, b) => somaBase(b) - somaBase(a) || a.localeCompare(b))
  const escolhidas: string[] = []
  for (let volta = 0; volta < MAXIMO_DA_MESMA_ESPECIE && escolhidas.length < TAMANHO_DA_EQUIPE_DE_GINASIO; volta++) {
    for (const id of candidatas) {
      if (escolhidas.length >= TAMANHO_DA_EQUIPE_DE_GINASIO) break
      escolhidas.push(id)
    }
  }
  return escolhidas.map((id) => ({
    species_id: id,
    level: faixa.nivel,
    iv: [IV_DO_NPC, IV_DO_NPC, IV_DO_NPC, IV_DO_NPC, IV_DO_NPC, IV_DO_NPC],
    rarity: faixa.raridadeNpc,
    is_shiny: false,
    nature: null,
    active_abilities: null,
    golpes_de_maquina: null,
  }))
}

export const NOME_DO_LIDER_NPC = (tipo: ElementType) => `Líder ${tipo}`
