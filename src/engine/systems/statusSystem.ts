// Aplicacao e passagem do tempo dos status.
//
// COMO O TEMPO FUNCIONA AQUI. Nos jogos originais o status resolve no fim de
// cada turno da batalha. Este combate e continuo e nao tem turno global — cada
// POKE tem o SEU relogio (`proximoTurnoDeStatus`), que dispara a cada
// TURNO_SEGUNDOS. E o mesmo intervalo que separa duas acoes dele, entao um
// veneno de 1/8 por turno tira 1/8 no ritmo em que aquele POKE agiria.
//
// POR QUE O RELOGIO DE STATUS E SEPARADO DO COOLDOWN DE ACAO: um POKE dormindo
// nao age, mas o sono precisa continuar contando. Amarrar o tick de status ao
// `globalCooldown` deixaria o sono eterno — o POKE nunca agiria, entao o
// contador nunca desceria.
import { nextFloat, type Rng } from '@/core/rng'
import { SPECIES } from '@/data/pokes'
import { TURNO_SEGUNDOS } from '@/data/abilities'
import {
  podeReceberStatus, sortearDuracao, danoPorTurno, ehVolatil, perdeOTurno,
  chanceDeDescongelar, descongelaCom, chanceDeSeAtacar, poderDoAutoDano,
  SEGUNDOS_DE_IMUNIDADE_APOS_CURA, ESTAGIO_MINIMO, ESTAGIO_MAXIMO,
  type StatusAtivo, type StatusCondition,
} from '@/data/statusEffects'
import type { StatChange } from '@/data/generated/types'
import type { Ability } from '@/data/abilities'
import type { WorldEntity } from '../types'
import { heal } from '../entity'

// Fracoes de HP MAXIMO por turno dos golpes de tick volatil novos (ver
// BaseEntity#seeded/curseDot/nightmareDot/regenPercent em engine/types.ts).
// Vivem aqui (nao em combatSystem.ts) porque so sao lidas dentro de
// tickStatus — quem SETA cada flag e resolveHit (combatSystem.ts), que tem
// suas proprias constantes de aplicacao (custo do Curse, regenPercent do
// Ingrain/Aqua Ring, etc).
const LEECH_SEED_DRAIN_PERCENT = 1 / 8
const CURSE_DOT_PERCENT = 1 / 4
const NIGHTMARE_DOT_PERCENT = 1 / 4

export function statusNaoVolatil(entity: WorldEntity): StatusAtivo | null {
  return entity.poke.status ?? null
}

export function statusAtivos(entity: WorldEntity): StatusAtivo[] {
  const saida: StatusAtivo[] = []
  const nv = statusNaoVolatil(entity)
  if (nv) saida.push(nv)
  if (entity.statusVolatil) saida.push(entity.statusVolatil)
  return saida
}

/**
 * Vale a pena tentar este status neste alvo AGORA?
 *
 * Usada pela IA (`pickAbility`) antes de escolher um golpe de status puro. Sem
 * ela o inimigo gastaria turnos jogando Thunder Wave num POKE ja paralisado,
 * num POKE de tipo ELECTRIC, ou dentro da janela de imunidade de reaplicacao —
 * e a leitura pro jogador seria "esse POKE parou de atacar do nada".
 *
 * Nao sorteia nada: e a pergunta "pode pegar", nao "pegou".
 */
export function statusVaiPegar(alvo: WorldEntity, tipo: StatusCondition, abilityId?: string): boolean {
  if (alvo.imunidadeDeStatus > 0) return false
  if (ehVolatil(tipo) && alvo.statusVolatil) return false
  const especie = SPECIES[alvo.poke.speciesId]
  return podeReceberStatus(tipo, {
    tipo1: especie.type,
    tipo2: especie.type2,
    statusAtual: statusNaoVolatil(alvo)?.tipo ?? null,
  }, abilityId)
}

