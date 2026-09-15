// PH-544: golpes intervalados em ROUNDS no combate duelo.
//
// O combate livre e simultaneo: cada lado dispara quando o proprio cooldown
// global (`MIN_ACTION_GAP`, 3 s) libera, sem olhar pro outro. No combate duelo
// (`mapDef.encarada`: Campeao Lance, covis de lendario, arena PvP) o dono
// pediu o ritmo dos jogos: primeiro age quem tem mais Velocidade; 3 s depois
// age o outro; os dois tendo agido, o round fecha e o proximo REORDENA — a
// Velocidade muda durante a luta (estagio, paralisia, clima, Trick Room) e
// pode inverter quem vai primeiro. E por isso que e "round" e nao "fila
// fixa": a ordem e recalculada a cada abertura.
//
// O QUE CONTA COMO "AGIU". Qualquer saida do executor que arma o cooldown
// global: golpe disparado, golpe errado, turno perdido por status (sono,
// paralisia, congelado), Truant, atracao. Todas passam por
// `startGlobalCooldown(MIN_ACTION_GAP)`, entao o sinal e observavel sem
// duplicar a marcacao nos dois executores — a mesma decisao que
// `truantImpedeAcao` documenta. `pickAbility` devolvendo `null` (POKE sem
// golpe nenhum) nao gasta a vez; nao acontece na pratica porque todo POKE tem
// Ataque Basico.
//
// O RELOGIO conta do DISPARO, nao do pouso: `HIT_LAND_DELAY` (0,5 s) e menor
// que os 3 s, entao o golpe de quem agiu sempre pousa antes de o proximo
// disparar — a pose Hurt de quem levou nunca disputa com a pose de ataque
// dele mesmo.
//
// EMPATE de Velocidade sorteia por `world.rng`, que e a sequencia reconferida
// pelo servidor: os dois lados chegam ao mesmo vencedor do empate. Consome um
// sorteio so no empate, e so no duelo — o combate livre nao passa por aqui.
//
// TROCA. Se um dos ids do round nao esta mais de pe (caiu, ou o rival foi
// substituido por outra entidade), o round e descartado e um novo abre
// quando os dois lados voltam a ter alguem engajado. O substituto do jogador
// e a MESMA entidade (`world.player`), entao o teste e "vivo", nao "mesmo id".
//
// EFEMERO como `encarada`: nao persiste no flush. Um corte no meio de um round
// so faz o proximo comecar do zero na janela seguinte, com a ordem recalculada
// — que e o que um round novo faria de qualquer jeito.
import { nextFloat } from '@/core/rng'
import { TURNO_SEGUNDOS } from '@/data/abilities'
import { isDead } from '../entity'
import type { EnemyEntity, PlayerEntity, RodadaDeDuelo, WorldEntity, WorldState } from '../types'

/** Intervalo entre a acao de um lado e a do outro, e entre rounds. */
export const INTERVALO_DO_TURNO = TURNO_SEGUNDOS

export interface ExecutoresDeAcao {
  jogador: () => void
  inimigo: (enemy: EnemyEntity) => void
}

/**
 * Desconta o relogio do turno. Roda TODO tick de combate (silent inclusive),
 * antes de qualquer decisao de acao, pra o intervalo valer tambem enquanto
 * ninguem esta engajado — senao um par que se separa e volta a se encarar
 * dispararia na hora.
 */
export function tickRodadaDeDuelo(world: WorldState, dt: number): void {
  const rodada = world.rodadaDeDuelo
  if (!rodada) return
  if (rodada.espera > 0) rodada.espera = Math.max(0, rodada.espera - dt)
  // 180 passos de 1/60 nao somam 3 exatos em ponto flutuante; sem isto o
  // relogio sobraria um epsilon e o proximo agiria um tick depois do que
  // o cooldown global dele (que desce do mesmo jeito) ja libera.
  if (rodada.espera < 1e-6) rodada.espera = 0
}

/**
 * Um tick da decisao de acao no duelo: no maximo UMA entidade age, e so
 * quando o relogio zerou. Substitui, no combate duelo, o trecho de
 * `updateCombat` em que jogador e todos os engajados agem no mesmo tick.
 */
export function executarRodadaDeDuelo(
  world: WorldState,
  player: PlayerEntity,
  engajados: EnemyEntity[],
  velocidade: (entity: WorldEntity) => number,
  executores: ExecutoresDeAcao,
): void {
  const rival = engajados[0]
  if (!rival || isDead(player) || isDead(rival)) {
    // Um lado caiu (ou ainda nao entrou): o round em curso morre com ele. O
    // proximo abre quando os dois estiverem de pe, com a ordem recalculada.
    if (world.rodadaDeDuelo) world.rodadaDeDuelo = null
    return
  }

  let rodada = world.rodadaDeDuelo
  const rodadaValida = rodada != null
    && rodada.ordem.length === 2
    && rodada.ordem.includes(player.id)
    && rodada.ordem.includes(rival.id)
  if (!rodadaValida) {
    rodada = abrirRound(world, player, rival, velocidade, (rodada?.numero ?? 0) + 1, rodada?.espera ?? 0)
    world.rodadaDeDuelo = rodada
  }
  if (!rodada || rodada.espera > 0) return

  if (rodada.indice >= rodada.ordem.length) {
    // Os dois agiram: fecha e reabre com a ordem de agora. A espera do ultimo
    // a agir ja passou (chegamos aqui com `espera` zerada), entao o primeiro
    // do round novo age neste mesmo tick — o intervalo entre rounds e o
    // mesmo intervalo entre turnos, nao um a mais.
    rodada = abrirRound(world, player, rival, velocidade, rodada.numero + 1, 0)
    world.rodadaDeDuelo = rodada
  }

  const vezDe = rodada.ordem[rodada.indice]
  const quem: WorldEntity = vezDe === player.id ? player : rival
  const cooldownAntes = quem.globalCooldown
  if (quem === player) executores.jogador()
  else executores.inimigo(rival)

  // Agiu (ou perdeu a vez): o executor armou o cooldown global. Passa a vez
  // e arma o relogio. Se nao agiu (cooldown ainda contando de antes, ou sem
  // golpe), continua sendo a vez dele no proximo tick.
  if (quem.globalCooldown > 0 && quem.globalCooldown !== cooldownAntes) {
    rodada.indice++
    rodada.espera = INTERVALO_DO_TURNO
  }
}

function abrirRound(
  world: WorldState,
  player: PlayerEntity,
  rival: EnemyEntity,
  velocidade: (entity: WorldEntity) => number,
  numero: number,
  espera: number,
): RodadaDeDuelo {
  const vJogador = velocidade(player)
  const vRival = velocidade(rival)
  let jogadorPrimeiro: boolean
  if (vJogador === vRival) jogadorPrimeiro = nextFloat(world.rng) < 0.5
  else jogadorPrimeiro = vJogador > vRival
  // Trick Room: o mais lento vai primeiro, como nos jogos.
  if ((world.trickRoomRestante ?? 0) > 0) jogadorPrimeiro = !jogadorPrimeiro
  const ordem = jogadorPrimeiro ? [player.id, rival.id] : [rival.id, player.id]
  return { numero, ordem, indice: 0, espera }
}
