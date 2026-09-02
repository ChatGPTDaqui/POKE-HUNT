// Nucleo de SIMULACAO — construcao de mundo, stepWorld, resolucao de kill.
//
// Separado de controller.ts (as acoes de UI) por um motivo concreto: este
// arquivo precisa rodar HEADLESS EM NODE, porque na Fase D o servidor passa a
// ser quem simula de verdade — o cliente vira predicao, como client-side
// prediction de FPS. Por isso aqui nao pode haver nenhum import de VALOR de
// `gameStateStore` (ele puxa o adaptador de persistencia -> lib/supabase ->
// `import.meta.env`, que so existe no bundle do navegador). `GameStateStore`
// entra so como TIPO, que o build apaga.
//
// `useToastStore` fica: e zustand puro, roda em Node sem problema. E, na
// pratica, o servidor simula sempre com `silent: true`, que ja pula toda
// notificacao daqui.
//
// Por que NAO verificar por re-simulacao (o plano original da Fase D dizia
// isso): o motor usa Math.sin/cos/atan2 no movimento e o IEEE 754 nao
// especifica essas funcoes bit-a-bit, entao navegador e Node divergem no
// ultimo bit — posicao diverge, instante de engajamento diverge, kill diverge.
// Um comparador acusaria jogador honesto. E re-simular pra conferir custa a
// MESMA CPU que simular; se vai gastar, gaste sendo a autoridade.
import { SPECIES, createPokeInstance, rollIvsDoProtetor, type PokeInstance } from '@/data/pokes'
import { mapDefParaSala, spawnPointParaSala, spawnInimigoParaSala, mapWalkRadius, isCellBlocked, nearestOpenPoint, type MapDef } from '@/data/maps'
import { getEncounter } from '@/data/enemies'
import { getItem } from '@/data/items'
import { isDamagingAbility } from '@/data/abilities'
import { traitDoPoke } from '@/data/traits'
import { getEffectiveness } from '@/data/generated/typeChart.generated'
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from '@/data/generated/formulas.generated'
import { randInt, randRange, weightedPick } from '@/core/random'
import type { Rng } from '@/core/rng'
import { captureAnimFrameDuration, captureAnimFrameCount } from '@/data/captureAnim'
import { rarityOf, realceDaRaridade } from '@/data/rarity'
import { ESPERA_DE_TROCA_SEGUNDOS } from '@/data/huntTypes'
import { formatStatGains } from '@/data/statLabels'
import type { EspecialidadeNiveis } from '@/data/especialidades'
import { ABATES_POR_SALA, SUB_BIOMA_POR_CHAVE } from '@/data/biomas'
import { parseEstagioId, quantidadeDeSalas } from '@/data/estagios'

import { createPlayerEntity, createEnemyEntity, isDead, takeDamage } from './entity'
import { createWorldEffect } from './effect'
import { updateMovement } from './systems/movementSystem'
import { atualizarLure } from './systems/lureSystem'
import { updateCombat, podeDanificar } from './systems/combatSystem'
import { aplicarStatus, apagarTodosOsEstagios } from './systems/statusSystem'
import { bloqueiaAcaoSempre } from '@/data/statusEffects'
import { climaAmbienteDaSala, climaDeAmbiente, tickClimaDeGolpe } from './systems/climaAmbiente'
import { updateAnimations, tickAttackAnimTimers } from './systems/animationSystem'
import { updateAutoHeal, maybeAutoCatch } from './systems/autoSystem'
import { grantExp, expRewardForEnemy, grantTrainerExp, applyDeathExpPenalty } from './systems/progressionSystem'
import { awardKillLoot } from './systems/economySystem'
import { recordKill } from './systems/farmRates'
import {
  contextoDeSpawn, lootAtivo, novaSala, registrarAbate, temSalas,
  aplicarTransicaoDeSala, garantirTransicaoDeQuotaFechada, protetorDaSala, resolverProtetorDaSala, type TipoDeProtetor,
  encurtarTransicaoDeSala, contextoDoProtetor, type ContextoDeSpawn,
} from './systems/salaSystem'
import { recordPokedexKill } from './systems/pokedexSystem'
import type { KillResult } from './systems/offlineSimSystem'

import type { GameStateStore } from '@/stores/gameStateStore'
import { emptyWorldState } from './worldState'
import { toastStore } from '@/stores/toastStoreVanilla'
import { celebracaoStore } from '@/stores/celebracaoStoreVanilla'
import { splashDeSalaStore } from '@/stores/splashDeSalaVanilla'
import type {
  ClimaTipo, EnemyEntity, EnemyHazards, Point, PlayerEntity, SalaAtiva, WorldState, ProtetorPendente,
} from './types'

export const STARTER_LEVEL = 1
// Starters sempre saem previsiveis — raridade Comum, IV 75% (23/31) em toda
// stat — em vez do roll aleatorio por-instancia normal, pra a primeira
// POKE de uma run nova nao ser um outlier de sorte.
export const STARTER_RARITY = 'comum' as const
export const STARTER_IVS = { hp: 23, atkFis: 23, atkEsp: 23, def: 23, defEsp: 23, speed: 23 }
export const DEATH_ANIM_GRACE_PERIOD = 4.0 // segundos que um inimigo derrotado fica visivel tocando a pose Faint

/**
 * PH-301: quantas vezes o sorteio do protetor pode repetir procurando um que o
 * POKE em campo consiga danificar. Ver `criarEntidadeDoProtetor`.
 *
 * 6 e teto de trabalho, nao alvo: no caso normal a primeira tentativa passa e
 * nenhum numero extra sai da sequencia. So sobe quando o pool tem muita
 * especie imune ao tipo do POKE — e ai 6 ja cobre bem: com metade do pool
 * imune, a chance de as 6 falharem e 1 em 64.
 */
export const TENTATIVAS_DE_PROTETOR_DANIFICAVEL = 6

/**
 * PH-301: segundos de COMBATE ENGAJADO sem o protetor perder um ponto de HP
 * antes de ele ser trocado por outro.
 *
 * O cao de guarda existe porque o filtro do sorteio nao cobre tudo: o jogador
 * troca de POKE depois do sorteio, o protetor sobe estagio de defesa, o pool da
 * sala pode ser todo imune. Nenhum desses e erro do motor, e todos terminam do
 * mesmo jeito sem isto — sala parada em 30/30 pra sempre, sem erro na tela.
 *
 * TROCA o protetor em vez de liberar a sala. Liberar seria bypass do gate de
 * bioma (quem credita `bioma_progress` e matar o LORD, ver
 * `avancarBiomaProgressSeForOProximo`) — o jogador ganharia o avanco sem a
 * luta. Trocando, o gate continua de pe e o que morre e so o impasse.
 *
 * 12s: acima de qualquer sequencia normal de "errei dois golpes seguidos"
 * (o intervalo entre acoes e ~2s) e bem abaixo da janela de flush de 30s, pra
 * caber inteiro dentro de UMA janela do servidor — o contador e efemero como
 * `salaCountdownRemaining`, e nao atravessa a reconstrucao de mundo.
 */
export const PROTETOR_SEM_DANO_LIMITE = 12

const formulaEngine = createFormulaEngine(FORMULAS)
export const OFFLINE_FARM_MAX_HOURS = formulaEngine.evalOrDefault('OFFLINE_FARM_MAX_HOURS', 6)
export const OFFLINE_SIM_STEP_SECONDS = formulaEngine.evalOrDefault('OFFLINE_SIM_STEP_SECONDS', 0.1)
// Mesmo passo fixo que useGameLoop.ts usa pro tick ao vivo (1/60s). PH-37: o
// resim do servidor usava OFFLINE_SIM_STEP_SECONDS (0.1s, 6x mais grosso) pra
// QUALQUER flush, inclusive o normal (<=LIMIAR_OFFLINE_SEGUNDOS). RNG e
// sorteado por evento (ataque, status), mas O INSTANTE em que um evento
// dispara depende de um cooldown cruzar zero — com passo mais grosso esse
// cruzamento acontece em outro instante simulado, desalinhando a sequencia
// de sorteios cedo. Client (1/60s) e servidor (0.1s) resimulando o MESMO
// intervalo com o MESMO rng_state divergiam so por causa do tamanho do
// passo, mesmo sem nenhuma interacao real do jogador no meio — e o POKE
// levava level-up no client que o servidor nunca confirmava.
//
// Fix paliativo: bate o passo do servidor com o do client fora do regime
// offline. Nao elimina 100% de divergencia (jogo ao vivo tem tempo real
// variavel por tick do lado do client, resim do servidor sempre fixo), mas
// fecha o desalinhamento de 6x que dominava o caso reproduzido. O jeito
// definitivo de fechar isso de vez e o flush ser refeito (ver PH-62,
// intervalo adaptativo) — nao antecipado aqui.
export const LIVE_SIM_STEP_SECONDS = 1 / 60
export const MIN_CATCHUP_GAP_SECONDS = 5
export const MIN_OFFLINE_GAP_SECONDS = 60
// Acima disso o gap caracteriza ausencia real (offline de verdade, nao so um
// respiro entre acoes) e o combate roda em modo pessimista (sem critico, dano
// no piso da variacao) — em vez da MESMA distribuicao do jogo ao vivo.
// Compartilhado entre cliente e servidor: os dois caminhos de farm offline
// (server/src/progresso.ts no flush, e o boot sem servidor aqui embaixo em
// GameShell.tsx) precisam concordar sobre quando ligar `world.pessimista`,
// senao o farm offline sem servidor renderia melhor que o ao vivo por ate
// OFFLINE_FARM_MAX_HOURS — o invariante que esse modo pessimista existe pra
// proteger (PH-15).
export const LIMIAR_OFFLINE_SEGUNDOS = 120
// De quanto em quanto tempo o debito entre relogio de parede e tempo
// simulado e reconciliado. De proposito independente de qualquer evento de
// visibilidade — ver o comentario em App.tsx#useBackgroundCatchUp.
export const CATCHUP_CHECK_INTERVAL_MS = 10000
// Orcamento de tempo real mais curto que o do Farm Offline de boot: o
// catch-up roda com o jogo ja na tela, entao a pausa e sentida como travada.
// Como o simulador engrossa o passo em vez de descartar o resto do tempo
// (ver offlineSimSystem.ts), um orcamento menor custa fidelidade, nao tempo
// de jogo perdido.
export const CATCHUP_WALL_CLOCK_BUDGET_MS = 1200

export function shinyPrefix(isShiny?: boolean): string {
  return isShiny ? '✨ ' : ''
}

// ---------- Construcao de mundo ----------

// A sequencia de sorteios ATRAVESSA as trocas de cena: quem constroi um mundo
// novo passa o `rng`/`counters` do mundo atual, entao a sessao inteira e uma
// unica sequencia derivada de uma semente so. Sem isso, cada ida ao Hospital
// reiniciaria o stream com uma semente nova e o servidor (Fase D) teria que
// rastrear uma semente por cena em vez de uma por sessao.
export type SequenciaDeSorteio = Pick<WorldState, 'rng' | 'counters' | 'seed'>

function novoMundo(carry?: SequenciaDeSorteio): WorldState {
  const base = emptyWorldState()
  if (carry) {
    base.rng = { ...carry.rng }
    base.counters = { ...carry.counters }
    // Sem isto o clima de ambiente re-sortearia a cada janela de simulacao:
    // `emptyWorldState()` sorteia uma semente nova quando ninguem passa uma, e
    // o clima e derivado dela (PH-140).
    base.seed = carry.seed
  }
  return base
}

export function buildHospitalWorld(activePoke: PokeInstance | null, hospitalSpot: Point, carry?: SequenciaDeSorteio): WorldState {
  const base = novoMundo(carry)
  const player = activePoke ? createPlayerEntity(base.counters, { poke: activePoke, x: hospitalSpot.x, y: hospitalSpot.y }) : null
  if (player && isDead(player)) player.fainted = true
  return { ...base, player, enemies: [] }
}

const SPAWN_MIN_DISTANCE = 250
const SPAWN_MARGIN = 60
const SPAWN_POINT_MAX_ATTEMPTS = 40

