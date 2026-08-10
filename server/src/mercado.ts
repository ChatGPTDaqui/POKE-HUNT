// Mercado entre jogadores.
//
// Dois modelos, porque os dois lados nao sao a mesma coisa:
//
//  - ITENS entram num LIVRO DE OFERTAS (pedido explicito: "semelhante ao
//    Mercado Comunitario da Steam"). Item e fungivel: 100 Poke Ball sao 100
//    Poke Ball, entao existe "melhor preco" e faz sentido cruzar filas.
//  - POKE vai por ANUNCIO DE PRECO FIXO. IV, raridade e shiny fazem cada linha
//    ser unica; nao existe "melhor preco" entre coisas diferentes, e um livro
//    de ofertas de POKE cruzaria oferta por Charmander com procura por Mewtwo.
//
// TRES INVARIANTES QUE SUSTENTAM TUDO:
//
// 1. ESCROW. Criar ordem de venda tira o item do inventario AGORA; criar ordem
//    de compra tira o ouro AGORA. Sem isso, duas ordens de venda do mesmo
//    estoque venderiam o dobro do que existe, e uma ordem de compra poderia
//    casar depois de o ouro ja ter sido gasto na Loja.
// 2. NENHUM VALOR VEM DO CLIENTE ALEM DE PRECO E QUANTIDADE. Quem paga quanto,
//    quem recebe o que, e o que sobra de troco sai daqui — mesma regra do
//    resto do servico de autoridade (ver acoes.ts).
// 3. TODA ESCRITA CONCORRENTE E COMPARE-AND-SWAP. Nao ha transacao entre duas
//    chamadas ao PostgREST (o servico e serverless), entao cada baixa numa
//    ordem alheia manda o valor antigo no filtro; se nao casar, a corrida foi
//    perdida e aquela ordem simplesmente nao e usada nesta execucao.
import { SPECIES, averageIvPercent, getItem, rowToPoke, type PokemonRow } from '#engine'
import { ErroHttp, selecionar, selecionarTudo, inserir, atualizar, atualizarRetornando, type Config } from './db.js'
import { enfileirarEntrega } from './entregas.js'
import { carregarEstado, comEstadoParaEscrita, gravarEstado } from './progresso.js'
import { criarEstadoDoJogador } from './estadoDoJogador.js'
import type { GameStateData } from '#engine'

// Teto de itens por ordem. Nao e regra de jogo — e limite de sanidade: uma
// ordem de 2 bilhoes estouraria o int da coluna e travaria o livro.
const MAX_QUANTIDADE = 1_000_000
const MAX_PRECO = 100_000_000
// Quantas ordens do lado oposto uma ordem nova percorre antes de parar de
// tentar casar. Um livro real nao tem 200 niveis de preco pro mesmo item; o
// teto existe pra uma unica requisicao nao virar centenas de round-trips.
const MAX_CASAMENTOS = 40

export interface LinhaOrdem {
  id: string
  user_id: string
  item_id: string
  side: 'compra' | 'venda'
  unit_price: number
  quantity: number
  remaining: number
  gold_retido: number
  status: 'ativa' | 'concluida' | 'cancelada'
  created_at: string
  closed_at: string | null
}

export interface LinhaAnuncio {
  id: string
  seller_id: string
  poke_uid: string
  /** `null` em anuncio "somente lance" — nao ha compra direta. */
  price: number | null
  apenas_oferta: boolean
  currency: 'gold' | 'diamond'
  status: 'ativo' | 'vendido' | 'cancelado'
  species_id: string
  level: number
  rarity: string
  is_shiny: boolean
  iv_percent: number
  created_at: string
  sold_at: string | null
  buyer_id: string | null
}

export interface LinhaOferta {
  id: string
  listing_id: string
  buyer_id: string
  valor: number
  currency: 'gold' | 'diamond'
  status: 'pendente' | 'aceita' | 'recusada' | 'cancelada'
  created_at: string
  resolved_at: string | null
}

export interface LinhaNegocio {
  id: string
  kind: 'item' | 'poke'
  item_id: string | null
  species_id: string | null
  quantity: number
  unit_price: number
  currency: 'gold' | 'diamond'
  buyer_id: string | null
  seller_id: string | null
  created_at: string
}

const inteiro = (v: unknown, campo: string, max: number): number => {
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw new ErroHttp(400, `${campo} invalido`)
  // Mensagem separada da de "invalido": quem digita 999.999.999 num lance esta
  // fazendo algo legitimo e so precisa saber onde e o teto. "valor invalido" ali
  // parecia bug do jogo.
  if (n > max) throw new ErroHttp(400, `O maximo permitido para ${campo} e ${max.toLocaleString('pt-BR')}.`)
  return n
}

const texto = (v: unknown, campo: string): string => {
  if (typeof v !== 'string' || !v || v.length > 120) throw new ErroHttp(400, `${campo} invalido`)
  return v
}

