import { useEffect, useMemo, useState } from 'react'
import { pedirAcao, pedirAcaoComLocal } from '@/data/remote/autoridade'
import { SHOP_STOCK, getItem, ITEMS } from '@/data/items'
import { buyItem, sellItem, sellAllItems } from '@/engine/systems/economySystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useDeviceMode } from '@/stores/uiStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { GameButton, SectionLabel } from '@/components/game/controls'
import { Sheet } from '@/components/game/Sheet'
import { Paginacao, usePaginacao } from '@/components/game/Paginacao'
import { fmt, toast } from '../utils'
import { ItemCompraCard, FichaCompra, type AcoesCompra } from './ItemCompraCard'
import { ItemVendaCard, FichaVenda, type AcoesVenda } from './ItemVendaCard'

export function ItensTab() {
  const gold = useGameStateStore((s) => s.wallet.gold)
  const items = useGameStateStore((s) => s.items)
  const lockedItems = useGameStateStore((s) => s.lockedItems)
  const toggleItemLock = useGameStateStore((s) => s.toggleItemLock)
  // Ver a nota em `ItemCompraCard`: quem decide a forma e a largura da coluna.
  const estreito = useDeviceMode().mode === 'compacto'
  const acao = useAcaoPendente()

  const [buyQty, setBuyQty] = useState<Record<string, number>>({})
  const [sellQty, setSellQty] = useState<Record<string, number>>({})
  // Qual ficha esta aberta. O estado mora AQUI, e nao dentro da linha, porque a
  // linha nao sobrevive as proprias acoes dela: trancar um item o manda pro fim
  // da ordenacao (e possivelmente pra outra pagina), e vender o ultimo o tira da
  // lista. Com o sheet montado pela linha, trancar de dentro dele desmontava o
  // sheet no meio da interacao — reproduzido antes de mudar.
  const [compraAberta, setCompraAberta] = useState<string | null>(null)
  const [vendaAberta, setVendaAberta] = useState<string | null>(null)

  // Item TRAVADO vai pro fim (mesma regra da Mochila): ele nao pode ser vendido,
  // entao ficar no topo da lista de VENDA e ruido puro.
  const ownedItemIds = useMemo(
    () => Object.keys(items)
      .filter((id) => items[id] > 0 && ITEMS[id])
      .sort((a, b) => {
        const travaA = lockedItems[a] ? 1 : 0
        const travaB = lockedItems[b] ? 1 : 0
        if (travaA !== travaB) return travaA - travaB
        return ITEMS[a].name.localeCompare(ITEMS[b].name)
      }),
    [items, lockedItems],
  )
  const paginadoVenda = usePaginacao(ownedItemIds)

  // Vendeu ate zerar: a ficha perde o assunto. Fechar aqui e nao no `onVender`
  // porque o estoque tambem pode zerar por outro caminho (o "Tudo" do topo, uma
  // acao vinda do servidor).
  const semEstoque = vendaAberta != null && !(items[vendaAberta] > 0)
  useEffect(() => {
    if (semEstoque) setVendaAberta(null)
  }, [semEstoque])

  async function comprar(itemId: string, qty: number, nome: string) {
    const { ok, local } = await pedirAcaoComLocal(
      { tipo: 'comprarItem', itemId, qtd: qty },
      () => buyItem(useGameStateStore.getState(), itemId, qty),
    )
    if (!ok) return // pedirAcao ja avisou o erro do servidor
    if (!local) return // caminho remoto: a mensagem certa vem do servidor
    if (local.success) toast(`Comprou ${nome} x${qty}.`)
    else toast(local.reason === 'insufficient_gold' ? 'Ouro insuficiente.' : 'Nao foi possivel comprar.', 'error')
  }

  async function vender(itemId: string, qty: number, nome: string) {
    const { ok, local } = await pedirAcaoComLocal(
      { tipo: 'venderItem', itemId, qtd: qty },
      () => sellItem(useGameStateStore.getState(), itemId, qty),
    )
    if (!ok || !local) return
    if (local.success) toast(`Vendeu ${nome} x${qty}.`)
    else toast(local.reason === 'locked' ? 'Item trancado.' : 'Nao foi possivel vender.', 'error')
  }

  function acoesCompra(itemId: string): AcoesCompra | null {
    const item = getItem(itemId)
    if (!item || item.kind === 'stone') return null
    const maxAffordable = Math.max(1, Math.floor(gold / item.buyPrice))
    const qty = Math.min(buyQty[item.id] ?? 1, maxAffordable)
    const key = `buy:${item.id}`
    return {
      item,
      owned: items[item.id] || 0,
      gold,
      qty,
      ocupado: acao.pendingKey != null,
      isPending: acao.isPending(key),
      onQtyChange: (v) => setBuyQty((m) => ({ ...m, [item.id]: v })),
      onExecutarAtalho: (n) => void acao.run(`${key}:${n}`, () => comprar(item.id, n, item.name)),
      onComprar: () => void acao.run(key, () => comprar(item.id, qty, item.name)),
    }
  }

  function acoesVenda(itemId: string): AcoesVenda | null {
    const item = ITEMS[itemId]
    const owned = items[itemId]
    if (!item || !(owned > 0)) return null
    const qty = Math.min(sellQty[itemId] ?? 1, owned)
    return {
      itemId,
      item,
      owned,
      locked: Boolean(lockedItems[itemId]),
      qty,
      ocupado: acao.pendingKey != null,
      onQtyChange: (v) => setSellQty((m) => ({ ...m, [itemId]: v })),
      onToggleLock: () => void acao.run(`lock:${itemId}`, () =>
        pedirAcao({ tipo: 'alternarTravaItem', itemId }, () => toggleItemLock(itemId)),
      ),
      onExecutarAtalho: (n) => void acao.run(`sell:${itemId}:${n}`, () => vender(itemId, n, item.name)),
      onVender: () => void acao.run(`sell:${itemId}`, () => vender(itemId, qty, item.name)),
      onVenderTudo: () => void acao.run(`sell-all:${itemId}`, () => vender(itemId, owned, item.name)),
    }
  }

  const fichaCompra = compraAberta ? acoesCompra(compraAberta) : null
  const fichaVenda = vendaAberta ? acoesVenda(vendaAberta) : null

  return (
    <>
      {/* DUAS COLUNAS EM TODO REGIME (pedido explicito). No celular elas eram
          abas — "Comprar" ou "Vender", nunca os dois — e a troca custava um
          toque justamente no momento em que o jogador compara: acabou de
          esvaziar a mochila e quer saber se da pra repor as balls. O que paga a
          conta e a linha compacta: em ~170px de coluna nao cabe transacao
          inline, entao ali a linha e so identidade e os controles abrem num
          sheet (ver `ItemCompraCard`).

          `min-w-0` nas duas colunas: sem isso um nome longo estica a coluna e o
          grid de 1fr 1fr vira duas colunas de larguras diferentes. */}
      <div className="grid grid-cols-2 items-start gap-[.4em]">
        <div className="flex min-w-0 flex-col gap-[.3em]">
          {/* `min-h` igual nas duas colunas: o botao "Tudo" da venda e mais alto
              que um rotulo de texto, e sem o piso a primeira linha de uma coluna
              comecava abaixo da outra. */}
          <div className="flex min-h-[2em] items-center">
            <SectionLabel>COMPRAR</SectionLabel>
          </div>
          {SHOP_STOCK.map((stock) => {
            const acoes = acoesCompra(stock.itemId)
            if (!acoes) return null
            return (
              <ItemCompraCard
                key={stock.itemId}
                {...acoes}
                onAbrir={() => setCompraAberta(stock.itemId)}
              />
            )
          })}
        </div>

        <div className="flex min-w-0 flex-col gap-[.3em]">
          <div className="flex min-h-[2em] items-center justify-between gap-[.3em]">
            <SectionLabel className="truncate">VENDER</SectionLabel>
            <GameButton
              variant="ghost"
              disabled={acao.pendingKey != null}
              title="Vender TODOS os itens da mochila (os trancados sao poupados)"
              onClick={() =>
                void acao.run('sell-all-items', async () => {
                  const { ok, local } = await pedirAcaoComLocal(
                    { tipo: 'venderTodosItens' },
                    () => sellAllItems(useGameStateStore.getState()),
                  )
                  if (!ok || !local) return
                  if (local.itemCount > 0) toast(`Vendeu ${local.itemCount} itens por ${fmt.format(local.gold)} ouro.`)
                  else toast('Nada para vender (itens trancados sao poupados).', 'info')
                })
              }
              className="shrink-0 px-[.4em] text-[.8em]"
            >
              Tudo
            </GameButton>
          </div>

          {ownedItemIds.length === 0 && <p className="text-n500">Nenhum item para vender.</p>}

          {paginadoVenda.pagina.map((itemId) => {
            const acoes = acoesVenda(itemId)
            if (!acoes) return null
            return <ItemVendaCard key={itemId} {...acoes} onAbrir={() => setVendaAberta(itemId)} />
          })}

          <Paginacao estado={paginadoVenda} rotulo="itens" />
        </div>
      </div>

      {/* As fichas ficam FORA do grid: sao irmas das colunas, nao filhas de uma
          linha que a propria acao pode desmontar. */}
      {estreito && fichaCompra && (
        <Sheet
          winKey={`compra:${compraAberta}`}
          snap="conteudo"
          zIndex={34}
          title={`Comprar ${fichaCompra.item.name}`}
          onClose={() => setCompraAberta(null)}
        >
          <FichaCompra {...fichaCompra} />
        </Sheet>
      )}

      {estreito && fichaVenda && (
        <Sheet
          winKey={`venda:${vendaAberta}`}
          snap="conteudo"
          zIndex={34}
          title={`Vender ${fichaVenda.item.name}`}
          onClose={() => setVendaAberta(null)}
        >
          <FichaVenda {...fichaVenda} />
        </Sheet>
      )}
    </>
  )
}