// Pedido explicito do usuario: POKE selvagem so nasce a media distancia e na
// LINHA DE VISAO do jogador — um cone a frente de pra onde ele esta virado
// (`player.facing`, ja mantido por MovementSystem a cada passo). Faz o
// jogador ter que andar/virar pra "descobrir" spawn novo em vez de tudo
// aparecer ao redor do ponto onde ele esta parado — o pedido era
// literalmente "criar a ideia de explorar o mapa".
const SPAWN_CONE_MIN_DISTANCE = 250 // "media distância": nunca colado no jogador
const SPAWN_CONE_MAX_DISTANCE = 550 // nem no fim do mapa — se a tentativa nao achar celula livre nessa faixa, cai no sorteio antigo (raio do mapa inteiro) abaixo
const SPAWN_CONE_HALF_ANGLE = (55 * Math.PI) / 180 // ~110 graus de cone total
/**
 * Distancia minima ENTRE inimigos, em unidades de mundo (PH-143).
 *
 * O cone acima resolve "onde o jogador consegue ver", e so isso. Cada inimigo
 * era sorteado sem olhar onde os outros ja estavam, entao com `maxEnemies: 6`
 * (o valor das faixas em data/biomas.ts) os seis caiam na MESMA fatia de ~110
 * graus e podiam nascer colados. O resultado e um pico de dificuldade que nao
 * vem da faixa de nivel da hunt, e nada na tela denuncia que aquilo foi
 * sorteio.
 *
 * Menor que a largura util do cone de proposito: um valor grande demais nao
 * caberia na faixa 250-550 e todo spawn cairia no melhor-esforco, que e o mesmo
 * que nao ter regra.
 */
const SPAWN_ENTRE_INIMIGOS = 170
/**
 * Orcamento de tentativas quando ha vizinhos a evitar (PH-143).
 *
 * Maior que `SPAWN_POINT_MAX_ATTEMPTS`, e por geometria e nao por capricho: o
 * cone comporta os seis inimigos com folga (a area util e ~230 mil unidades²
 * contra ~136 mil que seis discos de raio 85 ocupam), mas o dardo aleatorio vai
 * ficando sem espaco conforme a regiao enche, e com 40 tentativas os ultimos
 * caiam quase sempre no melhor-esforco. Medido: a mediana da menor distancia
 * subiu de 108 para o dobro so com este orcamento.
 *
 * So custa sorteio no INSTANTE do spawn, nunca por quadro.
 */
const SPAWN_ESPACADO_MAX_ATTEMPTS = 160

// Sorteio antigo (raio do mapa inteiro, sem depender de onde o jogador esta
// olhando) — vira FALLBACK: cobre o caso sem jogador ainda (nao deveria
// acontecer nos 3 call sites reais, mas o parametro e opcional por
// seguranca) e o caso do cone nao achar celula livre em
// `SPAWN_POINT_MAX_ATTEMPTS` tentativas (corredor de body-block estreito
// demais pra caber a faixa/angulo pedidos) — sem isso um mapa apertado
// deixaria de spawnar QUALQUER inimigo, pior que nascer fora do cone.
function randomSpawnPointFullMap(rng: Rng, mapDef: MapDef): Point {
  const cx = mapDef.bounds.width / 2
  const cy = mapDef.bounds.height / 2
  const radius = mapWalkRadius(mapDef) - SPAWN_MARGIN
  let x = cx, y = cy
  let attempts = 0
  do {
    const angle = randRange(rng, 0, Math.PI * 2)
    const dist = Math.sqrt(randRange(rng, 0, 1)) * radius
    x = cx + Math.cos(angle) * dist
    y = cy + Math.sin(angle) * dist
    attempts++
  } while (
    attempts < SPAWN_POINT_MAX_ATTEMPTS
    && (Math.hypot(x - mapDef.playerSpawn.x, y - mapDef.playerSpawn.y) < SPAWN_MIN_DISTANCE || isCellBlocked(mapDef, x, y))
  )
  // O laco acima sai por ESGOTAR as tentativas, entao a ultima pode ser uma
  // celula bloqueada — ele nunca prometeu ponto valido, so tentou 40 vezes.
  // Era improvavel enquanto todo mapa tinha 1400x900; com o mundo do tamanho
  // da area pintada (PH-80) um sub-bioma apertado pode nao ter faixa nenhuma
  // que satisfaca `SPAWN_MIN_DISTANCE` E seja andavel, e ai o inimigo nascia
  // dentro da parede — de onde o pathfinder nao tira ele. Melhor perder a
  // distancia minima do que a validade do ponto.
  if (isCellBlocked(mapDef, x, y)) {
    const aberto = nearestOpenPoint(mapDef, x, y)
    if (aberto) return aberto
  }
  return { x, y }
}

/**
 * Quantos inimigos podem estar em campo AGORA (PH-259).
 *
 * `mapDef.maxEnemies` continua sendo a resposta pra 100% das hunts; o unico
 * caso com degraus e a inicial, onde o limite sobe com o nivel do POKE em campo
 * (ver huntTypes#maxEnemiesPorNivel). Uma funcao, e nao o campo lido direto nos
 * quatro pontos de spawn, porque os quatro precisam concordar: se o respawn
 * usasse o teto alto e a construcao do mundo o baixo, o campo encheria por
 * respawn e nunca esvaziaria.
 */
export function limiteDeInimigos(mapDef: MapDef, poke?: { level: number } | null): number {
  const degraus = mapDef.maxEnemiesPorNivel
  if (!degraus?.length || !poke) return mapDef.maxEnemies
  let limite = mapDef.maxEnemies
  // Percorre todos em vez de parar no primeiro que casa: a lista e do menor pro
  // maior nivel, e o ULTIMO degrau alcancado e o que vale.
  for (const degrau of degraus) {
    if (poke.level >= degrau.nivel) limite = degrau.max
  }
  return limite
}

/** Distancia do ponto ao inimigo ja posicionado mais proximo. */
function folgaAte(x: number, y: number, ocupados: Point[]): number {
  let menor = Number.POSITIVE_INFINITY
  for (const o of ocupados) menor = Math.min(menor, Math.hypot(x - o.x, y - o.y))
  return menor
}

/**
 * `ocupados`: onde os inimigos JA posicionados nesta leva estao (PH-143).
 *
 * O ponto sorteado precisa respeitar `SPAWN_ENTRE_INIMIGOS` em relacao a eles.
 * Quando nenhuma das tentativas consegue (corredor estreito, sala pequena,
 * muitos inimigos), vale o MELHOR ESFORCO — o candidato valido mais afastado
 * dos outros — e nao o fallback de mapa inteiro: perder o espacamento e melhor
 * que perder o cone de visao, que e pedido explicito do usuario.
 */
function randomSpawnPoint(
  rng: Rng,
  mapDef: MapDef,
  player: { x: number; y: number; facing: Point } | null,
  ocupados: Point[] = [],
): Point {
  if (!player) return randomSpawnPointFullMap(rng, mapDef)

  // PH-259: a hunt inicial pede folga MAIOR que a padrao — la o numero de
  // inimigos em campo subiu, e o que impede isso de virar dois bichos em cima
  // de um POKE Lv1 e eles nascerem a mais de um raio de aggro um do outro. Ver
  // huntTypes#spawnEntreInimigos. Ausente = o valor de sempre.
  const folgaPedida = mapDef.spawnEntreInimigos ?? SPAWN_ENTRE_INIMIGOS
  // PH-259: e a faixa de distancia em que o selvagem nasce. A hunt inicial usa
  // uma mais curta que a padrao — ver huntTypes#spawnDistancia.
  const distMin = mapDef.spawnDistancia?.[0] ?? SPAWN_CONE_MIN_DISTANCE
  const distMax = mapDef.spawnDistancia?.[1] ?? SPAWN_CONE_MAX_DISTANCE

  const cx = mapDef.bounds.width / 2
  const cy = mapDef.bounds.height / 2
  const radius = mapWalkRadius(mapDef)
  const facingAngle = Math.atan2(player.facing.y, player.facing.x)

  let melhor: { ponto: Point; folga: number } | null = null
  const orcamento = ocupados.length > 0 ? SPAWN_ESPACADO_MAX_ATTEMPTS : SPAWN_POINT_MAX_ATTEMPTS
  for (let attempts = 0; attempts < orcamento; attempts++) {
    const angle = facingAngle + randRange(rng, -SPAWN_CONE_HALF_ANGLE, SPAWN_CONE_HALF_ANGLE)
    const dist = randRange(rng, distMin, distMax)
    const x = player.x + Math.cos(angle) * dist
    const y = player.y + Math.sin(angle) * dist
    if (Math.hypot(x - cx, y - cy) > radius) continue
    if (isCellBlocked(mapDef, x, y)) continue
    const folga = folgaAte(x, y, ocupados)
    if (!melhor || folga > melhor.folga) melhor = { ponto: { x, y }, folga }
    // Sai cedo SO quando ja esta bem servido. Aceitar o primeiro que passa
    // raspando espalha pior: o ponto "ok por pouco" rouba o espaco de quem vem
    // depois, e a leva inteira termina mais apertada do que precisava.
    if (melhor.folga >= folgaPedida * 1.5) break
  }
  // Melhor esforco: o candidato valido mais afastado dos outros. Perder o
  // espacamento e melhor que perder o cone de visao, que e pedido explicito.
  if (melhor) return melhor.ponto
  return randomSpawnPointFullMap(rng, mapDef)
}

/**
 * Um ponto ANDAVEL a distancia de combate do jogador (PH-423).
 *
 * Serve pra recolocar em campo um inimigo que a janela anterior ja tinha posto
 * lado a lado com o POKE — hoje so o protetor retomado, ver
 * `criarEntidadeDoProtetor`.
 *
 * A distancia pedida e um pouco MENOR que `engageRangeFor` (~39px = raio + raio
 * + `MELEE_RANGE_PADDING`): nascer exatamente no limite deixa o primeiro tick
 * decidindo entre `chase` e `engaged` por arredondamento de ponto flutuante, e
 * um tick de perseguicao a mais nao custa nada. Nascer COLADO (distancia 0) e
 * que seria errado — as duas entidades se sobrepondo fazem o passo de separacao
 * de `movementSystem` empurrar as duas.
 *
 * Tenta 8 direcoes ao redor do jogador antes de desistir, porque a direcao unica
 * cai em parede em sala apertada — e ai o protetor nascia dentro do bloco, de
 * onde o pathfinder nao tira ele. Sem candidato andavel, devolve o ponto do
 * jogador snapado pra celula aberta mais proxima: perder o espacamento e melhor
 * que perder a validade do ponto, mesma regra de `randomSpawnPoint`.
 *
 * CONSOME ZERO RNG, E ISSO NAO E DETALHE. A primeira versao sorteava o angulo
 * inicial com `randRange`, e isso quebra a invariante que o cabecalho de
 * `criarEntidadeDoProtetor` declara: "recriar nunca sorteia de novo... a
 * reconstrucao consome ZERO `rng`". O servidor persiste `rng_state`/`rng_draws`
 * em `game_sessions` e reconstroi o mundo a cada flush — um sorteio a mais por
 * reconstrucao desloca a sequencia inteira dali pra frente, o que muda spawn e
 * dano de tudo que vem depois. Media na bancada, o efeito colateral foi visivel:
 * a mediana da espera saltou de 15,0s pra 35,5s, nao por regressao real, mas
 * porque a corrida virou outra trajetoria aleatoria e deixou de ser comparavel
 * com a linha de base.
 *
 * O angulo sai do FACING do jogador, que e estado do mundo ja reconstruido —
 * deterministico e, de bonus, poe o protetor onde o POKE ja esta olhando.
 */