// ---------------------------------------------------------------------------
// Nomes de treinador
// ---------------------------------------------------------------------------
// A vitrine mostra "de quem e a oferta". O jogador NAO pode ler `players` de
// terceiros (a RLS so libera a propria linha, e corretamente), entao a
// resolucao acontece aqui, com service_role, devolvendo so o nome.
export async function nomesDeTreinadores(cfg: Config, ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (!unicos.length) return new Map()
  const linhas = await selecionarTudo<{ user_id: string; trainer_name: string }>(
    cfg,
    `players?user_id=in.(${unicos.join(',')})&select=user_id,trainer_name`,
  )
  return new Map(linhas.map((l) => [l.user_id, l.trainer_name]))
}

// ---------------------------------------------------------------------------
// Leitura da vitrine
// ---------------------------------------------------------------------------

export interface NivelDePreco {
  unitPrice: number
  quantity: number
}

/** Livro de um item: melhores compras e melhores vendas, agregadas por preco. */
export async function livroDoItem(cfg: Config, itemId: string) {
  const ativas = await selecionarTudo<LinhaOrdem>(
    cfg,
    `market_orders?item_id=eq.${itemId}&status=eq.ativa&select=*`,
  )
  const agrega = (lado: 'compra' | 'venda'): NivelDePreco[] => {
    const porPreco = new Map<number, number>()
    for (const o of ativas) {
      if (o.side !== lado) continue
      porPreco.set(o.unit_price, (porPreco.get(o.unit_price) ?? 0) + o.remaining)
    }
    return [...porPreco.entries()]
      .map(([unitPrice, quantity]) => ({ unitPrice, quantity }))
      // Compra: maior preco primeiro (melhor pra quem vende). Venda: menor
      // primeiro (melhor pra quem compra).
      .sort((a, b) => (lado === 'compra' ? b.unitPrice - a.unitPrice : a.unitPrice - b.unitPrice))
      .slice(0, 12)
  }
  const negocios = await selecionar<LinhaNegocio>(
    cfg,
    `market_trades?item_id=eq.${itemId}&select=*&order=created_at.desc&limit=15`,
  )
  return { itemId, compras: agrega('compra'), vendas: agrega('venda'), negocios }
}

/** Resumo de todos os itens com ordem ativa — a lista da aba "Comprar". */
export async function resumoDosItens(cfg: Config) {
  const ativas = await selecionarTudo<LinhaOrdem>(cfg, 'market_orders?status=eq.ativa&select=*')
  const porItem = new Map<string, { itemId: string; melhorCompra: number | null; melhorVenda: number | null; emVenda: number; emCompra: number }>()
  for (const o of ativas) {
    const atual = porItem.get(o.item_id) ?? { itemId: o.item_id, melhorCompra: null, melhorVenda: null, emVenda: 0, emCompra: 0 }
    if (o.side === 'venda') {
      atual.emVenda += o.remaining
      atual.melhorVenda = atual.melhorVenda == null ? o.unit_price : Math.min(atual.melhorVenda, o.unit_price)
    } else {
      atual.emCompra += o.remaining
      atual.melhorCompra = atual.melhorCompra == null ? o.unit_price : Math.max(atual.melhorCompra, o.unit_price)
    }
    porItem.set(o.item_id, atual)
  }
  return [...porItem.values()].sort((a, b) => a.itemId.localeCompare(b.itemId))
}

export interface AnuncioComVendedor extends LinhaAnuncio {
  vendedor: string
  /** Quantas ofertas pendentes esse anuncio ja recebeu. */
  ofertas: number
  /** A maior oferta pendente — o que a vitrine mostra no lugar do preco. */
  melhorOferta: number | null
}

/** Ofertas pendentes agrupadas por anuncio, para uma lista de anuncios. */
async function ofertasPendentesPorAnuncio(cfg: Config, anuncioIds: string[]): Promise<Map<string, LinhaOferta[]>> {
  const porAnuncio = new Map<string, LinhaOferta[]>()
  if (!anuncioIds.length) return porAnuncio
  const linhas = await selecionarTudo<LinhaOferta>(
    cfg,
    `market_offers?status=eq.pendente&listing_id=in.(${anuncioIds.join(',')})&select=*`,
  )
  for (const o of linhas) {
    const lista = porAnuncio.get(o.listing_id)
    if (lista) lista.push(o)
    else porAnuncio.set(o.listing_id, [o])
  }
  return porAnuncio
}

function enfeitarAnuncios(
  linhas: LinhaAnuncio[],
  nomes: Map<string, string>,
  ofertas: Map<string, LinhaOferta[]>,
): AnuncioComVendedor[] {
  return linhas.map((l) => {
    const lista = ofertas.get(l.id) ?? []
    return {
      ...l,
      vendedor: nomes.get(l.seller_id) ?? 'Treinador',
      ofertas: lista.length,
      melhorOferta: lista.length ? Math.max(...lista.map((o) => o.valor)) : null,
    }
  })
}

export async function anunciosAtivos(cfg: Config): Promise<AnuncioComVendedor[]> {
  const linhas = await selecionarTudo<LinhaAnuncio>(
    cfg,
    'market_listings?status=eq.ativo&select=*&order=created_at.desc',
  )
  const [nomes, ofertas] = await Promise.all([
    nomesDeTreinadores(cfg, linhas.map((l) => l.seller_id)),
    ofertasPendentesPorAnuncio(cfg, linhas.map((l) => l.id)),
  ])
  return enfeitarAnuncios(linhas, nomes, ofertas)
}

