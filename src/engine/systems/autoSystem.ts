// Port de js/systems/AutoSystem.js.
import type { Rng } from '@/core/rng'
import { getItem, ITEMS, type GeneratedItem } from '@/data/items'
import type { GameStateStore } from '@/stores/gameStateStore'
import { attemptCapture, type CaptureResult } from './captureSystem'
import { heal } from '../entity'
import { curarStatus } from './statusSystem'
import type { StatusCondition } from '@/data/statusEffects'
import type { PokeInstance } from '@/data/pokes'
import type { WorldState } from '../types'

// O cooldown do TREINADOR: de 1.5 em 1.5 segundos ele consegue usar UM item de
// cura, seja pocao, revive ou antidoto. Substituiu dois timers de 1s
// independentes (um pra pocao, outro pra revive) que nunca se esperavam — o bot
// conseguia usar os dois no mesmo instante, o que nao e uma mao humana usando
// itens, e sim duas.
//
// Numero do usuario, atrelado ao Treinador como personagem (a ser introduzido).
// Poke Ball NAO passa por este cooldown: capturar nao e curar.
const COOLDOWN_DO_TREINADOR = 1.5

// Abaixo disso, HP tem precedencia sobre status: de nada adianta curar o
// veneno de um POKE que morre no proximo golpe. Acima, o status vem primeiro —
// e ele que esta impedindo o POKE de agir ou drenando HP todo turno.
const HP_CRITICO = 0.25

export const BEST_POTION_OPTION = 'best'
export const AUTO_REVIVE_DELAY = 5.0 // segundos que um POKE desmaiado espera antes do Auto-Revive disparar de verdade

// Resolve a pocao escolhida numa regra pro itemId concreto. `best` escolhe
// a pocao de maior healAmount que o jogador possui agora.
function resolveRulePotionId(gameState: GameStateStore, rule: { itemId: string }): string | null {
  if (rule.itemId !== BEST_POTION_OPTION) return rule.itemId
  const owned = Object.values(ITEMS)
    .filter((item): item is GeneratedItem & { kind: 'potion' } => item.kind === 'potion' && gameState.hasItem(item.id, 1))
    .sort((a, b) => (b.healAmount ?? 0) - (a.healAmount ?? 0))
  return owned[0]?.id || null
}

export type AutoHealEvent = { type: 'auto_pot' | 'auto_revive' | 'auto_status'; itemId: string }

/**
 * O item de cura mais BARATO que resolve o status que o POKE tem agora.
 *
 * A ordem importa em ouro: o Full Heal cura os seis, mas custa 120 contra os 30
 * de um Despertar. Deixar o bot pegar "o primeiro que serve" faria ele gastar
 * quatro vezes mais pra curar um sono. Ordena por preco de compra e pega o
 * primeiro que cobre o status — o Full Heal so entra quando e o unico que o
 * jogador tem.
 */
function melhorCuraDeStatus(gameState: GameStateStore, status: StatusCondition): GeneratedItem | null {
  const candidatos = Object.values(ITEMS)
    .filter((item): item is GeneratedItem => (
      'kind' in item && item.kind === 'status_heal'
      && Array.isArray((item as GeneratedItem).healsStatus)
      && ((item as GeneratedItem).healsStatus as string[]).includes(status)
      && gameState.hasItem(item.id, 1)
    ))
    .sort((a, b) => a.buyPrice - b.buyPrice)
  return candidatos[0] ?? null
}