function pontoEmAlcanceDeCombate(
  mapDef: MapDef,
  jogador: { x: number; y: number; radius: number; facing: Point },
): Point {
  const distancia = jogador.radius + RAIO_PADRAO_DE_INIMIGO + MELEE_RANGE_PADDING_LOCAL - 6
  const inicial = Math.atan2(jogador.facing.y, jogador.facing.x)
  for (let i = 0; i < 8; i++) {
    const ang = inicial + (i * Math.PI) / 4
    const x = jogador.x + Math.cos(ang) * distancia
    const y = jogador.y + Math.sin(ang) * distancia
    if (!isCellBlocked(mapDef, x, y)) return { x, y }
  }
  return nearestOpenPoint(mapDef, jogador.x, jogador.y) ?? { x: jogador.x, y: jogador.y }
}

// Espelho local de `MELEE_RANGE_PADDING` (combatSystem) e do raio com que
// `createEnemyEntity` nasce. Locais, e nao importados, porque importar
// `combatSystem` aqui fecharia o ciclo `simulation -> combatSystem -> simulation`
// — o mesmo motivo pelo qual `garantirProtetorDaSala` e injetado de fora em
// `garantirTransicaoDeQuotaFechada`.
const MELEE_RANGE_PADDING_LOCAL = 10
const RAIO_PADRAO_DE_INIMIGO = 15

/**
 * PH-202/204/205/236: cria a entidade do protetor da sala atual — nova
 * (sorteando especie/nivel/IV do pool da sala) ou RECRIADA fielmente a
 * partir de um `ProtetorPendente` ja persistido. Recriar nunca sorteia de
 * novo: `ivs`, `rarity`, `nature`, `isShiny`, `trait` e `uid` chegam todos
 * fixos em `createPokeInstance`, entao a reconstrucao consome ZERO `rng` —
 * sortear de novo trocaria a aparencia/stats do protetor a cada flush (~30s).
 */
function criarEntidadeDoProtetor(
  world: SequenciaDeSorteio,
  mapDef: MapDef,
  ctx: ContextoDeSpawn,
  tipo: TipoDeProtetor,
  protetorSalvo: ProtetorPendente | null | undefined,
  player: PlayerEntity | null,
  entrada: Point | null,
): { enemy: EnemyEntity; pendente: ProtetorPendente } {
  // PH-301: quem vai ter que derrubar este protetor. `null` fora do jogo
  // normal (mundo sem jogador em campo) — ali o sorteio segue como antes.
  const atacante = player
  const { rng, counters } = world
  const point = entrada ?? randomSpawnPoint(rng, mapDef, player ?? null, [])

  if (protetorSalvo) {
    const poke = createPokeInstance(rng, protetorSalvo.speciesId, protetorSalvo.level, {
      ivs: protetorSalvo.ivs, rarity: protetorSalvo.rarity, nature: protetorSalvo.nature,
      isShiny: protetorSalvo.isShiny, trait: protetorSalvo.trait, uid: protetorSalvo.uid,
    })
    poke.hp = protetorSalvo.hpAtual
    // PROTETOR RETOMADO NASCE EM ALCANCE DE COMBATE (PH-423), e nao no cone de
    // 250-550px em que um protetor NOVO aparece.
    //
    // O LIVELOCK QUE ISTO CONSERTA, medido em
    // scripts/harness/troca-de-sala-sob-autoridade.mjs. O servidor reconstroi o
    // mundo a cada janela de flush e a posicao NAO e persistida (so identidade e
    // `hpAtual` sao). Entao, com janela curta, toda janela repetia a MESMA
    // aproximacao parcial:
    //
    //   nasce a 250-550px -> persegue -> janela fecha a 114px -> mundo descartado
    //   -> nasce a 250-550px de novo, com o rng restaurado e a mesma geometria
    //
    // `engageRangeFor` e ~39px (raio + raio + 10), entao 114px nunca vira luta.
    // Sonda de 46 janelas seguidas numa sala travada: `dist=114` IDENTICO em
    // todas, os dois em `chase` e nunca `engaged`, `hpAtual` congelado em 33 —
    // "caiu 0". A sala nao avancava NUNCA, nao "devagar": 10 salas em 100 no piso
    // de janela de producao (10s).
    //
    // O cao de guarda do impasse (PH-301) nao pega este caso de proposito: ele so
    // conta tempo com os dois ENGAJADOS, pra nao trocar o protetor durante a
    // caminhada legitima. Perseguicao que nunca converge fica no ponto cego dele
    // — e `protetorSemDanoSegundos` tambem e efemero, entao nem acumularia entre
    // janelas.
    //
    // POR QUE ISTO NAO E TRAPACA NEM MUDA BALANCEAMENTO: a posicao do protetor
    // nunca foi persistida, logo nao ha estado fiel a preservar. Um protetor
    // SALVO e, por definicao, um que o POKE ja encontrou numa janela anterior;
    // recolocar ele a meio mapa de distancia e que era a ficcao. Protetor NOVO
    // continua nascendo no cone (o ramo abaixo), entao a chegada dele na tela nao
    // muda, e o spawn de selvagem comum nao e tocado — a taxa de farm fica igual.
    const pontoDeRetomada = atacante ? pontoEmAlcanceDeCombate(mapDef, atacante) : point
    const enemy = createEnemyEntity(counters, {
      poke, x: pontoDeRetomada.x, y: pontoDeRetomada.y, encounterId: protetorSalvo.encounterId,
    })
    enemy.isProtetor = true
    return { enemy, pendente: protetorSalvo }
  }

  // Novo: sorteio no ELENCO DE CHEFE do sub-bioma (as pools BOSS/BOSS_RARE do
  // PokeRogue, ver salaSystem#contextoDoProtetor), so o NIVEL e o IV seguem a
  // regra propria do protetor.
  //
  // Antes o protetor saia do mesmo pool do spawn comum, entao o Guardian da
  // sala era um Rattata com IV alto — a diferenca era so a ficha, nao o bicho.
  // Agora o Guardian e um chefe daquele lugar de verdade, e o Lord da sala 10
  // comeca um degrau acima dele (BOSS_RARE), quando o lugar tem os dois.
  //
  // `contextoDoProtetor` degrada pro pool da sala quando nenhum chefe cabe na
  // faixa de nivel — o que na faixa I e a regra e nao a excecao, porque chefe do
  // PokeRogue e forma final. Ver la a medicao.
  //
  // PH-301: o sorteio REPETE ate cair um protetor que o POKE em campo consiga
  // danificar. A sala so avanca quando o protetor morre, e ele e o unico
  // inimigo em campo — um protetor imune ao tipo do POKE (Flash Fire contra um
  // monotipo de FOGO, Levitate contra um de TERRA) trava a hunt pra sempre, sem
  // erro e sem saida. Uma repeticao de sorteio custa alguns numeros da
  // sequencia; a alternativa custa a sessao inteira do jogador.
  //
  // O teto existe porque o pool da sala PODE ser todo imune. Nesse caso o
  // ultimo candidato vale: entregar um protetor duro e melhor que nao entregar
  // protetor nenhum, e o cao de guarda de `stepWorld` cobre o resto.
  let escolhido: {
    encounterId: string
    level: number
    ivs: ReturnType<typeof rollIvsDoProtetor>
    poke: PokeInstance
  } | null = null
  for (let tentativa = 0; tentativa < TENTATIVAS_DE_PROTETOR_DANIFICAVEL; tentativa++) {
    const encounterId = weightedPick(rng, ctx.pool, ctx.peso)
    const encounter = getEncounter(encounterId)
    if (!encounter) throw new Error(`Encontro desconhecido: ${encounterId}`)
    const level = tipo === 'lord' ? mapDef.levelRange[1] : (ctx.janela?.[1] ?? encounter.maxLevel)
    const ivs = rollIvsDoProtetor(rng)
    const poke = createPokeInstance(rng, encounter.speciesId, level, { ivs })
    escolhido = { encounterId, level, ivs, poke }
    if (!atacante) break
    const candidato = createEnemyEntity({ ...counters }, { poke, x: point.x, y: point.y, encounterId })
    if (podeDanificar(rng, atacante, candidato)) break
  }
  if (!escolhido) throw new Error('Sorteio de protetor não produziu candidato')
  const { encounterId, level, ivs, poke } = escolhido
  const enemy = createEnemyEntity(counters, { poke, x: point.x, y: point.y, encounterId })
  enemy.isProtetor = true
  const pendente: ProtetorPendente = {
    uid: poke.uid, speciesId: poke.speciesId, encounterId, level, ivs,
    rarity: poke.rarity, isShiny: poke.isShiny, nature: poke.nature, trait: poke.trait,
    hpAtual: poke.hp,
  }
  return { enemy, pendente }
}

/**
 * PH-202/203/236: garante o protetor da sala atual quando ela pedir um —
 * sorteia (primeira vez) ou recria fiel (janela reconstruida com o protetor
 * ainda vivo), e mantem `world.protetorPendente`/`world.enemies` coerentes.
 * Devolve true quando a sala pede protetor (bloqueia o avanco em
 * `garantirTransicaoDeQuotaFechada`, ver salaSystem.ts), false quando nao.
 *
 * Chamado tanto do `stepWorld` (quota acabou de fechar em tempo real) quanto
 * indiretamente de `buildMapWorld` (reconstrucao com protetor ja
 * persistido) — os dois caminhos convergem aqui pra nao duplicar a logica
 * de recriacao.
 */
function garantirProtetorDaSala(
  world: WorldState,
  mapDef: MapDef,
  protetorSalvo: ProtetorPendente | null | undefined,
  player: PlayerEntity | null,
  entrada: Point | null,
): boolean {
  const tipo = protetorDaSala(world.sala, world.mapDef?.id ?? '')
  if (!tipo) {
    world.protetorPendente = null
    return false
  }
  // PH-230: o protetor DESTA sala ja caiu e a sala ainda nao avancou — o caso
  // normal sob `salaSobAutoridade`, onde quem avanca a sala e o flush do
  // servidor e nao `resolverProtetorDaSala`. Sem este corte a sala pedia um
  // protetor novo a cada tick (respawn infinito) e o `true` daqui segurava pra
  // sempre o early-return de `garantirTransicaoDeQuotaFechada`, matando o
  // fallback de espera da autoridade. `false` = a sala nao bloqueia mais o
  // avanco.
  if (world.protetorResolvido) return false
  // Ja resolvido nesta mesma instancia de mundo (chamada de novo no mesmo
  // tick, ou protetor ja spawnado e ainda vivo) — idempotente, nao recria.
  if (world.protetorPendente) return true

  const ctx = contextoDoProtetor(
    mapDef.id,
    contextoDeSpawn(mapDef.id, mapDef.levelRange, world.sala, mapDef.enemyPool),
    world.sala,
    tipo,
  )
  const { enemy, pendente } = criarEntidadeDoProtetor(world, mapDef, ctx, tipo, protetorSalvo, player, entrada)
  world.enemies.push(enemy)
  world.protetorPendente = pendente
  return true
}

/**
 * Vencer (matar OU capturar) o LORD marca o ESTAGIO como limpo (PH-429/430).
 *
 * O QUE ISTO ERA ATE A PH-429, e por que a regra virou outra. A versao antiga
 * avancava um indice na `ORDEM_DOS_BIOMAS` — "quantos biomas da faixa o
 * jogador venceu" — e so avancava se o bioma resolvido fosse exatamente o
 * PROXIMO esperado na ordem. Isso existia porque o gate era sequencial entre
 * biomas: vencer o Lord do bioma N liberava o N+1.
 *
 * O redesenho de 02/09 tirou essa ordem. Os 12 biomas nascem abertos e o
 * progresso e por bioma: o que se registra e "o maior estagio limpo DESTE
 * bioma", e o que ele libera e o estagio seguinte DELE. Com isso caem as duas
 * condicoes da versao antiga (o `indexOf` na ordem e o `atual !== indice`), e
 * `ORDEM_DOS_BIOMAS` deixa de participar da decisao.
 *
 * NAO REGRIDE, e essa e a parte nova que o redesenho EXIGE: `comEstagioLimpo`
 * ignora estagio menor ou igual ao ja limpo. Sem isso a caçada direcionada da
 * PH-428 (voltar a um estagio antigo pela especie que ele da) desligaria o
 * estagio seguinte a cada visita.
 *
 * Chamado de dentro de `handleEnemyDefeated`, entao roda IGUAL nos dois lados
 * que rodam esse motor — resim do servidor e predicao do cliente.
 */