export async function minhasOrdens(cfg: Config, userId: string) {
  const [ordens, anuncios] = await Promise.all([
    selecionarTudo<LinhaOrdem>(cfg, `market_orders?user_id=eq.${userId}&status=eq.ativa&select=*&order=created_at.desc`),
    selecionarTudo<LinhaAnuncio>(cfg, `market_listings?seller_id=eq.${userId}&status=eq.ativo&select=*&order=created_at.desc`),
  ])
  // Ofertas RECEBIDAS (nos meus anuncios) e ofertas FEITAS (minhas, em anuncio
  // alheio) vem juntas: as duas so podem ser respondidas/canceladas daqui, e
  // separa-las em duas rotas obrigaria a tela a fazer dois requests pra montar
  // uma aba so.
  const [ofertasRecebidas, minhasOfertas] = await Promise.all([
    ofertasPendentesPorAnuncio(cfg, anuncios.map((a) => a.id)),
    selecionarTudo<LinhaOferta>(
      cfg,
      `market_offers?buyer_id=eq.${userId}&status=eq.pendente&select=*&order=created_at.desc`,
    ),
  ])
  const nomesCompradores = await nomesDeTreinadores(
    cfg,
    [...ofertasRecebidas.values()].flat().map((o) => o.buyer_id),
  )
  const recebidas = [...ofertasRecebidas.values()].flat().map((o) => ({
    ...o,
    comprador: nomesCompradores.get(o.buyer_id) ?? 'Treinador',
    anuncio: anuncios.find((a) => a.id === o.listing_id) ?? null,
  }))
  return { ordens, anuncios, ofertasRecebidas: recebidas, minhasOfertas }
}

export async function meuHistorico(cfg: Config, userId: string) {
  const linhas = await selecionar<LinhaNegocio>(
    cfg,
    `market_trades?or=(buyer_id.eq.${userId},seller_id.eq.${userId})&select=*&order=created_at.desc&limit=60`,
  )
  const nomes = await nomesDeTreinadores(cfg, linhas.flatMap((l) => [l.buyer_id, l.seller_id]))
  return linhas.map((l) => ({
    ...l,
    comprador: l.buyer_id ? nomes.get(l.buyer_id) ?? 'Treinador' : null,
    vendedor: l.seller_id ? nomes.get(l.seller_id) ?? 'Treinador' : null,
    souComprador: l.buyer_id === userId,
  }))
}

// ---------------------------------------------------------------------------
// Ordem de item: criacao + casamento
// ---------------------------------------------------------------------------

/**
 * Cria uma ordem e casa com o lado oposto imediatamente.
 *
 * O preco de execucao e o da ordem QUE JA ESTAVA NO LIVRO, nunca o da que
 * chegou. E a convencao de qualquer livro de ofertas, e aqui ela tem efeito
 * concreto: quem compra "a mercado" (limite alto) paga o preco da melhor venda
 * disponivel e recebe o troco de volta, em vez de pagar o proprio limite.
 */
export async function criarOrdem(
  cfg: Config,
  userId: string,
  corpo: { itemId?: unknown; side?: unknown; unitPrice?: unknown; quantity?: unknown },
) {
  const itemId = texto(corpo.itemId, 'itemId')
  const side = corpo.side === 'compra' || corpo.side === 'venda' ? corpo.side : null
  if (!side) throw new ErroHttp(400, 'side deve ser "compra" ou "venda"')
  const unitPrice = inteiro(corpo.unitPrice, 'unitPrice', MAX_PRECO)
  const quantity = inteiro(corpo.quantity, 'quantity', MAX_QUANTIDADE)
  if (!getItem(itemId)) throw new ErroHttp(400, 'item desconhecido')

  return comEstadoParaEscrita(cfg, userId, async ({ estado: dados, pokeIdsNoLoad }) => {
    const { store, dados: estado } = criarEstadoDoJogador(dados)

    // --- escrow ---
    if (side === 'venda') {
      if (estado.lockedItems[itemId]) throw new ErroHttp(409, 'Este item esta travado — destrave antes de anunciar.')
      if (!store.removeItem(itemId, quantity)) throw new ErroHttp(409, 'Voce nao tem essa quantidade.')
    } else {
      if (!store.spendGold(unitPrice * quantity)) throw new ErroHttp(409, 'Ouro insuficiente.')
    }

    const [ordem] = await inserir<LinhaOrdem>(cfg, 'market_orders', {
      user_id: userId,
      item_id: itemId,
      side,
      unit_price: unitPrice,
      quantity,
      remaining: quantity,
      gold_retido: side === 'compra' ? unitPrice * quantity : 0,
    }, { retornar: true })

    const resultado = await casar(cfg, userId, ordem, store)

    // O estado do jogador (escrow debitado + o que ele recebeu no casamento) e
    // gravado uma vez so, no fim. Se algo estourar antes, nada foi debitado.
    await gravarEstado(cfg, userId, estado, pokeIdsNoLoad)
    return { ordemId: ordem.id, ...resultado, estado }
  })
}