/**
 * Tenta aplicar `tipo` em `alvo`. Devolve o status aplicado, ou null se nao
 * pegou (imunidade, ja tem status, imunidade de reaplicacao, ou o sorteio da
 * chance falhou).
 *
 * `abilityId` entra porque a imunidade a golpe de PO depende do GOLPE, nao do
 * status: GRASS ignora Sleep Powder mas nao ignora Hypnosis.
 */
export function aplicarStatus(
  rng: Rng,
  alvo: WorldEntity,
  tipo: StatusCondition,
  chance: number,
  abilityId?: string,
): StatusAtivo | null {
  // A imunidade de reaplicacao vale pros dois tipos de status: e ela que
  // impede o Antidoto de virar ouro jogado fora num combate que nao acaba.
  if (alvo.imunidadeDeStatus > 0) return null

  const especie = SPECIES[alvo.poke.speciesId]
  const podeReceber = podeReceberStatus(tipo, {
    tipo1: especie.type,
    tipo2: especie.type2,
    statusAtual: statusNaoVolatil(alvo)?.tipo ?? null,
  }, abilityId)
  if (!podeReceber) return null

  // Confusao sobre confusao nao empilha nem estende, como nos jogos.
  if (ehVolatil(tipo) && alvo.statusVolatil) return null

  if (nextFloat(rng) * 100 >= chance) return null

  const status: StatusAtivo = { tipo, turnosRestantes: sortearDuracao(rng, tipo) }
  if (ehVolatil(tipo)) alvo.statusVolatil = status
  else alvo.poke.status = status
  return status
}

/**
 * Aplica as mudancas de estagio de atributo de um golpe ("power ups").
 *
 * `ability.statTarget === 'self'` manda no proprio usuario (Danca das Espadas);
 * ausente manda no alvo (Rosnado). Sem essa distincao, Danca das Espadas subiria
 * o Ataque do INIMIGO — e o dado cru da PokeAPI nao a carrega, ela vem de
 * `move.target` (ver fetch-usum-catalog.js).
 *
 * Devolve as mudancas que REALMENTE entraram: quem ja esta em +6 nao sobe mais,
 * e o chamador precisa saber disso pra nao anunciar um buff que nao houve.
 */
export function aplicarMudancasDeStat(
  rng: Rng,
  atacante: WorldEntity,
  alvo: WorldEntity,
  ability: Ability,
): StatChange[] {
  if (!ability.statChanges || !ability.statChance) return []
  if (nextFloat(rng) * 100 >= ability.statChance) return []

  const destino = ability.statTarget === 'self' ? atacante : alvo
  const aplicadas: StatChange[] = []
  for (const mudanca of ability.statChanges) {
    const antes = destino.estagios[mudanca.stat] ?? 0
    const depois = Math.max(ESTAGIO_MINIMO, Math.min(ESTAGIO_MAXIMO, antes + mudanca.estagios))
    if (depois === antes) continue // ja no teto ou no piso
    destino.estagios[mudanca.stat] = depois
    aplicadas.push({ stat: mudanca.stat, estagios: depois - antes })
  }
  return aplicadas
}

// Efeito colateral de golpe: le `ability.status`/`statusChance` e tenta aplicar.
// Separado de `aplicarStatus` porque o golpe tambem PODE DESCONGELAR o alvo
// (golpe de FIRE com dano), e as duas coisas acontecem no mesmo hit.
export function aplicarEfeitosDoGolpe(rng: Rng, alvo: WorldEntity, ability: Ability): StatusAtivo | null {
  const congelado = statusNaoVolatil(alvo)
  if (congelado && descongelaCom(congelado.tipo, ability.type, ability.power)) {
    curarStatus(alvo, congelado.tipo)
  }

  if (!ability.status || !ability.statusChance) return null
  return aplicarStatus(rng, alvo, ability.status, ability.statusChance, ability.id)
}

/**
 * Tira um status e liga a imunidade de reaplicacao.
 *
 * `tipo` opcional: sem ele tira TUDO (o que o Centro Pokemon faz). Com ele,
 * tira so aquele — e o que um Antidoto faz.
 */