function avancarBiomaProgressSeForOProximo(world: WorldState, gameState: GameStateStore): void {
  const bioma = SUB_BIOMA_POR_CHAVE[world.sala?.chave ?? '']?.bioma.chave
  if (!bioma) return
  // O estagio sai do mapId, e nao do `continent`: o `continent` e o grupo de
  // gate (a ponte de faixa da PH-426) e nao diz QUAL dos tres estagios daquele
  // grupo o jogador limpou.
  const doMapa = parseEstagioId(world.mapDef?.id ?? '')
  if (!doMapa || doMapa.bioma !== bioma) return
  gameState.setBiomaProgress(bioma, doMapa.estagio)
}

function spawnEnemyAt(
  world: SequenciaDeSorteio,
  mapDef: MapDef,
  // O CONTEXTO INTEIRO, e nao `pool` e `janela` soltos: o peso de sorteio
  // depende do pool ATIVO (ver salaSystem#ContextoDeSpawn.peso), entao passar so
  // a lista abriria caminho pra sortear com o peso da hunt dentro de uma sala —
  // que e exatamente o bug que o teto por sala existe pra fechar.
  ctx: ContextoDeSpawn,
  player?: { x: number; y: number; facing: Point } | null,
  entrada?: Point | null,
  // PH-143: onde os outros inimigos ja estao, pra este nao nascer em cima
  // deles. Ausente = leva de um inimigo so, nao ha com quem se espremer.
  ocupados: Point[] = [],
): EnemyEntity {
  const { rng, counters } = world
  const point = entrada ?? randomSpawnPoint(rng, mapDef, player ?? null, ocupados)
  // Ponderado pelo TIER de spawn da especie, derivado da chance real de
  // encontro selvagem do Gen1/Gen2 (ver scripts/derive-spawn-tiers.js) — quem e
  // comum nos jogos reais aparece mais que quem e raro, dentro da mesma hunt.
  // Antes era a taxa de captura, que mede outra coisa.
  //
  // O SORTEIO E O MESMO NO MODO PESSIMISTA (farm offline). Uma versao anterior
  // fixava aqui o inimigo de maior nivel do pool, na ideia de que "o mais forte
  // sempre" seria o limite inferior. Media, era falso e quebrava o jogo de dois
  // jeitos (1h na Planicie, mesma semente):
  //
  //   sorteado  1213 kills, 305.005 ouro, 219 capturas de 28 especies
  //   fixado    1073 kills, 209.165 ouro, 332 capturas de  1 especie
  //
  //   1. A mochila voltava com 332 copias do MESMO POKE — o jogador farmava a
  //      noite inteira e recebia uma unica especie repetida. Foi assim que o
  //      bug apareceu.
  //   2. Capturar rendia MAIS offline que acordado, exatamente o contrario da
  //      regra. O inimigo fixo era Pidgey (o de maior nivel ali), que tem
  //      `catchRate` alto — fixar a especie fixa junto a chance de captura
  //      dela, entao "o mais forte" podia ser tambem "o mais facil de pegar".
  //
  // O limite inferior vem de onde ele e de fato monotonico: a RESOLUCAO do
  // combate (dano na variacao minima, zero critico — ver computeDamage), que so
  // faz matar mais devagar, nunca render mais. Composicao de especie e nivel
  // continua sendo a da hunt, entao o que volta na mochila e o que aquela hunt
  // realmente da. Contra a "sequencia de sorte" que a versao anterior temia, o
  // que protege e a escala: um flush offline sao milhares de kills, e a media
  // de milhares de sorteios nao desvia o bastante pra passar o jogo ao vivo.
  // `pool` e o da SALA atual quando a hunt tem salas, e o da hunt inteira
  // quando nao tem (inicial, BOSS, Lance) — ver systems/salaSystem.ts.
  const encounterId = weightedPick(rng, ctx.pool, ctx.peso)
  const encounter = getEncounter(encounterId)
  if (!encounter) throw new Error(`Encontro desconhecido: ${encounterId}`)
  // `levelWeights` (ver data/huntTypes.ts) troca o sorteio uniforme por um
  // ponderado — hoje so a hunt inicial usa, pra sair 80% Lv1 / 20% Lv2.
  //
  // `janela` e a faixa de nivel da SALA atual: a hunt afunda conforme as salas
  // sao limpas (ver salaSystem#janelaDaSala). Sem ela, a primeira sala de uma
  // faixa de 30 niveis ja podia jogar um POKE Lv30 contra quem acabou de sair
  // do Hospital.
  const [jmin, jmax] = ctx.janela ?? [encounter.minLevel, encounter.maxLevel]
  const lo = Math.max(encounter.minLevel, Math.min(jmin, encounter.maxLevel))
  const hi = Math.min(encounter.maxLevel, Math.max(jmax, encounter.minLevel))
  const level = encounter.levelWeights?.length
    ? weightedPick(rng, encounter.levelWeights, (entry) => entry.weight).level
    : randInt(rng, Math.min(lo, hi), Math.max(lo, hi))
  const poke = createPokeInstance(rng, encounter.speciesId, level)
  return createEnemyEntity(counters, { poke, x: point.x, y: point.y, encounterId })
}

const SEQUENCE_SPAWN_OFFSET_MIN = 60
const SEQUENCE_SPAWN_OFFSET_MAX = 150
function sequenceSpawnPoint(rng: Rng, mapDef: MapDef, base: Point): Point {
  const mapCx = mapDef.bounds.width / 2
  const mapCy = mapDef.bounds.height / 2
  const radius = mapWalkRadius(mapDef)
  let x = base.x, y = base.y, attempts = 0
  do {
    const angle = randRange(rng, 0, Math.PI * 2)
    const dist = randRange(rng, SEQUENCE_SPAWN_OFFSET_MIN, SEQUENCE_SPAWN_OFFSET_MAX)
    x = base.x + Math.cos(angle) * dist
    y = base.y + Math.sin(angle) * dist
    attempts++
  } while (
    attempts < SPAWN_POINT_MAX_ATTEMPTS
    && (Math.hypot(x - mapCx, y - mapCy) > radius || isCellBlocked(mapDef, x, y))
  )
  return { x, y }
}

/**
 * A BOLA VERDE pintada na arte: por onde entra todo POKE novo do lado inimigo.
 * `null` quando a arte nao tem uma (as 29 hunts normais), e ai o chamador cai
 * no sorteio de sempre.
 *
 * Mapa que poe VARIOS inimigos em campo ao mesmo tempo nao usa: um ponto fixo
 * empilharia os seis no mesmo pixel. Sobra o formato de duelo — a sequencia do
 * Lance e os mapas de um inimigo so (BOSS, Treinamento), que e onde a bola faz
 * sentido.
 */
function entradaDoInimigo(mapDef: MapDef, sala: { chave: string } | null): Point | null {
  if (!mapDef.sequence && mapDef.maxEnemies > 1) return null
  return spawnInimigoParaSala(mapDef.id, sala)
}

/**
 * Poe o proximo POKE vivo da equipe em campo depois da espera. Nao faz nada
 * fora dos mapas com `autoSwitchTeamOnFaint`, nem quando a equipe inteira caiu
 * — ai o fluxo normal de derrota assume.
 */
function trocarPorDesmaio(world: WorldState, gameState: GameStateStore, dt: number, silent: boolean): void {
  const player = world.player
  if (!world.mapDef?.autoSwitchTeamOnFaint || !player || !isDead(player)) {
    world.trocaEmCampo = null
    return
  }
  const proximo = gameState.team.findIndex((p) => p.hp > 0)
  if (proximo === -1) {
    world.trocaEmCampo = null
    return
  }

  world.trocaEmCampo = (world.trocaEmCampo ?? ESPERA_DE_TROCA_SEGUNDOS) - dt
  if (world.trocaEmCampo > 0) return
  world.trocaEmCampo = null

  // ROTACIONA, NAO SO APONTA (PH-382).
  //
  // O invariante do modelo e um: `team[0]` E o POKE em campo. `definir_ativo`
  // (RPC) rotaciona o escolhido pro slot 0 e grava `active_team_index = 0`
  // SEMPRE; `refetchEquipeInteira` ordena por `team_slot` por causa disso; o
  // trilho de reservas desenha `team.slice(1)`; e `reordenarReservas` recusa
  // mexer no indice 0 nos dois lados.
  //
  // Esta funcao chamava `setActiveIndex(proximo)` e deixava a equipe na ordem
  // antiga — o unico lugar do projeto que quebrava o invariante. Com
  // `activeIndex = 1`, o `StatusRail` desenha `team[1]` (certo, e quem esta em
  // campo) e o trilho de reservas desenha `team.slice(1)`, entao o MESMO POKE
  // aparece nos dois lugares: mesma instancia, logo o nivel e o HP da "reserva"
  // sobem junto com o de campo, e o POKE do slot 0 desaparece da tela.
  //
  // Relatado ao vivo em 01/09 (conta Vinny): o Eevee do Lance no slot 0 sumiu e
  // a reserva 2 virou o Quagsire que estava lutando, ganhando nivel junto.
  // Estado no banco: `active_team_index = 1`, que so o flush a partir do estado
  // local pode ter escrito — `definir_ativo` nunca grava outra coisa que 0.
  // O POKE e lido ANTES da rotacao de proposito. No navegador `gameState` e o
  // objeto que `useGameStateStore.getState()` devolveu no comeco do tick, e
  // zustand troca o objeto de estado a cada `set` — depois de
  // `moveTeamIndexToFront` a propriedade `team` deste `gameState` ainda e o
  // ARRAY ANTIGO, e `team[0]` seria o POKE desmaiado. Ler antes vale nos dois
  // lados (a rotacao preserva a identidade das instancias) e nao depende de
  // reler a store, que o motor headless nao tem como fazer.
  const nextPoke = gameState.team[proximo]
  gameState.moveTeamIndexToFront(proximo)
  player.poke = nextPoke
  player.cooldowns = {}
  player.flashTimer = 0
  player.fainted = false
  player.state = 'wander'
  player.targetId = null
  // PH-418: o POKE que entra NAO herda estagio de atributo do que caiu.
  //
  // O prazo de 18s fez estagio sobreviver ao fim de batalha, e sem esta linha
  // ele sobreviveria tambem a troca de POKE — um substituto que nunca lutou
  // entraria com a Danca das Espadas do anterior, ou com o Rosnado que derrubou
  // o anterior. Nos jogos, trocar zera; e o pedido era sobre mudar de ALVO, nao
  // de POKE.
  apagarTodosOsEstagios(player)
  // Entra pela BOLA AMARELA, nao no buraco onde o anterior caiu — e a mesma
  // regra que a bola verde da pro outro lado. Arte sem bola pintada nao move
  // ninguem: o substituto continua aparecendo no lugar do anterior, que e o
  // comportamento de antes.
  const entrada = spawnPointParaSala(world.mapDef.id, world.sala)
  if (entrada) {
    player.x = entrada.x
    player.y = entrada.y
    player.pathWaypoints = null
    player.pathIndex = 0
    player.pathTargetX = null
    player.pathTargetY = null
  }
  if (!silent) {
    toastStore.getState().pushToast(
      `${shinyPrefix(nextPoke.isShiny)}${SPECIES[nextPoke.speciesId].name} entrou em campo!`,
      'success', 'combat',
    )
  }
}

function spawnSequenceEnemy(world: SequenciaDeSorteio, mapDef: MapDef, index: number, entrada: Point | null): EnemyEntity {
  const { rng, counters } = world
  const encounterId = mapDef.sequence![index]
  const encounter = getEncounter(encounterId)
  if (!encounter) throw new Error(`Encontro desconhecido: ${encounterId}`)
  const base = mapDef.spawnPoints[0] || mapDef.playerSpawn
  // Com bola verde TODO POKE da sequencia entra por ela, o primeiro inclusive
  // — o pedido foi "todo novo pokemon", nao "do segundo em diante".
  const point = entrada ?? (index === 0 ? base : sequenceSpawnPoint(rng, mapDef, base))
  const poke = createPokeInstance(rng, encounter.speciesId, encounter.minLevel, { rarity: encounter.rarity, ivs: encounter.ivs })
  return createEnemyEntity(counters, { poke, x: point.x, y: point.y, encounterId })
}