interface ResultadoCasamento {
  executado: number
  gastoTotal: number
  recebidoTotal: number
}

export async function casar(
  cfg: Config,
  userId: string,
  ordem: LinhaOrdem,
  store: ReturnType<typeof criarEstadoDoJogador>['store'],
): Promise<ResultadoCasamento> {
  const oposto = ordem.side === 'compra' ? 'venda' : 'compra'
  // Ordem de varredura: melhor preco pro agressor primeiro, depois a mais
  // antiga (prioridade preco-tempo, o padrao de qualquer livro).
  const ordenacao = oposto === 'venda' ? 'unit_price.asc' : 'unit_price.desc'
  // Filtro de preco: compra so casa com venda ate o limite; venda so casa com
  // compra a partir do limite.
  const filtroPreco = oposto === 'venda' ? `unit_price=lte.${ordem.unit_price}` : `unit_price=gte.${ordem.unit_price}`
  // `user_id=neq` bloqueia auto-negociacao: sem isso da pra cruzar ordem
  // consigo mesmo repetidamente e forjar um historico de precos.
  const candidatas = await selecionar<LinhaOrdem>(
    cfg,
    `market_orders?item_id=eq.${ordem.item_id}&side=eq.${oposto}&status=eq.ativa`
    + `&${filtroPreco}&user_id=neq.${userId}&select=*&order=${ordenacao},created_at.asc&limit=${MAX_CASAMENTOS}`,
  )

  let restante = ordem.remaining
  let retido = ordem.gold_retido
  let executado = 0
  let gastoTotal = 0
  let recebidoTotal = 0

  for (const outra of candidatas) {
    if (restante <= 0) break
    const qtd = Math.min(restante, outra.remaining)
    if (qtd <= 0) continue
    const preco = outra.unit_price
    const valor = preco * qtd

    // COMPARE-AND-SWAP na ordem alheia: `remaining=eq.<valor lido>` garante que
    // ninguem baixou essa mesma ordem entre o SELECT e este PATCH. Resposta
    // vazia = perdi a corrida; sigo pra proxima em vez de sobrescrever.
    const novoRestanteOutra = outra.remaining - qtd
    const patch: Record<string, unknown> = {
      remaining: novoRestanteOutra,
      status: novoRestanteOutra === 0 ? 'concluida' : 'ativa',
      closed_at: novoRestanteOutra === 0 ? new Date().toISOString() : null,
    }
    if (outra.side === 'compra') patch.gold_retido = Math.max(0, outra.gold_retido - valor)
    const aplicadas = await atualizarRetornando<LinhaOrdem>(
      cfg,
      `market_orders?id=eq.${outra.id}&status=eq.ativa&remaining=eq.${outra.remaining}`,
      patch,
    )
    if (!aplicadas.length) continue

    if (ordem.side === 'compra') {
      // Eu compro: recebo item na hora, o vendedor recebe ouro por entrega.
      store.addItem(ordem.item_id, qtd)
      // Troco: meu escrow retinha `ordem.unit_price` por unidade, mas executei a
      // `preco`. A diferenca volta pro meu ouro imediatamente.
      const troco = (ordem.unit_price - preco) * qtd
      if (troco > 0) store.addGold(troco)
      retido = Math.max(0, retido - ordem.unit_price * qtd)
      gastoTotal += valor
      await enfileirarEntrega(cfg, {
        userId: outra.user_id,
        gold: valor,
        motivo: `Venda de ${qtd}x ${ordem.item_id} no Mercado`,
      })
    } else {
      // Eu vendo: recebo ouro na hora, o comprador recebe item por entrega.
      store.addGold(valor)
      recebidoTotal += valor
      await enfileirarEntrega(cfg, {
        userId: outra.user_id,
        itemId: ordem.item_id,
        quantity: qtd,
        motivo: `Compra de ${qtd}x ${ordem.item_id} no Mercado`,
      })
    }

    await inserir(cfg, 'market_trades', {
      kind: 'item',
      item_id: ordem.item_id,
      quantity: qtd,
      unit_price: preco,
      currency: 'gold',
      buyer_id: ordem.side === 'compra' ? userId : outra.user_id,
      seller_id: ordem.side === 'compra' ? outra.user_id : userId,
    })

    restante -= qtd
    executado += qtd
  }

  if (executado > 0 || restante !== ordem.remaining) {
    // CAS na propria ordem: sem isso, esta escrita final sobrescreve em
    // silencio qualquer decremento que OUTRO casamento tenha aplicado nesta
    // mesma ordem (via linha 380) enquanto este loop ainda estava em voo —
    // bug real de duplicacao de ouro/item (PH-3).
    let remainingEsperado = ordem.remaining
    let patchFinal = {
      remaining: restante,
      gold_retido: ordem.side === 'compra' ? retido : 0,
      status: restante === 0 ? 'concluida' : 'ativa',
      closed_at: restante === 0 ? new Date().toISOString() : null,
    }
    let aplicado = await atualizarRetornando<LinhaOrdem>(
      cfg,
      `market_orders?id=eq.${ordem.id}&status=eq.ativa&remaining=eq.${remainingEsperado}`,
      patchFinal,
    )

    if (!aplicado.length) {
      // Perdemos a corrida: em vez de gravar por cima o valor pre-calculado,
      // rele o estado atual e recalcula o delta so com o que ESTA chamada
      // executou (`executado`), preservando o que a outra escrita ja aplicou.
      const [atual] = await selecionar<LinhaOrdem>(cfg, `market_orders?id=eq.${ordem.id}&select=*`)
      if (atual && atual.status === 'ativa') {
        remainingEsperado = atual.remaining
        const remainingFinal = Math.max(0, atual.remaining - executado)
        patchFinal = {
          remaining: remainingFinal,
          gold_retido: ordem.side === 'compra' ? Math.max(0, atual.gold_retido - ordem.unit_price * executado) : 0,
          status: remainingFinal === 0 ? 'concluida' : 'ativa',
          closed_at: remainingFinal === 0 ? new Date().toISOString() : null,
        }
        aplicado = await atualizarRetornando<LinhaOrdem>(
          cfg,
          `market_orders?id=eq.${ordem.id}&status=eq.ativa&remaining=eq.${remainingEsperado}`,
          patchFinal,
        )
      }

      if (!aplicado.length) throw new ErroHttp(409, 'outro comando concorrente nesta ordem — tente de novo')
    }
  }

  return { executado, gastoTotal, recebidoTotal }
}

