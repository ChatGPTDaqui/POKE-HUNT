// Adaptador que faz um `GameStateData` puro se comportar como a store do
// navegador, pra o motor rodar no servidor sem saber que trocou de casa.
//
// Por que implementar a interface INTEIRA em vez de so o que a simulacao usa
// hoje: o tipo `GameStateStore` vem do `headless.ts`, entao esquecer um metodo
// quebra o type-check aqui, agora — e nao dentro de uma simulacao de 6 horas em
// producao, com o jogador esperando o resultado.
//
// As acoes que o motor NUNCA chama durante simulacao (comprar, vender, mexer em
// regra de auto, resetar o jogo) sao implementadas mesmo assim, mas como
// operacoes sobre o dado local: elas nao tem efeito colateral no banco porque
// quem grava e o `flush` no fim, a partir do estado final. Nada aqui escreve
// direto no Postgres — um `addGold` que fizesse UPDATE por kill geraria milhares
// de escritas por sessao.
import { MAX_TEAM_SIZE } from '#engine'
import type {
  GameStateData, GameStateStore, PokeInstance,
} from '#engine'

type AutoPotRule = GameStateData['autoPotRules'][number]
type AutoCatchRule = GameStateData['autoCatchRules'][number]

export interface EstadoDoJogador {
  /** O que o motor recebe onde o navegador passaria a store. */
  store: GameStateStore
  /** O dado cru, pra gravar no banco depois da simulacao. */
  dados: GameStateData
}