// PARTE B (hazard): descarrega no INIMIGO recem-criado a armadilha de campo
// que o JOGADOR plantou contra o lado inimigo (Spikes/Toxic Spikes/Stealth
// Rock/Sticky Web — ver combatSystem.ts#resolveHit). Chamado logo apos CADA
// criacao de EnemyEntity (spawnEnemyAt/spawnSequenceEnemy, nos 4 pontos de
// chamada abaixo) — mesma regra dos jogos reais: FLYING e quem tem a Trait
// levitate nunca sofrem hazard de chao, entao pulam o bloco inteiro.
function aplicarHazardsAoInimigo(rng: Rng, hazards: EnemyHazards | undefined, enemy: EnemyEntity): void {
  if (!hazards) return
  const species = SPECIES[enemy.poke.speciesId]
  const imuneATerra = species.type === 'FLYING' || species.type2 === 'FLYING' || traitDoPoke(enemy.poke) === 'levitate'
  if (imuneATerra) return

  const maxHp = enemy.poke.stats.hp

  if (hazards.spikes > 0) {
    // 1 camada = 1/8, 2 = 1/6, 3 = 1/4 do HP maximo — mesma escala dos jogos.
    const fracao = hazards.spikes === 1 ? 1 / 8 : hazards.spikes === 2 ? 1 / 6 : 1 / 4
    takeDamage(enemy, Math.max(1, Math.round(maxHp * fracao)))
  }

  if (hazards.toxicSpikes > 0) {
    // So existe 1 nivel de veneno neste motor — a distincao leve/grave dos
    // jogos reais (1 camada = poison normal, 2 = toxic) se perde de proposito.
    aplicarStatus(rng, enemy, 'poison', 100)
  }

  if (hazards.stealthRock) {
    const efetividade = getEffectiveness('ROCK', species.type, species.type2)
    takeDamage(enemy, Math.max(1, Math.round((maxHp / 8) * efetividade)))
  }

  if (hazards.stickyWeb) {
    enemy.estagios.speed = (enemy.estagios.speed ?? 0) - 1
  }
}

/**
 * Progresso que precisa ATRAVESSAR a reconstrucao do mundo.
 *
 * O servidor simula por JANELAS: a cada flush (~30s) ele monta o mundo do zero
 * com esta funcao. Tudo que vive so em `WorldState` volta ao valor inicial —
 * foi assim que a sequencia do Campeao Lance ficou INGANHAVEL sob autoridade
 * do servidor: `sequenceIndex` voltava a 0 e o `startCountdown` de 5s era
 * pago de novo em toda janela, entao a luta so podia ser vencida se os 6 POKEs
 * dele caissem dentro de ~25 segundos.
 */
export interface ProgressoDaSessao {
  sequenceIndex?: number
  sequenceCleared?: boolean
  /**
   * PH-307: HP do membro da sequencia (Campeao Lance) que estava em campo no
   * fim da janela anterior. Sao TRES valores com tres significados:
   *
   *   `undefined`/`null` — nao ha informacao (sessao nova, ou servidor antigo).
   *                        O membro nasce com HP CHEIO, como sempre foi.
   *   `> 0`              — luta em andamento. O membro nasce com esse HP.
   *   `0`                — o membro deste indice JA CAIU e a sequencia ainda
   *                        nao avancou. O mundo nasce SEM ele.
   *
   * O terceiro caso nao e detalhe: sem ele, um membro derrotado exatamente na
   * borda da janela ressuscitava inteiro na reconstrucao seguinte e tinha que
   * ser derrotado de novo — e o indice nunca passava dali.
   *
   * Sem NADA disto o dano some na borda de cada janela (~30s), e um membro que
   * nao cabe numa janela e imbativel. Medido em producao em 30/08: as duas
   * sessoes de `boss_lance` pararam no indice 5 de 6, com o cliente anunciando
   * a vitoria que o servidor nunca teve. Mesma correcao que PH-217 fez pro
   * protetor da sala.
   */
  sequenceHp?: number | null
  /** Sala em que a sessao parou. Ausente = comeca uma sala nova sorteada. */
  sala?: SalaAtiva | null
  /**
   * O clima que o SERVIDOR sorteou para esta sala (PH-140).
   *
   * `undefined` e `null` querem dizer coisas diferentes, e a distincao e o
   * ponto deste campo:
   *
   * - `undefined` — nao ha autoridade (jogo local, ou o proprio servidor
   *   montando o mundo dele). O clima e DERIVADO de `(seed, sala)`.
   * - `null` — a autoridade falou, e o que ela disse foi "ceu limpo".
   *
   * Existe porque o cliente NAO conhece a semente da sessao e nunca vai
   * conhecer: e ela que decide shiny, IV, raridade e crit, e um cliente que a
   * tivesse preveria o proximo shiny (ver core/rng.ts). Sem este campo, cliente
   * e servidor derivariam climas diferentes — o jogador veria o ceu limpo
   * enquanto o servidor cobrava dano de areia.
   */
  clima?: ClimaTipo | null
  /**
   * PH-201/202/236: protetor (Guardian ou Lord) ainda vivo na sala em que a
   * sessao parou. Presente == a sala esta em "modo protetor": `buildMapWorld`
   * recria a entidade FIELMENTE em vez do spawn normal — sortear de novo
   * desalinharia o RNG e trocaria a aparencia do protetor a cada flush.
   * Ausente/null == sala sem protetor pendente, spawn normal de sempre.
   */
  protetorPendente?: ProtetorPendente | null
}

export function buildMapWorld(
  mapId: string,
  activePoke: PokeInstance,
  carry?: SequenciaDeSorteio,
  progresso?: ProgressoDaSessao,
  especialidadeNiveis?: EspecialidadeNiveis | null,
): WorldState {
  const base = novoMundo(carry)

  // A sala tem que ser decidida ANTES do primeiro spawn: e ela que diz qual
  // pool esta ativo (e, com body-block por sala, qual grade de colisao/ponto
  // de nascimento valem — ver mapDefParaSala/spawnPointParaSala).
  // Retomar a sala salva (e nao sortear uma nova por janela) e o mesmo
  // motivo do `sequenceIndex` — o mundo e reconstruido a cada flush, e
  // sortear aqui faria a sala trocar de 30 em 30 segundos sozinha.
  const sala = temSalas(mapId)
    ? (progresso?.sala ?? novaSala(base.rng, mapId, 0, 0))
    : null
  const mapDef = mapDefParaSala(mapId, sala)
  if (!mapDef) throw new Error(`Mapa desconhecido: ${mapId}`)

  const spawn = spawnPointParaSala(mapId, sala) ?? mapDef.playerSpawn
  // `spawnPointParaSala` ja devolve um ponto andavel quando a sala tem body-
  // block (o proprio script de build ja resolve isso). O fallback
  // (`mapDef.playerSpawn`, GEOMETRIA fixa) NAO passa por essa checagem —
  // hunt sem sala mas com grade propria (ex.: route_46 reusando o body-
  // block da 'forest', ver maps.ts#mapDefParaSala) podia nascer o jogador
  // DENTRO de uma parede pintada. Mesmo snap que `registrarAbate` ja faz na
  // troca de sala, aplicado aqui na construcao inicial do mundo.
  const spawnFinal = (mapDef.collisionGrid && isCellBlocked(mapDef, spawn.x, spawn.y))
    ? nearestOpenPoint(mapDef, spawn.x, spawn.y) ?? spawn
    : spawn
  const player = createPlayerEntity(base.counters, { poke: activePoke, x: spawnFinal.x, y: spawnFinal.y })
  if (isDead(player)) player.fainted = true

  const sequenceIndex = progresso?.sequenceIndex ?? 0
  const sequenceCleared = progresso?.sequenceCleared ?? false
  // A contagem regressiva de intro do Lance so vale na PRIMEIRA janela. Numa
  // retomada ela seria 5 segundos de combate congelado por flush.
  const retomando = sequenceIndex > 0 || sequenceCleared
  const countdownRemaining = retomando ? null : (mapDef.startCountdown || null)

  // PH-140: com autoridade o clima vem PRONTO no progresso; sem ela, e derivado
  // de `(seed, sala)`. `'clima' in progresso` e nao `progresso.clima != null`
  // porque ausente e "nao ha autoridade" e `null` e "a autoridade disse ceu
  // limpo" — ver `ProgressoDaSessao.clima`.
  const climaDaConstrucao = progresso && 'clima' in progresso
    ? climaDeAmbiente(progresso.clima ?? null)
    : climaAmbienteDaSala(base.seed, sala)

  const ctx = contextoDeSpawn(mapId, mapDef.levelRange, sala, mapDef.enemyPool)

  const enemies: EnemyEntity[] = []
  let protetorPendente: ProtetorPendente | null = null
  if (!countdownRemaining && !sequenceCleared) {
    // PH-225: achado corrigindo o proprio bug relatado ao vivo ("protetor
    // aparece sozinho, tela vazia, sem nenhum mob") — `protetorDaSala` so
    // olha bioma+indice da sala, NUNCA se a quota (30 abates) ja fechou. Sem
    // o `sala.abates >= ABATES_POR_SALA` aqui, TODA reconstrucao de mundo
    // numa sala com protetor habilitado (inclusive a abertura da sessao,
    // abates=0) pulava o spawn normal e ia direto pro protetor — mascarado
    // antes porque so igneo tinha protetor (facil nao perceber numa unica
    // hunt), virou impossivel de ignorar com os 12 biomas habilitados
    // (PH-225): QUALQUER hunt de bioma, na abertura, tentava recriar um
    // protetor do nada.
    const tipoDeProtetor = sala && sala.abates >= ABATES_POR_SALA ? protetorDaSala(sala, mapId) : null
    if (tipoDeProtetor) {
      // Sala em modo protetor (quota ja fechou, spawn normal fica suspenso
      // ate resolver). Recria FIEL quando `progresso.protetorPendente` ja
      // existe (zero RNG extra — outra janela ja tinha sorteado esse
      // protetor), sorteia na primeira vez que a sala pede protetor senao.
      const { enemy, pendente } = criarEntidadeDoProtetor(
        base, mapDef, contextoDoProtetor(mapId, ctx, sala, tipoDeProtetor), tipoDeProtetor,
        progresso?.protetorPendente, player, entradaDoInimigo(mapDef, sala),
      )
      aplicarHazardsAoInimigo(base.rng, base.enemyHazards, enemy)
      enemies.push(enemy)
      protetorPendente = pendente
    } else if (mapDef.sequence) {
      // PH-307: `sequenceHp === 0` significa "este membro ja caiu e o indice
      // ainda nao avancou" — o campo nasce VAZIO e o proximo tick avanca a
      // sequencia (ou a fecha, se era o ultimo). Sem esse caso, um membro
      // derrotado na borda da janela ressuscitava inteiro aqui.
      if (progresso?.sequenceHp !== 0) {
        const enemy = spawnSequenceEnemy(base, mapDef, sequenceIndex, entradaDoInimigo(mapDef, sala))
        // `> 0` e uma luta em andamento; `null`/ausente e sessao sem
        // informacao, e ai vale o HP cheio que `spawnSequenceEnemy` ja deu.
        // O clamp protege contra valor gravado por uma versao com outra
        // formula de stat (o HP maximo depende de nivel e IV).
        const hpSalvo = progresso?.sequenceHp
        if (hpSalvo != null && hpSalvo > 0) enemy.poke.hp = Math.min(hpSalvo, enemy.poke.stats.hp)
        aplicarHazardsAoInimigo(base.rng, base.enemyHazards, enemy)
        enemies.push(enemy)
      }
    } else {
      for (let i = 0; i < limiteDeInimigos(mapDef, player?.poke); i++) {
        const enemy = spawnEnemyAt(base, mapDef, ctx, player, entradaDoInimigo(mapDef, sala), enemies)
        aplicarHazardsAoInimigo(base.rng, base.enemyHazards, enemy)
        enemies.push(enemy)
      }
    }
  }

  return {
    ...base,
    mapDef, player, enemies, effects: [], pendingHits: [], pendingWishes: [],
    autoTimers: { treinador: 0 },
    reviveCountdown: null,
    trocaEmCampo: null,
    respawnTimer: mapDef.respawnDelay,
    sequenceIndex,
    sequenceCleared,
    countdownRemaining,
    sala,
    protetorPendente,
    // PH-140: o clima de ambiente e reposto em TODA construcao de mundo, e nao
    // guardado. E o que faz ele sobreviver ao flush do servidor (que reconstroi
    // o mundo a cada 30-90s) sem coluna nova em `game_sessions`: mesma
    // `(seed, sala)`, mesmo clima.
    //
    // Com autoridade, o clima vem PRONTO no progresso em vez de ser derivado —
    // o cliente nao tem a semente da sessao. Ver `ProgressoDaSessao.clima`.
    //
    // Clima de GOLPE nao volta aqui de proposito — 10 turnos nao atravessam
    // reconstrucao de mundo, igual estagio de atributo e escudo.
    clima: climaDaConstrucao,
    climaAmbiente: climaDaConstrucao,
    especialidadeNiveis: especialidadeNiveis ?? null,
  }
}

