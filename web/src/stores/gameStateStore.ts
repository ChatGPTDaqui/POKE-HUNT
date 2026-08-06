// Port de js/state/GameState.js + js/core/SaveManager.js — a arvore de
// estado PERSISTENTE do jogo (time/mochila/itens/carteira/regras de auto/
// trainer/pokedex), separada da arvore efemera de combate (worldStore.ts,
// nao persistida, reconstruida do zero a cada troca de cena).
//
// Fase 3 do plano: espelha os campos/metodos de GameState.js quase 1:1.
// Acoes que so existiam como mutacao direta de campo fora da classe
// original (main.js#controller, BagMenu.js, EconomySystem.js —
// `gameState.currentMapId = x`, `gameState.team.push(...)`, etc.) NAO
// entram aqui ainda — essa store so cobre o que GameState.js definia como
// metodo proprio. As acoes que faltam sao adicionadas quando o codigo que
// as usa for portado (main.js controller na Fase 4, paineis na Fase 6).
import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'
import type { PokeInstance } from '@/data/pokes'
import { MAPS } from '@/data/maps'
import { useToastStore } from '@/stores/toastStore'

// Todo item real, vendavel, da planilha (varas excluidas — pesca fora de
// escopo, ver CLAUDE.md).
// Limite de POKEs em campo — no vanilla so aparecia como comentario em
// GameState.js ("poke instances, max 6") e como `team.length < 6` inline no
// BagMenu; aqui vira constante de verdade, usada pelo guard de moveBagToTeam
// e pela UI que decide mostrar/esconder o botao "Mover p/ equipe".
export const MAX_TEAM_SIZE = 6

