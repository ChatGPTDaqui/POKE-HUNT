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
import { SALAS_POR_HUNT, ABATES_POR_SALA, SUB_BIOMA_POR_CHAVE, BIOMA_PILOTO_BOSS, LOOT, type SubBiomaDef } from '@/data/biomas'
import { climaAmbienteDaSala, climaDeAmbiente, definirClimaDeAmbiente } from './climaAmbiente'
import { POOL_POR_SALA } from '@/data/huntSpawnOverrides'
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
 * propria. Generoso de proposito: o flush periodico e de 30s e o pedido
 * disparado pela quota repete a cada 5s, entao 20s cobre varias tentativas.
 */
export const ESPERA_MAXIMA_PELA_AUTORIDADE = 20

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

export type TipoDeBoss = 'mini' | 'ultimate'

/**
 * PH-202: so o bioma piloto (BIOMA_PILOTO_BOSS) tem boss por enquanto. Salas
 * 1-9 (indice 0-8) pedem mini-boss ao fechar a quota; a ultima sala (indice
 * SALAS_POR_HUNT-1) pede o ultimate da faixa. Pura — nao sorteia nada, so
 * decide QUAL boss a sala pede, se pedir algum. A entidade em si (RNG,
 * criacao) fica em simulation.ts, que ja importa este modulo — colocar aqui
 * criaria import circular.
 */
export function bossDaSala(sala: SalaAtiva | null): TipoDeBoss | null {
  if (!sala) return null
  const bioma = SUB_BIOMA_POR_CHAVE[sala.chave]?.bioma.chave
  if (bioma !== BIOMA_PILOTO_BOSS) return null
  return sala.indice >= SALAS_POR_HUNT - 1 ? 'ultimate' : 'mini'
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
  // (nem no 30o abate normal, nem no proprio abate do boss) — quem arma e
  // `resolverBossDaSala`, e so depois que o boss cair. Sem este corte, o 30o
  // abate (quase sempre um inimigo comum, o boss ainda nem nasceu) armava a
  // contagem regressiva NA HORA e `aplicarTransicaoDeSala` 3s depois zerava
  // `world.enemies` — apagando o boss que `garantirTransicaoDeQuotaFechada`
  // ainda ia criar no tick seguinte — e a sala avancava sem o jogador nunca
  // ter visto o boss resolver nada.
  if (bossDaSala(sala)) return { avancou: false, fechouCiclo: false }
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
 * Avanco manual (PH-178/179): forca a transicao mesmo com o toggle ligado —
 * o proprio clique do jogador E o avanco que o toggle estava segurando.
 * So entrega "quota fechada" ao chamador; `armarTransicaoDeSala` ja e
 * idempotente (chamar de novo com transicao ja armada nao resorteia).
 */
export function solicitarAvancoDeSala(world: WorldState, mapId: string): AvancoDeSala {
  const sala = world.sala
  if (!sala || sala.abates < ABATES_POR_SALA) return { avancou: false, fechouCiclo: false }
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
 * abate era o do boss da sala — o UNICO gatilho que pode armar a transicao
 * de uma sala do bioma piloto (`registrarAbate` se recusa, ver acima). Sob
 * autoridade remota o cliente nao arma nada, so limpa o boss local: quem
 * decide quando a sala avanca e o flush do servidor, igual toda outra sala.
 */
export function resolverBossDaSala(world: WorldState, mapId: string): void {
  world.bossPendente = null
  if (world.salaSobAutoridade) return
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
 * passou a pedir flush a cada 5s ao fechar a quota.
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
  // — a criacao do boss usa `world.rng`/createPokeInstance/createEnemyEntity,
  // que ja importam este arquivo. Devolve true quando a sala pede boss
  // (acabou de spawnar um novo, ou ja tinha um vivo) — nesse caso o avanco
  // fica bloqueado INCONDICIONAL, antes de qualquer outra logica desta
  // funcao, inclusive o toggle de avanco manual e a espera de autoridade.
  garantirBossDaSala?: () => boolean,
): void {
  const sala = world.sala
  if (!sala || sala.abates < ABATES_POR_SALA) {
    world.salaEsperaDaAutoridade = 0
    return
  }
  // PH-202/203: transicao ja armada (o proprio abate do boss chamou
  // `resolverBossDaSala` neste MESMO tick, antes deste gate rodar de novo no
  // proximo) — nao reavaliar o boss. Sem este corte, `bossPendente` ja limpo
  // + sala ainda sem avancar fazia o gate ler "precisa de boss" de novo e
  // sortear um SEGUNDO boss por cima da transicao que ja estava a caminho.
  if (world.salaPendente || world.salaCountdownRemaining != null) return
  if (garantirBossDaSala?.()) return
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

  world.salaPendente = { ...sala }
  world.salaCountdownRemaining ??= SALA_TRANSITION_COUNTDOWN
  world.salaEsperaDaAutoridade = 0
  world.salaPredita = false
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
