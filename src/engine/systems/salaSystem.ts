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
import { SALAS_POR_HUNT, ABATES_POR_SALA, SUB_BIOMA_POR_CHAVE, ORDEM_DOS_BIOMAS, LOOT, type SubBiomaDef } from '@/data/biomas'
import { climaAmbienteDaSala, climaDeAmbiente, definirClimaDeAmbiente } from './climaAmbiente'
import { POOL_POR_SALA, aparaOTeto } from '@/data/huntSpawnOverrides'
import { pesosPorTier, tierDaEspecie, TIERS_SELVAGENS } from '@/data/spawnPorTier'
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
 * limitado por construcao: mapas com sala x sub-biomas deles x `SALAS_POR_HUNT`.
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
  const janela = janelaDaSala(faixa, sala.indice)
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
 * PH-202/225: todo bioma em ORDEM_DOS_BIOMAS tem protetor (pivo 27/08 sobre o
 * "fora de escopo" original de 16/08, que limitava a so o bioma piloto —
 * o gate sequencial de PH-207/226 nao tinha efeito nenhum com so 1 bioma,
 * o ultimo da ordem, tendo protetor). Salas 1-9 (indice 0-8) pedem Guardian ao
 * fechar a quota; a ultima sala (indice SALAS_POR_HUNT-1) pede o Lord da
 * faixa. Pura — nao sorteia nada, so decide QUAL protetor a sala pede, se
 * pedir algum. A entidade em si (RNG, criacao) fica em simulation.ts, que ja
 * importa este modulo — colocar aqui criaria import circular.
 */
export function protetorDaSala(sala: SalaAtiva | null): TipoDeProtetor | null {
  if (!sala) return null
  const bioma = SUB_BIOMA_POR_CHAVE[sala.chave]?.bioma.chave
  if (!bioma || !ORDEM_DOS_BIOMAS.includes(bioma)) return null
  return sala.indice >= SALAS_POR_HUNT - 1 ? 'lord' : 'guardian'
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
export function registrarAbate(world: WorldState, mapId: string, opts: { manualAdvance?: boolean } = {}): AvancoDeSala {
  const sala = world.sala
  if (!sala) return { avancou: false, fechouCiclo: false }

  sala.abates += 1
  if (sala.abates < ABATES_POR_SALA) return { avancou: false, fechouCiclo: false }
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
    sala.abates = ABATES_POR_SALA
    return { avancou: false, fechouCiclo: false }
  }
  // Cap: sem isto, matar mais de um inimigo no MESMO tick (AOE) ou o jogo
  // continuar rodando por um instante antes do proximo tick congelar
  // deixaria `sala.abates` crescer sem limite enquanto a contagem regressiva
  // ja esta armada — inofensivo pro jogo, mas polui o valor persistido
  // (server/src/progresso.ts#sala_abates) com numero que nunca reflete a
  // quota real.
  sala.abates = ABATES_POR_SALA
  // PH-202/203: sala do bioma piloto nunca arma transicao por conta propria
  // (nem no 30o abate normal, nem no proprio abate do protetor) — quem arma e
  // `resolverProtetorDaSala`, e so depois que o protetor cair. Sem este corte,
  // o 30o abate (quase sempre um inimigo comum, o protetor ainda nem nasceu)
  // armava a contagem regressiva NA HORA e `aplicarTransicaoDeSala` 3s depois
  // zerava `world.enemies` — apagando o protetor que
  // `garantirTransicaoDeQuotaFechada` ainda ia criar no tick seguinte — e a
  // sala avancava sem o jogador nunca ter visto o protetor resolver nada.
  if (protetorDaSala(sala)) return { avancou: false, fechouCiclo: false }
  // Toggle ligado + janela curta (jogador ativo): fecha a quota mas nao
  // sorteia nem arma a transicao — fica em 30/30 ate o avanco manual
  // (`avancarSalaManualmente`, endpoint PH-178). Cap acima ja preservado:
  // nao poluir `sala_abates` mesmo parado.
  if (opts.manualAdvance) return { avancou: false, fechouCiclo: false }
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
 */
export function salaTravadaPeloProtetor(world: WorldState): boolean {
  return protetorDaSala(world.sala) != null && !world.protetorResolvido
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
  if (!sala || sala.abates < ABATES_POR_SALA) return { avancou: false, fechouCiclo: false }
  if (salaTravadaPeloProtetor(world)) return { avancou: false, fechouCiclo: false }
  return armarTransicaoDeSala(world, mapId)
}

function armarTransicaoDeSala(world: WorldState, mapId: string): AvancoDeSala {
  const sala = world.sala
  if (!sala) return { avancou: false, fechouCiclo: false }
  if (world.salaCountdownRemaining != null || world.salaPendente) {
    return { avancou: false, fechouCiclo: false }
  }

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
  if (!sala || sala.abates < ABATES_POR_SALA) {
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
    world.salaEsperaDaAutoridade += dt
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
  const posicao = (s: SalaAtiva) => s.ciclos * SALAS_POR_HUNT + s.indice
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

export { SALAS_POR_HUNT, ABATES_POR_SALA }
