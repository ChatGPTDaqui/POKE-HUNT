// As acoes que um jogador pode pedir, e o que o servidor aceita fazer.
//
// UM endpoint com uma lista branca, e nao 20 endpoints: o que precisa ser
// auditavel aqui e "quais mutacoes existem", e isso fica legivel numa lista so.
//
// REGRA QUE NAO PODE SER QUEBRADA: nenhuma acao recebe um VALOR de resultado do
// cliente. O cliente diz "quero comprar 5 pocoes"; o preco sai do catalogo no
// servidor. Se alguma acao futura aceitar "some X ao meu ouro", a autoridade
// acabou ali — o resto deste arquivo vira teatro.
//
// Por isso tambem NAO existe acao pra `addGold`, `addItem`, `setTrainer`,
// `incrementPerfStats` nem `resetToDefaults`, mesmo que o adaptador implemente
// esses metodos (ele implementa pra satisfazer o tipo do motor, ver
// estadoDoJogador.ts). Ganho de ouro/XP/item so nasce de simulacao.
import {
  SPECIES, MAPS, getMap, getItem, createPokeInstance, createRng, randomSeed,
  buyItem, sellItem, sellAllItems, sellBagPoke, sellAllBagPokes, unlockMap,
  evolvePokeInstance, defaultGameStateData,
  type GameStateData, type GameStateStore,
} from '#engine'
import { ErroHttp } from './db.js'

// Iguais aos do cliente (engine/simulation.ts): a primeira POKE de uma run nova
// nao pode ser um outlier de sorte.
const STARTER_LEVEL = 1
const STARTER_RARITY = 'comum'
const STARTER_IVS = { hp: 23, atkFis: 23, atkEsp: 23, def: 23, defEsp: 23, speed: 23 }
const STARTERS_PERMITIDOS = new Set(['charmander', 'squirtle', 'bulbasaur'])

export interface Acao {
  tipo: string
  [k: string]: unknown
}

export interface ResultadoAcao {
  ok: boolean
  mensagem?: string
}

const inteiroPositivo = (v: unknown, padrao = 1): number => {
  const n = Number(v ?? padrao)
  if (!Number.isInteger(n) || n <= 0 || n > 1_000_000) throw new ErroHttp(400, 'quantidade invalida')
  return n
}
const texto = (v: unknown, campo: string): string => {
  if (typeof v !== 'string' || !v || v.length > 200) throw new ErroHttp(400, `${campo} invalido`)
  return v
}

// buyItem/sellItem/unlockMap devolvem um CODIGO (`insufficient_gold`, ...), nao
// uma frase. Sob autoridade do servidor o cliente nao executa a acao — ele so
// mostra a mensagem que volta daqui —, entao o codigo cru vazava pro chat
// ("insufficient_gold" aparecia pro jogador). Traduzido no unico lugar por onde
// esses erros saem.
const MENSAGEM_ERRO_ECONOMIA: Record<string, string> = {
  insufficient_gold: 'Ouro insuficiente.',
  insufficient_quantity: 'Voce nao tem itens suficientes.',
  unknown_item: 'Item desconhecido.',
  locked: 'Este item esta travado — destrave antes de vender.',
  not_found: 'POKE nao encontrado.',
  already_unlocked: 'Esta hunt ja esta desbloqueada.',
}
const traduzErroEconomia = (reason: string | undefined, padrao: string): string =>
  (reason && MENSAGEM_ERRO_ECONOMIA[reason]) || padrao

type Manipulador = (store: GameStateStore, estado: GameStateData, acao: Acao) => ResultadoAcao