export async function cancelarOrdem(cfg: Config, userId: string, ordemId: string) {
  // CAS de novo: `status=eq.ativa` no filtro impede que dois cancelamentos
  // simultaneos devolvam o escrow duas vezes.
  const [ordem] = await atualizarRetornando<LinhaOrdem>(
    cfg,
    `market_orders?id=eq.${ordemId}&user_id=eq.${userId}&status=eq.ativa`,
    { status: 'cancelada', closed_at: new Date().toISOString() },
  )
  if (!ordem) throw new ErroHttp(404, 'ordem nao encontrada ou ja encerrada')

  return comEstadoParaEscrita(cfg, userId, async ({ estado: dados, pokeIdsNoLoad }) => {
    const { store, dados: estado } = criarEstadoDoJogador(dados)
    if (ordem.side === 'venda') store.addItem(ordem.item_id, ordem.remaining)
    else store.addGold(ordem.gold_retido)
    await gravarEstado(cfg, userId, estado, pokeIdsNoLoad)

    const item = getItem(ordem.item_id)
    return {
      mensagem: ordem.side === 'venda'
        ? `Ordem cancelada — ${ordem.remaining}x ${item?.name ?? ordem.item_id} de volta na mochila.`
        : `Ordem cancelada — ${ordem.gold_retido} de ouro devolvido.`,
      estado,
    }
  })
}

// ---------------------------------------------------------------------------
// Anuncio de POKE
// ---------------------------------------------------------------------------

export async function anunciarPoke(
  cfg: Config,
  userId: string,
  corpo: { pokeUid?: unknown; price?: unknown; currency?: unknown; apenasOferta?: unknown },
) {
  const pokeUid = texto(corpo.pokeUid, 'pokeUid')
  const apenasOferta = corpo.apenasOferta === true
  // Em "somente lance" nao ha preco de compra direta — a coluna vai NULL e a
  // check `market_listings_preco_coerente` garante que as duas nunca se
  // contradigam. `currency` continua valendo: ela diz em que moeda as ofertas
  // podem ser feitas.
  const price = apenasOferta ? null : inteiro(corpo.price, 'price', MAX_PRECO)
  const currency = corpo.currency === 'diamond' ? 'diamond' : 'gold'

  // A checagem e o movimento sao a MESMA operacao: o filtro exige que o POKE
  // seja deste jogador, esteja na mochila, e nao esteja travado. Se qualquer
  // uma falhar, nenhuma linha volta e nada aconteceu. Checar antes e mover
  // depois deixaria a janela em que dois anuncios do mesmo POKE passam.
  const [linha] = await atualizarRetornando<PokemonRow>(
    cfg,
    `pokemon_instances?id=eq.${pokeUid}&user_id=eq.${userId}&location=eq.bag&locked=is.false`,
    { location: 'market', team_slot: null },
  )
  if (!linha) throw new ErroHttp(409, 'POKE indisponivel — precisa estar na mochila e destravado.')

  const poke = rowToPoke(linha)
  try {
    await inserir(cfg, 'market_listings', {
      seller_id: userId,
      poke_uid: pokeUid,
      price,
      apenas_oferta: apenasOferta,
      currency,
      species_id: poke.speciesId,
      level: poke.level,
      rarity: poke.rarity,
      is_shiny: poke.isShiny,
      iv_percent: Math.round(averageIvPercent(poke.ivs)),
    })
  } catch (erro) {
    // Anuncio nao entrou: devolve o POKE em vez de deixa-lo preso em 'market'
    // sem nenhum anuncio apontando pra ele (seria invisivel pro dono).
    await atualizar(cfg, `pokemon_instances?id=eq.${pokeUid}`, { location: 'bag' })
    throw erro
  }

  const nome = SPECIES[poke.speciesId]?.name ?? poke.speciesId
  const moeda = currency === 'gold' ? 'de ouro' : 'diamante(s)'
  return {
    mensagem: apenasOferta
      ? `${nome} anunciado para receber lances.`
      : `${nome} anunciado por ${price} ${moeda}.`,
    estado: await carregarEstado(cfg, userId),
  }
}

