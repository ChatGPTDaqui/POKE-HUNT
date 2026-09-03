// Salas: uma hunt e percorrida em salas, e cada sala e um SUB-BIOMA sorteado do
// bioma daquela hunt (ver data/biomas.ts e data/estagios.ts). Limpar a sala
// leva pra proxima; limpar a ultima fecha o ESTAGIO e recomeca.
//
// QUANTAS SALAS DEIXOU DE SER 10 FIXAS (PH-427). Agora vem do estagio: 3 no
// estagio 1, subindo ate 8 no estagio 10 (`SALAS_POR_ESTAGIO`). Todo lugar que
// comparava com `SALAS_POR_HUNT` passou a perguntar `quantidadeDeSalas(mapId)` — e
// mapId virou parametro de funcoes que antes so precisavam da sala, porque a
// `SalaAtiva` sabe o sub-bioma dela mas NAO sabe de que estagio ela e.
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
import {
  ABATES_POR_SALA, ABATES_COMUNS_POR_SALA, BIOMA_POR_CHAVE, SUB_BIOMA_POR_CHAVE, LOOT,
  type SubBiomaDef,
} from '@/data/biomas'
import { estagioId, parseEstagioId, pesosDoEstagio, quantidadeDeSalas } from '@/data/estagios'
import { estagioLiberado, maiorEstagioLimpo, type ProgressoPorBioma } from '@/data/progressoDeBioma'
import { climaAmbienteDaSala, climaDeAmbiente, definirClimaDeAmbiente } from './climaAmbiente'
import { POOL_POR_SALA, aparaOTeto } from '@/data/huntSpawnOverrides'
import {
  pesosPorTier, tierDaEspecie, TIERS_SELVAGENS, TIERS_DE_PROTETOR,
  CHANCE_DO_TIER_DE_PROTETOR,
} from '@/data/spawnPorTier'
import { SUB_BIOMA_TIERS } from '@/data/generated/subBiomas.generated'
import { SPAWN_WEIGHT_BY_SPECIES } from '@/data/generated/spawnTiers.generated'
import { getEncounter } from '@/data/enemies'
import { mapDefParaSala, spawnPointParaSala, isCellBlocked, nearestOpenPoint } from '@/data/maps'
import type { MapItemDrop } from '@/data/generated/types'
import type { ClimaTipo, SalaAtiva, WorldState } from '../types'

/**
 * Duracao do aviso "Entrando em nova area" entre salas — congela
 * movimento/combate (mesmo padrao do `countdownRemaining` de intro do
 * Campeao Lance, ver simulation.ts#stepWorld), tempo que a UI aproveita pra
 * cobrir a tela com o overlay em vez do jogador ver o mapa antigo trocar de
 * repente.
 */
export const SALA_TRANSITION_COUNTDOWN = 3

/**
 * Quanto o cliente espera a sala do servidor antes de voltar a sortear a
 * propria.
 *
 * 120s, e nao os 20s originais (PH-271). O valor antigo foi escolhido pela
 * cadencia das REQUISICOES ("o flush periodico e de 30s e o pedido disparado
 * pela quota repetia a cada 5s, entao 20s cobre varias tentativas") — mas a
 * pergunta certa nao e quantos pedidos cabem na janela, e sim quanto o servidor
 * costuma demorar pra fechar a quota DELE.
 *
 * Medido em scripts/harness/divergencia-de-quota.mjs, 30 pares de sequencias:
 * cliente e servidor levam tempos diferentes pra chegar aos 30 abates, com
 * mediana de 32,6s de diferenca, p90 de 107,3s e pior caso de 112s. Ou seja,
 * 20s era MENOR que a divergencia tipica — o fallback disparava no caso NORMAL,
 * e nao no excepcional pra que ele foi escrito.
 *
 * O que isso causava, reproduzido ao vivo no jogo-dev em 29/08 lendo o chip de
 * sala a cada 3 segundos:
 *
 *   63s  Sala 2/10 Relvado    0 p/ limpar
 *   66s  Sala 2/10 Planicie   26 p/ limpar
 *
 * O numero da sala nao mudou e o sub-bioma trocou: o cliente tinha adiantado
 * uma sala por palpite e a sala do servidor chegou depois, corrigindo. Pro
 * jogador isso le como "a area mudou sozinha sem eu completar as 30 kills" —
 * metade do relato da PH-258, que corrigiu a outra metade (a sala que nascia
 * vazia).
 *
 * O CUSTO E REAL: contra um servidor que de fato nunca fecha a transicao
 * (bundle publicado antes de 2026-08-19, o caso que este fallback existe pra
 * cobrir), a sala fica parada em 30/30 por dois minutos em vez de vinte
 * segundos. E o lado certo pra errar — um palpite errado troca a area debaixo
 * do jogador a cada sala, e a espera atrasa uma vez.
 *
 * E O NUMERO SOZINHO NAO BASTOU. Voltando ao jogo-dev depois de subir pra 120s,
 * a troca fantasma apareceu de novo:
 *
 *   Sala 3/10 Planicie  ->  Sala 3/10 Vilarejo
 *
 * Por isso estes 120 segundos deixaram de contar tempo de ESPERA e passaram a
 * contar tempo de SILENCIO: qualquer resposta da autoridade zera o relogio (ver
 * `reconciliarSalaDaAutoridade`), entao ele so estoura quando o servidor parou
 * de responder de vez. Servidor vivo — mesmo repetindo a mesma sala por
 * minutos — e o dono da sala, e o cliente espera.
 */
export const ESPERA_MAXIMA_PELA_AUTORIDADE = 120

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
 * O peso de sorteio de cada sub-bioma candidato desta hunt (PH-476).
 *
 * O BUG QUE ISTO CONSERTA, E ELE ERA A MECANICA CENTRAL DO REDESENHO. Ate aqui
 * `sortearSala` ponderava por `s.peso` — o peso ESTATICO de `data/biomas.ts`,
 * que e o mesmo nos dez estagios de um bioma. `pesosDoEstagio` (a curva de
 * profundidade da PH-425) era calculada, guardada em
 * `ESTAGIO_POR_ID[...].pesosDeSubBioma`, exibida na trilha, anunciada na nota
 * 7.38 — e NUNCA consultada por quem sorteia. Medido nos dados reais:
 *
 *   marinho e10    tela: sea 21%, seabed 79%       sorteio: sea 53%, beach 32%, seabed 16%
 *   campo   e10    tela: plains 13%, meadow 62%    sorteio: plains 31%, meadow 19%, town 19%
 *
 * A coluna do sorteio era IDENTICA nos dez estagios. O jogador escolhia o
 * estagio 10 do Marinho pelo Leito Oceanico e recebia Praia num terco das
 * salas — a arte, o texto e a mecanica contando coisas diferentes, sem nada
 * quebrar.
 *
 * PESO ZERO E AUSENCIA, e essa e a metade da curva que importa: o sub-bioma
 * some do estagio. Filtrar antes do `weightedPick` (em vez de passar 0 pra
 * ele) mantem o atalho de "um candidato so" valendo e deixa explicito que a
 * lista de candidatos DEPENDE do estagio.
 *
 * HUNT SEM ESTAGIO CONTINUA NO PESO ESTATICO. A inicial, as BOSS, o Campeao
 * Lance e o espelho do Pesadelo nao tem curva de profundidade — la `sub.peso` e
 * o peso certo, e nao um fallback.
 */
function pesoDeSorteioDaSala(mapId: string): { opcoes: SubBiomaDef[]; peso: (s: SubBiomaDef) => number } {
  const opcoes = candidatas(mapId)
  const doMapa = parseEstagioId(mapId)
  const bioma = doMapa ? BIOMA_POR_CHAVE[doMapa.bioma] : null
  if (!doMapa || !bioma) return { opcoes, peso: (s) => s.peso }

  const pesos = pesosDoEstagio(bioma, doMapa.estagio)
  const alcancaveis = opcoes.filter((s) => (pesos[s.chave] ?? 0) > 0)
  // Defesa em profundidade: se a curva zerar TODOS os candidatos, sortear
  // ninguem seria pior que sortear pelo peso antigo — `novaSala` devolveria
  // `null` e a hunt ficaria presa no sub-bioma anterior. Nao acontece com os
  // dados de hoje (`pesosPorProfundidade` sempre deixa pelo menos um acima de
  // zero), e por isso mesmo o caso nao merece silencio.
  if (alcancaveis.length === 0) return { opcoes, peso: (s) => s.peso }
  return { opcoes: alcancaveis, peso: (s) => pesos[s.chave] ?? 0 }
}

