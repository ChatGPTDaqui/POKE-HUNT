// Regras de status, como funcoes puras sobre STATUS_RULES (gerado de
// scripts/usum/status.json, Gen VII, conferido na Bulbapedia).
//
// TUDO AQUI E PURO E SEM ESTADO. Quem guarda status e aplica efeito e o
// motor (engine/systems/statusSystem.ts); este arquivo so responde perguntas
// — "esse POKE pode ser envenenado?", "quanto de dano por turno?", "quantos
// turnos dura?". Separado porque a tela tambem precisa das mesmas respostas
// (icone, tooltip) e nao pode depender do motor.
//
// O TURNO DESTE JOGO. Nos jogos originais um turno e uma rodada da batalha.
// Aqui o combate e continuo, entao "turno" e TURNO_SEGUNDOS (2s) — o mesmo
// intervalo minimo entre duas acoes de um POKE. Um veneno que tira 1/8 por
// turno tira 1/8 a cada 2 segundos.
import { STATUS_RULES } from './generated/status.generated'
import { TURNO_SEGUNDOS } from './abilities'
import type { ElementType, StatusCondition, StatusRule } from './generated/types'
import type { Rng } from '@/core/rng'
import { nextFloat } from '@/core/rng'

export type { StatusCondition }

// Guardado no PokeInstance (nao-volatil) ou na entidade (volatil).
// `turnosRestantes: null` = nao passa sozinho — so item ou Centro Pokemon.
export interface StatusAtivo {
  tipo: StatusCondition
  turnosRestantes: number | null
}

export const STATUS_NAO_VOLATEIS = Object.keys(STATUS_RULES.naoVolateis) as StatusCondition[]
export const STATUS_VOLATEIS = Object.keys(STATUS_RULES.volateis) as StatusCondition[]

export const TURNOS_DE_IMUNIDADE_APOS_CURA = STATUS_RULES.reaplicacao.turnosDeImunidade
export const SEGUNDOS_DE_IMUNIDADE_APOS_CURA = TURNOS_DE_IMUNIDADE_APOS_CURA * TURNO_SEGUNDOS

export function regraDoStatus(tipo: StatusCondition): StatusRule | null {
  return STATUS_RULES.naoVolateis[tipo] ?? STATUS_RULES.volateis[tipo] ?? null
}

export function ehVolatil(tipo: StatusCondition): boolean {
  return tipo in STATUS_RULES.volateis
}

export function nomeDoStatus(tipo: StatusCondition): string {
  return STATUS_RULES.nomes[tipo] ?? tipo
}

const GOLPES_DE_PO = new Set(STATUS_RULES.golpesDePo.golpes)

/**
 * O POKE alvo pode receber este status?
 *
 * Cobre as tres recusas do jogo real:
 *   1. imunidade por TIPO (Fogo nao queima, Eletrico nao paralisa, ...)
 *   2. imunidade a golpe de PO — GRASS ignora Spore/Stun Spore/Sleep Powder
 *      (Gen VI em diante). Depende do GOLPE, nao do status, por isso
 *      `abilityId` entra aqui.
 *   3. ja ter um status nao-volatil. Nos jogos so cabe um por vez: um POKE
 *      dormindo nao pode ser envenenado por cima.
 */
export function podeReceberStatus(
  tipo: StatusCondition,
  alvo: { tipo1: ElementType; tipo2: ElementType | null; statusAtual: StatusCondition | null },
  abilityId?: string,
): boolean {
  const regra = regraDoStatus(tipo)
  if (!regra) return false

  if (regra.imunidadesPorTipo.includes(alvo.tipo1)) return false
  if (alvo.tipo2 && regra.imunidadesPorTipo.includes(alvo.tipo2)) return false

  if (abilityId && GOLPES_DE_PO.has(abilityId)) {
    const imunes = STATUS_RULES.golpesDePo.imunesPorTipo
    if (imunes.includes(alvo.tipo1) || (alvo.tipo2 && imunes.includes(alvo.tipo2))) return false
  }

  // So vale pros nao-volateis: confusao convive com veneno, como nos jogos.
  if (!ehVolatil(tipo) && alvo.statusAtual != null) return false

  return true
}

