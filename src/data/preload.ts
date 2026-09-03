// Preload de arte: carrega tudo que uma cena vai desenhar ANTES de a cena
// aparecer.
//
// O bug que isto corrige: `render/sprites.ts` carrega cada spritesheet de forma
// lazy, no primeiro frame que precisa dele. Entao o primeiro encontro com cada
// especie desenhava alguns frames de nada (antes, do placeholder geometrico
// colorido — ver o guard em `drawEntity`) enquanto o PNG baixava. Numa hunt com
// 8 especies no pool isso acontecia 8 vezes.
//
// Como funciona: aquece o MESMO `imageCache` que o desenho consulta (via
// `primeImage`), entao quando a cena monta o `img.complete` ja e true e o
// primeiro frame ja sai correto. Nao ha cache proprio aqui de proposito — dois
// caches significariam que o preload baixa uma copia e o desenho baixa outra, e o
// bug continuaria igual.
//
// Este modulo e SO do navegador (usa `Image`). Nao pode ser importado por
// `simulation.ts`/`headless.ts`, que rodam em Node no servidor de autoridade.
import { BATTLE_SPRITE_ANIMS, type AnimName } from './battleSpriteAnims'
import { battleSpriteUrl } from './battleSprites'
import { getMap } from './maps'
import { getEncounter } from './enemies'
import { faceIconUrl, spriteUrl } from './sprites'
import { todasAsTirasDeVfx } from './vfxTiras'
import { todosOsIconesDeHabilidade } from './abilityIcons'
import { todosOsVfxDeStatus } from './statusVfx'
import { urlsDeEstagio } from './estagioVfx'
import { todasAsTirasDeProps } from '@/render/ambienteProps'
import { primeImage } from '@/render/sprites'
import { CENA_HOSPITAL } from './hospital'
import { todasAsTirasDeCaptura } from './captureAnim'
import { SUB_BIOMA_POR_CHAVE } from './biomas'
import { SPECIES } from './pokes'
import { nivelDeAprendizado } from './activeAbilities'
import { vfxDoGolpe } from './moveVfx'
import { TETO_DE_CARREGAMENTO_MS } from './tetoDeCarregamento'

// Teto de tempo pra NAO transformar uma rede ruim em "o botao Entrar nao
// funciona". Estourado o prazo, a cena entra do mesmo jeito e o que faltou
// termina de carregar por tras (o guard em `drawEntity` cobre o intervalo).
//
// ERA 4000 ATE A PH-483, e a troca e pedido do dono, textual: "eu estou vendo
// muitas coisas que estao indo ao ar para o jogador sem estar devidamente
// carregado, como o background... eu preciso que todos os conteudos sejam
// carregados previamente antes de aparecer para o jogador, mesmo que isso custe
// carregamento". Com 4s, uma hunt com pool grande em 4G entrava com metade da
// arte ainda no ar — o que o teto media era o pior caso, e o pior caso estava
// acontecendo.
//
// O NUMERO NAO MORA MAIS AQUI porque ele tem que casar com o teto da cutscene —
// ver `data/tetoDeCarregamento.ts`, que explica o que quebra quando os dois
// divergem.
export const PRELOAD_TIMEOUT_MS = TETO_DE_CARREGAMENTO_MS

