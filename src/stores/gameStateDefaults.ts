// Estado inicial + tipos de dado puros do save — extraido de gameStateStore.ts
// (PH-6, incidente de boot): #engine reexporta so isto pro server/edge, e
// gameStateStore.ts carrega `data/remote/gameStatePersistence` (que importa o
// client Supabase de browser) no top-level. ESM executa o modulo inteiro pra
// pegar um export nomeado — juntar os dois nesse arquivo fazia o bundle da
// Edge Function instanciar o Supabase client de browser no boot, que tenta ler
// localStorage (inexistente no Deno) e crasha toda requisicao. Este arquivo
// nao pode importar nada de `data/remote/*`.
import type { PokeInstance } from '@/data/pokes'
import type { RarityKey } from '@/data/rarity'
import { MAPS } from '@/data/maps'
import { GRUPOS_INICIAIS } from '@/data/biomas'
import { progressoPorBiomaDefault, type ProgressoPorBioma } from '@/data/progressoDeBioma'
import { especialidadeNiveisDefault, type EspecialidadeNiveis } from '@/data/especialidades'

// Limite de POKEs em campo — no vanilla so aparecia como comentario em
// GameState.js ("poke instances, max 6") e como `team.length < 6` inline no
// BagMenu; aqui vira constante de verdade, usada pelo guard de moveBagToTeam
// e pela UI que decide mostrar/esconder o botao "Mover p/ equipe".
export const MAX_TEAM_SIZE = 6

// Concessao inicial de conta nova. Espelha `concessao_inicial_de_itens()` na
// migration 20260808150000 — o servidor e quem manda (o cliente perdeu a
// escrita na Fase D), esta copia so serve pro estado local antes da primeira
// resposta chegar. Divergir dela nao vira exploit, vira um piscar de numeros
// errados no HUD no primeiro segundo.
//
// Pedido explicito do usuario: 500 Poke Ball, 500 Potion e 50 Revive (era
// 200/200/10). As outras bolas/pocoes (Great/Ultra/Premier, Super/Hyper/Max,
// Max Revive) seguem fora da concessao — sao compradas ou dropadas.
const STARTING_ITEMS: Record<string, number> = {
  poke_ball: 500,
  potion: 500,
  revive: 50,
}

export interface AutoPotRule {
  hpPercent: number
  itemId: string
}

export interface AutoCatchConfig {
  ballId: string
  catchShinyEnabled: boolean
  shinyBallId: string
}

export interface AutoCatchRule {
  speciesId: string
  ballItemId: string
}

export interface AutoSellConfig {
  ligado: boolean
  /**
   * Raridades que o bot vende. Lista explicita, e nao um "vende abaixo de X":
   * as raridades nao formam uma escala unica que o jogador queira cortar num
   * ponto (o `sellMultiplier` vai de 1x a 600x), e marcar caixinha e mais claro
   * que adivinhar uma ordem.
   */
  raridades: RarityKey[]
}

/**
 * LURE: quantos selvagens o jogador quer REUNIR antes de o POKE dele parar pra
 * lutar. Ver engine/systems/lureSystem.ts pra mecanica.
 *
 * `quantidade` e um inteiro de LURE_QUANTIDADE_MIN a LURE_QUANTIDADE_MAX. O
 * teto nao e capricho de interface: `GEOMETRIA.maxEnemies` e 6, e pedir mais
 * selvagens do que a hunt tem em campo faria a fase de reuniao viver de
 * tempo-limite em tempo-limite. O limite e revalidado no servidor (`configurar_auto`)
 * porque limite so de cliente neste projeto ja virou 502 (ver CLAUDE.md).
 */
export interface LureConfig {
  ligado: boolean
  quantidade: number
}

export interface PerfStats {
  gold: number
  xp: number
  mobs: number
  shinys: number
  since: number
}

export interface TrainerInfo {
  name: string
  level: number
  exp: number
}

export interface PokedexKillCount {
  normal: number
  shiny: number
}