/**
 * Sorteia o sub-bioma da proxima sala, ponderado pelo peso do ESTAGIO (PH-476)
 * — ou pelo peso estatico, nas hunts que nao tem estagio.
 *
 * Consome a sequencia semeada do mundo de proposito: quem decide qual sala vem
 * e o servidor, pela mesma semente que decide shiny, IV e raridade.
 */
export function sortearSala(rng: Rng, mapId: string): string | null {
  const { opcoes, peso } = pesoDeSorteioDaSala(mapId)
  if (opcoes.length === 0) return null
  if (opcoes.length === 1) return opcoes[0].chave
  return weightedPick(rng, opcoes, peso).chave
}

/**
 * A distribuicao que `sortearSala` de fato aplica, como probabilidade.
 *
 * Existe pra a TELA e o TESTE poderem perguntar "o que o sorteio faz?" sem
 * reimplementar a ponderacao — que e exatamente como a PH-476 passou
 * despercebida: a trilha comparava a si mesma com a tabela de dados, e as duas
 * concordavam porque nenhuma das duas era o sorteio.
 *
 * Soma 1 sobre os sub-biomas alcancaveis; `{}` na hunt sem salas.
 */
export function distribuicaoDeSala(mapId: string): Record<string, number> {
  const { opcoes, peso } = pesoDeSorteioDaSala(mapId)
  const soma = opcoes.reduce((s, o) => s + peso(o), 0)
  if (!(soma > 0)) return {}
  const saida: Record<string, number> = {}
  for (const o of opcoes) saida[o.chave] = peso(o) / soma
  return saida
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
 * cobria 30 niveis, entao sem janela a primeira sala da "Mata I" (Lv1-30) ja
 * podia jogar um Butterfree Lv30 contra um POKE recem-saido do Hospital. Um
 * Charmander Lv25 morreu em 4 abates numa simulacao de 30 minutos, gastando 21
 * pocoes no caminho. As zonas antigas tinham 10 niveis e nao expunham isso.
 *
 * A primeira sala fica na base do estagio e a ultima no topo — o que da a
 * mecanica de salas um significado mecanico (a hunt fica mais dura conforme
 * voce avanca) alem da variedade de sub-bioma.
 *
 * `salas` E PARAMETRO E NAO CONSTANTE DESDE A PH-427, porque o estagio agora
 * tem de 3 a 8 salas conforme o numero dele — e o degrau, que era sempre
 * 30/10 = 3 niveis, passa a variar de 10/3 (3,3 niveis) a 10/8 (1,25 nivel).
 * Com estagio de 10 niveis e 8 salas, os degraus arredondam pra 1 nivel cada e
 * varias salas ficam com janela de 1 unico nivel — o que e o desenho, nao um
 * defeito: o estagio inteiro cobre 10 niveis e a sala e um decimo dele.
 */
export function janelaDaSala(
  faixa: [number, number], indice: number, salas: number,
): [number, number] {
  const [lo, hi] = faixa
  const largura = hi - lo
  if (largura <= 0 || salas <= 0) return [lo, hi]
  const passo = largura / salas
  const inicio = Math.round(lo + passo * indice)
  const fim = Math.round(lo + passo * (indice + 1))
  // A primeira sala inclui o piso do estagio; as outras comecam onde a anterior
  // acabou. `Math.max(inicio, fim)` cobre janela curta demais pros degraus.
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
  /**
   * Peso do encontro NESTA sala, ja aparado pelo teto de fatia.
   *
   * Existe como funcao no contexto, e nao como `encounter.weight` lido direto,
   * porque o teto so faz sentido contra o pool que esta valendo AGORA — e o
   * peso guardado no encontro e um so, compartilhado por todas as salas da
   * mesma hunt (`addEncounter` chaveia por hunt + especie). Aparar o encontro
   * pra caber numa sala estragaria a fatia dele na sala vizinha.
   */
  peso: (encounterId: string) => number
}

// ---------------------------------------------------------------------------
// Peso por sala
// ---------------------------------------------------------------------------
// O teto de fatia (`huntSpawnOverrides#TETO_DE_FATIA`) sempre existiu, mas era
// aplicado sobre o `enemyPool` da HUNT — a uniao das salas — enquanto o sorteio
// acontece sobre o pool da SALA recortado pela janela de nivel. As duas coisas
// nao se encostam, e o resultado era um teto que nao segurava nada: medido nas
// 99 salas (33 sub-biomas x 3 faixas), 9 passavam de 35%, sendo Leito de Praia
// III e Laboratorio II exatamente 50%.
//
// A conta e feita aqui, no ponto onde o pool ativo e conhecido, em vez de
// pre-calculada num Record por (hunt, sub-bioma, indice de sala): sao ~2.000
// combinacoes, e uma tabela paralela e mais uma coisa que pode sair de sincronia
// com o pool sem dar erro. O cache abaixo tira o custo do caminho quente.
const cacheDePesos = new Map<string, Map<string, number>>()

/**
 * Pesos do pool ativo: tier do PokeRogue decide a fatia, tier real de encontro
 * dos jogos desempata dentro dela, teto de fatia apara o que sobrar.
 *
 * A CHANCE VEM DO TIER, E NAO MAIS DO PESO DO ENCONTRO. O peso guardado em
 * `encounter.weight` e a frequencia real da especie nos jogos (Gen1/Gen2 por
 * disassembly, Gen3 por pokeemerald) e ele continua valendo onde nao ha
 * sub-bioma — hunt inicial, hunts BOSS, Campeao Lance. Dentro de uma sala ele
 * vira DESEMPATE: quem manda e o tier que o PokeRogue da aquela especie
 * NAQUELE lugar, que e a informacao que faltava (o mesmo Zubat e comum na
 * caverna e nao existe na praia, e um numero global nao sabe disso).
 *
 * Especie sem tier no sub-bioma cai em COMMON. Nao e defesa: acontece de
 * verdade quando o pool da sala nao tem ninguem na janela de nivel e o fallback
 * traz o `enemyPool` da hunt inteira, com especie de sub-bioma vizinho junto.
 *
 * Memoizado porque `contextoDeSpawn` roda a cada spawn (milhares de vezes por
 * flush no farm offline) e a resposta so depende de (mapa, sub-bioma, indice da
 * sala) — a janela de nivel sai do indice, e o pool sai dos dois. O cache e
 * limitado por construcao: mapas com sala x sub-biomas deles x salas do estagio.
 */
function pesosDaSala(chave: string, subBioma: string, pool: string[]): Map<string, number> {
  const pronto = cacheDePesos.get(chave)
  if (pronto) return pronto
  const pesos = aparaOTeto(pesosPorTier(
    pool,
    (id) => {
      const sp = getEncounter(id)?.speciesId
      const tier = sp ? tierDaEspecie(subBioma, sp) : null
      return tier == null ? 0 : TIERS_SELVAGENS.indexOf(tier)
    },
    (id) => {
      const sp = getEncounter(id)?.speciesId
      return sp ? SPAWN_WEIGHT_BY_SPECIES[sp] ?? 0 : 0
    },
  ))
  cacheDePesos.set(chave, pesos)
  return pesos
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
  // Sem sala o pool de sorteio E o `enemyPool` da hunt, que ja levou a apara do
  // fallback em `huntSpawnOverrides` — o peso guardado no encontro ja e o final.
  if (!sala) return { pool, peso: (id) => getEncounter(id)?.weight ?? 0 }
  const janela = janelaDaSala(faixa, sala.indice, quantidadeDeSalas(mapId))
  const naJanela = pool.filter((id) => {
    const enc = getEncounter(id)
    return enc != null && enc.minLevel <= janela[1] && enc.maxLevel >= janela[0]
  })
  const ativo = naJanela.length > 0 ? naJanela : pool
  const pesos = pesosDaSala(`${mapId}|${sala.chave}|${sala.indice}`, sala.chave, ativo)
  return { pool: ativo, janela, peso: (id) => pesos.get(id) ?? 0 }
}

/** Loot que pode cair agora: o do sub-bioma, ou o da hunt inteira. */
export function lootAtivo(sala: SalaAtiva | null, fallback: MapItemDrop[]): MapItemDrop[] {
  if (!sala) return fallback
  const perfil = SUB_BIOMA_POR_CHAVE[sala.chave]?.sub.loot
  return perfil ? LOOT[perfil] : fallback
}

export type TipoDeProtetor = 'guardian' | 'lord'

/**
 * Minimo de candidatos a protetor. NAO e estetica — e o que impede um travamento
 * permanente da sala.
 *
 * O cao de guarda de `simulation.ts` (PROTETOR_SEM_DANO_LIMITE) descarta o
 * protetor depois de 12s de combate engajado sem tirar HP dele e deixa o tick
 * seguinte SORTEAR OUTRO, com o mesmo filtro. Com um candidato so, "outro" e o
 * mesmo — mesma especie, mesma imunidade — e o ciclo vira infinito: a cada 12s o
 * jogador le "o protetor fugiu, outro tomou o lugar" e a sala nunca avanca, com
 * `bioma_progress` travado atras dela.
 *
 * Enquanto o protetor saia do pool inteiro da sala (9 a 63 especies) isso era
 * teorico. Restringir ao pool de CHEFE torna concreto: sao 33 sub-biomas, e
 * cinco deles tem um chefe so no PokeRogue inteiro (town=ditto,
 * construction-site=machamp, metropolis=castform, snowy-forest=glalie,
 * temple=chimecho).
 */
export const MINIMO_DE_CANDIDATOS_A_PROTETOR = 3

// Cache dos candidatos, mesma chave e mesmo motivo do cache de pesos.
const cacheDeProtetor = new Map<string, ContextoDeSpawn>()

/**
 * O contexto de sorteio DO PROTETOR: o elenco de chefe daquele sub-bioma, com a
 * tabela de chance de chefe do PokeRogue.
 *
 * Guardian comeca no tier BOSS, Lord comeca no BOSS_RARE — e por isso que o
 * Lord da sala 10 e um bicho diferente do Guardian das salas 1-9 quando o lugar
 * tem os dois. De onde comeca, acumula tiers ate juntar
 * `MINIMO_DE_CANDIDATOS_A_PROTETOR`: primeiro na direcao do BOSS (mais comum),
 * depois na direcao do mais raro, que e o mesmo colapso do spawn normal.
 *
 * DUAS DEGRADACOES, as duas medidas, e as duas sao o comportamento certo:
 *
 *  1. CHEFE DO POKEROGUE E FORMA FINAL, E FORMA FINAL NAO CABE NA FAIXA I.
 *     O candidato tem que estar no pool da sala, que ja passou pela janela de
 *     nivel — e medido, 82 das 297 combinacoes (sub-bioma x indice de sala)
 *     nao tem chefe NENHUM disponivel, 71 delas na faixa I. Nesses casos vale o
 *     pool da sala inteiro, que e exatamente o que o jogo fazia antes desta
 *     mudanca. O efeito colateral e bem-vindo: o Guardian VIRA um chefe de
 *     verdade conforme o jogador sobe de faixa, em vez de ser um ja no Lv5.
 *
 *  2. COM MENOS DE 3 CHEFES, O RESTO VEM DO POOL DA SALA, do mais raro pro mais
 *     comum. Sao outras 82 combinacoes com 1 ou 2 chefes. Completar com os mais
 *     raros mantem o protetor sendo o bicho incomum do lugar; completar com os
 *     comuns entregaria um Rattata como Lord.
 */
export function contextoDoProtetor(
  mapId: string,
  ctx: ContextoDeSpawn,
  sala: SalaAtiva | null,
  tipo: TipoDeProtetor,
): ContextoDeSpawn {
  if (!sala) return ctx
  const chaveCache = `${mapId}|${sala.chave}|${sala.indice}|${tipo}`
  const pronto = cacheDeProtetor.get(chaveCache)
  if (pronto) return pronto

  const tiers = SUB_BIOMA_TIERS[sala.chave]
  const doTier = TIERS_DE_PROTETOR.map((t) => {
    const elenco = new Set(tiers?.[t] ?? [])
    return ctx.pool.filter((id) => elenco.has(getEncounter(id)?.speciesId ?? ''))
  })

  const inicio = tipo === 'lord' ? 1 : 0
  const escolhidos: string[] = []
  const tierDoEncontro = new Map<string, number>()
  const juntar = (i: number) => {
    for (const id of doTier[i]) {
      if (tierDoEncontro.has(id)) continue
      tierDoEncontro.set(id, i)
      escolhidos.push(id)
    }
  }
  juntar(inicio)
  for (let i = inicio - 1; i >= 0 && escolhidos.length < MINIMO_DE_CANDIDATOS_A_PROTETOR; i--) juntar(i)
  for (let i = inicio + 1; i < doTier.length && escolhidos.length < MINIMO_DE_CANDIDATOS_A_PROTETOR; i++) juntar(i)

  // Sem chefe nenhum: o pool da sala inteiro, com o peso normal de spawn.
  if (escolhidos.length === 0) {
    cacheDeProtetor.set(chaveCache, ctx)
    return ctx
  }

  // Completa com os mais RAROS da sala, e a ordem do desempate e estavel
  // (peso, depois id) porque cliente e autoridade precisam chegar no mesmo pool.
  if (escolhidos.length < MINIMO_DE_CANDIDATOS_A_PROTETOR) {
    const sobra = ctx.pool
      .filter((id) => !tierDoEncontro.has(id))
      .sort((a, b) => ctx.peso(a) - ctx.peso(b) || a.localeCompare(b))
    for (const id of sobra) {
      if (escolhidos.length >= MINIMO_DE_CANDIDATOS_A_PROTETOR) break
      tierDoEncontro.set(id, TIERS_DE_PROTETOR.length - 1)
      escolhidos.push(id)
    }
  }

  const chances = TIERS_DE_PROTETOR.map((t) => CHANCE_DO_TIER_DE_PROTETOR[t])
  const pesos = pesosPorTier(
    escolhidos,
    (id) => tierDoEncontro.get(id) ?? 0,
    (id) => {
      const sp = getEncounter(id)?.speciesId
      return sp ? SPAWN_WEIGHT_BY_SPECIES[sp] ?? 0 : 0
    },
    chances,
  )
  const doProtetor: ContextoDeSpawn = {
    pool: escolhidos,
    janela: ctx.janela,
    peso: (id) => pesos.get(id) ?? 0,
  }
  cacheDeProtetor.set(chaveCache, doProtetor)
  return doProtetor
}

/**
 * PH-202/225: todo bioma tem protetor (pivo 27/08 sobre o
 * "fora de escopo" original de 16/08, que limitava a so o bioma piloto —
 * o gate sequencial de PH-207/226 nao tinha efeito nenhum com so 1 bioma,
 * o ultimo da ordem, tendo protetor). Toda sala menos a ultima pede Guardian ao
 * fechar a quota; a ULTIMA SALA DO ESTAGIO pede o Lord. Pura — nao sorteia
 * nada, so decide QUAL protetor a sala pede, se pedir algum. A entidade em si
 * (RNG, criacao) fica em simulation.ts, que ja importa este modulo — colocar
 * aqui criaria import circular.
 *
 * `mapId` ENTROU NA ASSINATURA NA PH-427, e nao e conveniencia: antes a ultima
 * sala era sempre o indice 9, agora ela e o indice `quantidadeDeSalas(mapId) - 1`,
 * que vale 2 no estagio 1 e 7 no estagio 10. A `SalaAtiva` nao carrega o
 * estagio (ela guarda sub-bioma, indice, abates e ciclos, e e isso que vai pro
 * banco), entao a informacao so pode vir do mapId. Sem ele, o estagio 1 nunca
 * teria Lord — a sala 3 pediria Guardian pra sempre e o estagio nunca fecharia.
 */
export function protetorDaSala(sala: SalaAtiva | null, mapId: string): TipoDeProtetor | null {
  if (!sala) return null
  const bioma = SUB_BIOMA_POR_CHAVE[sala.chave]?.bioma.chave
  // PH-434: era `ORDEM_DOS_BIOMAS.includes`, e a pergunta nunca foi sobre
  // ORDEM — e "este sub-bioma pertence a um bioma de verdade?". A ordem entre
  // biomas morreu na PH-430; usa-la aqui deixava viva uma constante que so
  // sobrevivia pra traduzir save antigo.
  if (!bioma || !BIOMA_POR_CHAVE[bioma]) return null
  return sala.indice >= quantidadeDeSalas(mapId) - 1 ? 'lord' : 'guardian'
}

/** O jogador ja fechou o estagio desta hunt alguma vez? */
export function estagioJaLimpo(mapId: string, progresso: ProgressoPorBioma): boolean {
  const doMapa = parseEstagioId(mapId)
  if (!doMapa) return false
  return maiorEstagioLimpo(progresso, doMapa.bioma) >= doMapa.estagio
}

export function nomeDaSala(sala: SalaAtiva | null): string | null {
  if (!sala) return null
  return SUB_BIOMA_POR_CHAVE[sala.chave]?.sub.nome ?? sala.chave
}

/** Os dois campos de mundo que decidem se a sala ainda deve protetor. */
export interface EstadoDoProtetorDaSala {
  estagioJaLimpo: boolean
  protetorResolvido: boolean
}

/**
 * Esta sala ainda DEVE um protetor?
 *
 * TRES CONDICOES, E AS TRES JA MORAVAM ESPALHADAS. Ela e a mesma pergunta que
 * `registrarAbate`, `garantirTransicaoDeQuotaFechada`, `garantirProtetorDaSala`
 * e o `SalaChip` da tela faziam cada um por conta propria — e o chip esquecia o
 * `estagioJaLimpo`, entao em estagio limpo ele mandava derrotar um Guardian que
 * nao existe e escondia o botao de avanco (PH-474). Uma funcao, quatro
 * chamadores.
 *
 * Recebe o estado por interface, e nao o `WorldState` inteiro, porque
 * `buildMapWorld` precisa dela ANTES de o mundo existir.
 */
export function salaDeveProtetor(
  sala: SalaAtiva | null, mapId: string, estado: EstadoDoProtetorDaSala,
): boolean {
  // PH-428: estagio ja limpo nao repoe protetor — Guardian e Lord existem pra
  // travar a PRIMEIRA limpeza, e num estagio fechado seriam so pedagio.
  if (estado.estagioJaLimpo) return false
  // PH-230: ja caiu nesta sala. `protetorDaSala` e pura e continua respondendo
  // "esta sala pede protetor" pra sempre; sem este corte a sala pediria outro a
  // cada tick.
  if (estado.protetorResolvido) return false
  return protetorDaSala(sala, mapId) != null
}

/**
 * Quantos abates fecham ESTA sala (PH-473).
 *
 * `ABATES_COMUNS_POR_SALA` (29) enquanto a sala deve protetor — ele e o 30o. Os
 * `ABATES_POR_SALA` (30) cheios quando ela nao deve: hunt sem estagio, estagio
 * ja limpo, ou protetor ja derrotado.
 *
 * O DENOMINADOR DA BARRA CONTINUA SENDO 30 nos dois casos. Isto e o numerador
 * que fecha a sala, nao o total exibido — a barra em 29/30 com a quota de
 * comuns fechada e justamente o que diz "falta o chefe".
 */
export function quotaDeAbatesDaSala(
  sala: SalaAtiva | null, mapId: string, estado: EstadoDoProtetorDaSala,
): number {
  return salaDeveProtetor(sala, mapId, estado) ? ABATES_COMUNS_POR_SALA : ABATES_POR_SALA
}

/**
 * A sala ja matou todos os selvagens COMUNS que devia — nenhum outro nasce
 * (PH-473).
 *
 * O pedido do dono e literal: "nao havera nenhum outro Pokemon nascendo apos o
 * numero 30, em que o 30 seja o boss". O gate de respawn de `simulation.ts` ja
 * suspendia o repovoamento com protetor VIVO em campo (`!protetorPendente`),
 * mas havia duas frestas: o tick entre o 29o abate e o spawn do protetor, e o
 * caminho sob autoridade, onde o protetor do servidor pode nao ter espelho
 * local. Nas duas o campo voltava a encher de bicho comum.
 *
 * DEPOIS QUE O PROTETOR CAI, O REPOVOAMENTO VOLTA — de proposito, e nao por
 * descuido. Sob autoridade a sala so troca quando o servidor manda, o que pode
 * levar minutos (ver `ESPERA_MAXIMA_PELA_AUTORIDADE`), e deixar o campo vazio
 * nesse intervalo tiraria o farm do jogador em troca de nada: a sala ja esta
 * decidida. Os abates extras nao contam — `registrarAbate` capa na quota.
 */
export function comunsEsgotados(world: WorldState, mapId: string): boolean {
  const sala = world.sala
  if (!sala) return false
  if (!salaDeveProtetor(sala, mapId, world)) return false
  return sala.abates >= ABATES_COMUNS_POR_SALA
}

export interface AvancoDeSala {
  /** Quota fechou neste abate — a contagem regressiva de transicao comecou. */
  avancou: boolean
  /** A sala que vai entrar em vigor e a primeira do ciclo seguinte. */
  fechouEstagio: boolean
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
export function registrarAbate(world: WorldState, mapId: string, opts: { manualAdvance?: boolean } = {}): AvancoDeSala {
  const sala = world.sala
  if (!sala) return { avancou: false, fechouEstagio: false }

  sala.abates += 1
  // PH-473: a quota depende de a sala ainda dever protetor. Enquanto deve, sao
  // 29 comuns (o protetor e o 30o); depois que ele cai — ou onde ele nao
  // existe — sao os 30 cheios.
  const quota = quotaDeAbatesDaSala(sala, mapId, world)
  if (sala.abates < quota) return { avancou: false, fechouEstagio: false }
  // SOB AUTORIDADE REMOTA O CLIENTE NAO SORTEIA SALA. Ele conta abate (a barra
  // do HUD precisa andar a cada morte, nao de 30 em 30 segundos) e para aqui: a
  // sala seguinte chega pelo flush, por `reconciliarSalaDaAutoridade`.
  //
  // O BUG QUE ISTO CONSERTA, medido ao vivo em 2026-08-19 numa hunt de teste. As
  // duas simulacoes tem sequencia de sorteio PROPRIA (a do cliente e predicao,
  // ver core/rng.ts), entao elas sorteavam sub-biomas DIFERENTES pra mesma sala.
  // O cliente aplicava o dele com o aviso na tela; 2 segundos depois o flush
  // trazia o do servidor e `definirSala` o escrevia direto no estado — sem
  // aviso, sem trocar o mapa desenhado. Log real, uma hunt, 90 segundos:
  //
  //   14:53:13  Sala 2/10 Obra           (predicao local, com aviso)
  //   14:53:15  Sala 1/10 Usina 0/30     (flush: VOLTOU pra sala anterior)
  //   14:53:20  Sala 2/10 Laboratorio    (outro sub-bioma, sem aviso nenhum)
  //   14:53:45  Sala 2/10 Obra           (e de volta pro palpite local)
  //
  // Nao da pra consertar fazendo os dois sorteios coincidirem: seria preciso o
  // cliente conhecer a semente da sessao, e ai ele calcula as 10 salas na
  // abertura — o reroll gratis que a nota do topo deste arquivo existe pra
  // impedir. Quem cede e a predicao, que e o lado sem autoridade.
  if (world.salaSobAutoridade) {
    sala.abates = quota
    return { avancou: false, fechouEstagio: false }
  }
  // Cap: sem isto, matar mais de um inimigo no MESMO tick (AOE) ou o jogo
  // continuar rodando por um instante antes do proximo tick congelar
  // deixaria `sala.abates` crescer sem limite enquanto a contagem regressiva
  // ja esta armada — inofensivo pro jogo, mas polui o valor persistido
  // (server/src/progresso.ts#sala_abates) com numero que nunca reflete a
  // quota real.
  //
  // PH-473: o cap e a QUOTA VIGENTE, nao os 30 fixos. Com o protetor ainda de
  // pe a quota e 29, e capar em 30 poria a barra do HUD cheia antes de ele
  // cair — que e exatamente a leitura errada que esta issue existe pra
  // desfazer ("completei a sala e ela travou").
  sala.abates = quota
  // PH-202/203: sala de bioma nunca arma transicao por conta propria (nem no
  // ultimo abate comum, nem no proprio abate do protetor) — quem arma e
  // `resolverProtetorDaSala`, e so depois que o protetor cair. Sem este corte,
  // o abate que fecha a quota de comuns armava a contagem regressiva NA HORA e
  // `aplicarTransicaoDeSala` 3s depois zerava `world.enemies` — apagando o
  // protetor que `garantirTransicaoDeQuotaFechada` ainda ia criar no tick
  // seguinte — e a sala avancava sem o jogador nunca ter visto o protetor
  // resolver nada.
  // PH-428: num estagio ja limpo a sala avanca direto — Guardian e Lord existem
  // pra travar a PRIMEIRA limpeza, e num estagio fechado eles seriam so pedagio.
  if (salaDeveProtetor(sala, mapId, world)) {
    return { avancou: false, fechouEstagio: false }
  }
  // Toggle ligado + janela curta (jogador ativo): fecha a quota mas nao
  // sorteia nem arma a transicao — fica em 30/30 ate o avanco manual
  // (`avancarSalaManualmente`, endpoint PH-178). Cap acima ja preservado:
  // nao poluir `sala_abates` mesmo parado.
  if (opts.manualAdvance) return { avancou: false, fechouEstagio: false }
  return armarTransicaoDeSala(world, mapId)
}

/**
 * Sorteia a proxima sala e arma a contagem regressiva. Idempotente: com a
 * transicao ja armada (outro abate no MESMO tick, AOE matando 2+ de uma vez)
 * nao reamarra e nao resorteia.
 *
 * Separada de `registrarAbate` porque a quota fechada, e nao o abate, e o que
 * dispara a troca — ver `garantirTransicaoDeQuotaFechada`.
 */
/**
 * A sala ainda PEDE protetor e ele nao caiu?
 *
 * Existe como funcao exportada, e nao inline, porque a mesma pergunta e feita em
 * dois lugares que nao se enxergam: o avanco manual logo abaixo e o `SalaChip`
 * da tela — que precisa dela pra nao oferecer um botao que o servidor vai
 * recusar.
 *
 * PH-473: virou casca de `salaDeveProtetor`. A regra era escrita aqui e o
 * `SalaChip` a reescrevia sem o `estagioJaLimpo` (PH-474); agora as duas pontas
 * chamam a mesma funcao.
 */
export function salaTravadaPeloProtetor(world: WorldState): boolean {
  return salaDeveProtetor(world.sala, world.mapDef?.id ?? '', world)
}

/**
 * Avanco manual (PH-178/179): forca a transicao mesmo com o toggle ligado —
 * o proprio clique do jogador E o avanco que o toggle estava segurando.
 * So entrega "quota fechada" ao chamador; `armarTransicaoDeSala` ja e
 * idempotente (chamar de novo com transicao ja armada nao resorteia).
 *
 * PH-291: E ELE TAMBEM RESPEITA O PROTETOR. Os outros dois caminhos ja
 * respeitavam — `registrarAbate` se recusa a armar transicao em sala com
 * protetor, e `garantirTransicaoDeQuotaFechada` sai cedo quando
 * `garantirProtetorDaSala()` devolve true. Este passava por fora dos dois, e o
 * buraco anulava duas features de uma vez:
 *
 *  - PH-202/203: o protetor existe pra travar o avanco, e virava decoracao;
 *  - PH-206/226/227: quem credita `bioma_progress` e vencer o LORD da sala 10
 *    (`avancarBiomaProgressSeForOProximo`, em `handleEnemyDefeated`). Pulando o
 *    Lord, o ciclo fecha, `ciclos` incrementa e o progresso nunca e creditado —
 *    o jogador farma pra sempre sem destravar o bioma seguinte.
 *
 * Esconder o botao nao bastaria: `/sessao/avancar-sala` chega aqui pelo
 * `forcarAvancoDeSala` de `aplicarFlush`, e a rota e alcancavel por curl.
 * Limite de negocio so no cliente e bypass — regra do projeto.
 */
export function solicitarAvancoDeSala(world: WorldState, mapId: string): AvancoDeSala {
  const sala = world.sala
  // PH-473: a quota vigente, e nao os 30 fixos — com o protetor de pe ela e 29,
  // e a linha seguinte e quem barra o avanco enquanto ele nao cai.
  if (!sala || sala.abates < quotaDeAbatesDaSala(sala, mapId, world)) return { avancou: false, fechouEstagio: false }
  if (salaTravadaPeloProtetor(world)) return { avancou: false, fechouEstagio: false }
  return armarTransicaoDeSala(world, mapId)
}

function armarTransicaoDeSala(world: WorldState, mapId: string): AvancoDeSala {
  const sala = world.sala
  if (!sala) return { avancou: false, fechouEstagio: false }
  if (world.salaCountdownRemaining != null || world.salaPendente) {
    return { avancou: false, fechouEstagio: false }
  }

  const proximo = sala.indice + 1
  const fechouEstagio = proximo >= quantidadeDeSalas(mapId)
  const indice = fechouEstagio ? 0 : proximo
  const ciclos = fechouEstagio ? sala.ciclos + 1 : sala.ciclos

  // O QUE `fechouEstagio` SINALIZA, E O QUE ELE AINDA NAO FAZ (PH-427).
  //
  // Ele diz que a ULTIMA sala do estagio foi limpa — o que, com o Lord na
  // ultima sala, e o mesmo que "o Lord caiu e o estagio fechou". A tela usa
  // isso pro anuncio, e quem GRAVA o avanco de estagio e libera o seguinte e o
  // servidor, na PH-430. Aqui o motor so avisa.
  //
  // E O CICLO CONTINUA REINICIANDO, de proposito: nao ha "fim de hunt". Um fim
  // faria 6 horas de farm offline valerem os poucos minutos ate a ultima sala
  // — o oposto do que um jogo idle precisa. O que muda com o redesenho e que
  // estagio JA LIMPO para de repor protetor e quota (PH-428); o farm em si
  // segue.
  world.salaPendente = novaSala(world.rng, mapId, indice, ciclos) ?? { ...sala, indice, abates: 0, ciclos }
  world.salaCountdownRemaining = SALA_TRANSITION_COUNTDOWN
  return { avancou: true, fechouEstagio }
}

/**
 * PH-202/203: chamado por `handleEnemyDefeated` (simulation.ts) quando o
 * abate era o do protetor da sala — o UNICO gatilho que pode armar a
 * transicao de uma sala do bioma piloto (`registrarAbate` se recusa, ver
 * acima). Sob autoridade remota o cliente nao arma nada, so limpa o protetor
 * local: quem decide quando a sala avanca e o flush do servidor, igual toda
 * outra sala.
 */
export function resolverProtetorDaSala(
  world: WorldState,
  mapId: string,
  opts: { manualAdvance?: boolean } = {},
): void {
  // PH-472: a IDENTIDADE do protetor caido fica guardada, e nao descartada.
  //
  // Ela e o que `payloadDoProtetor` precisa pra gravar a linha de
  // `sala_protetor` com `hp_atual = 0` — o marcador que atravessa a janela e
  // diz "o chefe DESTA sala ja caiu". Sem ele o flush apagava a linha, e a
  // ausencia dela le igual a "nunca nasceu": a janela seguinte sorteava um
  // protetor novo com HP cheio. Ver `WorldState.protetorCaido`.
  //
  // `?? world.protetorCaido` porque esta funcao e idempotente por contrato
  // (chamada de novo no mesmo tick por AOE que mata dois): a segunda chamada
  // ja encontra `protetorPendente` nulo e nao pode apagar o que a primeira
  // guardou.
  world.protetorCaido = world.protetorPendente ?? world.protetorCaido
  world.protetorPendente = null
  // PH-230: marcar ANTES do corte de autoridade abaixo. Sem esta linha, sob
  // `salaSobAutoridade` a sala nao avanca (por design) e nada registra que o
  // protetor ja caiu — `protetorDaSala` continua dizendo "esta sala pede
  // protetor" e o proximo tick sorteia outro, pra sempre. Ver
  // `WorldState.protetorResolvido`.
  world.protetorResolvido = true
  if (world.salaSobAutoridade) return
  // PH-292: O TOGGLE DE AVANCO MANUAL VALE AQUI TAMBEM.
  //
  // Ate PH-202/225 so o bioma piloto tinha protetor, e esta funcao avancava
  // direto sem olhar o toggle porque nas salas normais quem decidia era
  // `registrarAbate` — que ja o respeitava. Depois que TODA sala de bioma
  // ganhou protetor (Guardian nas 1-9, Lord na 10), este virou o unico caminho
  // de avanco que sobrou, e o toggle passou a nao fazer nada em lugar nenhum.
  // Nada quebrou; a promessa da UI so parou de valer, em silencio.
  //
  // Com o toggle ligado a sala fica em 30/30 esperando o clique, e o jogador
  // continua farmando: o respawn de mob comum volta sozinho assim que
  // `protetorPendente` zera (a condicao vive no gate de respawn de
  // `simulation.ts`), entao nao ha campo vazio esperando. O botao "Proximo
  // Nivel" reaparece porque `travadaPeloProtetor` fica falso assim que
  // `protetorResolvido` sobe (PH-291).
  if (opts.manualAdvance) return
  armarTransicaoDeSala(world, mapId)
}

/**
 * Quota JA fechada na abertura da janela: arma a transicao sem esperar um abate
 * novo. Chamado por `stepWorld` no primeiro tick.
 *
 * O LIVELOCK QUE ISTO CONSERTA (medido ao vivo em 2026-08-19). `salaPendente` e
 * `salaCountdownRemaining` sao efemeros — nao atravessam a reconstrucao de mundo
 * de cada janela do servidor. Enquanto a transicao dependia do PROXIMO abate, uma
 * janela curta demais pra caber "matar + 3s de contagem" perdia a transicao e
 * recomecava do zero na janela seguinte:
 *
 *   janela de 5s: inimigos nascem, o primeiro morre em ~3s, contagem arma,
 *   janela acaba em 2s -> pendente e contagem descartados -> repete
 *
 * A sala travava em `abates: 30` pra sempre — e o cliente, que agora espera a
 * sala do servidor em vez de sortear a propria, travava com ela. Nao aparecia
 * antes porque a janela normal e de 30s e sempre cabia; apareceu quando o cliente
 * passou a pedir flush a cada 5s ao fechar a quota. (Esse pedido de 5s voltou a
 * ser de 30s em PH-273 — janela curta travava a hunt por outro motivo, o
 * servidor sem tempo de matar o protetor. A defesa aqui continua valendo: ela
 * nao pode depender do tamanho da janela.)
 *
 * Com a quota fechada valendo por si, a transicao acontece no comeco da janela e
 * cabe em qualquer duracao. Isso tambem fecha o caso que ja estava documentado
 * como "autocurativo no proximo abate" — ele nao era, quando nao havia proximo.
 */
export function garantirTransicaoDeQuotaFechada(
  world: WorldState,
  mapId: string,
  dt = 0,
  manualAdvance = false,
  // PH-202/203: injetado de fora (simulation.ts) pra evitar import circular
  // — a criacao do protetor usa `world.rng`/createPokeInstance/createEnemyEntity,
  // que ja importam este arquivo. Devolve true quando a sala pede protetor
  // (acabou de spawnar um novo, ou ja tinha um vivo) — nesse caso o avanco
  // fica bloqueado INCONDICIONAL, antes de qualquer outra logica desta
  // funcao, inclusive o toggle de avanco manual e a espera de autoridade.
  garantirProtetorDaSala?: () => boolean,
): void {
  const sala = world.sala
  // PH-473: quota vigente (29 com protetor de pe, 30 sem).
  if (!sala || sala.abates < quotaDeAbatesDaSala(sala, mapId, world)) {
    world.salaEsperaDaAutoridade = 0
    return
  }
  // PH-202/203: transicao ja armada (o proprio abate do protetor chamou
  // `resolverProtetorDaSala` neste MESMO tick, antes deste gate rodar de novo
  // no proximo) — nao reavaliar o protetor. Sem este corte, `protetorPendente`
  // ja limpo + sala ainda sem avancar fazia o gate ler "precisa de protetor"
  // de novo e sortear um SEGUNDO protetor por cima da transicao que ja estava
  // a caminho.
  if (world.salaPendente || world.salaCountdownRemaining != null) return
  // PH-475: O RELOGIO DE SILENCIO ANDA ANTES DO GATE DO PROTETOR.
  //
  // Ele andava DEPOIS, e isso passou a travar a sala pra sempre quando o
  // cliente parou de sortear o proprio chefe: `garantirProtetorDaSala` devolve
  // `true` enquanto o chefe do servidor nao chega, o `return` da linha seguinte
  // cortava o tick, e o relogio que decide "o servidor emudeceu" nunca saia do
  // zero. Contra uma Edge fora do ar a hunt ficaria em 29/30 pra sempre — e a
  // escapatoria que o proprio `garantirProtetorDaSala` documenta (voltar a
  // sortear depois de `ESPERA_MAXIMA_PELA_AUTORIDADE`) nunca dispararia.
  //
  // Continua medindo SILENCIO e nao espera: `reconciliarSalaDaAutoridade` zera
  // este contador a cada resposta que chega, qualquer que seja o conteudo dela.
  if (world.salaSobAutoridade) world.salaEsperaDaAutoridade += dt
  if (garantirProtetorDaSala?.()) return
  if (world.salaSobAutoridade) {
    // Sob autoridade remota quem sorteia e o servidor, e o cliente espera o
    // flush. Mas nao pra sempre: se a resposta nao trouxer sala nova nesta
    // janela de espera, a predicao local volta a valer.
    //
    // Isto e rede de seguranca contra VERSAO, nao contra rede. Um servidor sem
    // `garantirTransicaoDeQuotaFechada` (bundle publicado antes de 2026-08-19)
    // nunca fecha a transicao quando a janela e curta — e o cliente, que parou de
    // sortear, ficava com a barra cheia e a sala parada indefinidamente. Com o
    // fallback, o pior caso e voltar ao comportamento antigo (predicao que a
    // reconciliacao corrige depois, agora com aviso na tela).
    //
    // UMA sala de adiantamento, nunca duas. Enquanto o servidor nao confirmar a
    // predicao anterior, o cliente espera — e nao sorteia outra por cima. Sem
    // este teto o fallback virava um trilho paralelo: a cada 20s o cliente
    // avancava sozinho, e como `reconciliarSalaDaAutoridade` descarta sala em
    // posicao anterior, a autoridade nunca mais era aceita. Na tela: sub-bioma
    // trocando do nada de tempo em tempo, com o pool e o loot creditados vindo
    // de uma sala completamente outra. Com o teto, a divergencia fica limitada
    // a UMA sala: contra um servidor mudo o cliente adianta uma e espera, e
    // contra um servidor que responde com sala anterior o par
    // predicao/correcao pode se repetir — mas quem tem a ultima palavra e
    // sempre a autoridade, e o HUD volta pro sub-bioma que de fato pagou o
    // loot em vez de fugir dele pra sempre.
    if (world.salaPredita) return
    // O RELOGIO MEDE SILENCIO, NAO ESPERA (PH-271). Ele so anda aqui, e
    // `reconciliarSalaDaAutoridade` o zera a cada resposta que chega — de
    // modo que ele so estoura quando o servidor parou de responder.
    //
    // O relogio sozinho nao distingue "servidor que ainda nao chegou nesta
    // sala" de "servidor que nunca vai chegar", e so o segundo justificaria
    // palpite. A primeira tentativa foi subir a espera de 20s pra 120s,
    // cobrindo o p90 de 107s da divergencia medida em
    // scripts/harness/divergencia-de-quota.mjs — e ao vivo, no jogo-dev, a
    // troca fantasma voltou mesmo assim:
    //
    //   Sala 3/10 Planicie  ->  Sala 3/10 Vilarejo
    //
    // A segunda tentativa trocou o relogio por "3 respostas seguidas com a
    // quota do servidor cheia" — na teoria, um servidor que nunca avanca. Ao
    // vivo, mediu-se que essa e a cara do servidor NORMAL:
    //
    //   - com a quota fechada o cliente pedia flush de 5 em 5 segundos
    //     (REPETIR_PEDIDO_DE_SALA_MS em data/remote/autoridade.ts, hoje 30s por
    //     causa de PH-273), entao "3 respostas" eram QUINZE SEGUNDOS, e nao os
    //     90 que a constante supunha;
    //   - e o servidor legitimamente responde "mesma sala, 30/30" por MINUTOS,
    //     porque a sala so avanca quando o PROTETOR dela morre (PH-202/203) e
    //     ele mata o protetor bem mais devagar que o cliente: o mundo do
    //     servidor e reconstruido a cada janela, com o POKE de volta no ponto
    //     de entrada. Medido em 29/08, sessao real no jogo-dev: guardiao
    //     `lickitung` da sala 2, `hp_atual` caindo ao longo de dezenas de
    //     janelas de ~5s, ~3 minutos ate cair — com `kills: 0` em quase toda
    //     janela.
    //
    // Ou seja: quota cheia repetida NAO e sinal de servidor parado. Sobra UM
    // caso em que palpitar se justifica, e ele nao tem nada a ver com o que a
    // resposta diz — e nao ter resposta nenhuma:
    //
    //  - servidor MUDO (rede caida, Edge fora do ar): sem palpite a hunt trava
    //    com a barra cheia ate a rede voltar, que e pior que o bug original.
    //  - servidor QUE RESPONDE, qualquer que seja a resposta: ele esta vivo, e
    //    servidor vivo e o dono da sala. O cliente espera. Se ele demora
    //    minutos matando o protetor, o certo na tela e 30/30 parado — nao uma
    //    area nova que o servidor vai desmentir no flush seguinte.
    //
    // Ver `salaEsperaDaAutoridade` em types.ts.
    //
    // PH-475: O `+= dt` SAIU DAQUI e subiu pra antes do gate do protetor — ver
    // a nota la. Ele ficava atras de um `return` que passou a disparar em toda
    // sala com chefe devido, e o relogio nunca andava.
    if (world.salaEsperaDaAutoridade < ESPERA_MAXIMA_PELA_AUTORIDADE) return
    world.salaEsperaDaAutoridade = 0
    const armada = armarTransicaoDeSala(world, mapId)
    if (armada.avancou) world.salaPredita = true
    return
  }
  // Mesma regra do avanco manual em `registrarAbate`: quota fechada numa
  // janela anterior nao pode reavancar sozinha so porque o world foi
  // reconstruido — senao o toggle vale so no abate 30 e falha no proximo flush.
  if (manualAdvance) return
  armarTransicaoDeSala(world, mapId)
}

/**
 * A sala que o SERVIDOR decidiu, entrando pela mesma porta da transicao local.
 *
 * Tres casos, e a diferenca entre eles e o que o jogador ve:
 *
 *  - MESMA sala (so o contador de abates andou): escreve o contador e mais
 *    nada. E o caso comum — um flush a cada 30s, uma troca de sala a cada
 *    poucos minutos.
 *  - PRIMEIRA sala da sessao (nao havia sala): entra direto, sem aviso. Nao ha
 *    "sala anterior" pra anunciar saida de.
 *  - sala DIFERENTE: vira `salaPendente` e arma a contagem regressiva. Quem
 *    troca o mapa, zera os inimigos e reposiciona o jogador continua sendo
 *    `aplicarTransicaoDeSala`, no gate do proximo tick.
 *
 * Antes disto o cliente escrevia a sala do servidor direto no estado. O nome no
 * HUD trocava, e o resto da cena — arte de fundo, grade de colisao, ponto de
 * nascimento, inimigos em campo — ficava na sala ANTERIOR, porque so
 * `aplicarTransicaoDeSala` mexe nisso. Uma hunt podia ficar minutos anunciando
 * "Laboratorio" enquanto desenhava e colidia como "Usina".
 *
 * Nunca REGRIDE: sala com (ciclo, indice) anterior ao que esta na tela e
 * ignorada. Isso acontece de verdade — o flush cobre uma janela que comecou
 * antes da troca, e o servidor responde com a sala de la. Aceitar aquilo
 * mandava o jogador de volta pra sala 1 com o aviso de nova area, o que le como
 * perda de progresso.
 */
/**
 * `climaDaAutoridade` (PH-140): o clima de AMBIENTE que o servidor sorteou pra
 * sala. `undefined` = a resposta nao trouxe o campo (servidor antigo, ou jogo
 * local), e ai o clima que o cliente ja tem fica como esta.
 *
 * Nunca derruba clima de GOLPE: o servidor manda o clima do LUGAR, e um Rain
 * Dance de 10 turnos em andamento no cliente nao e assunto dele.
 */
export function reconciliarSalaDaAutoridade(
  world: WorldState, sala: SalaAtiva | null, climaDaAutoridade?: ClimaTipo | null,
): void {
  // `undefined` = a resposta nao trouxe o campo (servidor mais antigo que o
  // cliente, o mesmo descasamento de pipeline que o bloco de `sala: null`
  // abaixo documenta). Nesse caso o clima que o cliente ja tem fica como esta —
  // melhor um clima defasado que um ceu limpo mentiroso.
  const aplicarClima = () => {
    if (climaDaAutoridade === undefined) return
    definirClimaDeAmbiente(world, climaDeAmbiente(climaDaAutoridade))
  }
  // Fora de hunt nao ha sala: escrever uma aqui deixaria o Hospital com um
  // sub-bioma pendurado no HUD.
  if (!world.mapDef) return
  // PH-271: A RESPOSTA ZERA A ESPERA, O CONTEUDO DELA NAO IMPORTA.
  //
  // O relogio de `salaEsperaDaAutoridade` mede SILENCIO, e esta linha e o que
  // faz dele silencio em vez de "tempo desde que a quota fechou". Uma resposta
  // so precisa responder uma pergunta — "o servidor esta vivo?" — e a resposta
  // e sim mesmo quando ela traz a mesma sala pela centesima vez, ou uma sala
  // que vai ser descartada logo abaixo por ser anterior a atual.
  //
  // Fica ANTES do `if (!sala)`: sala nula tambem e resposta.
  world.salaEsperaDaAutoridade = 0
  if (!sala) {
    // `null` DO SERVIDOR TEM DOIS SIGNIFICADOS, e tratar os dois igual apagava
    // a sala em jogo.
    //
    // 1. Hunt sem sistema de salas (inicial, BOSS, Lance): nao ha sala mesmo, e
    //    limpar e o certo — sem isso o Hospital fica com sub-bioma pendurado.
    // 2. Servidor MAIS ANTIGO que o cliente, numa hunt que TEM salas. Foi o
    //    caso medido ao vivo em 2026-08-20 com as 36 hunts do Pesadelo: o
    //    cliente ja sabia das salas (POOL_POR_SALA passou a cobrir o espelho) e
    //    a Edge Function publicada ainda nao. `/sessao/abrir` respondeu sem
    //    `sala`, o cliente exibiu a propria ("Sala 1/10 Vulcao"), e o primeiro
    //    flush trouxe `sala: null` — que caia aqui e APAGAVA o chip e o
    //    sub-bioma no meio da hunt.
    //
    // `temSalas` desempata pelo unico dado que separa os dois casos: se ESTE
    // mapa tem salas, um `null` e divergencia de versao, nao autoridade. O
    // cliente segue com a predicao dele ate o servidor ser publicado.
    //
    // Importa porque cliente e Edge Function sobem por pipelines DIFERENTES no
    // mesmo push (Cloudflare Pages e supabase-deploy.yml), com duracoes
    // diferentes: a janela em que um esta novo e o outro velho existe sempre.
    if (temSalas(world.mapDef.id)) return
    world.sala = null
    world.salaPendente = null
    world.salaCountdownRemaining = null
    return
  }

  const atual = world.salaPendente ?? world.sala
  if (!atual) {
    world.sala = { ...sala }
    world.salaPredita = false
    // PH-230: sala entrando direto (nao havia sala) nao herda marca de protetor.
    world.protetorResolvido = false
    // PH-472: nem o chefe caido da sala que nao existia.
    world.protetorCaido = null
    aplicarClima()
    return
  }
  if (atual.chave === sala.chave && atual.indice === sala.indice && atual.ciclos === sala.ciclos) {
    // O contador do servidor manda, mas nunca pra TRAS: entre o inicio da janela
    // e a resposta o jogador continuou matando, e o contador local ja andou.
    // Voltar faria a barra do HUD recuar sozinha.
    const alvo = world.salaPendente ?? world.sala
    if (alvo) alvo.abates = Math.max(alvo.abates, sala.abates)
    // O servidor chegou na MESMA sala: o palpite virou verdade e o fallback
    // pode voltar a valer daqui pra frente.
    world.salaPredita = false
    // PH-140: mesma sala, mas o clima local pode ser palpite (o cliente entrou
    // na hunt antes de a sessao responder). A autoridade corrige.
    aplicarClima()
    return
  }
  // A protecao anti-regressao vale contra flush ATRASADO, nao contra a propria
  // predicao. Com `salaPredita` ligado, quem esta adiante e o palpite local
  // (`garantirTransicaoDeQuotaFechada` sorteou sozinho porque a espera
  // estourou) — e ai voltar pra sala do servidor e a CORRECAO, nao a
  // regressao. Sem esta condicao, a primeira predicao envenenava a sessao
  // inteira: toda sala da autoridade caia como "anterior" e era descartada, o
  // HUD seguia mostrando sub-bioma sorteado localmente e o pool/loot creditados
  // vinham de outro lugar, sem nada na tela denunciando.
  // POSICAO COMPARAVEL ENTRE DUAS SALAS DA MESMA HUNT. O multiplicador tem que
  // ser o numero de salas DESTE estagio (PH-427): com 8 salas, `ciclos * 10 +
  // indice` deixaria a sala 0 do ciclo 1 (posicao 10) parecer ADIANTE da sala 7
  // do ciclo 0 (posicao 7) — o que e verdade — mas com 3 salas o mesmo 10
  // faria a sala 0 do ciclo 1 valer 10 contra 2 da ultima do ciclo 0, criando
  // um buraco de 7 posicoes que nao existe. A comparacao continua correta em
  // sinal, mas as posicoes deixariam de ser contiguas, e qualquer conta futura
  // de "quantas salas de diferenca" mentiria.
  const salas = quantidadeDeSalas(world.mapDef?.id ?? '')
  const posicao = (s: SalaAtiva) => s.ciclos * salas + s.indice
  if (!world.salaPredita && posicao(sala) < posicao(atual)) return

  // A BARRA FECHA ANTES DO AVISO (PH-258).
  //
  // O contador da sala que esta saindo vai pra quota cheia. Ele e uma PREDICAO:
  // cliente e servidor simulam com sequencias de sorteio diferentes (o cliente
  // nao tem a semente da sessao) e matam quantidades diferentes no mesmo
  // intervalo de relogio. Medido em scripts/harness/divergencia-de-quota.mjs,
  // 30 pares: a diferenca de tempo pra fechar a quota tem mediana de 32,6s e
  // chega a 112s no pior caso.
  //
  // Quem decide a troca e o servidor, entao quando ele manda sala nova a quota
  // FECHOU — e deixar a barra do jogador em 12/30 enquanto a tela anuncia area
  // nova le como bug ("mudou de bioma sem completar as 30 kills", o relato
  // desta issue). Isto nao inventa progresso: escreve o que a autoridade acabou
  // de dizer.
  if (atual.abates < ABATES_POR_SALA) atual.abates = ABATES_POR_SALA

  world.salaPendente = { ...sala }
  world.salaCountdownRemaining ??= SALA_TRANSITION_COUNTDOWN
  world.salaEsperaDaAutoridade = 0
  world.salaPredita = false
}

/**
 * PH-302: derruba a contagem de "Entrando em nova area" pro minimo, pra ela
 * resolver no proximo tick.
 *
 * A contagem corre em tempo SIMULADO (`stepWorld` desconta `dt` dela), e o
 * loop local quase nao anda com a aba oculta — o navegador derruba o tick pra
 * um por minuto, e cada um avanca no maximo 1 segundo de jogo. Os 3 segundos de
 * aviso viravam MINUTOS de movimento e combate congelados depois de voltar pra
 * aba, esperando uma animacao que o jogador nao chegou a ver.
 *
 * Nao pula a transicao: `aplicarTransicaoDeSala` continua sendo quem troca
 * mapa, colisao e inimigos, no gate normal de `stepWorld`. So o tempo de espera
 * some. Sem `salaPendente` nao ha o que encurtar.
 */
export function encurtarTransicaoDeSala(world: WorldState): void {
  if (world.salaCountdownRemaining == null || !world.salaPendente) return
  world.salaCountdownRemaining = Math.min(world.salaCountdownRemaining, 0)
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
  // PH-230: sala nova, protetor novo — a marca vale por SALA, nao pela sessao.
  world.protetorResolvido = false
  // PH-472: e o chefe caido da sala ANTERIOR nao pode ser gravado como o chefe
  // caido da sala nova — seria o mesmo defeito de `protetorPendente` pendurado
  // que a PH-258 corrigiu, so que pelo lado da persistencia.
  world.protetorCaido = null
  // O PROTETOR FICA NA SALA QUE PASSOU (PH-258), e esquecer esta linha matava a
  // hunt inteira em silencio.
  //
  // `world.enemies` e zerado logo abaixo, mas `protetorPendente` sobrevivia — e
  // o respawn de mob comum tem `&& !world.protetorPendente` na condicao
  // (simulation.ts, "protetor vivo suspende o spawn normal"). Ou seja: sala
  // nova, campo vazio, respawn desligado por um protetor que nao existe mais em
  // lugar nenhum. Nada nasce, ninguem morre, a quota nunca fecha — os dois
  // sintomas relatados juntos ("ficou sem novos oponentes" e "nao passa da sala
  // 2"), e sem nenhum erro na tela.
  //
  // O caminho pra cair nisso e o normal sob autoridade: a quota fecha, o
  // protetor da sala nasce, o jogador NAO o mata, e o flush do servidor traz a
  // sala seguinte (la a quota tambem fechou, ou o protetor de la caiu). A
  // transicao entao roda com um protetor pendurado. F5 era a unica saida,
  // porque `buildMapWorld` reconstroi o mundo do zero.
  world.protetorPendente = null
  // PH-140: o clima da sala anterior NAO acompanha o jogador — inclusive o de
  // golpe, que morre junto com a sala mesmo com turnos sobrando. Por isso o
  // `clima` e zerado ANTES de `definirClimaDeAmbiente`, que respeitaria um
  // golpe em campo.
  world.clima = null
  // Sob autoridade o cliente NAO deriva: ele nao tem a semente da sessao, e um
  // palpite aqui seria clima errado por ate um flush inteiro. Fica sem clima
  // ate o servidor dizer qual e — silencio honesto em vez de mentira curta.
  definirClimaDeAmbiente(
    world,
    world.salaSobAutoridade ? null : climaAmbienteDaSala(world.seed, world.sala),
  )
  world.salaEsperaDaAutoridade = 0
  world.enemies = []
  world.effects = []
  world.pendingHits = []
  world.respawnTimer = null

  const novoMapDef = mapDefParaSala(mapId, world.sala)
  if (!novoMapDef) return
  world.mapDef = novoMapDef

  if (!world.player) return
  const ponto = spawnPointParaSala(mapId, world.sala)
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

export { ABATES_POR_SALA, ABATES_COMUNS_POR_SALA }
export { quantidadeDeSalas }

/**
 * O mapId do estagio SEGUINTE deste, se ele existir e estiver liberado.
 * `null` quando nao ha pra onde ir (PH-428).
 *
 * DUAS RECUSAS, e as duas caem em "repetir": o estagio 10 nao tem seguinte, e
 * um seguinte ainda bloqueado nao pode ser aberto. Devolver o mapId nesses
 * casos faria o cliente pedir uma sessao que o gate da autoridade (PH-430)
 * recusa com 403 — o jogador veria a hunt parar sozinha, sem explicacao.
 */
export function proximoEstagioLiberado(
  mapId: string, progresso: ProgressoPorBioma,
): string | null {
  const doMapa = parseEstagioId(mapId)
  if (!doMapa) return null
  const proximo = doMapa.estagio + 1
  if (!estagioLiberado(progresso, doMapa.bioma, proximo)) return null
  return estagioId(doMapa.bioma, proximo)
}
