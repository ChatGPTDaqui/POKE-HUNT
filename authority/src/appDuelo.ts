// PH-533: "modo duelo" — Campeao Lance e lutas de lendario passam a ser
// resolvidos igual o PvP (server-side, turn-based, sem pot/movimento), em
// vez do motor de mundo em tempo real que o resto do jogo ("modo livre")
// usa. Mesmo motor do PvP (`pvpSimulator.ts`) — so o lado B nao e outro
// jogador, e o time fixo do Lance ou um lendario sorteado na hora.
import { createPokeInstance, type PokeInstance } from '@/data/pokes'
import { createRng, randomSeed } from '@/core/rng'
import { LANCE_MAP_ID, BOSS_MAPS_DATA } from '@/data/nightmareMaps'
import { simularPvp, type PvpCombatente } from '@/features/pvp/pvpSimulator'
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

// LadoPvpRemoto (`anfitriao`/`convidado`) e o vocabulario que o replay do
// PvP ja entende (pvpWorld.ts/pvpReplaySystem.ts) — jogador vira anfitriao,
// boss vira convidado, so pra reaproveitar aquele codigo sem duplicar.
function eventosParaCliente(eventos: ReturnType<typeof simularPvp>['eventos']) {
  const lado = (l: 'jogador' | 'oponente'): 'anfitriao' | 'convidado' => (l === 'jogador' ? 'anfitriao' : 'convidado')
  return eventos.map((e) => ({ ...e, atacanteLado: lado(e.atacanteLado), defensorLado: lado(e.defensorLado) }))
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
  const jogador: PvpCombatente = { nome: 'jogador', time: timeDoJogador }
  const boss: PvpCombatente = { nome: 'boss', time: timeDoBoss }
  const resultado = simularPvp(jogador, boss)

  return json({
    vencedor: resultado.vencedor === 'jogador' ? 'jogador' : resultado.vencedor === 'oponente' ? 'boss' : 'empate',
    eventos: eventosParaCliente(resultado.eventos),
    turnos: resultado.turnos,
    timeDoBoss,
  })
}
