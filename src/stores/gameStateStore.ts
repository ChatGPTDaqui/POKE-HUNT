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
import { persist, type PersistStorage } from 'zustand/middleware'
import type { PokeInstance } from '@/data/pokes'
import { FAIXAS_INICIAIS, GRUPOS_DO_LANCE, GRUPOS_LEGADOS } from '@/data/biomas'
import { useToastStore } from '@/stores/toastStore'
// Sem ciclo em runtime: os modulos de `data/remote` so importam TIPOS deste
// arquivo (`import type`, apagado na compilacao).
import { postgresStorage, flushAgora, ultimoSavedAt, aoFalharSave } from '@/data/remote/gameStatePersistence'
import { registrarCapturaPredita } from '@/data/remote/predicoesDeCaptura'
// Tipos/defaults puros do save, sem import de `data/remote/*` — extraidos pro
// `#engine` (edge/server) poder reexportar sem trazer o client Supabase de
// browser pro bundle da Edge Function (PH-6, incidente de boot). Ver
// gameStateDefaults.ts pro porque.
import {
  MAX_TEAM_SIZE, defaultGameStateData, defaultUnlockedMaps,
  DEFAULT_AUTO_POT_RULES, DEFAULT_AUTO_CATCH_CONFIG,
  type AutoPotRule, type AutoCatchConfig, type AutoCatchRule,
  type PerfStats, type TrainerInfo, type PokedexKillCount, type GameStateData,
} from '@/stores/gameStateDefaults'

export { MAX_TEAM_SIZE, defaultGameStateData }
export type { AutoPotRule, AutoCatchConfig, AutoCatchRule, PerfStats, TrainerInfo, PokedexKillCount, GameStateData }

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
  setAutoStatusItem: (itemId: string, enabled: boolean) => void
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
  // Os no maximo 4 golpes que o POKE leva pra luta (data/activeAbilities.ts).
  // Quem valida a lista e o Postgres (RPC `definir_golpes_ativos`); aqui e so
  // o caminho de escrita local.
  setActiveAbilities: (pokeUid: string, abilityIds: string[]) => void

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
// Agora o risco mudou de natureza: nao e mais "armazenamento bloqueado" (raro,
// permanente), e sim rede caindo (comum, intermitente). Por isso o aviso
// aparece uma vez quando comeca a falhar e some quando volta a gravar, em vez
// de ser um alerta unico e definitivo.
let falhaDeSaveAvisada = false

aoFalharSave((mensagem) => {
  if (mensagem == null) {
    falhaDeSaveAvisada = false
    return
  }
  if (falhaDeSaveAvisada) return
  falhaDeSaveAvisada = true
  useToastStore
    .getState()
    .pushToast(
      'Sem conexao com o servidor — seu progresso nao esta sendo salvo. Ele volta a salvar sozinho quando a conexao voltar.',
      'error',
      'world',
    )
})

// O adaptador de localStorage foi substituido pelo `postgresStorage`. O que
// sobra do localStorage e SO leitura: quem ja jogava antes do login existir
// tem um save real gravado neste formato ({version, data, savedAt}, a mesma
// chave que o js/core/SaveManager.js do vanilla usava), e ele precisa ser
// importado pra conta no primeiro acesso — senao o jogador "perde" o
// progresso ao criar conta.
export interface SaveLocalLegado {
  data: GameStateData
  savedAt: number | null
}

export function lerSaveLocalLegado(): SaveLocalLegado | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const payload = JSON.parse(raw) as { version: number; data: GameStateData; savedAt?: number }
    if (payload.version !== SAVE_VERSION) return null
    if (!payload.data || !Array.isArray(payload.data.team)) return null
    return { data: payload.data, savedAt: payload.savedAt ?? null }
  } catch {
    return null
  }
}

// Nao apaga o save local depois de importar: se algo der errado no meio da
// importacao, ele e a unica copia do progresso. Marca como importado, e a
// tela de importacao usa isso pra nao oferecer de novo.
const CHAVE_IMPORTADO = `${SAVE_KEY}:importado`

export function marcarSaveLegadoImportado(): void {
  try {
    localStorage.setItem(CHAVE_IMPORTADO, new Date().toISOString())
  } catch {
    // localStorage bloqueado — a importacao seria oferecida de novo, o que e
    // chato mas nao destrutivo (a tela deixa recusar).
  }
}

export function saveLegadoJaImportado(): boolean {
  try {
    return localStorage.getItem(CHAVE_IMPORTADO) != null
  } catch {
    return false
  }
}