// Configuracao inicial do Bot (pedido explicito): pocao a 70% de vida (era 50),
// auto-catch e auto-revive desligados — ver `defaultGameStateData` abaixo e o
// default da coluna `auto_pot_rules`/`auto_toggles` nas migrations
// 20260808150000 e 20260809120000. O tutorial do Bot parte exatamente deste
// estado.
//
// O default vive nos DOIS lugares porque nenhum e redundante: o do banco vale
// pra conta nova e pro wipe (`= default`), e este vale pro estado local antes
// de o servidor responder (e pro modo sem servidor). Divergir os dois faria a
// tela mostrar um valor e o bot usar outro ate o primeiro carregamento.
// Exportadas porque a migracao de save antigo (`persist#merge` em
// gameStateStore.ts) reaplica os mesmos defaults campo a campo num save
// parcial, em vez de reconstruir o objeto inteiro com defaultGameStateData().
export const DEFAULT_AUTO_POT_RULES: AutoPotRule[] = [{ hpPercent: 70, itemId: 'potion' }]
export const DEFAULT_AUTO_CATCH_CONFIG: AutoCatchConfig = { ballId: 'poke_ball', catchShinyEnabled: true, shinyBallId: 'great_ball' }
// Nasce DESLIGADA e sem raridade marcada. Automacao que APAGA POKE do jogador
// em troca de ouro nao pode chegar ligada por default num save que ja existe —
// e os defaults daqui sao exatamente o que um save antigo (sem a chave) recebe
// no merge do `persist`.
export const DEFAULT_AUTO_SELL_CONFIG: AutoSellConfig = { ligado: false, raridades: [] }

// Piso e teto da quantidade de lure, num lugar so: a tela monta os botoes a
// partir daqui, o clamp do motor le daqui, e o `check` da coluna na migration
// repete os MESMOS numeros (nao ha como um SQL importar TS).
export const LURE_QUANTIDADE_MIN = 1
export const LURE_QUANTIDADE_MAX = 4
// Nasce DESLIGADO: reunir 3 selvagens antes de bater triplica o dano que entra
// no POKE, e uma automacao que muda o risco do combate nao pode aparecer ligada
// num save que ja existe. `quantidade: 2` e so o valor que o seletor mostra
// quando o jogador liga pela primeira vez.
export const DEFAULT_LURE_CONFIG: LureConfig = { ligado: false, quantidade: 2 }

// Toda hunt sem unlockCost comeca desbloqueada — hoje so a hunt lendaria
// carrega um custo (ver CLAUDE.md).
export function defaultUnlockedMaps(): string[] {
  return Object.values(MAPS)
    .filter((map) => !map.unlockCost)
    .map((map) => map.id)
}