// ---------- Resolucao de combate (EXP, loot, captura) ----------

// `silent` e usado pelos 2 sistemas headless de catch-up — as chamadas
// reais de XP/ouro/loot/captura sempre rodam de qualquer jeito, so os
// Effects visuais e os toasts sao pulados quando silent. Sempre devolve um
// resumo do que aconteceu pro chamador agregar (OfflineSimSystem).
export function handleEnemyDefeated(
  world: WorldState,
  enemy: EnemyEntity,
  gameState: GameStateStore,
  opts: { silent?: boolean; manualAdvance?: boolean } = {},
): KillResult {
  const silent = opts.silent ?? false
  const player = world.player!
  // Autoritativo durante combate — ver nota de arquitetura no topo do
  // arquivo. NAO le gameState.activePoke aqui (poderia estar desatualizado
  // em relacao ao HP/EXP que a luta ja aplicou nesta hunt).
  const poke = player.poke
  const enemySpecies = SPECIES[enemy.poke.speciesId]

  // Boneco de treino (data/trainingDummy.ts): abate nao rende NADA — sai
  // antes de tocar EXP/ouro/loot/captura/Pokedex, e sem toast (o feedback do
  // treino ja e o numero de dano flutuante durante a luta, nao um resumo de
  // recompensa que so diria "+0"). `isShiny` continua honesto por curiosidade
  // — nao capturavel (`noCatch`), entao ver um shiny aqui nao vale nada alem
  // de flavor.
  if (world.mapDef!.noRewards) {
    if (!silent) {
      recordKill(gameState, { gold: 0, xp: 0, isShiny: Boolean(enemy.poke.isShiny) })
    }
    return {
      gold: 0, xp: 0, ouroDeAutoVenda: 0, leveledUp: false, trainerLeveledUp: false,
      isShiny: Boolean(enemy.poke.isShiny), captured: false, capturedPoke: null, droppedItems: [],
    }
  }

  const expGain = expRewardForEnemy(enemy.poke, poke.level)
  // O nivel do TREINADOR antes da concessao. `grantTrainerExp` devolve so o
  // nivel final, e o cartao dele CONTINUA coalescendo (PH-398) — entao o
  // intervalo importa. O do POKE nao esta mais aqui: `grantExp` passou a
  // devolver o detalhe por nivel (`niveis`), e cada cartao usa `nivel - 1`.
  const nivelDoTreinadorAntes = gameState.trainer.level

  const grantResult = grantExp(poke, expGain)
  player.poke = grantResult.poke
  gameState.updatePokeInstance(grantResult.poke.uid, () => grantResult.poke)

  const trainerResult = grantTrainerExp(gameState.trainer, expGain)
  gameState.setTrainer(trainerResult.trainer)

  const loot = awardKillLoot(world.rng, gameState, enemy, world.mapDef!, lootAtivo(world.sala, world.mapDef!.itemDrops))
  // Champion Lance (data/nightmareMaps.ts) proibe captura explicitamente —
  // seu `noCatch` e o unico lugar que isso e setado.
  //
  // `enemy.isProtetor` (PH-205): metade da chance. Ele vem da ENTIDADE e nao do
  // POKE — o mesmo POKE, ja na mochila, e um POKE comum. Passa por `world.rng`
  // igual a qualquer captura, entao o resim do servidor sorteia o mesmo.
  const captureResult = world.mapDef!.noCatch
    ? null
    : maybeAutoCatch(world.rng, gameState, enemy.poke, Boolean(enemy.isProtetor))
  recordPokedexKill(gameState, enemy.poke.speciesId, Boolean(enemy.poke.isShiny))

  // Ouro que a auto-venda gerou neste abate. Ja esta na carteira (creditado
  // dentro de `attemptCapture`); daqui pra baixo ele entra nas MEDIDAS — taxa
  // de ouro/h e resumo —, senao o jogador com o bot ligado veria a barra de
  // ouro andar sem a taxa acompanhar.
  const ouroDeAutoVenda = captureResult?.success && captureResult.location === 'vendido'
    ? captureResult.vendidoPor
    : 0

  if (!silent) {
    recordKill(gameState, { gold: loot.gold + ouroDeAutoVenda, xp: expGain, isShiny: enemy.poke.isShiny })

    world.effects.push(createWorldEffect(world.counters, {
      type: 'rewardText', x: enemy.x, y: enemy.y,
      targetX: enemy.x, targetY: enemy.y,
      value: expGain, unit: 'XP', color: '#4ade80', duration: 1.1, owner: enemy,
    }))
    world.effects.push(createWorldEffect(world.counters, {
      type: 'rewardText', x: enemy.x, y: enemy.y,
      targetX: enemy.x, targetY: enemy.y,
      value: loot.gold, unit: '🪙', color: '#fff59d', duration: 1.1, owner: enemy,
    }))

    toastStore.getState().pushToast(
      `${shinyPrefix(enemy.poke.isShiny)}${enemySpecies.name} [${rarityOf(enemy.poke).label}] derrotado! +${expGain} EXP, +${loot.gold} ouro`,
      'gold', 'combat', realceDaRaridade(enemy.poke),
    )

    if (grantResult.leveledUp) {
      // O ganho numerico de atributo vai junto do aviso (pedido explicito):
      // sem ele o level-up so dizia "subiu de nivel" e o jogador precisava
      // abrir o perfil pra descobrir se aquilo valeu alguma coisa.
      const ganhos = formatStatGains(grantResult.statGains)
      toastStore.getState().pushToast(
        `${shinyPrefix(grantResult.poke.isShiny)}${SPECIES[grantResult.poke.speciesId].name} subiu para o nível ${grantResult.level}!${ganhos ? ` ${ganhos}` : ''}`,
        'levelup', 'combat',
      )
      for (const ability of grantResult.newAbilities.filter(isDamagingAbility)) {
        toastStore.getState().pushToast(`Nova habilidade desbloqueada: ${ability.name}!`, 'levelup', 'combat')
      }
      // UM CARTAO POR NIVEL (PH-398), pedido explicito do usuario.
      //
      // Antes era um cartao pela rajada inteira, com `nivelAntesDoAbate` ->
      // `grantResult.level` e os ganhos SOMADOS — um abate pode subir vários
      // níveis (`grantExp` tem um `while`), e a coalescência do store ainda
      // juntava abates seguidos no mesmo cartão.
      //
      // `grantResult.niveis` traz o detalhe por nível, e o intervalo de cada
      // cartão é `nivel - 1` -> `nivel`: com isso o teste de marco
      // (`cruzouMultiplo`, a cada 5) passa a acertar EXATAMENTE o nível que
      // cruza o múltiplo, em vez de detectar "houve um 35 no meio" e mostrar o
      // cartão grande no fim da rajada.
      //
      // O teto de fila do store (`TETO_DA_FILA`) é o que impede a rajada de
      // virar uma parede de cartões — era isso que a coalescência fazia.
      for (const nivelGanho of grantResult.niveis) {
        celebracaoStore.getState().celebrar({
          tipo: 'nivel',
          especieId: grantResult.poke.speciesId,
          nome: SPECIES[grantResult.poke.speciesId].name,
          nivelInicial: nivelGanho.nivel - 1,
          nivel: nivelGanho.nivel,
          ganhos: nivelGanho.ganhos,
          // So golpe de DANO, igual ao toast logo acima: o jogador nao precisa de
          // um cartao pra dizer que aprendeu um golpe de status que a IA nem vai
          // priorizar.
          golpesNovos: nivelGanho.golpesNovos.filter(isDamagingAbility).map((a) => a.name),
          isShiny: Boolean(grantResult.poke.isShiny),
        })
      }
    }
    if (trainerResult.leveledUp) {
      toastStore.getState().pushToast(`${gameState.trainer.name} subiu para o nível ${trainerResult.level}!`, 'levelup', 'combat')
      // Um dos DOIS pontos que disparavam o splash no vanilla (js/main.js:288) e
      // que se perderam na migracao pra React — ver PH-192.
      celebracaoStore.getState().celebrar({
        tipo: 'treinador',
        nome: gameState.trainer.name,
        nivelInicial: nivelDoTreinadorAntes,
        nivel: trainerResult.level,
      })
    }

    for (const itemId of loot.droppedItems) {
      const item = getItem(itemId)
      if (item) toastStore.getState().pushToast(`Item encontrado: ${item.name}`, 'success', 'world')
    }

    // Animacao de arremesso de Pokebola — so pra uma tentativa de verdade.
    //
    // PH-174: `atrasoDoToastMs` guarda quanto tempo real a bola ainda vai
    // levar pra terminar de jogar na tela (`delay` do efeito + `duration`) —
    // o toast de resultado (abaixo) so dispara depois disso. Antes ele saia
    // na hora, narrando "capturado!"/"a captura falhou!" ANTES da animacao
    // visualmente resolver — ordem incoerente com o que o jogador via.
    let atrasoDoToastMs = 0
    if (captureResult && 'ballItemId' in captureResult && captureResult.ballItemId) {
      const quadros = captureAnimFrameCount(captureResult.success)
      const duracao = quadros * captureAnimFrameDuration() + 0.3
      world.effects.push(createWorldEffect(world.counters, {
        type: 'captureAnim', x: enemy.x, y: enemy.y, targetX: enemy.x, targetY: enemy.y,
        ballItemId: captureResult.ballItemId, success: captureResult.success,
        delay: DEATH_ANIM_GRACE_PERIOD,
        duration: duracao,
      }))
      atrasoDoToastMs = (DEATH_ANIM_GRACE_PERIOD + duracao) * 1000
    }

    if (captureResult) {
      const dispararToastDeCaptura = () => {
        if (captureResult.success && captureResult.location === 'vendido') {
          // Toast proprio: dizer "capturado! Foi para a mochila" e depois nao ter
          // nada na mochila e a forma mais rapida de o jogador achar que perdeu
          // POKE. A raridade fica porque e ela que explica o valor.
          toastStore.getState().pushToast(
            `${enemySpecies.name} [${rarityOf(captureResult.poke).label}] capturado e vendido pelo bot: +${captureResult.vendidoPor} ouro.`,
            'capture-success', 'world',
            realceDaRaridade(captureResult.poke),
          )
        } else if (captureResult.success) {
          // So sobra `location: 'bag'` aqui — o outro caso saiu no `if` acima.
          const location = 'mochila'
          // Raridade concatenada no relatorio (pedido explicito): ela multiplica
          // atributo e valor de venda em ate 600x, entao e o dado que decide se
          // aquela captura importou — e o chat era o unico lugar que nao dizia.
          const raridade = rarityOf(captureResult.poke).label
          toastStore.getState().pushToast(
            `${shinyPrefix(enemy.poke.isShiny)}${enemySpecies.name} [${raridade}] capturado! Foi para a ${location}.`,
            'capture-success', 'world',
            // A raridade que vale e a da INSTANCIA capturada, nao a do inimigo em
            // campo: `attemptCapture` sorteia o POKE que entra na mochila.
            realceDaRaridade(captureResult.poke),
          )
        } else if (captureResult.reason === 'roll_failed') {
          toastStore.getState().pushToast('A captura falhou!', 'capture-fail', 'combat')
        }

        // SHINY CAPTURADO ganha cartao proprio (PH-192).
        //
        // Na CAPTURA e nao no encontro: shiny que aparece e escapa nao e marco,
        // e um cartao ali celebraria algo que o jogador nao levou. Dentro do
        // `dispararToastDeCaptura` de proposito — ele ja espera a animacao da
        // bola terminar (PH-174), e comemorar antes de a bola fechar seria a
        // mesma incoerencia que aquela issue consertou.
        if (captureResult.success && enemy.poke.isShiny) {
          celebracaoStore.getState().celebrar({
            tipo: 'shiny',
            especieId: enemy.poke.speciesId,
            nome: enemySpecies.name,
          })
        }
      }
      // So atrasa quando houve animacao de verdade pra esperar (tentativa
      // real, `atrasoDoToastMs > 0`) — sem tentativa (sem bola) nao ha nada
      // na tela pra sincronizar, o toast sai na hora como sempre saiu.
      if (atrasoDoToastMs > 0) setTimeout(dispararToastDeCaptura, atrasoDoToastMs)
      else dispararToastDeCaptura()
    }
  }

  // PH-202/203: resolvido (morto OU capturado) arma a transicao NA HORA —
  // incondicional a `silent` porque o catch-up headless tambem precisa
  // desarmar o bloqueio. `registrarAbate` (chamado logo depois, mesmo tick,
  // pro proprio abate deste protetor) se recusa a arma-la de novo por conta
  // propria — ver salaSystem.ts#registrarAbate.
  //
  // PH-292: `manualAdvance` passa por aqui. Este era o unico caminho de avanco
  // de sala de bioma que nao olhava o toggle, e desde que TODA sala ganhou
  // protetor (PH-202/225) ele virou o unico caminho que resta — o que deixava
  // o "avanco manual de sala" inerte no jogo inteiro sem nada quebrar.
  if (enemy.isProtetor) {
    // PH-427: "a ultima sala" deixou de ser o indice 9. O estagio 1 tem 3
    // salas e o Lord dele mora no indice 2 — com a constante antiga o credito
    // de `bioma_progress` nunca acontecia em 9 dos 10 estagios, o jogador
    // vencia o Lord e o bioma seguinte continuava trancado. Falha silenciosa:
    // nada estoura, o Lord morre normalmente, o progresso simplesmente nao e
    // escrito.
    const ultimaDoEstagio = quantidadeDeSalas(world.mapDef?.id ?? '') - 1
    if (world.sala?.indice === ultimaDoEstagio) avancarBiomaProgressSeForOProximo(world, gameState)
    resolverProtetorDaSala(world, world.mapDef!.id, { manualAdvance: opts.manualAdvance ?? false })
  }

  return {
    gold: loot.gold + ouroDeAutoVenda,
    ouroDeAutoVenda,
    xp: expGain,
    leveledUp: grantResult.leveledUp,
    trainerLeveledUp: trainerResult.leveledUp,
    isShiny: Boolean(enemy.poke.isShiny),
    // "Capturado" aqui significa ENTROU NA MOCHILA: o que a auto-venda pegou
    // nunca chegou lá, e contá-lo como captura faria o relatório listar POKE
    // que o jogador não tem.
    captured: Boolean(captureResult?.success && captureResult.location === 'bag'),
    capturedPoke: captureResult?.success && captureResult.location === 'bag' ? captureResult.poke : null,
    droppedItems: loot.droppedItems,
  }
}

