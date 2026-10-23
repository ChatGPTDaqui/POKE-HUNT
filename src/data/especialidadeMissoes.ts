// Especialidade como MISSAO ("Prova do Tipo") — decisao do dono, 17/10/2026.
//
// Cada nivel de cada trilha passa a pedir FEITOS do tipo, alem da Pedra e do
// ouro (que continuam, em quantidade menor: hibrido). Sao 18 tipos x 2 trilhas
// x 10 niveis = 360 missoes, geradas por um MOLDE e nao escritas uma a uma: o
// que muda de um tipo pro outro e a casa dele (bioma), o clima e quantas
// especies daquele tipo existem pra colecionar.
//
// O REQUISITO E UMA REGRA NO FORMATO DAS CONQUISTAS, de proposito. Quem confere
// no servidor e o MESMO avaliador (`conquista_valor` / `conquista_alvo`), entao
// nao nasce um segundo motor de regras. Todo tipo de regra usado aqui ja existe
// la. Desde 23/10/2026 os requisitos sao FEITOS com POKEs do tipo (ver o bloco
// das familias abaixo), contados por engine/feitos.ts e somados no flush.
//
// O NIVEL 10 PEDE A INSIGNIA DO GINASIO DO TIPO (desde 23/10/2026).
//
// Requisito nunca depende do jogo fechado: farm offline nao existe, e o tempo
// de caçada so anda com o jogador jogando.
import type { ElementType } from './generated/types'
import { ESPECIALIDADE_NIVEL_MAX, ESPECIALIDADE_TYPES, type EspecialidadeTrilha } from './especialidades'
import { SUB_BIOMA_ESPECIES } from './generated/subBiomas.generated'
import { SPECIES } from './pokes'

/** Regra no formato que `conquista_valor` entende (subconjunto usado aqui). */
export type RegraDeMissao =
  | { t: 'abates'; tipo: ElementType; alvo: number }
  | { t: 'contador'; chave: string; alvo: number }
  | { t: 'colecao'; de: 'possuidas'; f: { tipo: ElementType }; alvo: number }
  | { t: 'posse'; f: { tipo: ElementType; nivel_min: number }; alvo: number }
  | { t: 'metrica'; m: 'estagio_do_bioma'; arg: string; alvo: number }

export interface RequisitoDeMissao {
  regra: RegraDeMissao
  /** Texto curto pra tela. */
  texto: string
}

export interface MissaoDeEspecialidade {
  tipo: ElementType
  trilha: EspecialidadeTrilha
  /** O nivel que a missao LIBERA (1..10). */
  nivel: number
  requisitos: RequisitoDeMissao[]
}

type Clima = 'sol' | 'chuva' | 'neve' | 'areia' | 'nevoa'

/** Bioma-casa e clima de cada tipo. Ver a tabela do brainstorm de 17/10/2026. */
const CASA: Record<ElementType, { bioma: string; nomeDoBioma: string; clima?: Clima }> = {
  NORMAL: { bioma: 'campo_aberto', nomeDoBioma: 'Campo Aberto' },
  FIRE: { bioma: 'igneo', nomeDoBioma: 'Ígneo', clima: 'sol' },
  WATER: { bioma: 'marinho', nomeDoBioma: 'Marinho', clima: 'chuva' },
  GRASS: { bioma: 'mata', nomeDoBioma: 'Mata', clima: 'sol' },
  ELECTRIC: { bioma: 'industrial', nomeDoBioma: 'Industrial' },
  ICE: { bioma: 'gelido', nomeDoBioma: 'Gélido', clima: 'neve' },
  FIGHTING: { bioma: 'urbano', nomeDoBioma: 'Urbano' },
  POISON: { bioma: 'aguas_interiores', nomeDoBioma: 'Águas Interiores' },
  GROUND: { bioma: 'aridos', nomeDoBioma: 'Áridos', clima: 'areia' },
  FLYING: { bioma: 'subterraneo', nomeDoBioma: 'Subterrâneo' },
  PSYCHIC: { bioma: 'sagrado', nomeDoBioma: 'Sagrado' },
  BUG: { bioma: 'mata', nomeDoBioma: 'Mata' },
  ROCK: { bioma: 'subterraneo', nomeDoBioma: 'Subterrâneo', clima: 'areia' },
  GHOST: { bioma: 'sombrio', nomeDoBioma: 'Sombrio', clima: 'nevoa' },
  DRAGON: { bioma: 'aridos', nomeDoBioma: 'Áridos' },
  DARK: { bioma: 'sombrio', nomeDoBioma: 'Sombrio', clima: 'nevoa' },
  STEEL: { bioma: 'industrial', nomeDoBioma: 'Industrial' },
  FAIRY: { bioma: 'sagrado', nomeDoBioma: 'Sagrado' },
}

