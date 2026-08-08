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
import { carregarEstado, carregarEstadoParaEscrita, gravarEstado } from './progresso.js'
import { criarEstadoDoJogador } from './estadoDoJogador.js'

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
  price: number
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
  if (!Number.isInteger(n) || n <= 0 || n > max) throw new ErroHttp(400, `${campo} invalido`)
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
}

export async function anunciosAtivos(cfg: Config): Promise<AnuncioComVendedor[]> {
  const linhas = await selecionarTudo<LinhaAnuncio>(
    cfg,
    'market_listings?status=eq.ativo&select=*&order=created_at.desc',
  )
  const nomes = await nomesDeTreinadores(cfg, linhas.map((l) => l.seller_id))
  return linhas.map((l) => ({ ...l, vendedor: nomes.get(l.seller_id) ?? 'Treinador' }))
}

export async function minhasOrdens(cfg: Config, userId: string) {
  const [ordens, anuncios] = await Promise.all([
    selecionarTudo<LinhaOrdem>(cfg, `market_orders?user_id=eq.${userId}&status=eq.ativa&select=*&order=created_at.desc`),
    selecionarTudo<LinhaAnuncio>(cfg, `market_listings?seller_id=eq.${userId}&status=eq.ativo&select=*&order=created_at.desc`),
  ])
  return { ordens, anuncios }
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

  const dados = await carregarEstadoParaEscrita(cfg, userId)
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
  await gravarEstado(cfg, userId, estado)
  return { ordemId: ordem.id, ...resultado, estado }
}

interface ResultadoCasamento {
  executado: number
  gastoTotal: number
  recebidoTotal: number
}

async function casar(
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
    await atualizar(cfg, `market_orders?id=eq.${ordem.id}`, {
      remaining: restante,
      gold_retido: ordem.side === 'compra' ? retido : 0,
      status: restante === 0 ? 'concluida' : 'ativa',
      closed_at: restante === 0 ? new Date().toISOString() : null,
    })
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

  const dados = await carregarEstadoParaEscrita(cfg, userId)
  const { store, dados: estado } = criarEstadoDoJogador(dados)
  if (ordem.side === 'venda') store.addItem(ordem.item_id, ordem.remaining)
  else store.addGold(ordem.gold_retido)
  await gravarEstado(cfg, userId, estado)

  const item = getItem(ordem.item_id)
  return {
    mensagem: ordem.side === 'venda'
      ? `Ordem cancelada — ${ordem.remaining}x ${item?.name ?? ordem.item_id} de volta na mochila.`
      : `Ordem cancelada — ${ordem.gold_retido} de ouro devolvido.`,
    estado,
  }
}

// ---------------------------------------------------------------------------
// Anuncio de POKE
// ---------------------------------------------------------------------------

export async function anunciarPoke(
  cfg: Config,
  userId: string,
  corpo: { pokeUid?: unknown; price?: unknown; currency?: unknown },
) {
  const pokeUid = texto(corpo.pokeUid, 'pokeUid')
  const price = inteiro(corpo.price, 'price', MAX_PRECO)
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
  return {
    mensagem: `${nome} anunciado por ${price} ${currency === 'gold' ? 'de ouro' : 'diamante(s)'}.`,
    estado: await carregarEstado(cfg, userId),
  }
}

export async function cancelarAnuncio(cfg: Config, userId: string, anuncioId: string) {
  const [anuncio] = await atualizarRetornando<LinhaAnuncio>(
    cfg,
    `market_listings?id=eq.${anuncioId}&seller_id=eq.${userId}&status=eq.ativo`,
    { status: 'cancelado' },
  )
  if (!anuncio) throw new ErroHttp(404, 'anuncio nao encontrado ou ja encerrado')
  await atualizar(cfg, `pokemon_instances?id=eq.${anuncio.poke_uid}`, { location: 'bag', team_slot: null })
  return {
    mensagem: 'Anuncio cancelado — o POKE voltou pra sua mochila.',
    estado: await carregarEstado(cfg, userId),
  }
}

export async function comprarAnuncio(cfg: Config, userId: string, anuncioId: string) {
  const [anuncio] = await selecionar<LinhaAnuncio>(cfg, `market_listings?id=eq.${anuncioId}&select=*`)
  if (!anuncio || anuncio.status !== 'ativo') throw new ErroHttp(409, 'Este anuncio nao esta mais disponivel.')
  if (anuncio.seller_id === userId) throw new ErroHttp(409, 'Voce nao pode comprar o proprio anuncio.')

  const dados = await carregarEstadoParaEscrita(cfg, userId)
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
    ? store.spendGold(anuncio.price)
    : store.spendDiamonds(anuncio.price)
  if (!pago) {
    throw new ErroHttp(409, anuncio.currency === 'gold' ? 'Ouro insuficiente.' : 'Diamantes insuficientes.')
  }

  // CAS: fecha o anuncio so se ele ainda estava ativo. Perder aqui significa
  // que outro comprador chegou primeiro — nada foi cobrado ainda (o
  // `gravarEstado` vem depois), entao basta recusar.
  const [fechado] = await atualizarRetornando<LinhaAnuncio>(
    cfg,
    `market_listings?id=eq.${anuncioId}&status=eq.ativo`,
    { status: 'vendido', sold_at: new Date().toISOString(), buyer_id: userId },
  )
  if (!fechado) throw new ErroHttp(409, 'Este anuncio acabou de ser vendido.')

  await gravarEstado(cfg, userId, estado)
  await atualizar(cfg, `pokemon_instances?id=eq.${anuncio.poke_uid}`, {
    user_id: userId,
    location: 'bag',
    team_slot: null,
  })

  await enfileirarEntrega(cfg, {
    userId: anuncio.seller_id,
    gold: anuncio.currency === 'gold' ? anuncio.price : 0,
    diamonds: anuncio.currency === 'diamond' ? anuncio.price : 0,
    motivo: `Venda de ${SPECIES[anuncio.species_id]?.name ?? anuncio.species_id} no Mercado`,
  })
  await inserir(cfg, 'market_trades', {
    kind: 'poke',
    species_id: anuncio.species_id,
    quantity: 1,
    unit_price: anuncio.price,
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
