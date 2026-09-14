// PH-533/535: "modo duelo" — Campeao Lance e lutas de lendario resolvidos
// SERVER-SIDE, turn-based, sem pot/movimento. PH-535 trocou o motor: em vez
// de `pvpSimulator.ts` (dano reimplementado do zero, sem stage/status/trait),
// roda o MESMO motor real de qualquer hunt (`combatSystem.ts#updateCombat`)
// de forma headless, com o gate de turno aditivo (`world.rodadaDuelo`, ver
// engine/types.ts) — habilidade de entrada (Intimidate etc.) agora tem
// efeito mecanico DE VERDADE, nao so decorativo.
import { createPokeInstance, type PokeInstance } from '@/data/pokes'
import { createRng, randomSeed } from '@/core/rng'
import { LANCE_MAP_ID, BOSS_MAPS_DATA } from '@/data/nightmareMaps'
import { createEnemyEntity, createPlayerEntity, isDead } from '@/engine/entity'
import { emptyWorldState } from '@/engine/worldState'
import { updateCombat } from '@/engine/systems/combatSystem'
import { apagarTodosOsEstagios } from '@/engine/systems/statusSystem'
import type { EnemyEntity, EventoDuelo, LadoDuelo, PlayerEntity, WorldState } from '@/engine/types'
import { ErroHttp, type Config } from './db.js'
import { carregarEstado } from './progresso.js'
import { MAPS, bloqueioDoLance, grupoLiberado } from '#engine'

const LANCE_RARITY = 'legendary'
const LANCE_IVS = { hp: 23, atkFis: 23, atkEsp: 23, def: 23, defEsp: 23, speed: 23 }
const LANCE_TEAM: { speciesId: string; level: number }[] = [
  { speciesId: 'gyarados', level: 60 },
  { speciesId: 'dragonite', level: 55 },
  { speciesId: 'charizard', level: 60 },
  { speciesId: 'dragonite', level: 56 },
  { speciesId: 'aerodactyl', level: 60 },
  { speciesId: 'dragonite', level: 65 },
]
const BOSS_LEVEL = 300

// Passo do loop headless — nao precisa ser fino (ninguem renderiza isto),
// so pequeno o bastante pra `HIT_LAND_DELAY`/cooldowns baterem certo.
const PASSO_DUELO = 0.1
// Teto de seguranca: pior caso realista (6v6, muito status/Protect) fica bem
// abaixo disto — mesma filosofia do teto de `offlineSimSystem.ts`, so que por
// STEPS (aqui nao ha "tempo real" pra estourar, o loop roda o mais rapido
// que o servidor permitir).
const MAX_TICKS_DUELO = 6000