// Sorteia a duracao inicial. `null` = permanente (veneno, queimadura,
// paralisia, congelamento — os que so saem por item ou pelo Centro Pokemon).
export function sortearDuracao(rng: Rng, tipo: StatusCondition): number | null {
  const regra = regraDoStatus(tipo)
  if (!regra || !regra.duracaoEmTurnos) return null
  const [min, max] = regra.duracaoEmTurnos
  return min + Math.floor(nextFloat(rng) * (max - min + 1))
}

// Dano de fim de turno (veneno/queimadura), em HP. Piso de 1: 1/16 de um POKE
// de 10 de HP arredondaria pra zero e a queimadura nao faria nada em nivel
// baixo.
export function danoPorTurno(tipo: StatusCondition, hpMaximo: number): number {
  const fracao = regraDoStatus(tipo)?.danoPorTurnoFracaoDoMaximo
  if (!fracao) return 0
  return Math.max(1, Math.floor(hpMaximo * fracao))
}

export function multiplicadorDeVelocidade(tipo: StatusCondition | null): number {
  if (!tipo) return 1
  return regraDoStatus(tipo)?.multiplicadorDeVelocidade ?? 1
}

export function multiplicadorDeDanoFisico(tipo: StatusCondition | null): number {
  if (!tipo) return 1
  return regraDoStatus(tipo)?.multiplicadorDeDanoFisico ?? 1
}

// Congelamento e sono impedem a acao sempre; paralisia impede em 25% dos
// turnos. Um so ponto de decisao pra os tres, porque quem chama so quer saber
// "esse POKE age agora?".
export function perdeOTurno(rng: Rng, status: StatusAtivo | null): boolean {
  if (!status) return false
  const regra = regraDoStatus(status.tipo)
  if (!regra) return false
  if (regra.bloqueiaAcao) return true
  if (regra.chanceDePerderOTurno) return nextFloat(rng) < regra.chanceDePerderOTurno
  return false
}

export function chanceDeSeAtacar(tipo: StatusCondition): number {
  return regraDoStatus(tipo)?.chanceDeSeAtacar ?? 0
}

export function poderDoAutoDano(tipo: StatusCondition): number {
  return regraDoStatus(tipo)?.poderDoAutoDano ?? 0
}

// Golpe de FIRE que causa dano descongela o alvo, como nos jogos. Vale so pro
// congelamento, e por isso a pergunta e feita pelo tipo do golpe, nao pelo
// status.
export function descongelaCom(tipo: StatusCondition, tipoDoGolpe: ElementType, poderDoGolpe: number): boolean {
  const regra = regraDoStatus(tipo)
  return Boolean(regra?.descongelaComTipo && regra.descongelaComTipo === tipoDoGolpe && poderDoGolpe > 0)
}

export function chanceDeDescongelar(tipo: StatusCondition): number {
  return regraDoStatus(tipo)?.chanceDeDescongelarPorTurno ?? 0
}

// --- Estagios de atributo ("power ups") -------------------------------------
//
// Danca das Espadas, Rosnado, Aro de Ferro e outros 87 golpes mexem em ESTAGIO,
// nao na stat. A stat da ficha nunca muda; o que muda e um multiplicador
// temporario, que some quando o POKE sai de campo — igual a confusao, e pelo
// mesmo motivo (nos jogos, sai da batalha, zera).
export const ESTAGIO_MINIMO = -6
export const ESTAGIO_MAXIMO = 6

export type StatDeEstagio = 'atkFis' | 'atkEsp' | 'def' | 'defEsp' | 'speed'
export type EstagiosDeStat = Partial<Record<StatDeEstagio, number>>

/**
 * Multiplicador de um estagio, formula exata dos jogos: (2+n)/2 subindo e
 * 2/(2-n) descendo.
 *
 * A assimetria e de proposito e e do jogo original: +1 da 1.5x, mas -1 da
 * 0.67x, nao 0.5x. Usar `1 + n*0.5` dos dois lados (o "obvio") tornaria os
 * debuffs bem mais fortes do que sao — em -2 a diferenca ja e 0.5 contra 0.5,
 * mas em -6 seria 0 (imortal) contra 0.25.
 */
export function multiplicadorDeEstagio(estagio: number): number {
  const n = Math.max(ESTAGIO_MINIMO, Math.min(ESTAGIO_MAXIMO, estagio))
  return n >= 0 ? (2 + n) / 2 : 2 / (2 - n)
}

export function multiplicadorDeStat(estagios: EstagiosDeStat | undefined, stat: StatDeEstagio): number {
  return multiplicadorDeEstagio(estagios?.[stat] ?? 0)
}