export function curarStatus(entity: WorldEntity, tipo?: StatusCondition): boolean {
  let curou = false
  const nv = statusNaoVolatil(entity)
  if (nv && (!tipo || nv.tipo === tipo)) {
    entity.poke.status = null
    curou = true
  }
  if (entity.statusVolatil && (!tipo || entity.statusVolatil.tipo === tipo)) {
    entity.statusVolatil = null
    curou = true
  }
  if (curou) entity.imunidadeDeStatus = SEGUNDOS_DE_IMUNIDADE_APOS_CURA
  return curou
}

/**
 * Zera o que os jogos zeram no fim da batalha: estagios de atributo e status
 * volatil (confusao). O nao-volatil NAO sai daqui — ele sobrevive a batalha
 * nos jogos, e e por isso que existe Antidoto.
 *
 * A imunidade de reaplicacao tambem nao e mexida: ela e sobre o tempo desde a
 * ultima cura, nao sobre a batalha.
 */
export function limparEstadoVolatil(entity: WorldEntity): void {
  entity.statusVolatil = null
  entity.estagios = {}
  // Golpes de tick volatil novos (leech_seed/curse/nightmare/ingrain/aqua_ring)
  // sao a mesma familia de "some no fim da batalha" do statusVolatil/estagios
  // acima — sem timer proprio, entao sem este ponto nunca sairiam sozinhos.
  entity.seeded = undefined
  entity.curseDot = undefined
  entity.nightmareDot = undefined
  entity.regenPercent = undefined
}

export interface TickDeStatus {
  /** Dano de veneno/queimadura aplicado neste turno (0 se nenhum). */
  dano: number
  /** Status que sairam sozinhos neste turno (sono acabou, descongelou, ...). */
  expirados: StatusCondition[]
  /**
   * Leech Seed: quanto curar em quem PLANTOU a semente, e o id dele.
   * Ausente = nada a drenar. A cura em si e cross-entity (precisa achar a
   * origem em `world.player`/`world.enemies`), entao quem aplica de fato e o
   * chamador (combatSystem.ts#updateCombat) — mesmo motivo de `dano` nao ser
   * aplicado aqui dentro (ver comentario da funcao).
   */
  drenoParaOrigem?: { sourceId: string; amount: number }
}

/**
 * Passa o tempo dos status de UMA entidade. Chamado todo frame; so faz algo
 * quando o relogio de turno dela fecha.
 *
 * NAO aplica o dano no POKE — devolve quanto foi, pro chamador (combatSystem)
 * decidir sobre numero flutuante, morte e loot com o mesmo caminho que ja usa
 * pro resto do dano.
 */