const STARTING_ITEMS: Record<string, number> = {
  poke_ball: 10000, great_ball: 10000, ultra_ball: 10000, premier_ball: 10000,
  potion: 10000, super_potion: 10000, hyper_potion: 10000, max_potion: 10000,
  revive: 10000, max_revive: 10000,
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

const DEFAULT_AUTO_POT_RULES: AutoPotRule[] = [{ hpPercent: 40, itemId: 'potion' }]
const DEFAULT_AUTO_CATCH_CONFIG: AutoCatchConfig = { ballId: 'poke_ball', catchShinyEnabled: true, shinyBallId: 'great_ball' }

// Toda hunt sem unlockCost comeca desbloqueada — hoje so a hunt lendaria
// carrega um custo (ver CLAUDE.md).
function defaultUnlockedMaps(): string[] {
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
  autoToggles: { autoPot: boolean; autoCatch: boolean; autoRevive: boolean }
  autoPotRules: AutoPotRule[]
  autoCatchConfig: AutoCatchConfig
  autoCatchRules: AutoCatchRule[]
  perfStats: PerfStats
  trainer: TrainerInfo
  pokedexKills: Record<string, PokedexKillCount>
  unlockedContinents: string[]
}

function defaultGameStateData(): GameStateData {
  return {
    team: [],
    activeIndex: 0,
    bagPokes: [],
    items: { ...STARTING_ITEMS },
    lockedItems: {},
    wallet: { gold: 500000, diamonds: 5 },
    unlockedMaps: defaultUnlockedMaps(),
    currentMapId: null,
    autoToggles: { autoPot: true, autoCatch: true, autoRevive: true },
    autoPotRules: DEFAULT_AUTO_POT_RULES.map((r) => ({ ...r })),
    autoCatchConfig: { ...DEFAULT_AUTO_CATCH_CONFIG },
    autoCatchRules: [],
    perfStats: { gold: 0, xp: 0, mobs: 0, shinys: 0, since: Date.now() },
    trainer: { name: 'Treinador', level: 1, exp: 0 },
    pokedexKills: {},
    unlockedContinents: ['johto', 'nightmare'],
  }
}

export interface GameStateActions {
  setActiveIndex: (index: number) => void
  addItem: (itemId: string, qty?: number) => void
  hasItem: (itemId: string, qty?: number) => boolean
  removeItem: (itemId: string, qty?: number) => boolean
  addGold: (amount: number) => void
  spendGold: (amount: number) => boolean
  addDiamonds: (amount: number) => void
  spendDiamonds: (amount: number) => boolean
  addCapturedPoke: (pokeInstance: PokeInstance) => 'bag'
  toggleItemLock: (itemId: string) => void
  isItemLocked: (itemId: string) => boolean
  unlockMap: (mapId: string) => void
  isMapUnlocked: (mapId: string) => boolean
  unlockContinent: (continent: string) => void
  isContinentUnlocked: (continent: string) => boolean
  healTeamFully: () => void

  // Acoes adicionadas na Fase 4 — no original (js/main.js#controller,
  // EconomySystem.js) essas eram mutacao direta de campo/array por fora da
  // classe GameState (`gameState.currentMapId = x`, `gameState.team.push`,
  // `gameState.team.splice/unshift`, `gameState.bagPokes.splice/filter`).
  // Zustand nao detecta mutacao direta de array/objeto — toda escrita
  // equivalente vira uma action explicita aqui.
  setCurrentMapId: (mapId: string | null) => void
  addPokeToTeam: (poke: PokeInstance) => void
  // Tira o poke do indice `index` e poe na frente (index 0) — usado por
  // setActiveTeamIndex pra "subir" o poke recem-colocado em campo pro topo
  // da lista visivel.
  moveTeamIndexToFront: (index: number) => void
  // Tira do time e poe na mochila; devolve o poke removido (null se uid nao
  // achado) pra quem chamou poder ler o nome/shiny pro toast.
  moveTeamToBag: (uid: string) => PokeInstance | null
  // Inversa de moveTeamToBag — adicionada na Fase 6 pro botao "Mover p/
  // equipe" da Mochila, que no original (js/ui/panels/BagMenu.js) fazia
  // `bagPokes.splice(idx,1)` + `team.push(moved)` direto no objeto de
  // estado. Recusa (devolve null) se a equipe ja tem 6 — o vanilla so
  // escondia o botao, mas o guard aqui e defesa em profundidade, mesmo
  // padrao dos guards de venda em EconomySystem.
  moveBagToTeam: (uid: string) => PokeInstance | null
  removeBagPoke: (uid: string) => PokeInstance | null
  removeBagPokes: (uids: string[]) => PokeInstance[]
  // Acha o poke por uid em team OU bagPokes (evolvePoke original buscava
  // nos dois) e substitui pelo resultado de `updater` — usado por
  // grantExp/applyDeathExpPenalty/evolvePokeInstance, que no original
  // mutavam o pokeInstance em lugar; aqui devolvem um poke NOVO e essa
  // action escreve ele de volta no array certo.
  updatePokeInstance: (uid: string, updater: (poke: PokeInstance) => PokeInstance) => void
  setTrainer: (trainer: TrainerInfo) => void
  resetPerfStats: () => void
  incrementPerfStats: (delta: { gold: number; xp: number; mobs: number; shinys: number }) => void
  setPokedexKillEntry: (speciesId: string, entry: PokedexKillCount) => void

  // Acoes do painel Auto + AbilityHUD (Fase 6). No vanilla essas telas
  // mutavam o objeto direto (`gameState.autoToggles.autoPot = !...`,
  // `gameState.autoPotRules.splice(...)`, `poke.disabledAbilities[id] = true`)
  // e chamavam `controller.save()` na sequencia. Zustand nao detecta mutacao
  // em lugar, entao cada uma vira uma action explicita aqui.
  setAutoToggle: (key: keyof GameStateData['autoToggles'], value: boolean) => void
  addAutoPotRule: (rule: AutoPotRule) => void
  updateAutoPotRule: (index: number, patch: Partial<AutoPotRule>) => void
  removeAutoPotRule: (index: number) => void
  setAutoCatchConfig: (patch: Partial<AutoCatchConfig>) => void
  addAutoCatchRule: (rule: AutoCatchRule) => void
  updateAutoCatchRule: (index: number, patch: Partial<AutoCatchRule>) => void
  removeAutoCatchRule: (index: number) => void
  // Liga/desliga um golpe pra selecao automatica da IA de combate
  // (CombatSystem#pickAbility filtra contra `poke.disabledAbilities`).
  // Procura o poke em team E bagPokes, igual updatePokeInstance.
  toggleAbilityDisabled: (pokeUid: string, abilityId: string) => void

  // Equivalente a `Object.assign(gameState, new GameState())` do
  // controller.resetGame original — devolve toda a store persistente pros
  // valores de um jogo novo (o SaveManager.clear() correspondente e so
  // apagar a chave do localStorage, que o proprio `persist` ja faz sozinho
  // na proxima escrita — resetToDefaults so precisa repor o estado in-memory).
  resetToDefaults: () => void
}

export type GameStateStore = GameStateData & GameStateActions

// Getters computados (poke.activePoke/hasStarter no original) viram
// selectors de fora da store — ver useActivePoke()/useHasStarter() no fim
// deste arquivo — Zustand nao suporta getters reativos dentro do proprio
// state do mesmo jeito que uma classe suportava.

const SAVE_KEY = 'novo-poke-idle:save'
const SAVE_VERSION = 1

// BUG REAL encontrado ao testar o Farm Offline ao vivo: um POKE que vem do
// worldStore chega como (ou contendo) um DRAFT do immer. O loop de combate
// roda inteiro dentro de `useWorldStore.update(draft => ...)`, entao
// `enemy.poke`/`world.player.poke` sao proxies de draft; as funcoes de
// progressao/captura fazem `{...poke, ...}`, que copia o nivel de cima mas
// deixa `ivs`/`stats`/`unlockedAbilities` apontando pros proxies. Assim que
// o producer termina, o immer REVOGA esses proxies — e o objeto guardado em
// team/bagPokes vira uma mina: `JSON.stringify(gameState)` passa a lancar
// "Cannot perform 'get' on a proxy that has been revoked" pra sempre.
//
// O sintoma era brutal e silencioso: o `setItem` do persist engolia o erro
// num console.warn, entao a PARTIR DA PRIMEIRA CAPTURA o jogo nunca mais
// salvava — sem save, o `savedAt` congela e o Farm Offline (que mede o tempo
// fora justamente por ele) simplesmente nunca mais roda direito.
//
// A defesa fica AQUI, na fronteira da store persistida, e nao nos 3 pontos
// que hoje escrevem POKE (progressao, penalidade de morte, captura): assim
// nenhum caminho futuro consegue reintroduzir o mesmo vazamento. Clone via
// JSON de proposito — le atraves dos proxies e um PokeInstance e dado puro
// (e persistido como JSON de qualquer jeito).
function detachPoke<T>(poke: T): T {
  return JSON.parse(JSON.stringify(poke)) as T
}

// Avisado UMA vez por sessao (nao a cada falha — isso escreve a cada kill).
// Uma falha silenciosa aqui e indistinguivel de "o farm offline quebrou":
// sem save nao ha `savedAt`, entao nao ha relatorio de tempo fora nem
// progresso nenhum guardado. Armazenamento indisponivel e caso real de
// dispositivo, nao hipotese — Safari em navegacao privada lanca na escrita,
// e alguns navegadores descartam o storage do site apos um tempo sem uso.
let saveFailureReported = false

function reportSaveFailure(err: unknown): void {
  console.warn('Falha ao salvar jogo:', err)
  if (saveFailureReported) return
  saveFailureReported = true
  useToastStore
    .getState()
    .pushToast(
      'Nao foi possivel salvar o jogo neste navegador (armazenamento bloqueado) — o progresso e o farm offline nao serao mantidos.',
      'error',
      'world',
    )
}

// Formato de storage customizado, byte-a-byte compativel com o payload que
// js/core/SaveManager.js ja escrevia ({version, data, savedAt}) — mesma
// chave de localStorage tambem, de proposito: no corte final da migracao
// (Fase 7), o save de um jogador real carrega direto pro app novo sem
// nenhuma acao manual. `data` (nao `state`, que e o nome padrao do Zustand)
// e a chave interna do payload — so pra bater com o formato que ja existia
// em disco.
const gameStateStorage: PersistStorage<GameStateData> = {
  getItem: (): StorageValue<GameStateData> | null => {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return null
      const payload = JSON.parse(raw) as { version: number; data: GameStateData; savedAt?: number }
      if (payload.version !== SAVE_VERSION) {
        console.warn('Save de versao antiga descartado.')
        return null
      }
      return { state: payload.data, version: SAVE_VERSION }
    } catch (err) {
      console.warn('Falha ao carregar save:', err)
      return null
    }
  },
  setItem: (_name, value) => {
    try {
      const payload = { version: SAVE_VERSION, data: value.state, savedAt: Date.now() }
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload))
    } catch (err) {
      reportSaveFailure(err)
    }
  },
  removeItem: () => localStorage.removeItem(SAVE_KEY),
}