// ---------- Tick de passo fixo ----------

// Compartilhado pelo loop ao vivo (silent:false) e os 2 sistemas headless
// de catch-up (silent:true, chamados em loop apertado por
// simulateWorldSeconds) — este e o UNICO lugar onde movimento/combate/
// auto-heal/respawn avancam. Devolve a lista de resumos por-kill.
export function stepWorld(world: WorldState, dt: number, gameState: GameStateStore, opts: { silent?: boolean; offline?: boolean } = {}): KillResult[] {
  const silent = opts.silent ?? false
  // Janela longa (farm offline de verdade) ignora o toggle — mesmo eixo que
  // ja liga `world.pessimista` no servidor (ver LIMIAR_OFFLINE_SEGUNDOS em
  // authority/progresso.ts). Calculado uma vez e repassado pros dois pontos
  // que decidem avanco de sala (`garantirTransicaoDeQuotaFechada` e
  // `registrarAbate`), senao um dos dois fica desatualizado com o toggle.
  const manualAdvance = (gameState.autoToggles.avancoManualDeSala ?? false) && !(opts.offline ?? false)
  if (!world.player) return []

  if (!world.mapDef) {
    // Hospital: sem movimento/combate, mas o battle sprite continua animando.
    if (!silent) updateAnimations(world, dt)
    return []
  }

  // PH-329: o prazo do clima de golpe/habilidade e gasto AQUI, antes de
  // qualquer um dos retornos antecipados abaixo, e nao dentro de
  // `updateCombat`.
  //
  // A posicao e o ponto. Os tres blocos que vem em seguida (`countdownRemaining`
  // da intro do Lance, `salaCountdownRemaining` da troca de sala, e o gate de
  // quota) fazem `return []` — congelam movimento e combate de proposito. Se o
  // clima fosse gasto depois deles, cada uma dessas pausas viraria tempo
  // gratis de Rain Dance. "A duracao e por tempo, ponto" nao abre excecao pra
  // overlay de transicao.
  //
  // Vale nos tres regimes que chamam `stepWorld` sem nenhum deles precisar
  // lembrar: ao vivo, catch-up silencioso e resim da autoridade.
  tickClimaDeGolpe(world, dt)

  // Contagem regressiva de intro da Champion Lance: movimento/combate/
  // respawn ficam congelados e nada nasceu ainda ate isso chegar a 0.
  if (world.countdownRemaining != null) {
    world.countdownRemaining -= dt
    if (world.countdownRemaining <= 0) {
      world.countdownRemaining = null
      if (world.mapDef.sequence) {
        const enemy = spawnSequenceEnemy(world, world.mapDef, world.sequenceIndex, entradaDoInimigo(world.mapDef, world.sala))
        aplicarHazardsAoInimigo(world.rng, world.enemyHazards, enemy)
        world.enemies.push(enemy)
      } else {
        const ctx = contextoDeSpawn(world.mapDef.id, world.mapDef.levelRange, world.sala, world.mapDef.enemyPool)
        for (let i = 0; i < limiteDeInimigos(world.mapDef, world.player?.poke); i++) {
          const enemy = spawnEnemyAt(world, world.mapDef, ctx, world.player, entradaDoInimigo(world.mapDef, world.sala), world.enemies)
          aplicarHazardsAoInimigo(world.rng, world.enemyHazards, enemy)
          world.enemies.push(enemy)
        }
      }
    }
    if (!silent) updateAnimations(world, dt)
    return []
  }

  // Quota fechada numa janela ANTERIOR (a contagem regressiva e efemera e nao
  // atravessa a reconstrucao de mundo do servidor): arma a transicao agora, sem
  // esperar um abate novo. Ver o livelock em
  // salaSystem.ts#garantirTransicaoDeQuotaFechada.
  garantirTransicaoDeQuotaFechada(world, world.mapDef.id, dt, manualAdvance, () =>
    garantirProtetorDaSala(world, world.mapDef!, undefined, world.player, null))

  // SIMULACAO SILENCIOSA NAO ESPERA A CONTAGEM DE "ENTRANDO EM NOVA AREA" (PH-331).
  //
  // `SALA_TRANSITION_COUNTDOWN` (3s) existe pra o jogador LER o nome do
  // sub-bioma novo no overlay. Quando ninguem esta olhando — resim do servidor
  // e catch-up de aba oculta, os dois `silent` — ele nao informa nada, e cobra
  // uma coisa concreta: `salaPendente` e `salaCountdownRemaining` sao EFEMEROS e
  // nao atravessam a reconstrucao de mundo por janela de flush.
  //
  // O DEFEITO MEDIDO (bancada `janela-do-protetor.mjs`, sonda de 2026-08-31): o
  // protetor da sala morre a 3,6s do fim da janela, a transicao arma, a janela
  // fecha com 2,0s de contagem sobrando — e o que o servidor grava e a sala
  // ANTIGA, com `sala_abates = 30` e a linha de `sala_protetor` deletada. A
  // janela seguinte reconstroi o mundo, le "sala pede protetor, nao ha protetor"
  // (`protetorResolvido` tambem e efemero, e nao ha coluna que o guarde) e
  // sorteia um protetor NOVO, com HP cheio. O jogador mata o guardiao e ganha
  // outro guardiao. Reproduzido: janela 1 mata em 3,63s; janela 2 mata OUTRO em
  // 7,37s, mesma sala.
  //
  // Com janelas de 30s isso e ~10% das vitorias (a contagem tem que caber nos
  // ultimos 3s); com janelas curtas vira livelock, que e a cara do travamento
  // relatado ao vivo em 29/08.
  //
  // Encurtar aqui fecha a janela de ambiguidade em vez de tentar persistir mais
  // estado: matar e trocar de sala passam a acontecer no mesmo tick de
  // simulacao, entao a sala que o flush grava JA e a nova. `encurtarTransicaoDeSala`
  // e a mesma funcao que a volta da aba usa (PH-302), pelo mesmo motivo.
  //
  // O QUE NAO MUDA: o gate do protetor. Quem arma a transicao continua sendo
  // `resolverProtetorDaSala`, e so depois de o protetor cair — encurtar a
  // contagem nao pula protetor nenhum.

  if (silent) encurtarTransicaoDeSala(world)
  // Contagem regressiva "Entrando em nova area" entre salas (ver
  // salaSystem.ts#registrarAbate/aplicarTransicaoDeSala): a quota de abates
  // da sala atual ja fechou e a proxima ja foi sorteada
  // (world.salaPendente) — movimento/combate ficam congelados ate zerar,
  // mesmo padrao do countdown de intro do Lance acima.
  if (world.salaCountdownRemaining != null) {
    world.salaCountdownRemaining -= dt
    if (world.salaCountdownRemaining <= 0) {
      world.salaCountdownRemaining = null
      const fechouEstagio = world.salaPendente?.indice === 0
      aplicarTransicaoDeSala(world, world.mapDef.id)
      if (world.mapDef) {
        const ctx = contextoDeSpawn(world.mapDef.id, world.mapDef.levelRange, world.sala, world.mapDef.enemyPool)
        for (let i = 0; i < limiteDeInimigos(world.mapDef, world.player?.poke); i++) {
          const enemy = spawnEnemyAt(world, world.mapDef, ctx, world.player, entradaDoInimigo(world.mapDef, world.sala), world.enemies)
          aplicarHazardsAoInimigo(world.rng, world.enemyHazards, enemy)
          world.enemies.push(enemy)
        }
        world.respawnTimer = world.mapDef.respawnDelay
        // O AVISO DE CHEGADA VIROU SPLASH, e nao e mais um toast (PH-395).
        //
        // O nome do lugar e a informacao que o jogador quer da troca de sala, e
        // ela saia num toast de canto, com a mesma duracao e no mesmo lugar de
        // "Item encontrado: Potion". Agora ela tem espaco proprio, 4 segundos, e
        // o resto (numero da sala, faixa de nivel, bioma) e derivado da propria
        // `sala` pelo componente — o motor manda o FATO, nao o texto.
        //
        // `!silent` pelo mesmo motivo de sempre: o resim do servidor e o
        // catch-up de aba oculta atravessam varias salas de uma vez, e nao ha
        // ninguem olhando.
        if (!silent && world.sala) {
          splashDeSalaStore.getState().anunciarSala(world.sala, fechouEstagio)
        }
      }
    }
    if (!silent) updateAnimations(world, dt)
    return []
  }

  // ANTES do movimento: quem decide se o jogador esta reunindo (e pra onde) e o
  // lure, e `updateMovement` so executa o `destino` que sai daqui. Rodar depois
  // deixaria o movimento um tick atrasado em relacao a fase — visivel no
  // instante em que a conta fecha (o POKE daria um passo a mais pro candidato
  // antes de virar pra lutar).
  atualizarLure(world, gameState, dt)
  updateMovement(world, dt)
  const { defeatedEnemyIds, playerJustFainted } = updateCombat(world, dt, { silent })
  // attackAnimTimer precisa decrementar todo tick independente de `silent`
  // — MovementSystem trava movimento enquanto ele roda.
  tickAttackAnimTimers(world, dt)
  // Precisa rodar DEPOIS do combate: triggerAttackAnim (chamado de dentro
  // de updateCombat) precisa ser capturado no mesmo tick.
  if (!silent) updateAnimations(world, dt)

  const kills: KillResult[] = []
  if (defeatedEnemyIds.length > 0) {
    for (const enemyId of defeatedEnemyIds) {
      const enemy = world.enemies.find((e) => e.id === enemyId)
      if (!enemy) continue
      kills.push(handleEnemyDefeated(world, enemy, gameState, { silent, manualAdvance }))
      enemy.deathRemovalTimer = silent ? 0 : DEATH_ANIM_GRACE_PERIOD
      // Conta pra quota da sala AQUI, e nao em quem chama: este e o unico
      // ponto de abate do jogo, entao o combate ao vivo, o catch-up de aba
      // oculta e o farm offline contam pela mesma regra sem nenhum deles
      // precisar lembrar. So arma a contagem regressiva (world.salaCountdownRemaining) —
      // a troca de fato acontece la em cima, no gate do proximo tick.
      registrarAbate(world, world.mapDef.id, { manualAdvance })
    }
  }


  for (const enemy of world.enemies) {
    if (isDead(enemy) && enemy.deathRemovalTimer != null && enemy.deathRemovalTimer > 0) enemy.deathRemovalTimer -= dt
  }
  // Regra da Champion Lance: POKEs derrotados ficam em campo como "corpos"
  // visiveis em vez de desaparecer apos o periodo de graca usual.
  world.enemies = world.enemies.filter((e) => !isDead(e) || (e.deathRemovalTimer ?? 0) > 0 || world.mapDef!.keepCorpses)

  if (playerJustFainted && world.player) {
    // Roda mesmo quando silent — mesma regra de todo outro pipeline de
    // recompensa/penalidade aqui, so o toast e ao-vivo-so.
    const expAntesDaPenalidade = world.player.poke.exp
    const penaltyResult = applyDeathExpPenalty(world.player.poke)
    world.player.poke = penaltyResult.poke
    gameState.updatePokeInstance(penaltyResult.poke.uid, () => penaltyResult.poke)
    // PH-169: entrada SINTETICA (nao e abate) — so pro resumo do flush
    // (offlineSimSystem.ts) saber quanto de queda de XP nesta janela e
    // LEGITIMA. Campos de abate ficam zerados/false/null de proposito.
    kills.push({
      gold: 0,
      ouroDeAutoVenda: 0,
      xp: 0,
      leveledUp: false,
      trainerLeveledUp: false,
      isShiny: false,
      captured: false,
      capturedPoke: null,
      droppedItems: [],
      playerFainted: true,
      expLostToPenalty: Math.max(0, expAntesDaPenalidade - penaltyResult.poke.exp),
      leveledDown: penaltyResult.leveledDown,
    })
    if (!silent) {
      toastStore.getState().pushToast(
        `${SPECIES[world.player.poke.speciesId].name} desmaiou!${penaltyResult.leveledDown ? ` Caiu para o nivel ${penaltyResult.level}.` : ''}`,
        'error', 'combat',
      )
    }
  }

  // Regra da Champion Lance (autoSwitchTeamOnFaint): em vez do modal "voce
  // perdeu" de BOSS normal no primeiro desmaio, o proximo membro de equipe
  // nao-desmaiado entra em campo — depois de TROCA_APOS_DESMAIO segundos, a
  // mesma espera que o outro lado tem (huntTypes.ts#ESPERA_DE_TROCA_SEGUNDOS).
  //
  // A condicao e REDERIVADA todo tick ("desmaiado em campo + alguem vivo no
  // banco") em vez de disparada uma vez no `playerJustFainted`. E o que faz a
  // espera sobreviver a reconstrucao do mundo por janela de flush: o mundo
  // novo nasce com o POKE desmaiado e sem timer nenhum, e sem esta releitura
  // a troca simplesmente nunca aconteceria — o mesmo modo de falha silencioso
  // do `sequenceIndex` que engine/lance.test.ts existe pra impedir.
  trocarPorDesmaio(world, gameState, dt, silent)

  const autoEvents = updateAutoHeal(world, gameState, dt)
  if (!silent) {
    for (const ev of autoEvents) {
      if (ev.type === 'auto_pot') {
        const item = getItem(ev.itemId)
        if (item) toastStore.getState().pushToast(`Auto-pot usou ${item.name}.`, 'success', 'combat')
      }
      if (ev.type === 'auto_revive') toastStore.getState().pushToast('Auto-revive reanimou seu POKE!', 'success', 'combat')
    }
  }

  // Hunts BOSS (Modo Pesadelo) nascem seu unico lendario uma vez por
  // visita e nunca reabastecem o pool depois que ele morre.
  const aliveCount = world.enemies.filter((e) => !isDead(e)).length

  if (
    world.mapDef.sequence && world.mapDef.unlocksContinentOnClear?.length && !world.sequenceCleared
    && aliveCount === 0 && world.sequenceIndex === world.mapDef.sequence.length - 1
  ) {
    world.sequenceCleared = true
    // PH-432: a lista encolheu pra so o Modo Pesadelo. A faixa III que ele
    // abria virou os estagios 7 a 10, que o proprio progresso do bioma libera.
    const grupos = world.mapDef.unlocksContinentOnClear
    const algumEstavaTrancado = grupos.some((g) => !gameState.isContinentUnlocked(g))
    for (const grupo of grupos) gameState.unlockContinent(grupo)
    if (!silent && algumEstavaTrancado) {
      toastStore.getState().pushToast('Você derrotou o Campeão Lance! O Modo Pesadelo foi liberado.', 'success', 'world')
    }
  }

  // PH-202/203: protetor vivo suspende o respawn de mob comum — o design fala
  // em "spawn normal suspenso ate resolver" e o spawn INICIAL do protetor
  // (via garantirProtetorDaSala/buildMapWorld) ja pula o loop normal, mas sem
  // este corte aqui `aliveCount` (que so conta o protetor, 1) ficava abaixo
  // de `maxEnemies` e este respawn enchia a sala com mobs comuns do lado do
  // protetor — achado revisando PH-217 (ChatGPTDaqui, #182).
  if (aliveCount < limiteDeInimigos(world.mapDef, world.player?.poke) && !world.mapDef.noRespawn && !world.protetorPendente) {
    world.respawnTimer = (world.respawnTimer ?? 0) - dt
    if (world.respawnTimer <= 0) {
      const ctx = contextoDeSpawn(world.mapDef.id, world.mapDef.levelRange, world.sala, world.mapDef.enemyPool)
      const enemy = spawnEnemyAt(world, world.mapDef, ctx, world.player, entradaDoInimigo(world.mapDef, world.sala), world.enemies)
      aplicarHazardsAoInimigo(world.rng, world.enemyHazards, enemy)
      world.enemies.push(enemy)
      world.respawnTimer = world.mapDef.respawnDelay
    }
  } else if (world.mapDef.sequence && aliveCount === 0 && world.sequenceIndex < world.mapDef.sequence.length - 1) {
    world.respawnTimer = (world.respawnTimer ?? 0) - dt
    if (world.respawnTimer <= 0) {
      world.sequenceIndex += 1
      const enemy = spawnSequenceEnemy(world, world.mapDef, world.sequenceIndex, entradaDoInimigo(world.mapDef, world.sala))
      aplicarHazardsAoInimigo(world.rng, world.enemyHazards, enemy)
      world.enemies.push(enemy)
      world.respawnTimer = world.mapDef.respawnDelay
    }
  }

  // PH-217: `world.protetorPendente.hpAtual` so nasce setado no spawn — o
  // dano que o protetor leva durante a janela vive na entidade. Espelha aqui,
  // todo tick, pra o flush (authority/progresso.ts#aplicarFlush) persistir o
  // HP real. Sem isto, a proxima reconstrucao de mundo (~30s) recria o
  // protetor com HP cheio, e uma luta longa nunca fecha. Sem RNG: so copia
  // um numero.
  if (world.protetorPendente) {
    const protetorVivo = world.enemies.find((e) => e.isProtetor && e.poke.uid === world.protetorPendente!.uid)
    if (protetorVivo) {
      // PH-301: CAO DE GUARDA DO IMPASSE. `protetorPendente.hpAtual` ainda tem
      // o HP do tick anterior neste ponto (a linha abaixo e que o atualiza),
      // entao a comparacao aqui e "caiu HP desde o ultimo tick?" de graca, sem
      // guardar estado a mais.
      //
      // So conta tempo com os dois ENGAJADOS: o POKE atravessando o mapa nao e
      // impasse, e sem esta condicao a caminhada (que pode passar de 12s num
      // mapa grande) trocaria o protetor antes da luta comecar.
      //
      // PH-305: e so enquanto o POKE PODE AGIR. O relogio mede "bato e nao
      // tiro HP", nao "nao estou batendo" — e sao coisas diferentes com o mesmo
      // sintoma. Congelamento e o caso que alcanca o limite: ele nao tem
      // duracao fixa (sorteio de 20% por turno pra descongelar), entao a cauda
      // passa dos 12s sem esforco, e o guardiao ia embora no meio de uma luta
      // que estava indo bem — levando junto o HP que ja tinha perdido. Sono nao
      // alcanca (2 a 4 turnos de 2s). Paralisia tambem fica de fora: ela atrasa
      // a acao por sorteio, nao impede, entao o POKE segue atacando.
      const podeAgir = !bloqueiaAcaoSempre(world.player?.poke.status ?? null)
      const engajado = protetorVivo.state === 'engaged' && world.player?.state === 'engaged'
      if (protetorVivo.poke.hp < world.protetorPendente.hpAtual) world.protetorSemDanoSegundos = 0
      else if (engajado && podeAgir) world.protetorSemDanoSegundos += dt
      world.protetorPendente.hpAtual = protetorVivo.poke.hp

      if (world.protetorSemDanoSegundos >= PROTETOR_SEM_DANO_LIMITE) {
        // Descarta ESTE protetor e deixa o proximo tick sortear outro (com o
        // filtro de `criarEntidadeDoProtetor`). A sala continua travada por
        // `protetorDaSala`, `protetorResolvido` continua false, e o gate de
        // bioma segue de pe — o que muda e so quem esta em campo.
        world.enemies = world.enemies.filter((e) => e.id !== protetorVivo.id)
        world.protetorPendente = null
        world.protetorSemDanoSegundos = 0
        if (!silent) {
          toastStore.getState().pushToast(
            'O protetor da sala fugiu do combate. Outro tomou o lugar dele.', 'info', 'world',
          )
        }
      }
    }
  } else {
    world.protetorSemDanoSegundos = 0
  }

  return kills
}

// Copia world.player.poke (autoritativo ao vivo durante combate) de volta
// pra gameStateStore.team — ver nota de arquitetura no topo do arquivo.
// Chamado pela Fase 5 num timer periodico de baixa frequencia (nao todo
// tick) e em pontos de transicao de cena.
export function syncActivePokeToGameState(world: WorldState, gameState: GameStateStore): void {
  if (!world.player) return
  gameState.updatePokeInstance(world.player.poke.uid, () => world.player!.poke)
}

// ---------- Acoes do controller (chamadas pela UI, Fase 6) ----------