// Cuida de autoPot e autoRevive. Chamado uma vez por tick fixo.
// `world.autoTimers` throttla uso repetido de item.
// Hunts BOSS (world.mapDef.noRespawn) desligam os dois toggles
// explicitamente, nao importa a config do jogador — morrer la e definitivo
// (pedido explicito do usuario).
export function updateAutoHeal(world: WorldState, gameState: GameStateStore, dt: number): AutoHealEvent[] {
  const player = world.player
  const events: AutoHealEvent[] = []
  if (!player) return events

  const timers = world.autoTimers
  timers.treinador = Math.max(0, timers.treinador - dt)

  const isBossHunt = Boolean(world.mapDef && world.mapDef.noRespawn)

  // Desmaiar comeca uma contagem regressiva fresca de AUTO_REVIVE_DELAY
  // segundos (mostrada como modal por UIManager) — Auto-Revive so dispara
  // de verdade quando chega a 0, nao no instante em que o POKE cai.
  if (!isBossHunt && gameState.autoToggles.autoRevive && player.fainted) {
    world.reviveCountdown = world.reviveCountdown == null
      ? AUTO_REVIVE_DELAY
      : Math.max(0, world.reviveCountdown - dt)
  } else {
    world.reviveCountdown = null
  }

  // UMA acao de item por janela de cooldown, na ordem de prioridade acordada:
  //
  //   1. revive              — POKE desmaiado nao faz mais nada
  //   2. pocao com HP critico — status nao importa se o proximo golpe mata
  //   3. cura de status      — e o que esta impedindo o POKE de agir
  //   4. pocao normal        — a regra de HP do jogador
  //
  // O `return` depois de cada uso e o que torna a lista uma PRIORIDADE de
  // verdade: sem ele, o cooldown seria checado quatro vezes no mesmo frame e a
  // ordem viraria enfeite.
  if (isBossHunt || timers.treinador > 0) return events

  if (gameState.autoToggles.autoRevive && player.fainted && (world.reviveCountdown ?? 0) <= 0) {
    const revive = getItem('revive')
    if (revive && 'reviveHpPercent' in revive && revive.reviveHpPercent != null && gameState.hasItem('revive', 1)) {
      gameState.removeItem('revive', 1)
      player.poke.hp = Math.round(player.poke.stats.hp * revive.reviveHpPercent)
      player.fainted = false
      player.state = 'wander'
      timers.treinador = COOLDOWN_DO_TREINADOR
      world.reviveCountdown = null
      events.push({ type: 'auto_revive', itemId: 'revive' })
      return events
    }
  }

  if (player.fainted) return events

  const fracaoDeHp = player.poke.hp / player.poke.stats.hp
  const usarPocao = (): boolean => {
    if (!gameState.autoToggles.autoPot) return false
    const hpPct = fracaoDeHp * 100
    for (const rule of gameState.autoPotRules) {
      if (hpPct > rule.hpPercent) continue
      const resolvedId = resolveRulePotionId(gameState, rule)
      const item = resolvedId && getItem(resolvedId)
      if (!item || !('healAmount' in item) || item.healAmount == null || !gameState.hasItem(resolvedId, 1)) continue
      gameState.removeItem(resolvedId, 1)
      heal(player, item.healAmount)
      timers.treinador = COOLDOWN_DO_TREINADOR
      events.push({ type: 'auto_pot', itemId: resolvedId })
      return true
    }
    return false
  }

  if (fracaoDeHp <= HP_CRITICO && usarPocao()) return events

  // Interruptor PROPRIO, e nao mais carona no `autoPot`: sao decisoes
  // diferentes. Quem quer o bot curando veneno mas nao gastando pocao (ou o
  // contrario) nao tinha como pedir isso, e quem desligava a pocao perdia a cura
  // de status sem nenhuma pista do motivo.
  if (gameState.autoToggles.autoStatus) {
    // Nao-volatil primeiro (persiste e drena HP), confusao depois.
    //
    // A confusao quase ficou de fora daqui, pelo argumento de que passa sozinha
    // em 2-5 turnos e so o Full Heal (120 de ouro) cura. O argumento nao para
    // em pe: enquanto ela dura, o POKE perde 1 turno em 3 se batendo, e 120 de
    // ouro e ruido em qualquer hunt que o jogador ja tenha desbloqueado. Curar
    // e barato; nao curar custa turno.
    const status = player.poke.status?.tipo ?? player.statusVolatil?.tipo ?? null
    if (status) {
      const cura = melhorCuraDeStatus(gameState, status)
      if (cura) {
        gameState.removeItem(cura.id, 1)
        curarStatus(player, status)
        timers.treinador = COOLDOWN_DO_TREINADOR
        events.push({ type: 'auto_status', itemId: cura.id })
        return events
      }
    }
  }

  usarPocao()
  return events
}

// Chamado logo depois de uma derrota quando gameState.autoToggles.autoCatch
// esta ligado. Precedencia: uma regra por-especie (gameState.autoCatchRules)
// ganha da config de bola shiny, que ganha da bola padrao. Uma regra
// combinada NAO tem fallback pra outra bola quando a sua propria acaba.
export function maybeAutoCatch(rng: Rng, gameState: GameStateStore, defeatedPoke: PokeInstance): CaptureResult | null {
  if (!gameState.autoToggles.autoCatch) return null

  const rule = gameState.autoCatchRules.find((r) => r.speciesId === defeatedPoke.speciesId)
  if (rule) {
    if (!rule.ballItemId || !gameState.hasItem(rule.ballItemId, 1)) return null
    return attemptCapture(rng, gameState, defeatedPoke, rule.ballItemId)
  }

  const config = gameState.autoCatchConfig
  const isShiny = Boolean(defeatedPoke.isShiny)
  const ballId = isShiny && config.catchShinyEnabled ? config.shinyBallId : config.ballId
  if (!ballId || !gameState.hasItem(ballId, 1)) return null
  return attemptCapture(rng, gameState, defeatedPoke, ballId)
}
