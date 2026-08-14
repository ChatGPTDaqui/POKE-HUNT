// Substitui `servidor.acao(...)` (HTTP pro server Node/Edge) por chamadas RPC
// diretas no Postgres (`supabase.rpc(...)`), migracao RPC-everything.
//
// Diferenca de contrato com o server antigo: uma RPC devolve so `{ok, mensagem}`,
// nunca o estado inteiro do jogador. Por isso cada `tipo` de acao carrega o seu
// proprio refetch CIRURGICO (so as tabelas/colunas que aquela acao pode ter
// mudado) em vez de um `aplicarEstadoDoServidor` generico — decisao tomada com
// o usuario pra nao pagar o preco de reconsultar equipe+mochila+pokedex
// inteiros numa acao tao pequena quanto travar um item.
import { supabase } from '@/lib/supabase'
import { rowToPoke } from './playerMapper'
import { useGameStateStore, type GameStateData } from '@/stores/gameStateStore'
import { ErroServidor } from './servidor'

type Acao = { tipo: string } & Record<string, unknown>
type RespostaRpc = { data: unknown; error: { message: string; code?: string } | null }

function statusPorErrcode(code: string | undefined): number {
  // '28000' = nao autenticado, '42501' = sem permissao (checagem de dono
  // falhou). O resto cai em 409 — mesma semantica generica de "acao recusada"
  // que o server antigo usava pras mensagens de negocio (ouro insuficiente,
  // POKE travado, etc), que hoje vem prontas em portugues no `message` da RPC.
  if (code === '28000') return 401
  if (code === '42501') return 403
  return 409
}

async function userIdAtual(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new ErroServidor(401, 'sem sessao — faca login de novo')
  return id
}

function upsertPorUid<T extends { uid: string }>(lista: T[], item: T): T[] {
  const idx = lista.findIndex((p) => p.uid === item.uid)
  if (idx === -1) return [...lista, item]
  const copia = [...lista]
  copia[idx] = item
  return copia
}

// --- refetches cirurgicos, um por "fatia" de dado afetada -------------------

async function refetchGold(): Promise<void> {
  const uid = await userIdAtual()
  const { data } = await supabase.from('players').select('gold, diamonds').eq('user_id', uid).maybeSingle()
  if (!data) return
  useGameStateStore.setState((s) => ({ wallet: { ...s.wallet, gold: data.gold, diamonds: data.diamonds } }))
}

async function refetchJogador(): Promise<void> {
  const uid = await userIdAtual()
  const { data } = await supabase
    .from('players')
    .select('gold, diamonds, unlocked_maps, auto_toggles, auto_pot_rules, auto_catch_config')
    .eq('user_id', uid)
    .maybeSingle()
  if (!data) return
  useGameStateStore.setState((s) => ({
    wallet: { ...s.wallet, gold: data.gold, diamonds: data.diamonds },
    unlockedMaps: data.unlocked_maps ?? s.unlockedMaps,
    autoToggles: (data.auto_toggles as GameStateData['autoToggles'] | null) ?? s.autoToggles,
    autoPotRules: (data.auto_pot_rules as GameStateData['autoPotRules'] | null) ?? s.autoPotRules,
    autoCatchConfig: (data.auto_catch_config as GameStateData['autoCatchConfig'] | null) ?? s.autoCatchConfig,
  }))
}

async function refetchItem(itemId: string): Promise<void> {
  const uid = await userIdAtual()
  const { data } = await supabase
    .from('player_items')
    .select('quantity, locked')
    .eq('user_id', uid)
    .eq('item_id', itemId)
    .maybeSingle()
  useGameStateStore.setState((s) => {
    const lockedItems = { ...s.lockedItems }
    if (data?.locked) lockedItems[itemId] = true
    else delete lockedItems[itemId]
    return { items: { ...s.items, [itemId]: data?.quantity ?? 0 }, lockedItems }
  })
}

async function refetchTodosItens(): Promise<void> {
  const uid = await userIdAtual()
  const { data } = await supabase.from('player_items').select('item_id, quantity').eq('user_id', uid)
  const items: Record<string, number> = {}
  for (const row of data ?? []) items[row.item_id] = row.quantity
  useGameStateStore.setState({ items })
}

