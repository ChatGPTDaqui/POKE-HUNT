// PH-532: reproduz golpe a golpe o resultado que o servidor ja decidiu
// (`/pvp/resolver`) — nunca decide nada aqui, so anima uma sequencia de
// eventos ja fechada. Sem movementSystem/combatSystem: os dois POKE ficam
// parados, e "quem esta lutando" pode TROCAR no meio (time inteiro, nao 1x1)
// quando o evento seguinte troca a especie daquele lado.
import { createPokeInstance } from '@/data/pokes'
import { createRng } from '@/core/rng'
import { createWorldEffect } from '../effect'
import { triggerAttackAnim, triggerHurtAnim } from './animationSystem'
import type { EnemyEntity, PlayerEntity, WorldState } from '../types'
import type { PvpEventoRemoto, LadoPvpRemoto } from '@/data/remote/servidor'

// Dano abaixo disto nao justifica o flinch — golpe fraco nao "machuca
// visivelmente" (limiar pedido: 30% do HP maximo do defensor).
const LIMIAR_HURT = 0.3
// Duracao de UM turno inteiro (pedido explicito: ~3s), contada a partir do
// instante em que o golpe e aplicado. PRECISA ser maior que
// ATTACK_ANIM_DURATION (0.5s, animationSystem.ts) + HURT_ANIM_DURATION
// (0.4s) — do contrario o proximo evento troca a pose antes da atual
// terminar de tocar e a sprite de ataque nunca aparece completa (bug
// PH-534: com 0.35s o replay ficava um borrao ilegivel).
const PAUSA_ENTRE_EVENTOS = 3
// Nivel arbitrario so pra ter um `PokeInstance` com stats coerentes — o
// replay nunca mostra numero de stat nenhum, so precisa de `poke.hp`/
// `poke.stats.hp` pra Faint/Hurt funcionarem via `isDead`.
const NIVEL_VISUAL = 50

// PH-535 Fase 3: coreografia de troca — pedido explicito do usuario ("igual
// nos jogos da franquia"). Duas fases, cada uma com seu proprio tempo:
//
//   RECOLHENDO — "breve intervalo" (pedido do usuario) antes do proximo
//   POKE entrar. O que caiu ja esta com hp=0 (nenhum switch deste motor
//   acontece com o ativo vivo, ver confrontoHeadless.ts#trocarAtivo) — a
//   animacao de desmaio (`animationSystem.ts`, prioridade Faint) ja toca
//   sozinha, so precisa de TEMPO pra ser vista antes da troca instantanea
//   de especie que existia ate aqui. Sem balao — o pedido do usuario so
//   menciona fala no momento de ENTRADA.
//
//   ARREMESSANDO — reaproveita a MESMA arte de arremesso de Pokebola que a
//   captura de selvagem usa (`data/captureAnim.ts`/`render/sprites.ts`,
//   ja carregada e testada), so que CORTADA no inicio do arremesso (2s,
//   nao os 6s da tira inteira ate a captura "fechar") — sai da bola, nao
//   entra nela, que era a distincao pedida explicitamente. O balao "Vai,
//   `<nome>`!" mostra durante esta fase; a especie nova so aparece DEPOIS
//   dela terminar.
const TEMPO_RECOLHENDO = 1.0
const TEMPO_ARREMESSANDO = 2.0

export interface EstadoDeTrocaPvp {
  lado: LadoPvpRemoto
  fase: 'recolhendo' | 'arremessando'
  tempoNaFase: number
  nomeNovo: string
  speciesIdNovo: string
  isShinyNovo: boolean
  hpNovo: number
}

export interface EstadoReplayPvp {
  eventos: PvpEventoRemoto[]
  indice: number
  esperando: number
  // Ultimo evento aplicado — PvpOverlay le isto pra mostrar "X usou Y!"
  // (PH-534: o nome do golpe ja vinha do servidor mas nunca era exibido).
  ultimoEvento?: PvpEventoRemoto
  // Coreografia de troca em andamento — PvpOverlay le isto pro balao "Vai/
  // Volta, X!" (PH-535 Fase 3). `null` fora de uma troca.
  troca: EstadoDeTrocaPvp | null
}

function pokeVisual(speciesId: string, isShiny: boolean) {
  const poke = createPokeInstance(createRng(0), speciesId, NIVEL_VISUAL)
  poke.isShiny = isShiny
  return poke
}

function entidadeDoLado(world: WorldState, lado: LadoPvpRemoto, meuLado: LadoPvpRemoto): PlayerEntity | EnemyEntity | null {
  return lado === meuLado ? world.player : (world.enemies[0] ?? null)
}

