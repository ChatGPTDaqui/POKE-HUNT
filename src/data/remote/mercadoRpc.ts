// Mercado sob RPC-everything: leituras via views/RLS publica (dev.mercado_*),
// escritas via as 8 RPCs `dev.*` (ver _Architecture.md, migracao #15).
//
// Mesmos tipos de retorno de `servidor.ts` (a tela ja espera esse formato) —
// so troca de onde o dado vem. RPC nunca devolve `estado` inteiro: cada
// escrita carrega o refetch cirurgico do que ela pode ter mudado (mesma
// decisao tomada com o usuario pro modulo de acoes, ver acoesRpc.ts).
import { supabase } from '@/lib/supabase'
import { ErroServidor } from './servidor'
import { useGameStateStore } from '@/stores/gameStateStore'
import { mochilaCarregada } from '@/stores/mochilaStore'
import { descartarIdsConhecidos } from './playerRepository'
import { COLUNAS_DE_POKE, rowToPoke } from './playerMapper'
import type {
  AnuncioMercado, NegocioMercado, NivelDePreco, OfertaMercado, OfertaRecebida, OrdemMercado, ResumoItemMercado,
} from './servidor'

// Cast local: essas tabelas/views vivem so no schema `dev`, o gerador de tipos
// (`database.types.ts`) so conhece `public` — mesma razao documentada em
// `acoesRpc.ts`. Regenerar contra `dev` e retrabalho duplicado enquanto o
// schema ainda e temporario (promocao pra `public` e decisao separada).
type Linha = Record<string, any>
const db = supabase as unknown as {
  from: (tabela: string) => any
  rpc: (nome: string, params?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

function estourarSeErro(error: { message: string } | null): void {
  if (error) throw new ErroServidor(409, error.message)
}

// Formatador local, e nao o `fmt` de `features/mercado/utils`: importar de
// `features/` dentro de `data/remote/` inverteria a camada — o adaptador de
// dados nao pode depender de tela. Mesma configuracao, dois donos.
const numero = new Intl.NumberFormat('pt-BR')

async function userIdAtual(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new ErroServidor(401, 'sem sessao — faca login de novo')
  return id
}

// --- refetch cirurgico pos-escrita -------------------------------------------

async function refetchCarteira(): Promise<void> {
  const uid = await userIdAtual()
  const { data } = await db.from('players').select('gold, diamonds').eq('user_id', uid).maybeSingle()
  if (!data) return
  useGameStateStore.setState((s) => ({ wallet: { ...s.wallet, gold: data.gold, diamonds: data.diamonds } }))
}

/** Ordens de item so mexem em ouro + mochila, nunca em POKE. */
async function refetchAposOrdem(itemId: string): Promise<void> {
  const uid = await userIdAtual()
  const [{ data: player }, { data: item }] = await Promise.all([
    db.from('players').select('gold, diamonds').eq('user_id', uid).maybeSingle(),
    db.from('player_items').select('quantity').eq('user_id', uid).eq('item_id', itemId).maybeSingle(),
  ])
  useGameStateStore.setState((s) => ({
    wallet: player ? { ...s.wallet, gold: player.gold, diamonds: player.diamonds } : s.wallet,
    items: { ...s.items, [itemId]: item?.quantity ?? 0 },
  }))
}

/** Acoes de anuncio de POKE so mexem em ouro/diamante + mochila (o POKE entra
 *  ou sai dela ao ir/voltar do Mercado — nunca toca a equipe). */
async function refetchAposAnuncio(pokeUid?: string): Promise<void> {
  await refetchCarteira()
  if (!pokeUid) return
  const { data } = await db.from('pokemon_instances').select(COLUNAS_DE_POKE).eq('id', pokeUid).maybeSingle()
  // Sem a mochila carregada nao ha lista local pra reconciliar (ver
  // mochilaStore): inserir um POKE numa lista vazia faria a tela da Mochila
  // mostrar UM POKE numa conta de milhares. A abertura da tela busca a verdade.
  if (!mochilaCarregada()) return
  useGameStateStore.setState((s) => {
    if (!data || data.location !== 'bag') return { bagPokes: s.bagPokes.filter((p) => p.uid !== pokeUid) }
    const poke = rowToPoke(data)
    const idx = s.bagPokes.findIndex((p) => p.uid === pokeUid)
    const bagPokes = idx === -1 ? [...s.bagPokes, poke] : s.bagPokes.map((p, i) => (i === idx ? poke : p))
    return { bagPokes }
  })
}

// --- leituras -----------------------------------------------------------------

export async function mercadoItens(): Promise<{ itens: ResumoItemMercado[] }> {
  const { data, error } = await db.from('mercado_resumo_itens').select('*')
  estourarSeErro(error)
  const itens: ResumoItemMercado[] = (data ?? []).map((r: Linha) => ({
    itemId: r.item_id, melhorCompra: r.melhor_compra, melhorVenda: r.melhor_venda,
    emVenda: r.em_venda, emCompra: r.em_compra,
  }))
  return { itens }
}

function agruparPorPreco(linhas: Linha[]): NivelDePreco[] {
  const porPreco = new Map<number, number>()
  for (const r of linhas) porPreco.set(r.unit_price, (porPreco.get(r.unit_price) ?? 0) + r.remaining)
  return [...porPreco.entries()].map(([unitPrice, quantity]) => ({ unitPrice, quantity }))
}

export async function mercadoLivro(itemId: string) {
  const [vendas, compras, negocios] = await Promise.all([
    db.from('market_orders').select('unit_price, remaining').eq('item_id', itemId).eq('side', 'venda').eq('status', 'ativa').order('unit_price', { ascending: true }).limit(20),
    db.from('market_orders').select('unit_price, remaining').eq('item_id', itemId).eq('side', 'compra').eq('status', 'ativa').order('unit_price', { ascending: false }).limit(20),
    db.from('market_trades').select('*').eq('item_id', itemId).eq('kind', 'item').order('created_at', { ascending: false }).limit(15),
  ])
  estourarSeErro(vendas.error); estourarSeErro(compras.error); estourarSeErro(negocios.error)
  return {
    itemId,
    vendas: agruparPorPreco(vendas.data ?? []).sort((a, b) => a.unitPrice - b.unitPrice),
    compras: agruparPorPreco(compras.data ?? []).sort((a, b) => b.unitPrice - a.unitPrice),
    negocios: (negocios.data ?? []) as NegocioMercado[],
  }
}

/**
 * Filtro da vitrine de POKE (PH-99). Tudo aqui vira predicado SQL — nada e
 * filtrado em memoria depois.
 */
export interface FiltroDaVitrine {
  /** Base zero. */
  pagina: number
  porPagina: number
  /** Casado contra `species_id` — ver a nota em `mercadoPokes`. */
  termo?: string
  moedas?: ('gold' | 'diamond')[]
  raridades?: string[]
  shinyOnly?: boolean
  nivelMin?: number
  ivMin?: number
  soLance?: boolean
  ordem?: 'preco' | 'recente' | 'nivel' | 'iv' | 'termina'
}

/**
 * Uma pagina da vitrine de POKE, com o TOTAL de verdade.
 *
 * ---------------------------------------------------------------------------
 * POR QUE `count: 'exact'` E NAO `data.length`
 * ---------------------------------------------------------------------------
 * `.length` no resultado do PostgREST MENTE acima de 1000 linhas: ele corta e
 * nao avisa. A vitrine ia simplesmente parar de mostrar anuncio, e nada na tela
 * nem no console diria isso — pareceria que o Mercado esta vazio de POKE mais
 * raro. E uma armadilha ja documentada como regra critica do projeto.
 *
 * `count: 'exact'` e o caminho do supabase-js pra `Prefer: count=exact` +
 * leitura do header `Content-Range`, que e exatamente a receita que a regra
 * manda usar — feita pela biblioteca em vez de a mao.
 *
 * ---------------------------------------------------------------------------
 * A BUSCA CASA CONTRA `species_id`, E ISSO NAO E UM ATALHO
 * ---------------------------------------------------------------------------
 * Buscar pelo NOME exigiria juntar `species` na view, e `security_invoker`
 * faria a leitura depender da RLS do catalogo no schema `dev` — que foi clonado
 * fora da trilha de migration e nao da pra afirmar sem conferir no banco.
 *
 * Medido em vez de suposto: das 226 especies do catalogo, 224 tem o nome
 * derivavel do id (`Charmander` <-> `charmander`). As duas excecoes sao
 * `nidoran_f`/`nidoran_m` ("Nidoran♀"/"Nidoran♂"), e as duas casam por
 * prefixo com "nidoran" de qualquer jeito. Ou seja: casar contra o id E casar
 * contra o nome, sem tocar em RLS de catalogo.
 */
export async function mercadoPokes(filtro?: FiltroDaVitrine): Promise<{ anuncios: AnuncioMercado[]; total: number }> {
  const f: FiltroDaVitrine = filtro ?? { pagina: 0, porPagina: 25 }
  let q = db.from('mercado_anuncios_ativos').select('*', { count: 'exact' })

  if (f.termo?.trim()) q = q.ilike('species_id', `%${f.termo.trim().toLowerCase()}%`)
  // Lista vazia significaria "nenhuma moeda", que nao e um estado que a tela
  // ofereça — mas se chegar, `in.()` vazio e erro de sintaxe no PostgREST. Só
  // filtra quando a lista restringe de verdade.
  if (f.moedas && f.moedas.length > 0 && f.moedas.length < 2) q = q.in('currency', f.moedas)
  if (f.raridades && f.raridades.length > 0) q = q.in('rarity', f.raridades)
  if (f.shinyOnly) q = q.eq('is_shiny', true)
  if (f.nivelMin && f.nivelMin > 0) q = q.gte('level', f.nivelMin)
  if (f.ivMin && f.ivMin > 0) q = q.gte('iv_percent', f.ivMin)
  if (f.soLance) q = q.eq('apenas_oferta', true)

  if (f.ordem === 'recente') q = q.order('created_at', { ascending: false })
  else if (f.ordem === 'nivel') q = q.order('level', { ascending: false })
  else if (f.ordem === 'iv') q = q.order('iv_percent', { ascending: false })
  else if (f.ordem === 'termina') {
    // Leilao primeiro, por quem acaba antes. `nullsFirst: false` manda quem nao
    // tem prazo (preco fixo e somente-lance) pro fim, em vez de tratar `null`
    // como "acaba agora".
    q = q.order('expira_em', { ascending: true, nullsFirst: false })
  } else {
    // Preco crescente, com anuncio SEM PRECO no fim — regra de negocio que ja
    // valia no filtro em memoria: tratar `null` como 0 faria o anuncio de lance
    // aparecer como o mais barato do Mercado. `nullsFirst: false` e o que
    // sustenta isso no servidor.
    q = q.order('price', { ascending: true, nullsFirst: false })
      // Desempate entre os sem-preco: quem acaba antes primeiro. Sem isto a
      // lista de leiloes se reembaralharia a cada refetch.
      .order('expira_em', { ascending: true, nullsFirst: false })
  }

  const de = f.pagina * f.porPagina
  const { data, error, count } = await q.range(de, de + f.porPagina - 1)
  estourarSeErro(error)
  const anuncios: AnuncioMercado[] = (data ?? []).map((r: Linha) => ({
    ...r, melhorOferta: r.melhor_oferta ?? null,
  }))
  return { anuncios, total: Number(count ?? 0) }
}

export async function mercadoMeus(): Promise<{
  ordens: OrdemMercado[]
  anuncios: AnuncioMercado[]
  ofertasRecebidas: OfertaRecebida[]
  minhasOfertas: OfertaMercado[]
}> {
  const uid = await userIdAtual()
  const [ordens, anuncios, ofertasRecebidas, minhasOfertas] = await Promise.all([
    db.from('market_orders').select('*').eq('user_id', uid).eq('status', 'ativa').order('created_at', { ascending: false }),
    db.from('market_listings').select('*').eq('seller_id', uid).eq('status', 'ativo').order('created_at', { ascending: false }),
    db.from('mercado_ofertas_recebidas').select('*').eq('seller_id', uid),
    // Embed do anuncio (PH-101): a tela precisa do `modo` pra nao oferecer
    // "Cancelar" num lance de leilao, que o servidor recusa. `market_offers.
    // listing_id` tem FK pra `market_listings`, entao o PostgREST resolve o
    // join sozinho — e a policy de leitura publica de anuncio ATIVO cobre
    // exatamente as linhas que interessam aqui (lance pendente e sempre em
    // anuncio ativo).
    db.from('market_offers').select('*, market_listings(modo, expira_em)').eq('buyer_id', uid).eq('status', 'pendente').order('created_at', { ascending: false }),
  ])
  estourarSeErro(ordens.error); estourarSeErro(anuncios.error)
  estourarSeErro(ofertasRecebidas.error); estourarSeErro(minhasOfertas.error)
  return {
    ordens: (ordens.data ?? []) as OrdemMercado[],
    anuncios: (anuncios.data ?? []) as AnuncioMercado[],
    ofertasRecebidas: (ofertasRecebidas.data ?? []).map((r: Linha): OfertaRecebida => ({
      id: r.id, listing_id: r.listing_id, buyer_id: r.buyer_id, valor: r.valor,
      currency: r.currency, status: r.status, created_at: r.created_at,
      comprador: r.comprador,
      // So os 3 campos que a tela realmente le do anuncio embutido (imagem +
      // nome + nivel) — o resto de AnuncioMercado nao veio nesta leitura.
      anuncio: { species_id: r.species_id, level: r.level, is_shiny: r.is_shiny } as AnuncioMercado,
    })),
    // O embed vem como objeto aninhado; achatado aqui pra a tela nao ter que
    // saber a forma da resposta do PostgREST.
    // `r` e `Record<string, any>` (ver a nota do cast no topo), e espalhar um
    // tipo com index signature nao satisfaz a interface pro `tsc` — dai o cast,
    // no mesmo espirito do resto deste arquivo.
    minhasOfertas: (minhasOfertas.data ?? []).map((r: Linha): OfertaMercado => ({
      ...(r as unknown as OfertaMercado),
      modo: r.market_listings?.modo ?? 'preco_fixo',
      expira_em: r.market_listings?.expira_em ?? null,
    })),
  }
}

/**
 * Regra da taxa de venda (PH-98). Leitura, apesar de ser `rpc`: a funcao e
 * `immutable` e nao escreve nada — ela existe pra a tela mostrar o liquido antes
 * de confirmar, usando a MESMA fonte que as RPCs de venda consultam.
 */
export async function taxaDoMercado(): Promise<{ percentual: number; moedasIsentas: string[] }> {
  const { data, error } = await db.rpc('taxa_do_mercado')
  estourarSeErro(error)
  return {
    percentual: Number(data?.percentual ?? 0),
    moedasIsentas: Array.isArray(data?.moedasIsentas) ? data.moedasIsentas : [],
  }
}

// --- historico de preco (PH-97) -----------------------------------------------

export interface PontoDeHistorico {
  dia: string
  mediana: number
  minimo: number
  maximo: number
  volume: number
  negocios: number
}

export interface ResumoDeHistorico {
  mediana24h: number | null
  mediana7d: number | null
  volume24h: number
  volume30d: number
  negocios30d: number
}

export interface HistoricoDePreco {
  serie: PontoDeHistorico[]
  resumo: ResumoDeHistorico | null
}

function pontos(linhas: Linha[]): PontoDeHistorico[] {
  return linhas.map((r) => ({
    dia: r.dia,
    mediana: Number(r.mediana),
    minimo: Number(r.minimo),
    maximo: Number(r.maximo),
    volume: Number(r.volume),
    negocios: Number(r.negocios),
  }))
}

/**
 * Exportada SO pra teste — a decisão que ela guarda é a que quebra em silêncio:
 * "não houve negócio nas últimas 24h" tem que sobreviver como `null` até a
 * tela, nunca virar 0. Zero é um PREÇO, e um preço em que dá pra clicar; o
 * projeto já pagou esse prejuízo uma vez (ver o guard de `isLoading` em
 * ComprarItens.tsx, que existe porque o campo nascia em 0).
 */
export function mapearResumoDeHistorico(linha: Linha | null): ResumoDeHistorico | null {
  return resumo(linha)
}

function resumo(linha: Linha | null): ResumoDeHistorico | null {
  if (!linha) return null
  return {
    // `null` sobrevive como `null` de propósito: "sem negocio nas ultimas 24h"
    // e uma resposta, e virar 0 faria a tela mostrar um PRECO de zero — numero
    // em que da pra clicar. Mesmo prejuizo que o guard de `isLoading` em
    // ComprarItens.tsx ja pagou uma vez.
    mediana24h: linha.mediana_24h == null ? null : Number(linha.mediana_24h),
    mediana7d: linha.mediana_7d == null ? null : Number(linha.mediana_7d),
    volume24h: Number(linha.volume_24h ?? 0),
    volume30d: Number(linha.volume_30d ?? 0),
    negocios30d: Number(linha.negocios_30d ?? 0),
  }
}

/**
 * Serie diaria + resumo de um item. Duas leituras em paralelo contra views
 * agregadas — o cliente nunca recebe linha crua de `market_trades` (30 dias de
 * um item liquido passam do corte silencioso de 1000 linhas do PostgREST).
 */
export async function historicoDoItem(itemId: string, currency = 'gold'): Promise<HistoricoDePreco> {
  const [serie, res] = await Promise.all([
    db.from('mercado_historico_itens').select('*')
      .eq('item_id', itemId).eq('currency', currency).order('dia', { ascending: true }),
    db.from('mercado_resumo_historico_itens').select('*')
      .eq('item_id', itemId).eq('currency', currency).maybeSingle(),
  ])
  estourarSeErro(serie.error)
  // O resumo NAO estoura: `maybeSingle` sem linha e o caso normal de item que
  // nunca foi negociado, e derrubar a tela por causa disso esconderia a serie.
  return { serie: pontos(serie.data ?? []), resumo: resumo(res.data ?? null) }
}

export async function historicoDaEspecie(speciesId: string, currency: 'gold' | 'diamond'): Promise<HistoricoDePreco> {
  const [serie, res] = await Promise.all([
    db.from('mercado_historico_pokes').select('*')
      .eq('species_id', speciesId).eq('currency', currency).order('dia', { ascending: true }),
    db.from('mercado_resumo_historico_pokes').select('*')
      .eq('species_id', speciesId).eq('currency', currency).maybeSingle(),
  ])
  estourarSeErro(serie.error)
  return { serie: pontos(serie.data ?? []), resumo: resumo(res.data ?? null) }
}

export async function mercadoHistorico(): Promise<{ negocios: NegocioMercado[] }> {
  const uid = await userIdAtual()
  const { data, error } = await db.from('market_trades').select('*')
    .or(`buyer_id.eq.${uid},seller_id.eq.${uid}`).order('created_at', { ascending: false }).limit(50)
  estourarSeErro(error)
  const linhas = (data ?? []) as Linha[]
  const outrosIds = [...new Set(linhas.map((n) => (n.buyer_id === uid ? n.seller_id : n.buyer_id)).filter(Boolean))]
  const { data: nomes } = outrosIds.length
    ? await db.from('treinadores_publico').select('user_id, trainer_name').in('user_id', outrosIds)
    : { data: [] as Linha[] }
  const nomePorId = new Map<string, string>((nomes ?? []).map((n: Linha) => [n.user_id, n.trainer_name]))
  const negocios: NegocioMercado[] = linhas.map((n) => {
    const souComprador = n.buyer_id === uid
    return {
      ...n, souComprador,
      comprador: souComprador ? 'voce' : nomePorId.get(n.buyer_id) ?? null,
      vendedor: souComprador ? nomePorId.get(n.seller_id) ?? null : 'voce',
    } as NegocioMercado
  })
  return { negocios }
}

// --- escritas (RPC) -----------------------------------------------------------

export async function criarOrdem(corpo: { itemId: string; side: 'compra' | 'venda'; unitPrice: number; quantity: number }) {
  const { data, error } = await db.rpc('criar_ordem_mercado', {
    p_item_id: corpo.itemId, p_side: corpo.side, p_unit_price: corpo.unitPrice, p_quantity: corpo.quantity,
  })
  estourarSeErro(error)
  await refetchAposOrdem(corpo.itemId)
  const executado = data?.executado ?? 0
  // A taxa (PH-98) entra no toast SO na venda, e so quando ela existiu: e o
  // vendedor que paga, e o `recebidoTotal` que a RPC devolve JA e liquido.
  // Repetir o desconto aqui descontaria duas vezes na frase.
  const taxaTotal = Number(data?.taxaTotal ?? 0)
  const recebido = Number(data?.recebidoTotal ?? 0)
  const sufixoDeVenda = corpo.side === 'venda' && recebido > 0
    ? ` Você recebeu ${numero.format(recebido)}${taxaTotal > 0 ? ` (taxa: ${numero.format(taxaTotal)})` : ''}.`
    : ''
  // Unica das 8 RPCs do mercado sem `mensagem` no retorno (so ok/ordemId/
  // executado/gastoTotal/recebidoTotal) — sem isto o jogador clicava
  // "Comprar"/"Colocar a venda" e nao via nenhum toast confirmando.
  const mensagem = executado >= corpo.quantity
    ? `Ordem executada: ${executado}x ${corpo.itemId} casou na hora.${sufixoDeVenda}`
    : executado > 0
      ? `${executado}x casou na hora, o resto (${corpo.quantity - executado}x) ficou no livro esperando.${sufixoDeVenda}`
      : 'Ordem criada, aguardando alguem do outro lado.'
  return { mensagem, executado }
}

export async function cancelarOrdem(ordemId: string) {
  const { data: ordem } = await db.from('market_orders').select('item_id').eq('id', ordemId).maybeSingle()
  const { data, error } = await db.rpc('cancelar_ordem_mercado', { p_ordem_id: ordemId })
  estourarSeErro(error)
  if (ordem?.item_id) await refetchAposOrdem(ordem.item_id)
  return { mensagem: data?.mensagem as string | undefined }
}

/**
 * O POKE saiu da mochila e foi pro Mercado — quem o moveu foi a RPC, e o
 * repositorio precisa saber (PH-311).
 *
 * SEM ESTA CHAMADA, O PROXIMO SAVE APAGA O POKE. Sao tres peças certas
 * isoladamente e erradas juntas:
 *
 *  1. abrir a Mochila registra os ids da reserva no dominio de exclusao
 *     (`acrescentarIdsDaReserva`, mochilaRemota.ts);
 *  2. `refetchAposAnuncio` tira o POKE de `bagPokes`, porque a linha voltou com
 *     `location = 'market'` — e correto, e ele nao avisa ninguem;
 *  3. `savePlayerState` calcula `removidos = dominio - vivos`. O id anunciado
 *     esta no dominio e nao esta entre os vivos, entao vira DELETE.
 *
 * O teto de seguranca (12 por save) nao pega: anuncia-se um POKE por vez. E
 * `market_listings_poke_uid_fkey` e `on delete set null`, entao o anuncio
 * SOBREVIVE apontando pra nada — o POKE some pra sempre e a vitrine continua
 * vendendo ele.
 *
 * Aqui e nao dentro de `refetchAposAnuncio` porque aqui o fato ja e conhecido
 * sem perguntar: a RPC voltou sem erro, logo o POKE saiu da mochila. Dentro do
 * refetch seria preciso ler a linha ANTES do corte de `mochilaCarregada()`,
 * gastando uma request a mais em toda conta que anuncia sem a Mochila aberta.
 */
function anunciado(pokeUid: string): void {
  descartarIdsConhecidos([pokeUid])
}

export async function anunciarPoke(corpo: { pokeUid: string; price: number | null; currency: 'gold' | 'diamond'; apenasOferta?: boolean }) {
  const { data, error } = await db.rpc('anunciar_poke', {
    p_poke_id: corpo.pokeUid, p_price: corpo.price, p_currency: corpo.currency, p_apenas_oferta: !!corpo.apenasOferta,
  })
  estourarSeErro(error)
  anunciado(corpo.pokeUid)
  await refetchAposAnuncio(corpo.pokeUid)
  return { mensagem: data?.mensagem as string | undefined }
}

/** Leilão (PH-101). RPC própria e não `anunciar_poke` com argumentos novos:
 *  acrescentar parâmetros àquela assinatura criaria um overload, e o PostgREST
 *  passa a responder erro de ambiguidade em vez de chamar qualquer uma. */
export async function criarLeilao(corpo: {
  pokeUid: string
  currency: 'gold' | 'diamond'
  horas: 6 | 12 | 24
  lanceMinimo: number
  incrementoMinimo: number
}) {
  const { data, error } = await db.rpc('criar_leilao', {
    p_poke_id: corpo.pokeUid,
    p_currency: corpo.currency,
    p_horas: corpo.horas,
    p_lance_minimo: corpo.lanceMinimo,
    p_incremento_minimo: corpo.incrementoMinimo,
  })
  estourarSeErro(error)
  // Mesmo caminho de `anunciar_poke`: a RPC move o POKE pra 'market' (PH-311).
  anunciado(corpo.pokeUid)
  await refetchAposAnuncio(corpo.pokeUid)
  return { mensagem: data?.mensagem as string | undefined }
}

export async function darLance(corpo: { anuncioId: string; valor: number }) {
  const { data, error } = await db.rpc('dar_lance', {
    p_anuncio_id: corpo.anuncioId, p_valor: corpo.valor,
  })
  estourarSeErro(error)
  await refetchCarteira()
  return { mensagem: data?.mensagem as string | undefined, esticou: Boolean(data?.esticou) }
}

export async function ofertar(corpo: { anuncioId: string; valor: number }) {
  const { data, error } = await db.rpc('ofertar_no_anuncio', { p_anuncio_id: corpo.anuncioId, p_valor: corpo.valor })
  estourarSeErro(error)
  await refetchCarteira()
  return { mensagem: data?.mensagem as string | undefined }
}

/**
 * O `poke_uid` de um anuncio, lido ANTES da RPC que vai mexer nele (PH-324).
 *
 * Quem chama `cancelar_anuncio` / `comprar_anuncio` / `responder_oferta` so tem
 * o id do ANUNCIO em maos, e as tres RPCs devolvem so uma mensagem. Sem o id do
 * POKE nao da pra reconciliar a lista local — e foi por isso que a tela passou a
 * dizer "o POKE voltou pra sua mochila" mostrando uma mochila sem ele.
 *
 * ANTES e nao depois: `comprar_anuncio` marca o anuncio como vendido, e
 * dependendo do caminho a linha deixa de ser legivel pelo comprador.
 *
 * Falha em silencio de proposito: se a leitura nao vier, a acao principal
 * continua valendo e a tela so fica sem o refresh cirurgico — que e exatamente
 * o comportamento de hoje, nunca pior que ele.
 */
async function pokeDoAnuncio(anuncioId: string): Promise<string | undefined> {
  const { data } = await db.from('market_listings').select('poke_uid').eq('id', anuncioId).maybeSingle()
  return (data?.poke_uid as string | null | undefined) ?? undefined
}

/** O mesmo, a partir do id da OFERTA — ela aponta pro anuncio, que aponta pro POKE. */
async function pokeDaOferta(ofertaId: string): Promise<string | undefined> {
  const { data } = await db.from('market_offers').select('listing_id').eq('id', ofertaId).maybeSingle()
  const anuncioId = data?.listing_id as string | null | undefined
  return anuncioId ? pokeDoAnuncio(anuncioId) : undefined
}

export async function responderOferta(ofertaId: string, aceitar: boolean) {
  const pokeUid = await pokeDaOferta(ofertaId)
  const { data, error } = await db.rpc('responder_oferta', { p_oferta_id: ofertaId, p_aceitar: aceitar })
  estourarSeErro(error)
  // Aceitar manda o POKE pro comprador; recusar devolve pro vendedor. Os dois
  // casos sao o mesmo aqui: `refetchAposAnuncio` le a linha e decide pela
  // `location` dela, sem o cliente ter que adivinhar qual dos dois foi.
  await refetchAposAnuncio(pokeUid)
  return { mensagem: data?.mensagem as string | undefined }
}

export async function cancelarOferta(ofertaId: string) {
  const { data, error } = await db.rpc('cancelar_oferta', { p_oferta_id: ofertaId })
  estourarSeErro(error)
  await refetchCarteira()
  return { mensagem: data?.mensagem as string | undefined }
}

export async function cancelarAnuncio(anuncioId: string) {
  const pokeUid = await pokeDoAnuncio(anuncioId)
  const { data, error } = await db.rpc('cancelar_anuncio', { p_anuncio_id: anuncioId })
  estourarSeErro(error)
  // A mensagem que a RPC devolve e "o POKE voltou pra sua mochila". Sem esta
  // linha, a tela dizia isso mostrando uma mochila sem ele (PH-324).
  await refetchAposAnuncio(pokeUid)
  return { mensagem: data?.mensagem as string | undefined }
}

export async function comprarAnuncio(anuncioId: string) {
  const pokeUid = await pokeDoAnuncio(anuncioId)
  const { data, error } = await db.rpc('comprar_anuncio', { p_anuncio_id: anuncioId })
  estourarSeErro(error)
  // O jogador PAGOU: nao ver o que comprou e o pior dos tres casos da PH-324.
  // `comprar_anuncio` muda o `user_id` da linha e a manda pra `bag`, entao a
  // releitura acha o POKE — agora dele.
  await refetchAposAnuncio(pokeUid)
  return { mensagem: data?.mensagem as string | undefined }
}
