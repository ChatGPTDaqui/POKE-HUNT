// Salas: uma hunt e percorrida em 10 salas, e cada sala e um SUB-BIOMA
// sorteado do bioma daquela hunt (ver data/biomas.ts). Limpar a sala leva pra
// proxima; limpar as 10 fecha um ciclo e recomeca.
//
// ---------------------------------------------------------------------------
// POR QUE "QUOTA DE ABATES" E NAO "MATAR TODOS OS INIMIGOS EM CAMPO"
// ---------------------------------------------------------------------------
// O servidor e a autoridade e simula por JANELAS: a cada flush (~30s) ele monta
// o mundo do zero com `buildMapWorld`. O inimigo que estava em campo NAO
// sobrevive de uma janela pra outra — um contador sobrevive. "Limpar a sala"
// como "zerar o campo" seria uma condicao que o servidor nunca observaria
// inteira, e a hunt travaria na sala 1 pra sempre. E o mesmo motivo que faz o
// `sequenceIndex` do Campeao Lance precisar de coluna propria.
//
// ---------------------------------------------------------------------------
// POR QUE O SORTEIO E POR AVANCO, E NAO UM PLANO DE 10 SALAS NA ABERTURA
// ---------------------------------------------------------------------------
// Um plano inteiro teria que ser mandado (ou escondido) do cliente. Mandado, o
// jogador le que a sala 7 e a boa, sai e reentra ate ela cair na sala 1 —
// reroll gratis. Escondido, o cliente nao tem o que mostrar. Sorteando no
// momento do avanco, o futuro simplesmente nao existe pra ser espiado, e o
// unico estado a persistir e a sala ATUAL.
//
// O anti-reroll que sobra e o custo: sair da hunt fecha a sessao, entao voltar
// recomeca no ciclo 1, sala 1.
import { weightedPick } from '@/core/random'
import type { Rng } from '@/core/rng'
import { SALAS_POR_HUNT, ABATES_POR_SALA, SUB_BIOMA_POR_CHAVE, LOOT, type SubBiomaDef } from '@/data/biomas'
import { POOL_POR_SALA } from '@/data/huntSpawnOverrides'
import { getEncounter } from '@/data/enemies'
import { mapDefParaSala, spawnPointParaSala, isCellBlocked, nearestOpenPoint } from '@/data/maps'
import type { MapItemDrop } from '@/data/generated/types'
import type { SalaAtiva, WorldState } from '../types'

/**
 * Duracao do aviso "Entrando em nova area" entre salas — congela
 * movimento/combate (mesmo padrao do `countdownRemaining` de intro do
 * Campeao Lance, ver simulation.ts#stepWorld), tempo que a UI aproveita pra
 * cobrir a tela com o overlay em vez do jogador ver o mapa antigo trocar de
 * repente.
 */
export const SALA_TRANSITION_COUNTDOWN = 3

/** A hunt e percorrida em salas? Hunt inicial, BOSS e Lance nao sao. */
export function temSalas(mapId: string): boolean {
  return POOL_POR_SALA[mapId] != null
}

/** Sub-biomas desta hunt que tem pelo menos um encontro nesta faixa. */
function candidatas(mapId: string): SubBiomaDef[] {
  const salas = POOL_POR_SALA[mapId]
  if (!salas) return []
  // O bioma e recuperado por QUALQUER uma das chaves de sala: todas pertencem
  // ao mesmo bioma por construcao.
  const primeira = Object.keys(salas)[0]
  const bioma = primeira ? SUB_BIOMA_POR_CHAVE[primeira]?.bioma : null
  if (!bioma) return []
  // Filtrar por pool nao-vazio e defesa em profundidade: o teste
  // "nenhuma sala fica com pool vazio" ja garante que nao ha nenhuma, mas uma
  // sala vazia nao daria erro — o jogador entraria e nada spawnaria.
  return bioma.subBiomas.filter((s) => (salas[s.chave]?.length ?? 0) > 0)
}

/**
 * Sorteia o sub-bioma da proxima sala, ponderado pelo `peso` de cada um.
 *
 * Consome a sequencia semeada do mundo de proposito: quem decide qual sala vem
 * e o servidor, pela mesma semente que decide shiny, IV e raridade.
 */