/**
 * Recusa (e DEVOLVE o escrow de) toda oferta pendente de um anuncio.
 *
 * Chamada sempre que o anuncio deixa de estar disponivel: cancelado pelo
 * vendedor, vendido por compra direta, ou uma das ofertas aceita. Sem isso o
 * ouro das outras ofertas ficaria retido pra sempre — o jogador nao teria como
 * cancelar uma oferta cujo anuncio nao existe mais na vitrine.
 */
async function recusarOfertasPendentes(
  cfg: Config,
  anuncioId: string,
  motivo: string,
  exceto?: string,
): Promise<number> {
  const filtroExceto = exceto ? `&id=neq.${exceto}` : ''
  const recusadas = await atualizarRetornando<LinhaOferta>(
    cfg,
    `market_offers?listing_id=eq.${anuncioId}&status=eq.pendente${filtroExceto}`,
    { status: 'recusada', resolved_at: new Date().toISOString() },
  )
  for (const oferta of recusadas) {
    await enfileirarEntrega(cfg, {
      userId: oferta.buyer_id,
      gold: oferta.currency === 'gold' ? oferta.valor : 0,
      diamonds: oferta.currency === 'diamond' ? oferta.valor : 0,
      motivo,
    })
  }
  return recusadas.length
}

export async function cancelarAnuncio(cfg: Config, userId: string, anuncioId: string) {
  const [anuncio] = await atualizarRetornando<LinhaAnuncio>(
    cfg,
    `market_listings?id=eq.${anuncioId}&seller_id=eq.${userId}&status=eq.ativo`,
    { status: 'cancelado' },
  )
  if (!anuncio) throw new ErroHttp(404, 'anuncio nao encontrado ou ja encerrado')
  await atualizar(cfg, `pokemon_instances?id=eq.${anuncio.poke_uid}`, { location: 'bag', team_slot: null })
  const devolvidas = await recusarOfertasPendentes(cfg, anuncioId, 'Anuncio retirado do Mercado')
  return {
    mensagem: devolvidas > 0
      ? `Anuncio cancelado — o POKE voltou pra sua mochila e ${devolvidas} oferta(s) foram devolvidas.`
      : 'Anuncio cancelado — o POKE voltou pra sua mochila.',
    estado: await carregarEstado(cfg, userId),
  }
}

/**
 * Envia uma oferta num anuncio "somente lance".
 *
 * O valor sai do bolso do comprador NA HORA (escrow), como na ordem de compra
 * de item. Sem isso, dez ofertas do mesmo ouro seriam todas aceitaveis e a
 * decima aceita nao teria como ser paga.
 */
export async function ofertarNoAnuncio(
  cfg: Config,
  userId: string,
  corpo: { anuncioId?: unknown; valor?: unknown },
) {
  const anuncioId = texto(corpo.anuncioId, 'anuncioId')
  const valor = inteiro(corpo.valor, 'valor', MAX_PRECO)

  const [anuncio] = await selecionar<LinhaAnuncio>(cfg, `market_listings?id=eq.${anuncioId}&select=*`)
  if (!anuncio || anuncio.status !== 'ativo') throw new ErroHttp(409, 'Este anuncio nao esta mais disponivel.')
  if (!anuncio.apenas_oferta) throw new ErroHttp(409, 'Este anuncio tem preco fixo — use Comprar.')
  if (anuncio.seller_id === userId) throw new ErroHttp(409, 'Voce nao pode ofertar no proprio anuncio.')

  return comEstadoParaEscrita(cfg, userId, async ({ estado: dados, pokeIdsNoLoad }) => {
    const { store, dados: estado } = criarEstadoDoJogador(dados)
    const pago = anuncio.currency === 'gold' ? store.spendGold(valor) : store.spendDiamonds(valor)
    if (!pago) {
      throw new ErroHttp(409, anuncio.currency === 'gold' ? 'Ouro insuficiente.' : 'Diamantes insuficientes.')
    }

    // A linha entra ANTES da gravacao do estado: o indice unico parcial
    // `market_offers_uma_pendente` e quem recusa a segunda oferta simultanea, e se
    // ele disparar aqui nada foi debitado ainda (o estado so e gravado abaixo).
    //
    // O try/catch traduz essa colisao: sem ele o PostgREST devolvia 23505, que
    // `db.ts` (corretamente) nao repassa pro cliente, e o jogador via
    // "falha ao falar com o banco" em vez de saber que ja tinha um lance ali.
    try {
      await inserir(cfg, 'market_offers', {
        listing_id: anuncioId,
        buyer_id: userId,
        valor,
        currency: anuncio.currency,
      })
    } catch {
      throw new ErroHttp(409, 'Voce ja tem um lance pendente neste anuncio — cancele antes de enviar outro.')
    }
    await gravarEstado(cfg, userId, estado, pokeIdsNoLoad)

    const nome = SPECIES[anuncio.species_id]?.name ?? anuncio.species_id
    return {
      mensagem: `Oferta de ${valor} enviada por ${nome}. O valor fica retido ate o vendedor responder.`,
      estado,
    }
  })
}