/**
 * Quantas especies do tipo um jogador consegue capturar no jogo: as que nascem
 * em algum sub-bioma ou sala especial. A coleção pedida nunca passa de 80%
 * disso — GHOST tem 9 especies selvagens, e pedir 10 seria missao impossivel.
 */
export function especiesCapturaveisDoTipo(tipo: ElementType): number {
  const nascem = new Set(Object.values(SUB_BIOMA_ESPECIES).flat())
  return [...nascem].filter((id) => {
    const s = SPECIES[id]
    return s && (s.type === tipo || s.type2 === tipo)
  }).length
}

// Degraus do molde, por nivel (indice 0 = nivel 1).
// FEITOS COM POKES DO TIPO (23/10/2026, entrega 3 do design de 19/10). Cada
// nivel pede de 1 a 3 feitos, crescendo com o nivel. Quatro familias:
//   Combate (Dano)  — derrotar selvagens, acertos super-efetivos, chefes;
//   Defesa (Defesa) — golpes resistidos, sobreviver no limite, vencer quem tem
//                     vantagem de tipo;
//   Conhecer (as duas) — capturas e evolucoes do tipo, colecao de especies;
//   Dominio (niveis altos) — estagio do bioma de casa e estagio com a equipe
//                     toda do tipo.
// Os contadores `*_tipo:<T>` sao contados pela simulacao (engine/feitos.ts) e
// somados no flush; `evolucao_tipo` vem do gatilho de evolucao no banco.
// Quem ja tem nivel o mantem: so os PROXIMOS niveis leem estas missoes.
const ABATES_COM_O_TIPO = [60, 150, 300, 500, 800, 1200, 1700, 2400, 3300, 4500]
const SUPEREFICAZES = [0, 40, 0, 120, 200, 0, 450, 650, 0, 1200]
const CHEFES = [0, 0, 2, 0, 0, 8, 0, 0, 20, 0]
const RESISTIDOS = [10, 25, 50, 90, 140, 200, 280, 380, 500, 650]
const NO_LIMITE = [0, 1, 0, 2, 0, 3, 0, 5, 0, 8]
const VANTAGEM = [0, 0, 5, 0, 15, 0, 35, 0, 60, 0]
const CAPTURAS = [0, 3, 0, 0, 10, 0, 0, 25, 0, 0]
const EVOLUCOES = [0, 0, 0, 1, 0, 0, 3, 0, 0, 5]
const ESTAGIO_DA_CASA = [0, 0, 3, 0, 0, 6, 0, 0, 9, 10]
const ESTAGIO_COM_A_EQUIPE = [0, 0, 0, 0, 0, 0, 0, 1, 0, 2]

/**
 * NIVEL 10 = INSIGNIA DO TIPO (23/10/2026, entrega 4): vencer o ginasio do tipo
 * pela insignia, em qualquer faixa. `_aplicar_resultado_ginasio` soma
 * `insignia:<TIPO>` na primeira insignia de cada ginasio.
 */
const insignia = (tipo: ElementType): RequisitoDeMissao =>
  ({ regra: { t: 'contador', chave: `insignia:${tipo}`, alvo: 1 }, texto: `Conquistar uma insígnia de ginásio ${tipo}` })

/** Teto de feitos por nivel: 1 no nivel 1, 2 do 2 ao 4, 3 do 5 em diante. */
export const FEITOS_POR_NIVEL = (i: number) => (i === 0 ? 1 : i < 4 ? 2 : 3)

const fmt = new Intl.NumberFormat('pt-BR')
const contador = (chave: string, alvo: number, texto: string): RequisitoDeMissao =>
  ({ regra: { t: 'contador', chave, alvo }, texto })