export function sortearSala(rng: Rng, mapId: string): string | null {
  const opcoes = candidatas(mapId)
  if (opcoes.length === 0) return null
  if (opcoes.length === 1) return opcoes[0].chave
  return weightedPick(rng, opcoes, (s) => s.peso).chave
}

export function novaSala(rng: Rng, mapId: string, indice: number, ciclos: number): SalaAtiva | null {
  const chave = sortearSala(rng, mapId)
  if (!chave) return null
  return { indice, chave, abates: 0, ciclos }
}

/**
 * A janela de nivel da sala: a hunt AFUNDA conforme as salas sao limpas.
 *
 * BUG DE BALANCEAMENTO QUE ISTO CORRIGE, medido no motor headless: uma faixa
 * cobre 30 niveis, entao sem janela a primeira sala da "Mata I" (Lv1-30) ja
 * podia jogar um Butterfree Lv30 contra um POKE recem-saido do Hospital. Um
 * Charmander Lv25 morreu em 4 abates numa simulacao de 30 minutos, gastando 21
 * pocoes no caminho. As zonas antigas tinham 10 niveis e nao expunham isso.
 *
 * A sala 1 fica na base da faixa e a 10 no topo — o que da a mecanica de salas
 * um significado mecanico (a hunt fica mais dura conforme voce avanca) alem da
 * variedade de sub-bioma.
 */
export function janelaDaSala(faixa: [number, number], indice: number): [number, number] {
  const [lo, hi] = faixa
  const largura = hi - lo
  if (largura <= 0) return [lo, hi]
  const passo = largura / SALAS_POR_HUNT
  const inicio = Math.round(lo + passo * indice)
  const fim = Math.round(lo + passo * (indice + 1))
  // A primeira sala inclui o piso da faixa; as outras comecam onde a anterior
  // acabou. `Math.max(inicio, fim)` cobre faixa curta demais pra 10 degraus.
  return [Math.max(lo, inicio), Math.max(Math.max(lo, inicio), Math.min(hi, fim))]
}

/** Encontros que podem nascer agora: os da sala, ou os da hunt inteira. */
export function poolAtivo(mapId: string, sala: SalaAtiva | null, fallback: string[]): string[] {
  if (!sala) return fallback
  const pool = POOL_POR_SALA[mapId]?.[sala.chave]
  return pool && pool.length > 0 ? pool : fallback
}

export interface ContextoDeSpawn {
  pool: string[]
  janela?: [number, number]
}

/**
 * O que pode nascer AGORA: o pool da sala, recortado pela janela de nivel dela.
 *
 * O recorte tem fallback: se nenhum encontro da sala alcanca a janela (a sala 1
 * de uma faixa cujo sub-bioma so tem forma evoluida, por exemplo), vale o pool
 * inteiro da sala. Sala que nao spawna nada e pior que sala fora do nivel — o
 * jogador ficaria num mapa vazio sem nenhum erro na tela.
 */
export function contextoDeSpawn(
  mapId: string,
  faixa: [number, number],
  sala: SalaAtiva | null,
  fallback: string[],
): ContextoDeSpawn {
  const pool = poolAtivo(mapId, sala, fallback)
  if (!sala) return { pool }
  const janela = janelaDaSala(faixa, sala.indice)
  const naJanela = pool.filter((id) => {
    const enc = getEncounter(id)
    return enc != null && enc.minLevel <= janela[1] && enc.maxLevel >= janela[0]
  })
  return { pool: naJanela.length > 0 ? naJanela : pool, janela }
}

/** Loot que pode cair agora: o do sub-bioma, ou o da hunt inteira. */
export function lootAtivo(sala: SalaAtiva | null, fallback: MapItemDrop[]): MapItemDrop[] {
  if (!sala) return fallback
  const perfil = SUB_BIOMA_POR_CHAVE[sala.chave]?.sub.loot
  return perfil ? LOOT[perfil] : fallback
}

export function nomeDaSala(sala: SalaAtiva | null): string | null {
  if (!sala) return null
  return SUB_BIOMA_POR_CHAVE[sala.chave]?.sub.nome ?? sala.chave
}

export interface AvancoDeSala {
  /** Quota fechou neste abate — a contagem regressiva de transicao comecou. */
  avancou: boolean
  /** A sala que vai entrar em vigor e a primeira do ciclo seguinte. */
  fechouCiclo: boolean
}