function json(dado: unknown, status = 200): Response {
  return new Response(JSON.stringify(dado), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}

function montarTimeDoBoss(mapId: string): PokeInstance[] {
  const rng = createRng(randomSeed())
  if (mapId === LANCE_MAP_ID) {
    return LANCE_TEAM.map((entry) => createPokeInstance(rng, entry.speciesId, entry.level, {
      rarity: LANCE_RARITY as PokeInstance['rarity'], ivs: LANCE_IVS,
    }))
  }
  // Lendario: `boss_<speciesId>` — mesmo id que spawnEnemyAt usaria pra
  // sortear um so, so que aqui ja sabemos a especie pelo proprio mapId.
  const speciesId = mapId.slice('boss_'.length)
  return [createPokeInstance(rng, speciesId, BOSS_LEVEL)]
}

// LadoPvpRemoto (`anfitriao`/`convidado`) e o vocabulario que o replay ja
// entende (pvpWorld.ts/pvpReplaySystem.ts, PH-532) — jogador vira anfitriao,
// boss vira convidado, so pra reaproveitar aquele codigo sem duplicar.
function eventosParaCliente(eventos: EventoDuelo[]) {
  const lado = (l: LadoDuelo): 'anfitriao' | 'convidado' => (l === 'player' ? 'anfitriao' : 'convidado')
  return eventos.map((e) => ({ ...e, atacanteLado: lado(e.atacanteLado), defensorLado: lado(e.defensorLado) }))
}

// Um time durante a resolucao headless: array fixo (nunca reordena — ao
// contrario de `trocarPorDesmaio`/simulation.ts, que rotaciona a equipe DE
// VERDADE do jogador porque o jogo continua depois; aqui o resultado e
// descartado ao fim da chamada) + o indice do ativo atual.
interface TimeDoDuelo {
  pokes: PokeInstance[]
  indiceAtivo: number
}

/** Acha o primeiro vivo a partir de `indiceAtivo` (inclusive), sem avancar. */
function primeiroVivo(time: TimeDoDuelo): PokeInstance | null {
  while (time.indiceAtivo < time.pokes.length && time.pokes[time.indiceAtivo].hp <= 0) time.indiceAtivo++
  return time.pokes[time.indiceAtivo] ?? null
}

/** Avanca PASSADO o atual (que acabou de desmaiar) e acha o proximo vivo. */
function proximoVivo(time: TimeDoDuelo): PokeInstance | null {
  time.indiceAtivo++
  return primeiroVivo(time)
}

/**
 * Poe `novoPoke` em campo no lugar do que desmaiou — mesma ideia de
 * `trocarPorDesmaio` (simulation.ts), sem a parte que so faz sentido pro
 * jogador de verdade (rotacionar `gameState.team`, mover pro spawn point
 * visual): aqui e so a ENTIDADE que muda.
 *
 * `entradaProcessada = false` e o ponto central da PH-535 — e o que faz o
 * hook de entrada (Intimidate etc.) disparar de novo pro POKE que acabou de
 * entrar, com efeito mecanico real (nao so uma linha de texto).
 */
function trocarAtivo(entity: PlayerEntity | EnemyEntity, novoPoke: PokeInstance, world: WorldState): void {
  entity.poke = novoPoke
  entity.cooldowns = {}
  entity.globalCooldown = 0
  entity.flashTimer = 0
  entity.deathHandled = false
  entity.entradaProcessada = false
  // `updateCombat` tem um early-return INCONDICIONAL em `player.fainted`
  // (roda antes de qualquer coisa, todo tick) — sem resetar aqui a luta
  // trava pra sempre no primeiro desmaio do jogador, mesmo com reserva viva.
  // So existe no lado `player` (EnemyEntity nao tem este campo).
  if (entity.kind === 'player') entity.fainted = false
  apagarTodosOsEstagios(entity)
  // Nova rodada: forca reavaliacao de Velocidade pro par que acabou de
  // entrar (ver combatSystem.ts#updateCombat, bloco "NOVO ROUND").
  world.rodadaDuelo!.fila = []
}

/**
 * Roda o duelo INTEIRO de uma vez, headless — mesmo motor real de qualquer
 * hunt (`updateCombat`), so travado em turnos alternados por Velocidade via
 * `world.rodadaDuelo` (engine/types.ts, PH-535). Sem `stepWorld`/
 * `buildMapWorld`: um duelo nao tem movimento, spawn ou sala — so os dois
 * ativos, parados, batendo.
 */
export function rodarDuelo(timeJogadorInicial: PokeInstance[], timeRivalInicial: PokeInstance[]): {
  vencedor: 'jogador' | 'boss' | 'empate'
  eventos: EventoDuelo[]
} {
  const timeJogador: TimeDoDuelo = { pokes: timeJogadorInicial, indiceAtivo: 0 }
  const timeRival: TimeDoDuelo = { pokes: timeRivalInicial, indiceAtivo: 0 }
  const pokeJogador = primeiroVivo(timeJogador)
  const pokeRival = primeiroVivo(timeRival)
  if (!pokeJogador || !pokeRival) {
    // Guard defensivo — os dois chamadores ja garantem equipe nao-vazia
    // antes de chegar aqui.
    return { vencedor: !pokeJogador ? 'boss' : 'jogador', eventos: [] }
  }

  const world = emptyWorldState(randomSeed())
  world.rodadaDuelo = { fila: [], eventos: [] }

  const player = createPlayerEntity(world.counters, { poke: pokeJogador, x: 0, y: 0 })
  player.state = 'engaged'
  // `encounterId` so alimenta `aggroRadius` (createEnemyEntity) — irrelevante
  // aqui, `movementSystem` nunca roda num duelo. Reaproveita o encontro
  // registrado do PROPRIO mapa (ja existe pra todo mapa de boss/Lance) em
  // vez de cadastrar um novo so pra isto, mesmo truque que
  // `pvpWorld.ts#criarMundoPvpVisual` ja usava no cliente.
  const enemy = createEnemyEntity(world.counters, {
    poke: pokeRival, x: 40, y: 0, encounterId: BOSS_MAPS_DATA[LANCE_MAP_ID].enemyPool[0],
  })
  enemy.state = 'engaged'
  enemy.targetId = player.id
  world.player = player
  world.enemies = [enemy]

  for (let tick = 0; tick < MAX_TICKS_DUELO; tick++) {
    updateCombat(world, PASSO_DUELO, { silent: true })

    let jogadorSemTime = false
    let rivalSemTime = false
    if (isDead(player)) {
      const proximo = proximoVivo(timeJogador)
      if (proximo) trocarAtivo(player, proximo, world)
      else jogadorSemTime = true
    }
    if (isDead(enemy)) {
      const proximo = proximoVivo(timeRival)
      if (proximo) trocarAtivo(enemy, proximo, world)
      else rivalSemTime = true
    }
    if (jogadorSemTime || rivalSemTime) {
      const vencedor = jogadorSemTime && rivalSemTime ? 'empate' : rivalSemTime ? 'jogador' : 'boss'
      return { vencedor, eventos: world.rodadaDuelo.eventos }
    }
  }
  // Teto de steps estourado sem ninguem vencer (nao deveria acontecer com
  // times de ate 6 — ver MAX_TICKS_DUELO) — empate em vez de travar a
  // resposta ou devolver 500.
  return { vencedor: 'empate', eventos: world.rodadaDuelo.eventos }
}

export async function resolverDuelo(cfg: Config, jogadorId: string, req: Request): Promise<Response> {
  const corpo = (await req.json().catch(() => null)) as { mapId?: string } | null
  const mapId = corpo?.mapId
  if (!mapId) throw new ErroHttp(400, 'mapId e obrigatorio')
  if (!BOSS_MAPS_DATA[mapId]) throw new ErroHttp(400, 'este mapa nao e um duelo de boss')
  if (!MAPS[mapId]) throw new ErroHttp(400, 'hunt desconhecida')

  const estado = await carregarEstado(cfg, jogadorId, { comBag: false })

  const grupo = MAPS[mapId].continent
  if (!grupoLiberado(grupo, estado.unlockedContinents)) {
    throw new ErroHttp(403, 'Derrote o Campeao Lance para acessar esta area.')
  }
  // Mapas de boss/Lance nao tem id de estagio (`parseEstagioIdOuEspelho`
  // devolve null pra eles) — o gate de estagio (`bloqueioDeBiomaPendente`
  // em appSessao.ts) e sempre no-op aqui, por isso nao entra nesta rota.
  if (mapId === LANCE_MAP_ID) {
    const doLance = bloqueioDoLance(estado.biomaProgress)
    if (doLance) throw new ErroHttp(403, doLance)
  }

  const timeDoJogador = estado.team.filter((p) => p.hp > 0)
  if (timeDoJogador.length === 0) {
    throw new ErroHttp(409, 'Toda a sua equipe esta desmaiada. Cure na Enfermeira antes de duelar.')
  }

  const timeDoBoss = montarTimeDoBoss(mapId)
  const resultado = rodarDuelo(timeDoJogador, timeDoBoss)

  return json({
    vencedor: resultado.vencedor,
    eventos: eventosParaCliente(resultado.eventos),
    turnos: resultado.eventos.length,
    timeDoBoss,
  })
}