const MANIPULADORES: Record<string, Manipulador> = {
  escolherStarter(store, estado, acao) {
    const speciesId = texto(acao.speciesId, 'speciesId')
    // Lista branca explicita: sem ela, "escolher starter" viraria "me da um
    // Mewtwo nivel 1 de graca".
    if (!STARTERS_PERMITIDOS.has(speciesId)) throw new ErroHttp(403, 'essa especie nao e um inicial')
    if (estado.team.length > 0 || estado.bagPokes.length > 0) {
      throw new ErroHttp(409, 'voce ja tem um POKE')
    }
    const poke = createPokeInstance(createRng(randomSeed()), speciesId, STARTER_LEVEL, {
      ivs: STARTER_IVS, rarity: STARTER_RARITY,
    })
    store.addPokeToTeam(poke)
    store.setActiveIndex(0)
    return { ok: true, mensagem: `${SPECIES[speciesId].name} entrou na sua equipe!` }
  },

  // Recomecar do zero. E a UNICA acao destrutiva exposta, e existe porque sem
  // ela o botao "Apagar e recomecar" MENTIA: o cliente zerava o estado local, o
  // servidor recusava a escrita (RLS) e o progresso voltava no proximo
  // carregamento — com direito a modal de confirmacao dando a entender que tinha
  // funcionado.
  //
  // Zera pelo mesmo `defaultGameStateData()` que o jogo usa pra conta nova, em
  // vez de uma lista de campos escrita a mao aqui: campo novo no jogo entra no
  // reset sozinho, sem ninguem lembrar de vir atualizar isto.
  reiniciarJogo(store, estado) {
    const zerado = defaultGameStateData() as unknown as Record<string, unknown>
    const alvo = estado as unknown as Record<string, unknown>
    for (const chave of Object.keys(zerado)) alvo[chave] = structuredClone(zerado[chave])
    void store
    return { ok: true, mensagem: 'Progresso apagado. Escolha um novo inicial.' }
  },

  // As mensagens sao montadas AQUI, e nao no cliente, porque sob autoridade do
  // servidor o cliente nao executa a acao — ele nao sabe o preco cobrado nem se
  // deu certo. Antes de existirem, a Loja mostrava "Comprou" a partir de um
  // literal fixo escrito antes da chamada, ou seja, dizia o mesmo tendo ouro ou
  // nao. Uma acao que muda a carteira sem dizer nada e igualmente ruim: o
  // jogador ve o saldo cair sem confirmacao do que aconteceu.
  comprarItem(store, _estado, acao) {
    const itemId = texto(acao.itemId, 'itemId')
    const qtd = inteiroPositivo(acao.qtd)
    const item = getItem(itemId)
    const r = buyItem(store, itemId, qtd)
    if (!r.success) throw new ErroHttp(409, traduzErroEconomia(r.reason, 'Compra recusada.'))
    const custo = item && 'buyPrice' in item ? item.buyPrice * qtd : 0
    return { ok: true, mensagem: `Comprou ${item?.name ?? itemId} x${qtd} por ${custo} de ouro.` }
  },

  venderItem(store, _estado, acao) {
    const itemId = texto(acao.itemId, 'itemId')
    const qtd = inteiroPositivo(acao.qtd)
    const item = getItem(itemId)
    const r = sellItem(store, itemId, qtd)
    if (!r.success) throw new ErroHttp(409, traduzErroEconomia(r.reason, 'Venda recusada.'))
    return { ok: true, mensagem: `Vendeu ${item?.name ?? itemId} x${qtd} por ${(item?.sellPrice ?? 0) * qtd} de ouro.` }
  },

  venderTodosItens(store) {
    const r = sellAllItems(store)
    return { ok: true, mensagem: `Vendeu ${r.itemCount} itens por ${r.gold} de ouro.` }
  },

  venderPoke(store, _estado, acao) {
    const uid = texto(acao.pokeUid, 'pokeUid')
    const r = sellBagPoke(store, uid)
    if (!r.success) throw new ErroHttp(409, traduzErroEconomia(r.reason, 'Venda recusada.'))
    return { ok: true, mensagem: `Vendido por ${r.value} de ouro.` }
  },

  venderPokes(store, _estado, acao) {
    const uids = Array.isArray(acao.pokeUids) ? acao.pokeUids.map((u) => texto(u, 'pokeUid')) : []
    if (!uids.length) throw new ErroHttp(400, 'nenhum POKE informado')
    const r = sellAllBagPokes(store, uids)
    return { ok: true, mensagem: `Vendeu ${r.pokeCount} POKEs por ${r.gold} de ouro.` }
  },

  usarItem(store, estado, acao) {
    const itemId = texto(acao.itemId, 'itemId')
    const item = getItem(itemId)
    if (!item) throw new ErroHttp(400, 'item desconhecido')
    const ativo = estado.team[estado.activeIndex]
    if (!ativo) throw new ErroHttp(409, 'nenhum POKE ativo')

    if (item.kind === 'potion' && item.healAmount != null) {
      if (ativo.hp <= 0) throw new ErroHttp(409, 'POKE desmaiado — use um Revive')
      if (!store.removeItem(itemId, 1)) throw new ErroHttp(409, 'voce nao tem esse item')
      store.updatePokeInstance(ativo.uid, (p) => ({
        ...p, hp: Math.min(p.stats.hp, p.hp + item.healAmount!),
      }))
      return { ok: true, mensagem: `Usou ${item.name}.` }
    }
    if (item.kind === 'revive' && item.reviveHpPercent != null) {
      if (ativo.hp > 0) throw new ErroHttp(409, 'o POKE ja esta consciente')
      if (!store.removeItem(itemId, 1)) throw new ErroHttp(409, 'voce nao tem esse item')
      store.updatePokeInstance(ativo.uid, (p) => ({
        ...p, hp: Math.max(1, Math.round(p.stats.hp * item.reviveHpPercent!)),
      }))
      return { ok: true, mensagem: 'POKE reanimado!' }
    }
    throw new ErroHttp(400, 'esse item nao pode ser usado assim')
  },

  curarEquipe(store) {
    store.healTeamFully()
    return { ok: true, mensagem: 'Equipe curada!' }
  },

  evoluirPoke(store, estado, acao) {
    const uid = texto(acao.pokeUid, 'pokeUid')
    const poke = [...estado.team, ...estado.bagPokes].find((p) => p.uid === uid)
    if (!poke) throw new ErroHttp(404, 'POKE nao encontrado')
    const anterior = SPECIES[poke.speciesId].name
    const r = evolvePokeInstance(poke, store)
    if (!r) throw new ErroHttp(409, 'este POKE ainda nao pode evoluir')
    if ('blocked' in r) {
      const item = getItem(r.required.itemId)
      throw new ErroHttp(409, `faltam ${r.required.count}x ${item?.name ?? r.required.itemId}`)
    }
    store.updatePokeInstance(uid, () => r.updatedPoke)
    return { ok: true, mensagem: `${anterior} evoluiu para ${r.species.name}!` }
  },

  definirAtivo(store, estado, acao) {
    const indice = Number(acao.indice)
    if (!Number.isInteger(indice) || indice < 0 || indice >= estado.team.length) {
      throw new ErroHttp(400, 'indice fora da equipe')
    }
    store.moveTeamIndexToFront(indice)
    return { ok: true }
  },

  tirarDaEquipe(store, estado, acao) {
    const uid = texto(acao.pokeUid, 'pokeUid')
    if (estado.team.length <= 1) throw new ErroHttp(409, 'voce precisa manter ao menos 1 POKE na equipe')
    const poke = estado.team.find((p) => p.uid === uid)
    if (!store.moveTeamToBag(uid)) throw new ErroHttp(404, 'POKE nao esta na equipe')
    const nome = poke ? SPECIES[poke.speciesId]?.name : null
    return { ok: true, mensagem: `${nome ?? 'POKE'} foi para a mochila.` }
  },

  porNaEquipe(store, estado, acao) {
    const uid = texto(acao.pokeUid, 'pokeUid')
    const poke = estado.bagPokes.find((p) => p.uid === uid)
    if (!store.moveBagToTeam(uid)) throw new ErroHttp(404, 'POKE nao esta na mochila')
    const nome = poke ? SPECIES[poke.speciesId]?.name : null
    return { ok: true, mensagem: `${nome ?? 'POKE'} entrou na equipe.` }
  },

  desbloquearHunt(store, _estado, acao) {
    const mapId = texto(acao.mapId, 'mapId')
    const mapa = MAPS[mapId] && getMap(mapId)
    if (!mapa) throw new ErroHttp(400, 'hunt desconhecida')
    const r = unlockMap(store, mapa)
    if (!r.success) throw new ErroHttp(409, traduzErroEconomia(r.reason, 'Recursos insuficientes.'))
    return { ok: true, mensagem: `${mapa.name} desbloqueada!` }
  },

  alternarTravaItem(store, _estado, acao) {
    store.toggleItemLock(texto(acao.itemId, 'itemId'))
    return { ok: true }
  },

  alternarTravaPoke(store, estado, acao) {
    const uid = texto(acao.pokeUid, 'pokeUid')
    const poke = [...estado.team, ...estado.bagPokes].find((p) => p.uid === uid)
    if (!poke) throw new ErroHttp(404, 'POKE nao encontrado')
    store.updatePokeInstance(uid, (p) => ({ ...p, locked: !p.locked }))
    return { ok: true }
  },

  alternarHabilidade(store, _estado, acao) {
    store.toggleAbilityDisabled(texto(acao.pokeUid, 'pokeUid'), texto(acao.abilityId, 'abilityId'))
    return { ok: true }
  },

  // Configuracao de automacao: nao move economia, mas MUDA O RESULTADO da
  // simulacao (o servidor le estas regras quando decide usar pocao ou bola), e
  // por isso precisa viver no servidor como todo o resto.
  configurarAuto(store, _estado, acao) {
    const patch = acao.patch as Record<string, unknown> | undefined
    if (!patch || typeof patch !== 'object') throw new ErroHttp(400, 'patch invalido')
    if ('toggles' in patch) {
      for (const [k, v] of Object.entries(patch.toggles as Record<string, boolean>)) {
        if (k !== 'autoPot' && k !== 'autoCatch' && k !== 'autoRevive') throw new ErroHttp(400, `toggle desconhecido: ${k}`)
        store.setAutoToggle(k, Boolean(v))
      }
    }
    if ('catchConfig' in patch) store.setAutoCatchConfig(patch.catchConfig as never)
    if ('potRules' in patch) {
      const regras = patch.potRules as unknown[]
      if (!Array.isArray(regras)) throw new ErroHttp(400, 'potRules invalido')
      while (_estado.autoPotRules.length) store.removeAutoPotRule(0)
      for (const r of regras) store.addAutoPotRule(r as never)
    }
    if ('catchRules' in patch) {
      const regras = patch.catchRules as unknown[]
      if (!Array.isArray(regras)) throw new ErroHttp(400, 'catchRules invalido')
      while (_estado.autoCatchRules.length) store.removeAutoCatchRule(0)
      for (const r of regras) store.addAutoCatchRule(r as never)
    }
    return { ok: true }
  },
}

export const ACOES_CONHECIDAS = Object.keys(MANIPULADORES)

export function aplicarAcao(store: GameStateStore, estado: GameStateData, acao: Acao): ResultadoAcao {
  const manipulador = MANIPULADORES[acao?.tipo]
  if (!manipulador) throw new ErroHttp(400, `acao desconhecida: ${String(acao?.tipo)}`)
  return manipulador(store, estado, acao)
}