function trocaPendente(entity: PlayerEntity | EnemyEntity, speciesId: string, isShiny: boolean): boolean {
  return entity.poke.speciesId !== speciesId || entity.poke.isShiny !== isShiny
}

/**
 * Inicia a coreografia — so MONTA o estado, nao muda nenhuma entidade
 * ainda (a troca de verdade so acontece no fim da fase 'arremessando', ver
 * `avancarTroca`). `hp` e o HP que o POKE novo vai ter QUANDO entrar —
 * mesmo calculo que `trocarSeNecessario` ja fazia: pro atacante e o
 * proprio HP atual (ele nao leva dano do proprio golpe), pro defensor e
 * `hpRestante + dano` (o HP que ele tinha ANTES deste hit).
 */
function iniciarTroca(lado: LadoPvpRemoto, speciesId: string, isShiny: boolean, hp: number, nome: string): EstadoDeTrocaPvp {
  return { lado, fase: 'recolhendo', tempoNaFase: TEMPO_RECOLHENDO, nomeNovo: nome, speciesIdNovo: speciesId, isShinyNovo: isShiny, hpNovo: hp }
}

/**
 * Avanca um tick da coreografia em andamento. Devolve `true` enquanto ela
 * ainda estiver segurando o replay (nao processa evento novo neste tick);
 * `false` quando termina — o proximo evento so passa a ser considerado na
 * chamada SEGUINTE de `stepPvpReplay` (nao no mesmo tick), o que da uma
 * folga de 1 frame entre "POKE novo em campo" e "ele ja ataca", tempo
 * suficiente pro balao terminar de sumir.
 */
function avancarTroca(world: WorldState, replay: EstadoReplayPvp, meuLado: LadoPvpRemoto, dt: number): boolean {
  const troca = replay.troca!
  troca.tempoNaFase -= dt
  if (troca.tempoNaFase > 0) return true

  if (troca.fase === 'recolhendo') {
    troca.fase = 'arremessando'
    troca.tempoNaFase = TEMPO_ARREMESSANDO
    const entity = entidadeDoLado(world, troca.lado, meuLado)
    if (entity) {
      // Mesma arte de captura de selvagem (data/captureAnim.ts), so que a
      // `duration` curta corta a tira ANTES da cauda de "fechar/confirmar" —
      // aqui ela e so "a bola chega e abre", nao "a bola prende um alvo".
      world.effects.push(createWorldEffect(world.counters, {
        type: 'captureAnim', x: entity.x, y: entity.y, targetX: entity.x, targetY: entity.y,
        ballItemId: 'poke_ball', success: true, delay: 0, duration: TEMPO_ARREMESSANDO,
      }))
    }
    return true
  }

  // Fase 'arremessando' terminou — so AGORA a especie de fato troca.
  const entity = entidadeDoLado(world, troca.lado, meuLado)
  if (entity) {
    const novo = pokeVisual(troca.speciesIdNovo, troca.isShinyNovo)
    novo.hp = Math.max(0, troca.hpNovo)
    entity.poke = novo
    entity.battleAnim = null // forca updateAnimations a resolver a arte da especie nova no proximo tick
    entity.animFrame = 0
    entity.animElapsed = 0
  }
  replay.troca = null
  return false
}

export function stepPvpReplay(world: WorldState, dt: number): void {
  const pvp = world.pvp
  if (!pvp || pvp.estado !== 'replay' || !pvp.replay || !pvp.meuLado) return
  const replay = pvp.replay
  const meuLado = pvp.meuLado

  if (replay.troca) {
    if (avancarTroca(world, replay, meuLado, dt)) return
  }

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

  // So UMA troca por tick (a outra, se houver, pega na chamada seguinte —
  // ver o comentario de `avancarTroca` sobre a folga de 1 frame).
  if (trocaPendente(atacante, evento.atacanteSpeciesId, evento.atacanteShiny)) {
    replay.troca = iniciarTroca(evento.atacanteLado, evento.atacanteSpeciesId, evento.atacanteShiny, atacante.poke.hp, evento.atacante)
    return
  }
  if (trocaPendente(defensor, evento.defensorSpeciesId, evento.defensorShiny)) {
    replay.troca = iniciarTroca(evento.defensorLado, evento.defensorSpeciesId, evento.defensorShiny, evento.hpRestante + evento.dano, evento.defensor)
    return
  }

  triggerAttackAnim(atacante, false, { x: defensor.x, y: defensor.y })
  defensor.poke.hp = evento.hpRestante
  if (evento.dano / Math.max(1, evento.hpMaximoDefensor) >= LIMIAR_HURT && !evento.nocaute) {
    triggerHurtAnim(defensor)
  }

  replay.ultimoEvento = evento
  replay.indice += 1
  replay.esperando = PAUSA_ENTRE_EVENTOS
}
