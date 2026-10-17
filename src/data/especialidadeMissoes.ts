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
// la — so o contador `ativo_tipo_seg:<TIPO>` e novo (tempo de caçada com um
// POKE do tipo em campo), somado em `authority/src/progresso.ts`.
//
// O NIVEL 10 E PROVISORIO. O topo e o duelo com o Lider de Ginasio do tipo,
// que entra numa entrega propria; ate la ele pede o maior degrau do molde.
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

const NOME_DO_CLIMA: Record<Clima, string> = {
  sol: 'sol forte', chuva: 'chuva', neve: 'neve', areia: 'tempestade de areia', nevoa: 'névoa',
}

const HORA = 3600

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
const ABATES = [100, 300, 600, 1000, 1600, 2400, 3500, 5000, 7000, 10000]
const HORAS_ATIVO = [0.5, 1, 2, 4, 6, 10, 15, 20, 30, 40]
const COLECAO = [0, 3, 0, 5, 0, 0, 8, 0, 0, 0]
const NIVEL_DO_POKE = [0, 0, 0, 0, 40, 0, 0, 60, 0, 80]
const ESTAGIO = [0, 0, 3, 0, 0, 6, 0, 0, 9, 10]
const HORAS_CLIMA = [0, 0.5, 0, 2, 0, 0, 5, 0, 0, 0]

const fmt = new Intl.NumberFormat('pt-BR')
function horas(h: number): string {
  return h < 1 ? `${Math.round(h * 60)} min` : `${fmt.format(h)} h`
}

function requisitosComuns(tipo: ElementType, i: number): RequisitoDeMissao[] {
  const casa = CASA[tipo]
  const req: RequisitoDeMissao[] = []
  if (ESTAGIO[i] > 0) {
    req.push({
      regra: { t: 'metrica', m: 'estagio_do_bioma', arg: casa.bioma, alvo: ESTAGIO[i] },
      texto: `Limpar o estágio ${ESTAGIO[i]} do ${casa.nomeDoBioma}`,
    })
  }
  if (NIVEL_DO_POKE[i] > 0) {
    req.push({
      regra: { t: 'posse', f: { tipo, nivel_min: NIVEL_DO_POKE[i] }, alvo: 1 },
      texto: `Ter um POKE ${tipo} capturado por você no Lv ${NIVEL_DO_POKE[i]}`,
    })
  }
  return req
}

function colecao(tipo: ElementType, alvo: number): RequisitoDeMissao {
  const teto = Math.max(1, Math.floor(especiesCapturaveisDoTipo(tipo) * 0.8))
  const n = Math.min(alvo, teto)
  return {
    regra: { t: 'colecao', de: 'possuidas', f: { tipo }, alvo: n },
    texto: `Ter ${n} espécies ${tipo} diferentes capturadas por você`,
  }
}

function missaoDeDano(tipo: ElementType, i: number): RequisitoDeMissao[] {
  const req: RequisitoDeMissao[] = [{
    regra: { t: 'abates', tipo, alvo: ABATES[i] },
    texto: `Derrotar ${fmt.format(ABATES[i])} POKEs ${tipo}`,
  }]
  if (COLECAO[i] > 0) req.push(colecao(tipo, COLECAO[i]))
  return [...req, ...requisitosComuns(tipo, i)]
}

function missaoDeDefesa(tipo: ElementType, i: number): RequisitoDeMissao[] {
  const casa = CASA[tipo]
  const req: RequisitoDeMissao[] = [{
    regra: { t: 'contador', chave: `ativo_tipo_seg:${tipo}`, alvo: HORAS_ATIVO[i] * HORA },
    texto: `Caçar ${horas(HORAS_ATIVO[i])} com um POKE ${tipo} em campo`,
  }]
  if (HORAS_CLIMA[i] > 0) {
    // Tipo sem clima proprio troca o degrau de clima por colecao.
    req.push(casa.clima
      ? {
        regra: { t: 'contador', chave: `clima_seg:${casa.clima}`, alvo: HORAS_CLIMA[i] * HORA },
        texto: `Caçar ${horas(HORAS_CLIMA[i])} sob ${NOME_DO_CLIMA[casa.clima]}`,
      }
      : colecao(tipo, COLECAO[i] || 3 + i))
  }
  return [...req, ...requisitosComuns(tipo, i)]
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