async function refetchPoke(pokeId: string): Promise<void> {
  const { data } = await supabase.from('pokemon_instances').select('*').eq('id', pokeId).maybeSingle()
  useGameStateStore.setState((s) => {
    if (!data) {
      // Vendido/removido: some das duas listas, seja onde estivesse.
      return { team: s.team.filter((p) => p.uid !== pokeId), bagPokes: s.bagPokes.filter((p) => p.uid !== pokeId) }
    }
    const poke = rowToPoke(data)
    if (data.location === 'team') {
      return { team: upsertPorUid(s.team, poke), bagPokes: s.bagPokes.filter((p) => p.uid !== pokeId) }
    }
    return { bagPokes: upsertPorUid(s.bagPokes, poke), team: s.team.filter((p) => p.uid !== pokeId) }
  })
}

async function refetchEquipeInteira(): Promise<void> {
  const uid = await userIdAtual()
  // `order('team_slot')` e obrigatorio: `definirAtivo` reordena os slots pra
  // trazer o POKE escolhido pro topo (slot 0), e o resto do app assume
  // `team[0]` = ativo (ver controller.ts#setActiveTeamIndex). Sem o order, o
  // Postgres devolve em ordem arbitraria e o campo so mostrava o POKE certo
  // depois de um F5 (que recarrega ordenado por outro caminho).
  const { data } = await supabase
    .from('pokemon_instances')
    .select('*')
    .eq('user_id', uid)
    .eq('location', 'team')
    .order('team_slot', { ascending: true })
  useGameStateStore.setState({ team: (data ?? []).map(rowToPoke) })
}

function removerPokes(pokeIds: string[]): void {
  const idsFora = new Set(pokeIds)
  useGameStateStore.setState((s) => ({
    team: s.team.filter((p) => !idsFora.has(p.uid)),
    bagPokes: s.bagPokes.filter((p) => !idsFora.has(p.uid)),
  }))
}

/** So pra escolherStarter/reiniciarJogo: os 2 casos em que TUDO muda de fato. */
async function refetchTudo(): Promise<void> {
  const uid = await userIdAtual()
  const { loadPlayerState } = await import('./playerRepository')
  const resultado = await loadPlayerState(uid, useGameStateStore.getState() as GameStateData)
  if (resultado) useGameStateStore.setState(resultado.data)
}

// --- despacho por tipo de acao -----------------------------------------------

interface Despacho {
  chamar: (acao: Acao) => Promise<RespostaRpc>
  aoSucesso: (acao: Acao) => Promise<void>
}

// `database.types.ts` so conhece as funcoes do schema `public` (geradas antes
// desta migracao). As RPCs novas vivem em `dev` (temporario — promover pra
// `public` e decisao separada, ver _Architecture.md) e o gerador nao sabe
// delas ainda. Cast local em vez de regenerar o arquivo inteiro no meio da
// migracao — regenerar de novo na promocao seria retrabalho duplicado.
type RpcDinamica = (nome: string, params: Record<string, unknown>) => Promise<RespostaRpc>
const rpcDinamica = supabase.rpc.bind(supabase) as unknown as RpcDinamica

function rpc(nome: string, params: (acao: Acao) => Record<string, unknown>): Despacho['chamar'] {
  return (acao) => rpcDinamica(nome, params(acao))
}