function comTimeout(promessa: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    void promessa.then(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}

/**
 * A arte da TELA DE CARREGAMENTO, aquecida antes de a tela de carregamento
 * aparecer (PH-483).
 *
 * Parece circular e nao e: a cutscene e a tela que o jogador olha ENQUANTO a
 * hunt carrega, e ela tem arte propria (o fundo do bioma). Quando essa arte
 * chegava junto com todo o resto, o letreiro subia primeiro e a imagem entrava
 * depois — "a imagem da tela de carregamento esta chegando apos o anuncio", nas
 * palavras do dono. Um arquivo, esperado antes de abrir a cena; quem mostra a
 * espera nesse intervalo e o botao "Entrando...".
 *
 * `null`/vazio resolve na hora: hunt sem arte cai na cor do bioma, que ja e o
 * piso da cutscene.
 */
export function preloadArteDeCena(url: string | null | undefined): Promise<void> {
  if (!url) return Promise.resolve()
  return comTimeout(primeImage(url), PRELOAD_TIMEOUT_MS)
}

/**
 * Arte do Centro Pokemon. Vale o preload proprio porque o Hospital e a
 * PRIMEIRA cena de toda sessao (e a unica de quem so abriu o jogo): sem isto,
 * o saguao aparece como um retangulo escuro por alguns frames enquanto o JPEG
 * de 600kB decodifica. Chamado no boot, nao ao entrar em cena — quando o
 * jogador volta da hunt a imagem ja tem que estar quente.
 */
export function preloadHospital(): Promise<void> {
  return primeImage(CENA_HOSPITAL.imagem)
}

/** Toda URL de spritesheet de batalha que esta especie pode desenhar. */
export function battleSpriteUrlsFor(speciesId: string, isShiny: boolean): string[] {
  const anims = BATTLE_SPRITE_ANIMS[speciesId]
  if (!anims) return []
  // Todas as animacoes que a especie tem, e nao so a atual: 'Faint' e
  // 'Shoot'/'Charge' sao exatamente as que aparecem em momento critico (o POKE
  // morrendo, o primeiro golpe) e seriam as ultimas a serem carregadas de forma
  // lazy.
  return (Object.keys(anims) as AnimName[]).map((name) => battleSpriteUrl(speciesId, name, isShiny))
}

/** Icones de lista/HUD da especie (mochila, loja, equipe, card do POKE ativo). */
export function iconUrlsFor(speciesId: string, isShiny: boolean): string[] {
  return [spriteUrl(speciesId, isShiny), faceIconUrl(speciesId, isShiny)].filter((u): u is string => u != null)
}

export interface EspeciePreload {
  speciesId: string
  isShiny: boolean
}

/** Aquece o cache pras especies dadas. Resolve quando tudo carregou ou no teto. */
export async function preloadEspecies(
  especies: EspeciePreload[],
  { timeoutMs = PRELOAD_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<void> {
  const urls = new Set<string>()
  for (const { speciesId, isShiny } of especies) {
    for (const url of battleSpriteUrlsFor(speciesId, isShiny)) urls.add(url)
    for (const url of iconUrlsFor(speciesId, isShiny)) urls.add(url)
  }
  if (urls.size === 0) return
  await comTimeout(Promise.all([...urls].map(primeImage)), timeoutMs)
}

/**
 * Tudo que a hunt `mapId` vai desenhar: o fundo, o POKE do jogador e TODA especie
 * do pool de encontros — nas duas paletas (normal e shiny), porque um shiny pode
 * nascer no primeiro spawn e a versao shiny e um arquivo diferente.
 */
export async function preloadHunt(mapId: string, jogador: EspeciePreload | null): Promise<void> {
  const mapDef = getMap(mapId)
  if (!mapDef) return

  const especies: EspeciePreload[] = jogador ? [jogador] : []
  for (const encounterId of mapDef.enemyPool) {
    const encounter = getEncounter(encounterId)
    if (!encounter) continue
    especies.push({ speciesId: encounter.speciesId, isShiny: false })
    especies.push({ speciesId: encounter.speciesId, isShiny: true })
  }

  const fundo = mapDef.bg?.image ? [primeImage(mapDef.bg.image)] : []
  // Arte de efeito de golpe (18 tipos, 1 tira cada — ver data/vfxTiras.ts),
  // faisca de cura, simbolos de sono/confusao e icone de slot. Todos de uma
  // vez em vez de derivar quais tipos esta hunt pode usar: o proprio POKE do
  // jogador muda de golpe ao subir de nivel e ao evoluir, e "quais tipos vao
  // aparecer" nao e uma pergunta que da pra responder na entrada da hunt.
  //
  // As tiras somam ~1 MB (PNG-8; eram 4,5 MB em RGBA). E o item mais pesado
  // deste preload, e o teto de PRELOAD_TIMEOUT_MS existe justamente pra rede
  // ruim nao transformar isso em "o botao Entrar nao funciona".
  // Arte por GOLPE nao entra aqui de proposito (ver o cabecalho de
  // data/moveVfx.ts): sao 23 tiras hoje, e um jogador ve os golpes que o
  // time dele sabe — meia duzia. Aquecer arquivo que a sessao nao vai usar
  // troca boot rapido por nada; o primeiro uso de cada golpe cai no
  // procedural por alguns frames enquanto a tira baixa, que e exatamente o
  // que o fallback existe pra fazer.
  // As duas tiras de prop de ambiente (PH-254) entram sempre, e sao 9 kB: elas
  // desenham a chama da fogueira e a cintilancia da agua a partir do PRIMEIRO
  // quadro da cena, e sao a unica arte deste preload cuja ausencia apareceria
  // parada no cenario em vez de piscar durante um golpe.
  const efeitos = [
    ...todasAsTirasDeVfx(), ...todosOsIconesDeHabilidade(), ...todosOsVfxDeStatus(),
    ...todasAsTirasDeProps(),
    // PH-416: os 15 selos de mudanca de atributo. 3,2 kB no total desde a
    // PH-480 (eram 28 kB como tira de 16 quadros) — mais baratos
    // que as 8 da animacao de bola logo abaixo, e com o mesmo argumento: golpe
    // de status e das primeiras coisas que acontecem numa hunt (o auto-play usa
    // o que o POKE sabe, e Growl/Tail Whip/Leer estao no comeco de quase toda
    // linha evolutiva). Sem elas, o primeiro Rosnado da sessao desenha o
    // fallback procedural enquanto o PNG baixa — silencioso, e por isso mesmo
    // fica assim pra sempre se ninguem cruzar as listas.
    //
    // ESTE ERA O BURACO DA PH-416: `urlsDeEstagio` nasceu documentada como "usada
    // pelo preload" e nenhum lugar a chamava fora do teste.
    ...urlsDeEstagio(),
    // PH-400: as tiras da animacao de bola (8 arquivos, 170 kB no total). Ficavam
    // de fora e a PRIMEIRA captura da sessao desenhava nada por alguns quadros —
    // e a primeira captura acontece no comeco, quando o cache esta mais frio.
    // Barato o bastante pra entrar no preload que BLOQUEIA a entrada; o resto do
    // que faltava (fundo das outras salas, arte por golpe) e grande demais pra
    // isso e vai pro aquecimento de segundo plano, abaixo.
    ...todasAsTirasDeCaptura(),
  ].map(primeImage)
  await Promise.all([preloadEspecies(especies), ...fundo, ...efeitos])
}

// --- aquecimento de segundo plano (PH-400) ------------------------------------
//
// O PEDIDO era "nada carrega durante a jogabilidade". O que ainda carregava, e o
// peso de cada coisa (medido em 2026-09-01):
//
//   fundo da proxima sala     ~2,9 MB por arte (30 artes, 85,6 MB no total)
//   arte por golpe            164 arquivos, 5,3 MB (~33 kB cada)
//   animacao de captura       8 arquivos, 170 kB   <- foi pro preload de entrada
//   faces de emocao           5.306 arquivos, 8,1 MB  <- fora de escopo, ver a issue
//
// POR QUE ISTO NAO PODE ENTRAR NO PRELOAD DA ENTRADA. Os biomas com mais salas
// (campo aberto, industrial) tem 4 sub-biomas: pre-carregar as outras tres custa
// ~9 MB ANTES de a cena aparecer. Trocaria "o mapa aparece durante o jogo" por
// "o botao Entrar demora dez segundos no 4G" — e o `PRELOAD_TIMEOUT_MS` existe
// justamente porque esse risco ja foi medido antes.
//
// A troca de sala leva de 1 a 2 minutos (medido em producao: 57s a 126s por
// sala). Ha tempo de sobra pra 2,9 MB chegarem antes da primeira transicao, desde
// que o download nao dispute com o que a cena precisa AGORA — dai ser sequencial
// e comecar depois da entrada.

/** Cancela o aquecimento em andamento. Chamado ao sair da hunt ou entrar noutra. */
let cancelarAquecimento: (() => void) | null = null

/**
 * `true` quando vale gastar banda aquecendo.
 *
 * `saveData` e o jogador dizendo explicitamente "economize meus dados" — aquecer
 * 9 MB de arte que ele PODE nem ver (a hunt tem 10 salas e ele sai quando quiser)
 * contra esse pedido e escolher o solavanco dele pelo bolso dele. `slow-2g`/`2g`
 * pela mesma razao por outro caminho: nessa banda o aquecimento nao chega antes
 * da troca de sala de qualquer jeito, e ainda rouba o que a cena precisa.
 *
 * `navigator.connection` nao existe no Safari nem no Firefox: ausente = aquece,
 * que e o comportamento certo pro caso comum (rede boa e sem pedido de economia).
 */
function conexaoPermiteAquecer(): boolean {
  if (typeof navigator === 'undefined') return false
  const conexao = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
  }).connection
  if (!conexao) return true
  if (conexao.saveData) return false
  return conexao.effectiveType !== 'slow-2g' && conexao.effectiveType !== '2g'
}

/**
 * As artes de fundo das OUTRAS salas que esta hunt pode sortear.
 *
 * Sai do BIOMA da sala atual, e nao do `mapId`: `SUB_BIOMA_POR_CHAVE` ja liga
 * chave -> sub-bioma -> bioma, e e o bioma que lista os sub-biomas candidatos
 * (`data/biomas.ts`). Derivar do mapId exigiria a faixa junto (`biomaDoMapId`),
 * que este chamador nao tem por que conhecer.
 *
 * Sub-bioma sem arte propria cai na arte do bioma (mesma regra de
 * `maps.ts#backgroundParaSala`), e a arte da sala ATUAL sai da lista — ela ja
 * chegou no preload de entrada.
 */
export function fundosDasOutrasSalas(sala: { chave: string } | null): string[] {
  if (!sala) return []
  const entrada = SUB_BIOMA_POR_CHAVE[sala.chave]
  if (!entrada) return []
  const atual = entrada.sub.bg?.image ?? entrada.bioma.bg.image
  const candidatas = entrada.bioma.subBiomas.map((sub) => sub.bg?.image ?? entrada.bioma.bg.image)
  return [...new Set(candidatas)].filter((url) => url !== atual)
}

/** As tiras dos golpes que o time do jogador de fato conhece. */
export function tirasDosGolpesDoTime(especies: string[]): string[] {
  const urls = new Set<string>()
  for (const speciesId of especies) {
    const species = SPECIES[speciesId]
    if (!species) continue
    for (const [abilityId] of nivelDeAprendizado(species)) {
      const vfx = vfxDoGolpe(abilityId)
      if (!vfx) continue
      urls.add(vfx.single.url)
      if (vfx.aoe) urls.add(vfx.aoe.url)
    }
  }
  return [...urls]
}

/**
 * Aquece, em segundo plano, o que a hunt vai precisar DEPOIS do primeiro frame.
 *
 * SEQUENCIAL de proposito: em paralelo, seis downloads de 2,9 MB disputam a
 * banda com a arte que a cena esta desenhando agora — o preload de entrada
 * termina com timeout e o jogador ve exatamente o buraco que isto existe pra
 * fechar. Um por vez, sem pressa, e a troca de sala tem um minuto de folga.
 *
 * Nao devolve promessa: quem chama nao espera. Erro de rede em arte de
 * aquecimento nao e erro de jogo — `primeImage` resolve nos dois casos e o
 * desenho tem o guard de `img.complete` de sempre.
 */
export function aquecerHuntEmSegundoPlano(
  sala: { chave: string } | null,
  especiesDoTime: string[],
): void {
  pararAquecimento()
  if (!conexaoPermiteAquecer()) return

  // Golpes primeiro, fundos depois: as tiras sao ~33 kB e podem ser precisas no
  // PROXIMO turno de combate; o fundo da sala seguinte tem um minuto de prazo.
  const urls = [...tirasDosGolpesDoTime(especiesDoTime), ...fundosDasOutrasSalas(sala)]
  if (urls.length === 0) return

  let cancelado = false
  cancelarAquecimento = () => { cancelado = true }
  void (async () => {
    for (const url of urls) {
      if (cancelado) return
      await primeImage(url)
    }
  })()
}

/**
 * Para o aquecimento pendente.
 *
 * Sair da hunt ou entrar noutra: o resto da fila e arte de um bioma que o jogador
 * nao esta mais vendo, e continuar baixando competiria com o preload da cena
 * nova — que e o caminho que o jogador esta esperando na tela.
 */
export function pararAquecimento(): void {
  cancelarAquecimento?.()
  cancelarAquecimento = null
}
