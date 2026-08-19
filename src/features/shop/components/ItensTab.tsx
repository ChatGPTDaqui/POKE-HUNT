import { useMemo, useState } from 'react'
import { pedirAcao, pedirAcaoComLocal } from '@/data/remote/autoridade'
import { SHOP_STOCK, getItem, ITEMS } from '@/data/items'
import { buyItem, sellItem, sellAllItems } from '@/engine/systems/economySystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useDeviceMode } from '@/stores/uiStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { GameButton, SectionLabel, SegmentedTabs } from '@/components/game/controls'
import { Paginacao, usePaginacao } from '@/components/game/Paginacao'
import { cn } from '@/lib/utils'
import { fmt, toast } from '../utils'
import { ItemCompraCard } from './ItemCompraCard'
import { ItemVendaCard } from './ItemVendaCard'

export function ItensTab({ ladoExterno }: { ladoExterno?: 'comprar' | 'vender' } = {}) {
  const gold = useGameStateStore((s) => s.wallet.gold)
  const items = useGameStateStore((s) => s.items)
  const lockedItems = useGameStateStore((s) => s.lockedItems)
  const toggleItemLock = useGameStateStore((s) => s.toggleItemLock)
  const { compacto } = useDeviceMode()
  const acao = useAcaoPendente()

  const [buyQty, setBuyQty] = useState<Record<string, number>>({})
  const [sellQty, setSellQty] = useState<Record<string, number>>({})
  // No celular as duas colunas viram duas ABAS, nao duas secoes empilhadas:
  // empilhadas, chegar em "vender" exigia rolar por dez cards de compra — e
  // vender e justamente o que o jogador faz depois de uma hunt cheia.
  //
  // Quem manda no lado pode ser o pai (`ladoExterno`): no compacto a Loja funde
  // as duas fileiras de aba numa so — "Comprar | Vender | POKEs" — e a escolha
  // passa a viver la em cima. Sem isso eram duas barras de abas empilhadas,
  // ~100px de uma tela de 470px.
  const [ladoLocal, setLadoLocal] = useState<'comprar' | 'vender'>('comprar')
  const lado = ladoExterno ?? ladoLocal
  const mostrarCompra = !compacto || lado === 'comprar'
  const mostrarVenda = !compacto || lado === 'vender'

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

  return (
    // `overflow-x-auto` nas duas colunas (pedido explicito): com os atalhos de
    // quantidade e o botao "Vender tudo", uma linha da Loja passa da largura da
    // janela quando ela e redimensionada pra estreita. Sem isso o botao ficava
    // cortado e inalcancavel; a rolagem horizontal e local a coluna, entao a
    // janela inteira nunca rola de lado.
    <div className="flex flex-col gap-[.4em]">
      {compacto && ladoExterno == null && (
        <SegmentedTabs
          value={lado}
          onChange={setLadoLocal}
          options={[{ value: 'comprar', label: 'Comprar' }, { value: 'vender', label: 'Vender' }]}
        />
      )}

      <div className={compacto ? 'flex flex-col gap-[.4em]' : 'grid grid-cols-2 gap-[.5em]'}>
      <div className={cn('flex min-w-0 flex-col gap-[.3em] overflow-x-auto', !mostrarCompra && 'hidden')}>
        {!compacto && <SectionLabel>COMPRAR</SectionLabel>}
        {SHOP_STOCK.map((stock) => {
          const item = getItem(stock.itemId)
          if (!item || item.kind === 'stone') return null
          const maxAffordable = Math.max(1, Math.floor(gold / item.buyPrice))
          const qty = Math.min(buyQty[item.id] ?? 1, maxAffordable)
          const key = `buy:${item.id}`
          return (
            <ItemCompraCard
              key={item.id}
              item={item}
              owned={items[item.id] || 0}
              gold={gold}
              qty={qty}
              ocupado={acao.pendingKey != null}
              isPending={acao.isPending(key)}
              onQtyChange={(v) => setBuyQty((m) => ({ ...m, [item.id]: v }))}
              onExecutarAtalho={(n) => void acao.run(`${key}:${n}`, () => comprar(item.id, n, item.name))}
              onComprar={() => void acao.run(key, () => comprar(item.id, qty, item.name))}
            />
          )
        })}
      </div>

      <div className={cn('flex min-w-0 flex-col gap-[.3em] overflow-x-auto', !mostrarVenda && 'hidden')}>
        <div className="flex items-center justify-between">
          <SectionLabel>VENDER ITENS</SectionLabel>
          <GameButton
            variant="ghost"
            disabled={acao.pendingKey != null}
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
          >
            Vender Tudo
          </GameButton>
        </div>

        {ownedItemIds.length === 0 && <p className="text-n500">Nenhum item para vender.</p>}

        {paginadoVenda.pagina.map((itemId) => {
          const item = ITEMS[itemId]
          const owned = items[itemId]
          const locked = Boolean(lockedItems[itemId])
          const qty = Math.min(sellQty[itemId] ?? 1, owned)
          return (
            <ItemVendaCard
              key={itemId}
              itemId={itemId}
              item={item}
              owned={owned}
              locked={locked}
              qty={qty}
              ocupado={acao.pendingKey != null}
              onQtyChange={(v) => setSellQty((m) => ({ ...m, [itemId]: v }))}
              onToggleLock={() =>
                void acao.run(`lock:${itemId}`, () =>
                  pedirAcao({ tipo: 'alternarTravaItem', itemId }, () => toggleItemLock(itemId)),
                )
              }
              onExecutarAtalho={(n) => void acao.run(`sell:${itemId}:${n}`, () => vender(itemId, n, item.name))}
              onVender={() => void acao.run(`sell:${itemId}`, () => vender(itemId, qty, item.name))}
              onVenderTudo={() => void acao.run(`sell-all:${itemId}`, () => vender(itemId, owned, item.name))}
            />
          )
        })}

        <Paginacao estado={paginadoVenda} rotulo="itens" />
      </div>
      </div>
    </div>
  )
}