// Escreve o save AGORA, sem esperar uma mudanca de estado disparar o
// `persist`. Necessario nos pontos de saida da pagina: navegadores mobile
// matam uma aba em segundo plano sem nunca disparar `beforeunload`, e
// `savedAt` e exatamente o que o Farm Offline usa pra medir o tempo fora —
// um save velho vira tempo offline contado a mais. Devolve false quando o
// armazenamento esta bloqueado (Safari em navegacao privada, por exemplo),
// pra quem chama poder avisar em vez de falhar em silencio.
export function forceSave(): boolean {
  try {
    const payload = { version: SAVE_VERSION, data: useGameStateStore.getState(), savedAt: Date.now() }
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload))
    return true
  } catch (err) {
    reportSaveFailure(err)
    return false
  }
}

// Roda `fn` com a persistencia DESLIGADA, gravando uma unica vez no fim.
//
// Existe por causa de uma diferenca real entre o vanilla e este port: la, o
// modo `silent` da simulacao pulava o `saveGame()` por kill de proposito
// ("isso ficaria inviavel pra potencialmente milhares de kills"). Aqui quem
// grava e o middleware `persist`, que reage a QUALQUER `set` — e um unico
// kill faz varios (ouro, itens, POKE, treinador, pokedex). Resultado: a
// simulacao de 2h fazia dezenas de milhares de `JSON.stringify` do estado
// inteiro + escritas no localStorage, ~10x mais lenta que o vanilla e
// estourando o orcamento de tempo real (o relatorio saia truncado ate num
// desktop; num celular seria bem pior).
const noopStorage: PersistStorage<GameStateData> = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