// Escreve o save AGORA, sem esperar uma mudanca de estado disparar o
// `persist`. Necessario nos pontos de saida da pagina: navegadores mobile
// matam uma aba em segundo plano sem nunca disparar `beforeunload`, e
// `savedAt` e exatamente o que o Farm Offline usa pra medir o tempo fora —
// um save velho vira tempo offline contado a mais. Devolve false quando o
// armazenamento esta bloqueado (Safari em navegacao privada, por exemplo),
// pra quem chama poder avisar em vez de falhar em silencio.
export function forceSave(): boolean {
  // Assinatura sincrona mantida de proposito: e chamada de dentro do tick do
  // jogo e de handlers de visibilidade, em ~8 pontos que nao teriam o que
  // fazer com uma Promise. A escrita em si e assincrona (rede) e reporta
  // falha pelo callback de `gameStatePersistence`, nao pelo retorno.
  //
  // O `true` aqui significa "flush disparado", nao "gravado" — diferente do
  // tempo do localStorage, onde os dois eram a mesma coisa. Para o ponto onde
  // isso importa de verdade (pagina fechando), ver `flushPlayerRowOnUnload`.
  void flushAgora()
  return true
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
  // Vem de `players.updated_at` (no load) ou do relogio local (a cada
  // escrita) — ver gameStatePersistence. Nota que importa pro Farm Offline:
  // o `updated_at` e carimbado pelo RELOGIO DO SERVIDOR, entao o tempo fora
  // calculado agora e imune a relogio de aparelho adiantado/atrasado, que era
  // uma fonte real de gap absurdo na versao localStorage.
  return ultimoSavedAt()
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
        // Sob autoridade do servidor, ESTA captura e predicao: quem grava e o
        // flush, com `uid` proprio. Marcar aqui — no unico ponto do cliente por
        // onde toda captura passa — e o que permite trocar a predicao pela
        // linha real sem exibir o mesmo POKE duas vezes. Ver
        // `predicoesDeCaptura.ts`.
        registrarCapturaPredita(pokeInstance.uid)
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
        // Tira o status junto com o HP: e o que o Centro Pokemon faz nos jogos,
        // e sem isso o jogador sairia do Hospital com o POKE de HP cheio e
        // ainda envenenado — que e exatamente o estado que ele foi la resolver.
        set((state) => ({
          team: state.team.map((poke) => ({ ...poke, hp: poke.stats.hp, status: null })),
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

      setAutoStatusItem: (itemId, enabled) => {
        set((state) => ({ autoStatusConfig: { ...state.autoStatusConfig, [itemId]: enabled } }))
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

      setActiveAbilities: (pokeUid, abilityIds) => {
        get().updatePokeInstance(pokeUid, (poke) => ({ ...poke, activeAbilities: [...abilityIds] }))
      },

      resetToDefaults: () => set(defaultGameStateData()),
    }),
    {
      name: SAVE_KEY,
      // Postgres, nao mais localStorage. O adaptador (data/remote/
      // gameStatePersistence.ts) precisa saber QUEM esta logado antes de
      // poder ler/escrever, e isso so existe depois do login — por isso
      // `skipHydration`: quem chama `hidratarProgresso()` apos a sessao
      // resolver e o bootstrap em features/game, nao o carregamento deste
      // modulo.
      storage: postgresStorage,
      skipHydration: true,
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
          autoToggles: { ...defaultGameStateData().autoToggles, ...(persisted.autoToggles || {}) },
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
          // As faixas iniciais entram SEMPRE, nao so como default: um save
          // escrito antes desta leva guarda os grupos antigos e sem isto o
          // jogador ficaria sem hunt nenhuma.
          //
          // Os tres grupos legados sao TRADUZIDOS, nao carregados adiante:
          // 'kanto' era o que o Lance liberava, entao vira o que ele libera
          // hoje; 'johto' vira as faixas iniciais; e 'nightmare' antigo e
          // DESCARTADO — ele nascia aberto pra todo mundo, e mante-lo daria
          // de graca o conteudo que acabou de virar gate do Lance. Espelha
          // a migration 20260814120000.
          unlockedContinents: [...new Set([
            ...FAIXAS_INICIAIS,
            ...(persisted.unlockedContinents || []).flatMap((c) =>
              c === 'kanto' ? GRUPOS_DO_LANCE : GRUPOS_LEGADOS.has(c) ? [] : [c]),
          ])],
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