/** O comprador desiste: a oferta sai do ar e o escrow volta. */
export async function cancelarOferta(cfg: Config, userId: string, ofertaId: string) {
  const [oferta] = await atualizarRetornando<LinhaOferta>(
    cfg,
    `market_offers?id=eq.${ofertaId}&buyer_id=eq.${userId}&status=eq.pendente`,
    { status: 'cancelada', resolved_at: new Date().toISOString() },
  )
  if (!oferta) throw new ErroHttp(404, 'oferta nao encontrada ou ja respondida')

  return comEstadoParaEscrita(cfg, userId, async ({ estado: dados, pokeIdsNoLoad }) => {
    const { store, dados: estado } = criarEstadoDoJogador(dados)
    if (oferta.currency === 'gold') store.addGold(oferta.valor)
    else store.addDiamonds(oferta.valor)
    await gravarEstado(cfg, userId, estado, pokeIdsNoLoad)

    return { mensagem: `Oferta cancelada — ${oferta.valor} devolvido(s).`, estado }
  })
}

/** O vendedor aceita ou recusa uma oferta recebida. */
export async function responderOferta(
  cfg: Config,
  userId: string,
  ofertaId: string,
  aceitar: boolean,
) {
  const [oferta] = await selecionar<LinhaOferta>(cfg, `market_offers?id=eq.${ofertaId}&select=*`)
  if (!oferta || oferta.status !== 'pendente') throw new ErroHttp(409, 'Esta oferta ja foi respondida.')
  const [anuncio] = await selecionar<LinhaAnuncio>(cfg, `market_listings?id=eq.${oferta.listing_id}&select=*`)
  if (!anuncio) throw new ErroHttp(404, 'anuncio nao encontrado')
  if (anuncio.seller_id !== userId) throw new ErroHttp(403, 'Esta oferta nao e de um anuncio seu.')

  // CAS na oferta: dois cliques simultaneos em "Aceitar" nao podem transferir o
  // POKE duas vezes nem pagar o vendedor duas vezes.
  const [respondida] = await atualizarRetornando<LinhaOferta>(
    cfg,
    `market_offers?id=eq.${ofertaId}&status=eq.pendente`,
    { status: aceitar ? 'aceita' : 'recusada', resolved_at: new Date().toISOString() },
  )
  if (!respondida) throw new ErroHttp(409, 'Esta oferta ja foi respondida.')

  const nome = SPECIES[anuncio.species_id]?.name ?? anuncio.species_id

  if (!aceitar) {
    await enfileirarEntrega(cfg, {
      userId: oferta.buyer_id,
      gold: oferta.currency === 'gold' ? oferta.valor : 0,
      diamonds: oferta.currency === 'diamond' ? oferta.valor : 0,
      motivo: `Oferta por ${nome} recusada`,
    })
    return { mensagem: 'Oferta recusada — o valor foi devolvido ao ofertante.', estado: await carregarEstado(cfg, userId) }
  }

  // Fecha o anuncio com CAS. Perder aqui = o POKE ja saiu por compra direta ou
  // o anuncio foi cancelado: devolve o escrow desta oferta em vez de entregar um
  // POKE que ja nao esta la.
  const [fechado] = await atualizarRetornando<LinhaAnuncio>(
    cfg,
    `market_listings?id=eq.${anuncio.id}&status=eq.ativo`,
    { status: 'vendido', sold_at: new Date().toISOString(), buyer_id: oferta.buyer_id },
  )
  if (!fechado) {
    // A oferta ja foi marcada 'aceita' no CAS acima, mas o anuncio saiu debaixo
    // dela: ela NAO foi aceita, e deixar o carimbo produzia duas ofertas
    // "aceitas" pro mesmo POKE (reproduzido com dois `Aceitar` simultaneos).
    // O escrow voltava certo — mentia so o registro, que e o que um historico
    // de negociacao existe pra nao fazer.
    await atualizar(cfg, `market_offers?id=eq.${ofertaId}`, {
      status: 'recusada', resolved_at: new Date().toISOString(),
    })
    await enfileirarEntrega(cfg, {
      userId: oferta.buyer_id,
      gold: oferta.currency === 'gold' ? oferta.valor : 0,
      diamonds: oferta.currency === 'diamond' ? oferta.valor : 0,
      motivo: `Oferta por ${nome} devolvida (anuncio encerrado)`,
    })
    throw new ErroHttp(409, 'Este anuncio ja tinha sido encerrado — a oferta foi devolvida.')
  }

  await atualizar(cfg, `pokemon_instances?id=eq.${anuncio.poke_uid}`, {
    user_id: oferta.buyer_id,
    location: 'bag',
    team_slot: null,
  })
  await enfileirarEntrega(cfg, {
    userId,
    gold: oferta.currency === 'gold' ? oferta.valor : 0,
    diamonds: oferta.currency === 'diamond' ? oferta.valor : 0,
    motivo: `Venda de ${nome} por lance no Mercado`,
  })
  await inserir(cfg, 'market_trades', {
    kind: 'poke',
    species_id: anuncio.species_id,
    quantity: 1,
    unit_price: oferta.valor,
    currency: oferta.currency,
    buyer_id: oferta.buyer_id,
    seller_id: userId,
  })
  const devolvidas = await recusarOfertasPendentes(cfg, anuncio.id, `Outra oferta por ${nome} foi aceita`, ofertaId)

  return {
    mensagem: devolvidas > 0
      ? `Lance aceito! ${nome} foi entregue e ${devolvidas} outra(s) oferta(s) foram devolvidas.`
      : `Lance aceito! ${nome} foi entregue ao ofertante.`,
    // O pagamento vem por entrega (o vendedor pode estar cacando neste segundo),
    // entao o estado devolvido aqui ainda nao tem o ouro — ele entra no proximo
    // request que gravar. Mesma regra do resto do Mercado.
    estado: await carregarEstado(cfg, userId),
  }
}