/**
 * Conta um abate na sala atual. Ao fechar a quota, NAO troca de sala na
 * hora — sorteia a proxima (o "carregamento" adiantado, pra UI ja saber o
 * nome/pool antes do overlay sumir) e arma `salaCountdownRemaining`.
 * `stepWorld` congela o jogo enquanto ela conta e so chama
 * `aplicarTransicaoDeSala` quando zera — mesmo padrao do
 * `countdownRemaining` de intro do Campeao Lance, so disparado no MEIO da
 * hunt em vez de na entrada.
 *
 * Chamado de dentro do `stepWorld`, entao vale igual no combate ao vivo, no
 * catch-up de aba oculta e no farm offline — nao ha um segundo caminho de
 * abate que pudesse esquecer de contar.
 */
export function registrarAbate(world: WorldState, mapId: string): AvancoDeSala {
  const sala = world.sala
  if (!sala) return { avancou: false, fechouCiclo: false }

  sala.abates += 1
  if (sala.abates < ABATES_POR_SALA) return { avancou: false, fechouCiclo: false }
  // Cap: sem isto, matar mais de um inimigo no MESMO tick (AOE) ou o jogo
  // continuar rodando por um instante antes do proximo tick congelar
  // deixaria `sala.abates` crescer sem limite enquanto a contagem regressiva
  // ja esta armada — inofensivo pro jogo, mas polui o valor persistido
  // (server/src/progresso.ts#sala_abates) com numero que nunca reflete a
  // quota real.
  sala.abates = ABATES_POR_SALA
  // Transicao ja armada por outro abate neste mesmo tick (AOE matando 2+ de
  // uma vez): nao reamarra, nao resorteia.
  if (world.salaCountdownRemaining != null) return { avancou: false, fechouCiclo: false }

  const proximo = sala.indice + 1
  const fechouCiclo = proximo >= SALAS_POR_HUNT
  const indice = fechouCiclo ? 0 : proximo
  const ciclos = fechouCiclo ? sala.ciclos + 1 : sala.ciclos

  // Nao ha "fim de hunt": o ciclo reinicia. Um fim faria 6 horas de farm
  // offline valerem os poucos minutos ate a sala 10 — o oposto do que um jogo
  // idle precisa.
  world.salaPendente = novaSala(world.rng, mapId, indice, ciclos) ?? { ...sala, indice, abates: 0, ciclos }
  world.salaCountdownRemaining = SALA_TRANSITION_COUNTDOWN
  return { avancou: true, fechouCiclo }
}

/**
 * Aplica a sala ja sorteada (`world.salaPendente`) quando a contagem
 * regressiva zera: troca mapa/colisao e reposiciona pro spawn point da nova
 * sala. "Area nova do zero" (pedido explicito do usuario) — zera tambem
 * inimigos/efeitos/hits pendentes em vez de so filtrar quem sobrou da sala
 * anterior; quem chama (`stepWorld`) faz o spawn fresco logo em seguida.
 */
export function aplicarTransicaoDeSala(world: WorldState, mapId: string): void {
  const pendente = world.salaPendente
  if (!pendente) return
  world.sala = pendente
  world.salaPendente = null
  world.enemies = []
  world.effects = []
  world.pendingHits = []
  world.respawnTimer = null

  const novoMapDef = mapDefParaSala(mapId, world.sala)
  if (!novoMapDef) return
  world.mapDef = novoMapDef

  if (!world.player) return
  const ponto = spawnPointParaSala(world.sala)
  if (ponto) {
    world.player.x = ponto.x
    world.player.y = ponto.y
    return
  }
  // Sala sem ponto de spawn proprio (sem body-block pintado): mantem a
  // posicao do jogador, so escapando de uma celula que a nova grade marque
  // como bloqueada — mesmo snap que `buildMapWorld` ja faz na construcao
  // inicial do mundo.
  if (isCellBlocked(novoMapDef, world.player.x, world.player.y)) {
    const escape = nearestOpenPoint(novoMapDef, world.player.x, world.player.y)
    if (escape) { world.player.x = escape.x; world.player.y = escape.y }
  }
}

export { SALAS_POR_HUNT, ABATES_POR_SALA }