export function criarEstadoDoJogador(dados: GameStateData): EstadoDoJogador {
  // Clone defensivo: o motor muta POKE em lugar durante o combate, e o objeto
  // que chegou aqui veio de JSON.parse da resposta do PostgREST — nao quero que
  // uma simulacao abortada no meio deixe o objeto de entrada meio-escrito.
  const s: GameStateData = structuredClone(dados)

  const acharPoke = (uid: string): { lista: PokeInstance[]; indice: number } | null => {
    const iTime = s.team.findIndex((p) => p.uid === uid)
    if (iTime >= 0) return { lista: s.team, indice: iTime }
    const iBag = s.bagPokes.findIndex((p) => p.uid === uid)
    if (iBag >= 0) return { lista: s.bagPokes, indice: iBag }
    return null
  }

  const store: GameStateStore = {
    // ----- dado -----
    // Getters, e nao copia: o motor le `gameState.team` DEPOIS de ter chamado
    // acoes que mexem nele (capturar, evoluir). Uma copia congelada no momento
    // da criacao faria o motor enxergar um time desatualizado no meio da luta.
    get team() { return s.team },
    get activeIndex() { return s.activeIndex },
    get bagPokes() { return s.bagPokes },
    get items() { return s.items },
    get lockedItems() { return s.lockedItems },
    get wallet() { return s.wallet },
    get unlockedMaps() { return s.unlockedMaps },
    get currentMapId() { return s.currentMapId },
    get autoToggles() { return s.autoToggles },
    get autoPotRules() { return s.autoPotRules },
    get autoCatchConfig() { return s.autoCatchConfig },
    get autoCatchRules() { return s.autoCatchRules },
    get autoStatusConfig() { return s.autoStatusConfig },
    get perfStats() { return s.perfStats },
    get trainer() { return s.trainer },
    get pokedexKills() { return s.pokedexKills },
    get unlockedContinents() { return s.unlockedContinents },

    // ----- acoes que a simulacao realmente usa -----
    setActiveIndex: (index) => { s.activeIndex = index },
    addItem: (itemId, qty = 1) => { s.items[itemId] = (s.items[itemId] || 0) + qty },
    hasItem: (itemId, qty = 1) => (s.items[itemId] || 0) >= qty,
    removeItem: (itemId, qty = 1) => {
      if ((s.items[itemId] || 0) < qty) return false
      s.items[itemId] -= qty
      if (s.items[itemId] <= 0) delete s.items[itemId]
      return true
    },
    addGold: (amount) => { s.wallet.gold += amount },
    spendGold: (amount) => {
      if (s.wallet.gold < amount) return false
      s.wallet.gold -= amount
      return true
    },
    addDiamonds: (amount) => { s.wallet.diamonds += amount },
    spendDiamonds: (amount) => {
      if (s.wallet.diamonds < amount) return false
      s.wallet.diamonds -= amount
      return true
    },
    addCapturedPoke: (poke) => { s.bagPokes.push(poke); return 'bag' },
    toggleItemLock: (itemId) => {
      if (s.lockedItems[itemId]) delete s.lockedItems[itemId]
      else s.lockedItems[itemId] = true
    },
    isItemLocked: (itemId) => Boolean(s.lockedItems[itemId]),
    unlockMap: (mapId) => { if (!s.unlockedMaps.includes(mapId)) s.unlockedMaps.push(mapId) },
    isMapUnlocked: (mapId) => s.unlockedMaps.includes(mapId),
    unlockContinent: (c) => { if (!s.unlockedContinents.includes(c)) s.unlockedContinents.push(c) },
    isContinentUnlocked: (c) => s.unlockedContinents.includes(c),
    healTeamFully: () => { s.team = s.team.map((p) => ({ ...p, hp: p.stats.hp })) },
    setCurrentMapId: (mapId) => { s.currentMapId = mapId },
    addPokeToTeam: (poke) => { s.team.push(poke) },
    moveTeamIndexToFront: (index) => {
      if (index <= 0 || index >= s.team.length) return
      const [p] = s.team.splice(index, 1)
      s.team.unshift(p)
      s.activeIndex = 0
    },
    moveTeamToBag: (uid) => {
      const i = s.team.findIndex((p) => p.uid === uid)
      if (i < 0 || s.team.length <= 1) return null
      const [p] = s.team.splice(i, 1)
      s.bagPokes.push(p)
      if (s.activeIndex >= s.team.length) s.activeIndex = s.team.length - 1
      return p
    },
    moveBagToTeam: (uid) => {
      // O limite de 6 existia SO na store do navegador. Sob autoridade do
      // servidor o cliente nao executa nada — quem move e este adaptador —,
      // entao a regra simplesmente nao valia aqui. O que segurava era a check
      // `team_slot <= 5` do banco, que so estoura na hora de GRAVAR: o jogador
      // levava um 502 "falha ao falar com o banco" no 7o POKE, e (antes do
      // `comEstadoParaEscrita`) esse mesmo erro ainda engolia as entregas do
      // Mercado ja reivindicadas naquele request.
      if (s.team.length >= MAX_TEAM_SIZE) return null
      const i = s.bagPokes.findIndex((p) => p.uid === uid)
      if (i < 0) return null
      const [p] = s.bagPokes.splice(i, 1)
      s.team.push(p)
      return p
    },
    removeBagPoke: (uid) => {
      const i = s.bagPokes.findIndex((p) => p.uid === uid)
      if (i < 0) return null
      return s.bagPokes.splice(i, 1)[0]
    },
    removeBagPokes: (uids) => {
      const alvo = new Set(uids)
      const removidos = s.bagPokes.filter((p) => alvo.has(p.uid))
      s.bagPokes = s.bagPokes.filter((p) => !alvo.has(p.uid))
      return removidos
    },
    updatePokeInstance: (uid, updater) => {
      const achado = acharPoke(uid)
      if (achado) achado.lista[achado.indice] = updater(achado.lista[achado.indice])
    },
    setTrainer: (trainer) => { s.trainer = trainer },
    resetPerfStats: () => { s.perfStats = { gold: 0, xp: 0, mobs: 0, shinys: 0, since: Date.now() } },
    incrementPerfStats: (delta) => {
      s.perfStats.gold += delta.gold
      s.perfStats.xp += delta.xp
      s.perfStats.mobs += delta.mobs
      s.perfStats.shinys += delta.shinys
    },
    setPokedexKillEntry: (speciesId, entry) => { s.pokedexKills[speciesId] = entry },

    // ----- acoes de UI: existem pro tipo fechar, nao sao usadas na simulacao -----
    setAutoToggle: (key, value) => { s.autoToggles[key] = value },
    addAutoPotRule: (rule: AutoPotRule) => { s.autoPotRules.push(rule) },
    updateAutoPotRule: (index, patch) => {
      if (s.autoPotRules[index]) s.autoPotRules[index] = { ...s.autoPotRules[index], ...patch }
    },
    removeAutoPotRule: (index) => { s.autoPotRules.splice(index, 1) },
    setAutoCatchConfig: (patch) => { s.autoCatchConfig = { ...s.autoCatchConfig, ...patch } },
    addAutoCatchRule: (rule: AutoCatchRule) => { s.autoCatchRules.push(rule) },
    updateAutoCatchRule: (index, patch) => {
      if (s.autoCatchRules[index]) s.autoCatchRules[index] = { ...s.autoCatchRules[index], ...patch }
    },
    removeAutoCatchRule: (index) => { s.autoCatchRules.splice(index, 1) },
    toggleAbilityDisabled: (pokeUid, abilityId) => {
      const achado = acharPoke(pokeUid)
      if (!achado) return
      const poke = achado.lista[achado.indice]
      // `disabledAbilities` e um mapa `{ [abilityId]: true }`, nao uma lista —
      // mesma forma que a store do navegador grava.
      const desligadas = { ...(poke.disabledAbilities || {}) }
      if (desligadas[abilityId]) delete desligadas[abilityId]
      else desligadas[abilityId] = true
      achado.lista[achado.indice] = { ...poke, disabledAbilities: desligadas }
    },
    setActiveAbilities: (pokeUid, abilityIds) => {
      const achado = acharPoke(pokeUid)
      if (!achado) return
      achado.lista[achado.indice] = { ...achado.lista[achado.indice], activeAbilities: [...abilityIds] }
    },
    // Resetar o jogo NAO e uma operacao que o servidor deva expor via
    // simulacao. Estoura de proposito: se algum caminho chamar isto durante um
    // flush, quero o erro, nao a conta do jogador zerada em silencio.
    resetToDefaults: () => {
      throw new Error('resetToDefaults nao pode ser chamado durante uma simulacao no servidor')
    },
  }

  return { store, dados: s }
}