const DESPACHO: Record<string, Despacho> = {
  comprarItem: {
    chamar: rpc('comprar_item', (a) => ({ p_item_id: a.itemId, p_qtd: a.qtd })),
    aoSucesso: async (a) => { await Promise.all([refetchGold(), refetchItem(a.itemId as string)]) },
  },
  venderItem: {
    chamar: rpc('vender_item', (a) => ({ p_item_id: a.itemId, p_qtd: a.qtd })),
    aoSucesso: async (a) => { await Promise.all([refetchGold(), refetchItem(a.itemId as string)]) },
  },
  venderTodosItens: {
    chamar: rpc('vender_todos_itens', () => ({})),
    aoSucesso: async () => { await Promise.all([refetchGold(), refetchTodosItens()]) },
  },
  usarItem: {
    chamar: rpc('usar_item', (a) => ({ p_item_id: a.itemId })),
    aoSucesso: async (a) => { await Promise.all([refetchItem(a.itemId as string), refetchEquipeInteira()]) },
  },
  venderPokes: {
    chamar: rpc('vender_pokes', (a) => ({ p_poke_ids: a.pokeUids })),
    aoSucesso: async (a) => {
      const ids = a.pokeUids as string[]
      removerPokes(ids)
      await refetchGold()
    },
  },
  curarEquipe: {
    chamar: rpc('curar_equipe', () => ({})),
    aoSucesso: async () => { await Promise.all([refetchGold(), refetchEquipeInteira()]) },
  },
  evoluirPoke: {
    chamar: rpc('evoluir_poke', (a) => ({ p_poke_id: a.pokeUid })),
    aoSucesso: async (a) => { await Promise.all([refetchPoke(a.pokeUid as string), refetchTodosItens()]) },
  },
  definirAtivo: {
    // O caller manda `indice` (posicao na equipe local, ver controller.ts
    // moveTeamIndexToFront) — a RPC espera `poke_id` (mesmo padrao de
    // ownership-por-id de todas as outras). Resolve aqui em vez de mudar a
    // RPC ja testada: le a equipe local, pega o uid na posicao pedida.
    chamar: (a) => {
      const indice = Number(a.indice)
      const poke = useGameStateStore.getState().team[indice]
      if (!poke) return Promise.resolve({ data: null, error: { message: 'indice fora da equipe' } })
      return rpcDinamica('definir_ativo', { p_poke_id: poke.uid })
    },
    aoSucesso: async () => { await refetchEquipeInteira() },
  },
  tirarDaEquipe: {
    chamar: rpc('tirar_da_equipe', (a) => ({ p_poke_id: a.pokeUid })),
    aoSucesso: async (a) => { await refetchPoke(a.pokeUid as string) },
  },
  porNaEquipe: {
    chamar: rpc('por_na_equipe', (a) => ({ p_poke_id: a.pokeUid })),
    aoSucesso: async (a) => { await refetchPoke(a.pokeUid as string) },
  },
  alternarTravaPoke: {
    chamar: rpc('alternar_trava_poke', (a) => ({ p_poke_id: a.pokeUid })),
    aoSucesso: async (a) => { await refetchPoke(a.pokeUid as string) },
  },
  alternarTravaItem: {
    chamar: rpc('alternar_trava_item', (a) => ({ p_item_id: a.itemId })),
    aoSucesso: async (a) => { await refetchItem(a.itemId as string) },
  },
  alternarHabilidade: {
    chamar: rpc('alternar_habilidade', (a) => ({ p_poke_id: a.pokeUid, p_ability_id: a.abilityId })),
    aoSucesso: async (a) => { await refetchPoke(a.pokeUid as string) },
  },
  definirGolpesAtivos: {
    chamar: rpc('definir_golpes_ativos', (a) => ({ p_poke_id: a.pokeUid, p_ability_ids: a.abilityIds })),
    aoSucesso: async (a) => { await refetchPoke(a.pokeUid as string) },
  },
  desbloquearHunt: {
    chamar: rpc('desbloquear_hunt', (a) => ({ p_map_id: a.mapId })),
    aoSucesso: async () => { await refetchJogador() },
  },
  definirNomeDoTreinador: {
    chamar: rpc('definir_nome_do_treinador', (a) => ({ p_nome: a.nome })),
    aoSucesso: async () => { await refetchJogador() },
  },
  configurarAuto: {
    // Sem refetch de proposito: `configurar_auto` e passthrough puro (o SQL so
    // grava o patch que o client ja mandou, nada computado do lado do
    // servidor). Um `refetchJogador()` aqui reescreve autoToggles/
    // autoPotRules/autoCatchConfig com objetos NOVOS (mesmo valor, referencia
    // diferente) — o `useEffect` do AutoPanel que observa essas referencias
    // dispara nesse refetch, manda o patch de novo, refetch de novo: loop
    // infinito de configurar_auto sem teto (achado ao vivo em producao,
    // 2026-08-13, centenas de chamadas em segundos).
    chamar: rpc('configurar_auto', (a) => ({ p_patch: a.patch })),
    aoSucesso: async () => {},
  },
  escolherStarter: {
    chamar: rpc('escolher_starter', (a) => ({ p_species_id: a.speciesId })),
    aoSucesso: async () => { await refetchTudo() },
  },
  reiniciarJogo: {
    chamar: rpc('reiniciar_jogo', () => ({})),
    aoSucesso: async () => { await refetchTudo() },
  },
}

/** Substitui `servidor.acao(acao)`. Chama a RPC certa, sincroniza so o que mudou. */
export async function executarAcaoRpc(acao: Acao): Promise<{ mensagem?: string }> {
  const despacho = DESPACHO[acao.tipo]
  if (!despacho) throw new ErroServidor(400, `acao desconhecida: ${acao.tipo}`)
  const { data, error } = await despacho.chamar(acao)
  if (error) throw new ErroServidor(statusPorErrcode(error.code), error.message)
  await despacho.aoSucesso(acao)
  const resultado = data as { mensagem?: string } | null
  return { mensagem: resultado?.mensagem ?? undefined }
}