/** Feitos das familias Conhecer e Dominio, comuns as duas trilhas. Em ordem de prioridade. */
function conhecerEDominio(tipo: ElementType, i: number): RequisitoDeMissao[] {
  const casa = CASA[tipo]
  const req: RequisitoDeMissao[] = []
  if (ESTAGIO_COM_A_EQUIPE[i] > 0) {
    req.push(contador(`estagio_equipe:${tipo}`, ESTAGIO_COM_A_EQUIPE[i],
      `Limpar ${ESTAGIO_COM_A_EQUIPE[i] > 1 ? `${ESTAGIO_COM_A_EQUIPE[i]} estágios` : 'um estágio'} com a equipe toda ${tipo}`))
  }
  if (ESTAGIO_DA_CASA[i] > 0) {
    req.push({
      regra: { t: 'metrica', m: 'estagio_do_bioma', arg: casa.bioma, alvo: ESTAGIO_DA_CASA[i] },
      texto: `Limpar o estágio ${ESTAGIO_DA_CASA[i]} do ${casa.nomeDoBioma}`,
    })
  }
  if (EVOLUCOES[i] > 0) req.push(contador(`evolucao_tipo:${tipo}`, EVOLUCOES[i], `Evoluir ${EVOLUCOES[i]} POKE${EVOLUCOES[i] > 1 ? 's' : ''} ${tipo}`))
  if (CAPTURAS[i] > 0) req.push(contador(`captura_tipo:${tipo}`, CAPTURAS[i], `Capturar ${CAPTURAS[i]} POKEs ${tipo}`))
  return req
}

function missaoDeDano(tipo: ElementType, i: number): RequisitoDeMissao[] {
  const req: RequisitoDeMissao[] = [
    contador(`abate_tipo:${tipo}`, ABATES_COM_O_TIPO[i], `Vencer ${fmt.format(ABATES_COM_O_TIPO[i])} selvagens com um POKE ${tipo} em campo`),
  ]
  if (CHEFES[i] > 0) req.push(contador(`protetor_tipo:${tipo}`, CHEFES[i], `Derrotar ${CHEFES[i]} Guardiões ou Lordes com um POKE ${tipo}`))
  if (SUPEREFICAZES[i] > 0) req.push(contador(`supereficaz_tipo:${tipo}`, SUPEREFICAZES[i], `Acertar ${fmt.format(SUPEREFICAZES[i])} golpes ${tipo} super-efetivos`))
  return [req[0], ...(i === 9 ? [insignia(tipo)] : []), ...req.slice(1), ...conhecerEDominio(tipo, i)].slice(0, FEITOS_POR_NIVEL(i))
}

function missaoDeDefesa(tipo: ElementType, i: number): RequisitoDeMissao[] {
  const req: RequisitoDeMissao[] = [
    contador(`resistido_tipo:${tipo}`, RESISTIDOS[i], `Aguentar ${fmt.format(RESISTIDOS[i])} golpes "pouco efetivos" com um POKE ${tipo}`),
  ]
  if (VANTAGEM[i] > 0) req.push(contador(`vantagem_tipo:${tipo}`, VANTAGEM[i], `Vencer ${VANTAGEM[i]} selvagens com vantagem de tipo sobre o seu POKE ${tipo}`))
  if (NO_LIMITE[i] > 0) req.push(contador(`critico_tipo:${tipo}`, NO_LIMITE[i], `Vencer ${NO_LIMITE[i]} luta${NO_LIMITE[i] > 1 ? 's' : ''} com o POKE ${tipo} abaixo de 25% de HP`))
  return [req[0], ...(i === 9 ? [insignia(tipo)] : []), ...req.slice(1), ...conhecerEDominio(tipo, i)].slice(0, FEITOS_POR_NIVEL(i))
}

export const MISSOES_DE_ESPECIALIDADE: readonly MissaoDeEspecialidade[] = ESPECIALIDADE_TYPES.flatMap((tipo) =>
  (['dano', 'defesa'] as const).flatMap((trilha) =>
    Array.from({ length: ESPECIALIDADE_NIVEL_MAX }, (_, i) => ({
      tipo,
      trilha,
      nivel: i + 1,
      requisitos: trilha === 'dano' ? missaoDeDano(tipo, i) : missaoDeDefesa(tipo, i),
    }))))

/** A missao que libera o nivel `nivel` (1..10), ou null fora da regua. */
export function missaoDoNivel(tipo: ElementType, trilha: EspecialidadeTrilha, nivel: number): MissaoDeEspecialidade | null {
  return MISSOES_DE_ESPECIALIDADE.find((m) => m.tipo === tipo && m.trilha === trilha && m.nivel === nivel) ?? null
}