export async function comprarAnuncio(cfg: Config, userId: string, anuncioId: string) {
  const [anuncio] = await selecionar<LinhaAnuncio>(cfg, `market_listings?id=eq.${anuncioId}&select=*`)
  if (!anuncio || anuncio.status !== 'ativo') throw new ErroHttp(409, 'Este anuncio nao esta mais disponivel.')
  if (anuncio.seller_id === userId) throw new ErroHttp(409, 'Voce nao pode comprar o proprio anuncio.')
  if (anuncio.apenas_oferta || anuncio.price == null) {
    throw new ErroHttp(409, 'Este anuncio so aceita lances — envie uma oferta.')
  }
  const preco = anuncio.price

  return comEstadoParaEscrita(cfg, userId, async ({ estado: dados, pokeIdsNoLoad }) =>
    concluirCompra(cfg, userId, anuncio, preco, dados, pokeIdsNoLoad))
}

async function concluirCompra(
  cfg: Config,
  userId: string,
  anuncio: LinhaAnuncio,
  preco: number,
  dados: GameStateData,
  pokeIdsNoLoad: Set<string>,
) {
  const { store, dados: estado } = criarEstadoDoJogador(dados)

  // ORDEM DELIBERADA: cobrar e gravar ANTES de mover o POKE.
  //
  // O estado do comprador e gravado como snapshot inteiro, com diff de remocao
  // em `pokemon_instances`. Se o POKE fosse transferido primeiro, este
  // `gravarEstado` (montado a partir de um estado carregado ANTES da
  // transferencia) nao teria a linha nova e a APAGARIA — o comprador pagaria e
  // o POKE sumiria do jogo.
  //
  // O risco invertido — falhar depois de cobrar — existe, mas erra a favor do
  // jogador (ele fica sem o POKE e o CAS abaixo devolve o anuncio ao ar), e o
  // erro fica visivel em vez de destruir um POKE em silencio.
  const pago = anuncio.currency === 'gold'
    ? store.spendGold(preco)
    : store.spendDiamonds(preco)
  if (!pago) {
    throw new ErroHttp(409, anuncio.currency === 'gold' ? 'Ouro insuficiente.' : 'Diamantes insuficientes.')
  }

  // CAS: fecha o anuncio so se ele ainda estava ativo. Perder aqui significa
  // que outro comprador chegou primeiro — nada foi cobrado ainda (o
  // `gravarEstado` vem depois), entao basta recusar.
  const [fechado] = await atualizarRetornando<LinhaAnuncio>(
    cfg,
    `market_listings?id=eq.${anuncio.id}&status=eq.ativo`,
    { status: 'vendido', sold_at: new Date().toISOString(), buyer_id: userId },
  )
  if (!fechado) throw new ErroHttp(409, 'Este anuncio acabou de ser vendido.')

  await gravarEstado(cfg, userId, estado, pokeIdsNoLoad)
  await atualizar(cfg, `pokemon_instances?id=eq.${anuncio.poke_uid}`, {
    user_id: userId,
    location: 'bag',
    team_slot: null,
  })

  await enfileirarEntrega(cfg, {
    userId: anuncio.seller_id,
    gold: anuncio.currency === 'gold' ? preco : 0,
    diamonds: anuncio.currency === 'diamond' ? preco : 0,
    motivo: `Venda de ${SPECIES[anuncio.species_id]?.name ?? anuncio.species_id} no Mercado`,
  })
  await inserir(cfg, 'market_trades', {
    kind: 'poke',
    species_id: anuncio.species_id,
    quantity: 1,
    unit_price: preco,
    currency: anuncio.currency,
    buyer_id: userId,
    seller_id: anuncio.seller_id,
  })

  const nome = SPECIES[anuncio.species_id]?.name ?? anuncio.species_id
  return {
    mensagem: `${nome} comprado! Ele esta na sua mochila.`,
    // Recarrega DEPOIS da transferencia: e o unico jeito de a resposta ja
    // conter o POKE novo.
    estado: await carregarEstado(cfg, userId),
  }
}