export function withSavesDeferred<T>(fn: () => T): T {
  const previous = useGameStateStore.persist.getOptions().storage
  useGameStateStore.persist.setOptions({ storage: noopStorage })
  try {
    return fn()
  } finally {
    useGameStateStore.persist.setOptions({ storage: previous })
    forceSave() // uma escrita so, com o estado final da simulacao inteira
  }
}

// Timestamp do ultimo save gravado — usado pelo Farm Offline (Fase 4/5) pra
// saber quanto tempo real se passou desde o ultimo save, igual
// SaveManager.load() devolvia `savedAt` junto do `data`.
export function readLastSavedAt(): number | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const payload = JSON.parse(raw) as { savedAt?: number }
    return payload.savedAt ?? null
  } catch {
    return null
  }
}

export const useGameStateStore = create<GameStateStore>()(
  persist(
    (set, get) => ({
      ...defaultGameStateData(),

      setActiveIndex: (index) => {
        const { team } = get()
        if (index >= 0 && index < team.length) set({ activeIndex: index })
      },

      addItem: (itemId, qty = 1) => {
        set((state) => ({ items: { ...state.items, [itemId]: (state.items[itemId] || 0) + qty } }))
      },

      hasItem: (itemId, qty = 1) => (get().items[itemId] || 0) >= qty,

      removeItem: (itemId, qty = 1) => {
        if (!get().hasItem(itemId, qty)) return false
        set((state) => {
          const remaining = state.items[itemId] - qty
          const items = { ...state.items }
          if (remaining <= 0) delete items[itemId]
          else items[itemId] = remaining
          return { items }
        })
        return true
      },

      addGold: (amount) => set((state) => ({ wallet: { ...state.wallet, gold: state.wallet.gold + amount } })),

      spendGold: (amount) => {
        if (get().wallet.gold < amount) return false
        set((state) => ({ wallet: { ...state.wallet, gold: state.wallet.gold - amount } }))
        return true
      },

      addDiamonds: (amount) => set((state) => ({ wallet: { ...state.wallet, diamonds: state.wallet.diamonds + amount } })),

      spendDiamonds: (amount) => {
        if (get().wallet.diamonds < amount) return false
        set((state) => ({ wallet: { ...state.wallet, diamonds: state.wallet.diamonds - amount } }))
        return true
      },

      // Toda captura cai na mochila; mover pro time e acao manual do jogador.
      addCapturedPoke: (pokeInstance) => {
        set((state) => ({ bagPokes: [...state.bagPokes, detachPoke(pokeInstance)] }))
        return 'bag'
      },

      toggleItemLock: (itemId) => {
        set((state) => {
          const lockedItems = { ...state.lockedItems }
          if (lockedItems[itemId]) delete lockedItems[itemId]
          else lockedItems[itemId] = true
          return { lockedItems }
        })
      },

      isItemLocked: (itemId) => Boolean(get().lockedItems[itemId]),

      unlockMap: (mapId) => {
        set((state) => (state.unlockedMaps.includes(mapId) ? state : { unlockedMaps: [...state.unlockedMaps, mapId] }))
      },

      isMapUnlocked: (mapId) => get().unlockedMaps.includes(mapId),

      unlockContinent: (continent) => {
        set((state) =>
          state.unlockedContinents.includes(continent)
            ? state
            : { unlockedContinents: [...state.unlockedContinents, continent] },
        )
      },

      isContinentUnlocked: (continent) => get().unlockedContinents.includes(continent),

      healTeamFully: () => {
        set((state) => ({
          team: state.team.map((poke) => ({ ...poke, hp: poke.stats.hp })),
        }))
      },

      setCurrentMapId: (mapId) => set({ currentMapId: mapId }),

      addPokeToTeam: (poke) => set((state) => ({ team: [...state.team, detachPoke(poke)] })),

      moveTeamIndexToFront: (index) => {
        set((state) => {
          if (index < 0 || index >= state.team.length) return state
          const team = [...state.team]
          const [poke] = team.splice(index, 1)
          team.unshift(poke)
          return { team, activeIndex: 0 }
        })
      },

      moveTeamToBag: (uid) => {
        let removed: PokeInstance | null = null
        set((state) => {
          const idx = state.team.findIndex((p) => p.uid === uid)
          if (idx === -1) return state
          const team = [...state.team]
          ;[removed] = team.splice(idx, 1)
          const bagPokes = [...state.bagPokes, removed]
          let activeIndex = state.activeIndex
          if (idx < state.activeIndex) activeIndex -= 1
          else if (idx === state.activeIndex) activeIndex = Math.min(state.activeIndex, team.length - 1)
          return { team, bagPokes, activeIndex }
        })
        return removed
      },

      moveBagToTeam: (uid) => {
        let moved: PokeInstance | null = null
        set((state) => {
          if (state.team.length >= MAX_TEAM_SIZE) return state
          const idx = state.bagPokes.findIndex((p) => p.uid === uid)
          if (idx === -1) return state
          const bagPokes = [...state.bagPokes]
          ;[moved] = bagPokes.splice(idx, 1)
          return { bagPokes, team: [...state.team, moved] }
        })
        return moved
      },

      removeBagPoke: (uid) => {
        let removed: PokeInstance | null = null
        set((state) => {
          const idx = state.bagPokes.findIndex((p) => p.uid === uid)
          if (idx === -1) return state
          const bagPokes = [...state.bagPokes]
          ;[removed] = bagPokes.splice(idx, 1)
          return { bagPokes }
        })
        return removed
      },

      removeBagPokes: (uids) => {
        const uidSet = new Set(uids)
        let removed: PokeInstance[] = []
        set((state) => {
          removed = state.bagPokes.filter((p) => uidSet.has(p.uid))
          const bagPokes = state.bagPokes.filter((p) => !uidSet.has(p.uid))
          return { bagPokes }
        })
        return removed
      },

      updatePokeInstance: (uid, updater) => {
        set((state) => {
          const teamIdx = state.team.findIndex((p) => p.uid === uid)
          if (teamIdx !== -1) {
            const team = [...state.team]
            team[teamIdx] = detachPoke(updater(team[teamIdx]))
            return { team }
          }
          const bagIdx = state.bagPokes.findIndex((p) => p.uid === uid)
          if (bagIdx !== -1) {
            const bagPokes = [...state.bagPokes]
            bagPokes[bagIdx] = detachPoke(updater(bagPokes[bagIdx]))
            return { bagPokes }
          }
          return state
        })
      },

      setTrainer: (trainer) => set({ trainer }),

      resetPerfStats: () => set({ perfStats: { gold: 0, xp: 0, mobs: 0, shinys: 0, since: Date.now() } }),

      incrementPerfStats: (delta) => {
        set((state) => ({
          perfStats: {
            ...state.perfStats,
            gold: state.perfStats.gold + delta.gold,
            xp: state.perfStats.xp + delta.xp,
            mobs: state.perfStats.mobs + delta.mobs,
            shinys: state.perfStats.shinys + delta.shinys,
          },
        }))
      },

      setPokedexKillEntry: (speciesId, entry) => {
        set((state) => ({ pokedexKills: { ...state.pokedexKills, [speciesId]: entry } }))
      },

      setAutoToggle: (key, value) => {
        set((state) => ({ autoToggles: { ...state.autoToggles, [key]: value } }))
      },

      addAutoPotRule: (rule) => {
        set((state) => ({ autoPotRules: [...state.autoPotRules, rule] }))
      },

      updateAutoPotRule: (index, patch) => {
        set((state) => ({
          autoPotRules: state.autoPotRules.map((r, i) => (i === index ? { ...r, ...patch } : r)),
        }))
      },

      removeAutoPotRule: (index) => {
        set((state) => ({ autoPotRules: state.autoPotRules.filter((_, i) => i !== index) }))
      },

      setAutoCatchConfig: (patch) => {
        set((state) => ({ autoCatchConfig: { ...state.autoCatchConfig, ...patch } }))
      },

      addAutoCatchRule: (rule) => {
        set((state) => ({ autoCatchRules: [...state.autoCatchRules, rule] }))
      },

      updateAutoCatchRule: (index, patch) => {
        set((state) => ({
          autoCatchRules: state.autoCatchRules.map((r, i) => (i === index ? { ...r, ...patch } : r)),
        }))
      },

      removeAutoCatchRule: (index) => {
        set((state) => ({ autoCatchRules: state.autoCatchRules.filter((_, i) => i !== index) }))
      },

      toggleAbilityDisabled: (pokeUid, abilityId) => {
        get().updatePokeInstance(pokeUid, (poke) => {
          const disabled = { ...(poke.disabledAbilities || {}) }
          if (disabled[abilityId]) delete disabled[abilityId]
          else disabled[abilityId] = true
          return { ...poke, disabledAbilities: disabled }
        })
      },

      resetToDefaults: () => set(defaultGameStateData()),
    }),
    {
      name: SAVE_KEY,
      storage: gameStateStorage,
      version: SAVE_VERSION,
      // Equivalente ao GameState.fromSnapshot: defaults defensivos pra save
      // antigo faltando campo novo, e UNIAO (nao substituicao) em
      // unlockedMaps/unlockedContinents — uma hunt/continente novo nunca
      // nasce "trancado" so por nao existir ainda quando o save foi escrito.
      merge: (persistedState, currentState) => {
        // BUG REAL corrigido apos teste ao vivo: `zustand/persist` chama
        // `merge` SEMPRE na hidratacao, inclusive quando nao existe save
        // nenhum (`persistedState === undefined`, primeiro boot). Sem este
        // early-return, os defaults defensivos abaixo — que existem pra
        // preencher CAMPO FALTANDO dentro de um save real — sobrescreviam os
        // defaults de jogo novo: `wallet` virava {gold:0,diamonds:0} em vez
        // de {gold:500000,diamonds:5} e `items` virava {} em vez dos 10.000
        // de cada item inicial. Sintoma observado no browser: run nova
        // comecava sem ouro e sem nenhuma pocao/bola/revive, e por tabela
        // auto-pot/auto-revive nunca disparavam (nao havia item pra usar).
        // Equivale ao `if (!data) return state` que o
        // js/state/GameState.js#fromSnapshot original ja tinha.
        if (!persistedState) return currentState
        const persisted = persistedState as Partial<GameStateData>
        return {
          ...currentState,
          ...persisted,
          autoToggles: { autoPot: true, autoCatch: true, autoRevive: true, ...(persisted.autoToggles || {}) },
          wallet: { gold: 0, diamonds: 0, ...(persisted.wallet || {}) },
          unlockedMaps: [...new Set([...(persisted.unlockedMaps || []), ...defaultUnlockedMaps()])],
          team: persisted.team || [],
          bagPokes: persisted.bagPokes || [],
          items: persisted.items || {},
          lockedItems: persisted.lockedItems || {},
          autoPotRules:
            persisted.autoPotRules && persisted.autoPotRules.length > 0
              ? persisted.autoPotRules
              : DEFAULT_AUTO_POT_RULES.map((r) => ({ ...r })),
          autoCatchConfig: { ...DEFAULT_AUTO_CATCH_CONFIG, ...(persisted.autoCatchConfig || {}) },
          autoCatchRules: persisted.autoCatchRules || [],
          perfStats: { gold: 0, xp: 0, mobs: 0, shinys: 0, since: Date.now(), ...(persisted.perfStats || {}) },
          trainer: { name: 'Treinador', level: 1, exp: 0, ...(persisted.trainer || {}) },
          pokedexKills: persisted.pokedexKills || {},
          // 'nightmare' sempre unido (nao so default) — save escrito antes
          // dessa feature existir nunca teria como ganhar o continente de
          // outro jeito (mesmo raciocinio de unlockedMaps acima).
          unlockedContinents: [...new Set([...(persisted.unlockedContinents || ['johto']), 'nightmare'])],
        }
      },
    },
  ),
)

// Getters computados do GameState original (activePoke/hasStarter) — viram
// hooks de selector simples, mesma API de leitura pros componentes.
export function useActivePoke(): PokeInstance | null {
  return useGameStateStore((state) => state.team[state.activeIndex] || null)
}

export function useHasStarter(): boolean {
  return useGameStateStore((state) => state.team.length > 0)
}
