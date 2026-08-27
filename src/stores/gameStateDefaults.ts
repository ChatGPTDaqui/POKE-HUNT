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
import { FAIXAS_INICIAIS } from '@/data/biomas'

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
  autoToggles: { autoPot: boolean; autoCatch: boolean; autoRevive: boolean; autoStatus: boolean; avancoManualDeSala: boolean }
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
  perfStats: PerfStats
  trainer: TrainerInfo
  pokedexKills: Record<string, PokedexKillCount>
  unlockedContinents: string[]
  // Chave `${tipo}:${speciesId}` (ver data/missoes.ts#chaveDaMissao) —
  // presente e `true` = reivindicada. A mesma especie pode estar em DUAS
  // cadeias (dual-type), e reivindicar numa nao reivindica a outra.
  missoesReivindicadas: Record<string, boolean>
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
    autoToggles: { autoPot: true, autoCatch: false, autoRevive: false, autoStatus: true, avancoManualDeSala: false },
    autoPotRules: DEFAULT_AUTO_POT_RULES.map((r) => ({ ...r })),
    autoCatchConfig: { ...DEFAULT_AUTO_CATCH_CONFIG },
    autoCatchRules: [],
    autoSellConfig: { ...DEFAULT_AUTO_SELL_CONFIG, raridades: [] },
    autoStatusConfig: {},
    perfStats: { gold: 0, xp: 0, mobs: 0, shinys: 0, since: Date.now() },
    trainer: { name: 'Treinador', level: 1, exp: 0 },
    pokedexKills: {},
    unlockedContinents: [...FAIXAS_INICIAIS],
    missoesReivindicadas: {},
  }
}