export interface GameStateData {
  team: PokeInstance[]
  activeIndex: number
  bagPokes: PokeInstance[]
  items: Record<string, number>
  lockedItems: Record<string, boolean>
  wallet: { gold: number; diamonds: number }
  unlockedMaps: string[]
  currentMapId: string | null
  /**
   * `avancarDeEstagio` (PH-428): ao limpar a ULTIMA sala do estagio, entra no
   * estagio seguinte em vez de repetir o mesmo.
   *
   * PADRAO `false` — REPETIR — e isso e decisao, nao inercia. Este e um jogo
   * idle: o normal e o jogador escolher onde deixar rodando e sair. Avancar
   * sozinho tiraria ele do estagio que ele escolheu pela especie que caca ali,
   * que e a mecanica central do redesenho.
   *
   * `recuarSePerder` (PH-493): o PAR do de cima, e do outro lado. Tres derrotas
   * dentro de `JANELA_DE_RECUO_SEGUNDOS` devolvem o jogador ao estagio
   * ANTERIOR. Pedido do dono do projeto, e a leitura e "o estagio esta acima do
   * meu time": num idle o jogador nao esta olhando, e sem isto ele volta depois
   * de uma hora pra encontrar um POKE que morreu, reviveu e morreu de novo o
   * tempo todo, sem progresso nenhum.
   *
   * PADRAO `false` pelo mesmo motivo do irmao: sair sozinho do estagio que o
   * jogador escolheu e uma decisao dele, nao do jogo.
   *
   * `avancoManualDeSala` (PH-177) SAIU na PH-493 — ver o comentario em
   * `AutoPanel`. Nao ha migracao de save: a chave que sobrar em `auto_toggles`
   * de quem ja jogava simplesmente deixa de ser lida (o merge do `persist`
   * ignora chave desconhecida), e nenhum caminho do motor pergunta por ela.
   */
  autoToggles: {
    autoPot: boolean; autoCatch: boolean; autoRevive: boolean; autoStatus: boolean
    avancarDeEstagio: boolean; recuarSePerder: boolean
  }
  autoPotRules: AutoPotRule[]
  autoCatchConfig: AutoCatchConfig
  autoCatchRules: AutoCatchRule[]
  /**
   * Auto-venda: vende a captura NO INSTANTE em que ela acontece, antes de o POKE
   * entrar na mochila.
   *
   * Por que na captura, e nao varrendo a mochila: a mochila deixou de ser
   * carregada a cada flush (custava megabytes por request — ver
   * `OpcoesDeLeitura` em server/src/progresso.ts) e uma varredura periodica
   * traria esse custo de volta multiplicado. Vender na captura ainda ataca a
   * causa em vez do sintoma — a mochila nunca enche de lixo.
   *
   * Shiny NUNCA e vendido por aqui, esteja a raridade dele marcada ou nao.
   */
  autoSellConfig: AutoSellConfig
  // Item ausente = habilitado (mesmo padrao de "ausente = default" do resto
  // do projeto) — so guarda excecao explicita (`false`) por item.
  autoStatusConfig: Record<string, boolean>
  /**
   * LURE (ver `LureConfig`). Vive junto das automacoes porque e uma automacao:
   * quem escolhe "reunir 3 antes de bater" esta configurando o bot, e a tela
   * dela e uma aba do painel de Automacoes.
   */
  lureConfig: LureConfig
  perfStats: PerfStats
  trainer: TrainerInfo
  pokedexKills: Record<string, PokedexKillCount>
  unlockedContinents: string[]
  // Chave `${tipo}:${speciesId}` (ver data/missoes.ts#chaveDaMissao) —
  // presente e `true` = reivindicada. A mesma especie pode estar em DUAS
  // cadeias (dual-type), e reivindicar numa nao reivindica a outra.
  missoesReivindicadas: Record<string, boolean>
  especialidades: EspecialidadeNiveis
  /**
   * PH-429: um numero por BIOMA ("maior estagio ja limpo", 0 a 10), e nao mais
   * tres inteiros por faixa. O NOME DO CAMPO ficou como estava de proposito —
   * trocar obrigaria uma migracao do `persist` local, e o tipo novo ja e o que
   * obriga o compilador a apontar cada leitura.
   */
  biomaProgress: ProgressoPorBioma
}

// Exportado porque o adaptador de persistencia precisa dos mesmos defaults
// para preencher campo ausente numa linha antiga do Postgres.
export function defaultGameStateData(): GameStateData {
  return {
    team: [],
    activeIndex: 0,
    bagPokes: [],
    items: { ...STARTING_ITEMS },
    lockedItems: {},
    wallet: { gold: 1000, diamonds: 0 },
    unlockedMaps: defaultUnlockedMaps(),
    currentMapId: null,
    // `autoStatus` nasce LIGADO, ao contrario de autoCatch/autoRevive: status
    // negativo e a unica coisa aqui que faz o POKE perder turno sozinho, e o
    // save antigo (que nao tem a chave) cai neste default via o merge em
    // gameStateStore — ou seja, quem ja jogava ganha a cura sem precisar
    // descobrir o interruptor.
    autoToggles: {
      autoPot: true, autoCatch: false, autoRevive: false, autoStatus: true,
      avancarDeEstagio: false, recuarSePerder: false,
    },
    autoPotRules: DEFAULT_AUTO_POT_RULES.map((r) => ({ ...r })),
    autoCatchConfig: { ...DEFAULT_AUTO_CATCH_CONFIG },
    autoCatchRules: [],
    autoSellConfig: { ...DEFAULT_AUTO_SELL_CONFIG, raridades: [] },
    autoStatusConfig: {},
    lureConfig: { ...DEFAULT_LURE_CONFIG },
    perfStats: { gold: 0, xp: 0, mobs: 0, shinys: 0, since: Date.now() },
    trainer: { name: 'Treinador', level: 1, exp: 0 },
    pokedexKills: {},
    unlockedContinents: [...GRUPOS_INICIAIS],
    missoesReivindicadas: {},
    especialidades: especialidadeNiveisDefault(),
    biomaProgress: progressoPorBiomaDefault(),
  }
}