export function tickStatus(rng: Rng, entity: WorldEntity, dt: number): TickDeStatus {
  if (entity.imunidadeDeStatus > 0) {
    entity.imunidadeDeStatus = Math.max(0, entity.imunidadeDeStatus - dt)
  }

  entity.proximoTurnoDeStatus -= dt
  // EPSILON, e nao `> 0`: dez frames de 0.2s somam 1.9999999999999998, nao 2.
  // Sem a folga, um turno que fecha exatamente no fim de um frame escorrega
  // pro frame seguinte por causa de um erro de ponto flutuante — inofensivo
  // num tick, mas e o tipo de coisa que faz um teste de "quantos turnos ate
  // acordar" falhar de forma intermitente.
  if (entity.proximoTurnoDeStatus > 1e-9) return { dano: 0, expirados: [] }
  entity.proximoTurnoDeStatus += TURNO_SEGUNDOS

  const expirados: StatusCondition[] = []
  let dano = 0

  const nv = statusNaoVolatil(entity)
  if (nv) {
    dano += danoPorTurno(nv.tipo, entity.poke.stats.hp)

    // Congelamento nao tem contador: e um sorteio por turno. Sono tem.
    const chanceDeSair = chanceDeDescongelar(nv.tipo)
    if (chanceDeSair > 0) {
      if (nextFloat(rng) < chanceDeSair) {
        entity.poke.status = null
        expirados.push(nv.tipo)
      }
    } else if (nv.turnosRestantes != null) {
      nv.turnosRestantes -= 1
      if (nv.turnosRestantes <= 0) {
        entity.poke.status = null
        expirados.push(nv.tipo)
      }
    }
  }

  const vol = entity.statusVolatil
  if (vol && vol.turnosRestantes != null) {
    vol.turnosRestantes -= 1
    if (vol.turnosRestantes <= 0) {
      entity.statusVolatil = null
      expirados.push(vol.tipo)
    }
  }

  // A imunidade de reaplicacao comeca quando o status SAI sozinho, igual a
  // quando sai por item — senao o POKE que acabou de acordar levaria Hypnosis
  // de novo no mesmo instante.
  if (expirados.length) entity.imunidadeDeStatus = SEGUNDOS_DE_IMUNIDADE_APOS_CURA

  // --- Golpes de tick volatil novos (leech_seed/curse/nightmare/ingrain/
  // aqua_ring) --------------------------------------------------------------
  // Mesmo relogio de turno de cima (proximoTurnoDeStatus ja fechou, ou o
  // early-return no topo desta funcao teria saido antes de chegar aqui).
  // Somam no MESMO `dano` agregado que veneno/queimadura ja usa acima —
  // combatSystem aplica tudo junto num unico takeDamage/spawnDamageNumber.
  // CUIDADO se outra fase (clima) tambem mexer em `dano` aqui: somar, nunca
  // substituir.
  let drenoParaOrigem: { sourceId: string; amount: number } | undefined
  if (entity.seeded) {
    const quanto = Math.max(1, Math.round(entity.poke.stats.hp * LEECH_SEED_DRAIN_PERCENT))
    dano += quanto
    drenoParaOrigem = { sourceId: entity.seeded.sourceId, amount: quanto }
  }
  if (entity.curseDot) {
    dano += Math.max(1, Math.round(entity.poke.stats.hp * CURSE_DOT_PERCENT))
  }
  // Nightmare so causa dano ENQUANTO o alvo estiver dormindo — se ele acordar
  // a flag fica ligada (nao precisa limpar), mas simplesmente para de fazer
  // nada, exatamente como pedido.
  if (entity.nightmareDot && entity.poke.status?.tipo === 'sleep') {
    dano += Math.max(1, Math.round(entity.poke.stats.hp * NIGHTMARE_DOT_PERCENT))
  }
  // Ingrain/Aqua Ring (mesmo campo `regenPercent` pros dois): HoT puro, sem
  // dreno de ninguem, cura sempre a propria entidade.
  if (entity.regenPercent) {
    heal(entity, Math.max(1, Math.round(entity.poke.stats.hp * entity.regenPercent)))
  }

  return { dano, expirados, drenoParaOrigem }
}

export type ResultadoDaAcao =
  | { agir: true }
  // `autoDano` so vem na confusao — nos outros o POKE simplesmente perde o
  // turno, sem se machucar.
  | { agir: false; motivo: StatusCondition; autoDano?: number }

/**
 * O POKE consegue agir neste turno?
 *
 * Ordem igual a dos jogos: o status nao-volatil resolve ANTES da confusao —
 * um POKE dormindo nem chega a se atacar de confuso.
 *
 * `calcularAutoDano` e injetado em vez de calculado aqui porque o dano de
 * confusao usa o MESMO pipeline de dano do combate (nivel, Ataque, Defesa),
 * que mora em combatSystem. Reimplementar aqui seria uma segunda formula de
 * dano pra divergir na primeira mudanca de balanceamento.
 */
export function tentarAgir(rng: Rng, entity: WorldEntity, calcularAutoDano: (poder: number) => number): ResultadoDaAcao {
  const nv = statusNaoVolatil(entity)
  if (nv && perdeOTurno(rng, nv)) return { agir: false, motivo: nv.tipo }

  const vol = entity.statusVolatil
  if (vol) {
    const chance = chanceDeSeAtacar(vol.tipo)
    if (chance > 0 && nextFloat(rng) < chance) {
      return { agir: false, motivo: vol.tipo, autoDano: calcularAutoDano(poderDoAutoDano(vol.tipo)) }
    }
  }
  return { agir: true }
}
