// PH-532: reproduz golpe a golpe o resultado que o servidor ja decidiu
// (`/pvp/resolver`) — nunca decide nada aqui, so anima uma sequencia de
// eventos ja fechada. Sem movementSystem/combatSystem: os dois POKE ficam
// parados, e "quem esta lutando" pode TROCAR no meio (time inteiro, nao 1x1)
// quando o evento seguinte troca a especie daquele lado.
import { createPokeInstance } from '@/data/pokes'
import { createRng } from '@/core/rng'
import { triggerAttackAnim, triggerHurtAnim } from './animationSystem'
import type { EnemyEntity, PlayerEntity, WorldState } from '../types'
import type { PvpEventoRemoto, LadoPvpRemoto } from '@/data/remote/servidor'

// Dano abaixo disto nao justifica o flinch — golpe fraco nao "machuca
// visivelmente" (limiar pedido: 30% do HP maximo do defensor).
const LIMIAR_HURT = 0.3
// Pausa entre um evento e o proximo, alem da duracao da propria pose de
// ataque (ATTACK_ANIM_DURATION) — sem isto os golpes emendam sem dar tempo
// de ler "quem atacou quem".
const PAUSA_ENTRE_EVENTOS = 0.35
// Nivel arbitrario so pra ter um `PokeInstance` com stats coerentes — o
// replay nunca mostra numero de stat nenhum, so precisa de `poke.hp`/
// `poke.stats.hp` pra Faint/Hurt funcionarem via `isDead`.
const NIVEL_VISUAL = 50

export interface EstadoReplayPvp {
  eventos: PvpEventoRemoto[]
  indice: number
  esperando: number
}

function pokeVisual(speciesId: string, isShiny: boolean) {
  const poke = createPokeInstance(createRng(0), speciesId, NIVEL_VISUAL)
  poke.isShiny = isShiny
  return poke
}

function entidadeDoLado(world: WorldState, lado: LadoPvpRemoto, meuLado: LadoPvpRemoto): PlayerEntity | EnemyEntity | null {
  return lado === meuLado ? world.player : (world.enemies[0] ?? null)
}

function trocarSeNecessario(entity: PlayerEntity | EnemyEntity, speciesId: string, isShiny: boolean, hp: number): void {
  if (entity.poke.speciesId === speciesId && entity.poke.isShiny === isShiny) return
  const novo = pokeVisual(speciesId, isShiny)
  novo.hp = Math.max(0, hp)
  entity.poke = novo
  entity.battleAnim = null // forca updateAnimations a resolver a arte da especie nova no proximo tick
  entity.animFrame = 0
  entity.animElapsed = 0
}

export function stepPvpReplay(world: WorldState, dt: number): void {
  const pvp = world.pvp
  if (!pvp || pvp.estado !== 'replay' || !pvp.replay || !pvp.meuLado) return
  const replay = pvp.replay
  const meuLado = pvp.meuLado

  if (replay.esperando > 0) {
    replay.esperando = Math.max(0, replay.esperando - dt)
    return
  }

  if (replay.indice >= replay.eventos.length) {
    pvp.estado = pvp.resultadoFinal ?? 'empate'
    return
  }

  const evento = replay.eventos[replay.indice]
  const atacante = entidadeDoLado(world, evento.atacanteLado, meuLado)
  const defensor = entidadeDoLado(world, evento.defensorLado, meuLado)
  if (!atacante || !defensor) { replay.indice = replay.eventos.length; return }

  trocarSeNecessario(atacante, evento.atacanteSpeciesId, evento.atacanteShiny, atacante.poke.hp)
  trocarSeNecessario(defensor, evento.defensorSpeciesId, evento.defensorShiny, evento.hpRestante + evento.dano)

  triggerAttackAnim(atacante, false, { x: defensor.x, y: defensor.y })
  defensor.poke.hp = evento.hpRestante
  if (evento.dano / Math.max(1, evento.hpMaximoDefensor) >= LIMIAR_HURT && !evento.nocaute) {
    triggerHurtAnim(defensor)
  }

  replay.indice += 1
  replay.esperando = PAUSA_ENTRE_EVENTOS
}