/**
 * SO as chaves de `autoToggles` que ESTA versao do jogo conhece.
 *
 * PH-494, defeito em producao com causa embaraçosa: a PH-493 tirou
 * `avancoManualDeSala` do cliente e da lista branca de `configurar_auto`, mas
 * NAO do banco — a chave continua dentro do jsonb `auto_toggles` de todo
 * jogador que ja existia, porque ela esteve no default desde a PH-177 e nada
 * apaga chave de jsonb.
 *
 * O caminho de volta fechava o circulo sozinho: `playerMapper` espalha o jsonb
 * inteiro dentro de `autoToggles` (`{ ...defaults, ...fromJson(...) }`), a
 * chave orfa entra no store, e `sincronizarAuto` manda `s.autoToggles` CRU de
 * volta. A RPC valida por lista branca com `raise`, que derruba a TRANSACAO
 * INTEIRA — e nenhuma configuracao de auto era gravada. Exatamente o dano da
 * PH-492, pela porta oposta: la faltava a chave no SQL, aqui sobra a chave no
 * cliente.
 *
 * O FILTRO MORA NA FRONTEIRA, e nao no `sincronizarAuto`, porque a fronteira e
 * a unica coisa que da pra provar: o store passa a NUNCA conter chave que o
 * jogo nao conhece, e ai nao importa quantos lugares leiam `autoToggles`.
 * `sincronizarAuto` filtra de novo por cima — o custo e um `Object.keys` e o
 * que ele compra e nao depender de todo caminho futuro pro store passar por
 * aqui.
 *
 * DERIVADO do default, e nao escrito a mao: uma lista literal aqui viraria a
 * terceira cópia da mesma verdade (o tipo, o default e a lista) e divergiria na
 * primeira mudanca. `togglesDeAutoBatemComORpc.test.ts` ja amarra o default ao
 * SQL; isto amarra o filtro ao default.
 */
export type ChaveDeAutoToggle = keyof GameStateData['autoToggles']

export function CHAVES_DE_AUTO_TOGGLE(): ChaveDeAutoToggle[] {
  return Object.keys(defaultGameStateData().autoToggles) as ChaveDeAutoToggle[]
}

/**
 * Deixa passar so as chaves conhecidas, caindo no default pra cada uma que
 * faltar ou vier com tipo errado.
 *
 * `typeof !== 'boolean'` e nao `!!valor`: um `"false"` (string) gravado por
 * engano viraria `true`, e um `null` viraria `false` em vez do default do jogo
 * — que pra `autoStatus` significa desligar sozinho uma automacao que nasce
 * ligada.
 */
export function sanearAutoToggles(bruto: unknown): GameStateData['autoToggles'] {
  const padrao = defaultGameStateData().autoToggles
  if (!bruto || typeof bruto !== 'object') return padrao
  const entrada = bruto as Record<string, unknown>
  const limpo = { ...padrao }
  for (const chave of CHAVES_DE_AUTO_TOGGLE()) {
    const valor = entrada[chave]
    if (typeof valor === 'boolean') limpo[chave] = valor
  }
  return limpo
}
