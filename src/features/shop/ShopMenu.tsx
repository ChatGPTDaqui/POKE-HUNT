// Port de js/ui/panels/ShopMenu.js — aba Itens (colunas comprar/vender) e
// aba Pokemons (venda em lote com filtros).
import { useMemo, useState } from 'react'
import { pedirAcao } from '@/data/remote/autoridade'
import { SHOP_STOCK, getItem, ITEMS } from '@/data/items'
import { SPECIES, averageIvPercent } from '@/data/pokes'
import { itemIconUrl, itemIconBorderColor } from '@/data/sprites'
import { RARITIES, rarityOf, type RarityKey } from '@/data/rarity'
import {
  buyItem, sellItem, sellAllItems, sellBagPoke, sellAllBagPokes, pokemonSellValue,
} from '@/engine/systems/economySystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useToastStore, type ToastType, type ToastChannel } from '@/stores/toastStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { PokeNameTag } from '@/components/shared/PokeNameTag'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

function toast(message: string, type: ToastType, channel: ToastChannel) {
  useToastStore.getState().pushToast(message, type, channel)
}

function ItemIcon({ itemId, name, description }: { itemId: string; name: string; description?: string }) {
  const url = itemIconUrl(itemId)
  const borderColor = itemIconBorderColor(itemId)
  if (!url) return null
  return (
    <img
      src={url}
      alt={name}
      title={description}
      className="h-10 w-10 shrink-0 rounded-md object-contain"
      style={borderColor ? { border: `3px solid ${borderColor}` } : undefined}
    />
  )
}

// Slider + campo numerico sincronizados. No vanilla os dois eram inputs
// separados que se atualizavam via listener manual pra nao disparar um
// re-render do painel inteiro no meio do arrasto; aqui e so estado local.
function QtyControl({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Slider
        className="w-24"
        min={1}
        max={Math.max(1, max)}
        step={1}
        value={value}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
      <Input
        type="number"
        className="h-8 w-16 text-xs"
        min={1}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.min(max, Math.floor(Number(e.target.value) || 1))))}
      />
    </div>
  )
}

function ItensTab() {
  const gold = useGameStateStore((s) => s.wallet.gold)
  const items = useGameStateStore((s) => s.items)
  const lockedItems = useGameStateStore((s) => s.lockedItems)
  const toggleItemLock = useGameStateStore((s) => s.toggleItemLock)

  const [buyQty, setBuyQty] = useState<Record<string, number>>({})
  const [sellQty, setSellQty] = useState<Record<string, number>>({})

  const ownedItemIds = Object.keys(items).filter((id) => items[id] > 0 && ITEMS[id])

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <div className="text-xs font-semibold tracking-wide text-muted-foreground">COMPRAR</div>
        {SHOP_STOCK.map((stock) => {
          const item = getItem(stock.itemId)
          if (!item || item.kind === 'stone') return null
          const buyPrice = item.buyPrice
          const maxAffordable = Math.max(1, Math.floor(gold / buyPrice))
          const qty = Math.min(buyQty[item.id] ?? 1, maxAffordable)
          return (
            <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
              <ItemIcon itemId={item.id} name={item.name} description={item.description} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {item.name} <span className="text-xs text-muted-foreground">(voce tem: {items[item.id] || 0})</span>
                </div>
                <div className="text-xs text-muted-foreground">Preço: {buyPrice} ouro</div>
              </div>
              <QtyControl value={qty} max={maxAffordable} onChange={(v) => setBuyQty((m) => ({ ...m, [item.id]: v }))} />
              <Button
                size="sm"
                className="text-xs"
                onClick={() => {
                  const res = { success: true } as const; void pedirAcao({ tipo: 'comprarItem', itemId: item.id, qtd: qty }, () => { buyItem(useGameStateStore.getState(), item.id, qty) })
                  if (res.success) toast(`Comprou ${item.name} x${qty}.`, 'success', 'trade')
                  else toast('Ouro insuficiente.', 'error', 'trade')
                }}
              >
                Comprar ({buyPrice * qty} ouro)
              </Button>
            </div>
          )
        })}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground">VENDER ITENS</div>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => {
              const res = { gold: 0, itemCount: 0 }; void pedirAcao({ tipo: 'venderTodosItens' }, () => { sellAllItems(useGameStateStore.getState()) })
              if (res.itemCount > 0) toast(`Vendeu ${res.itemCount} itens por ${res.gold} ouro.`, 'success', 'trade')
            }}
          >
            Vender Tudo
          </Button>
        </div>

        {ownedItemIds.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item para vender.</p>}

        {ownedItemIds.map((itemId) => {
          const item = ITEMS[itemId]
          const owned = items[itemId]
          const locked = Boolean(lockedItems[itemId])
          const qty = Math.min(sellQty[itemId] ?? 1, owned)
          return (
            <div key={itemId} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
              <ItemIcon itemId={itemId} name={item.name} description={item.description} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {item.name} x{owned}
                </div>
                <div className="text-xs text-muted-foreground">Valor de venda: {item.sellPrice} ouro</div>
              </div>
              <Button size="sm" variant="ghost" title={locked ? 'Destrancar' : 'Trancar'} onClick={() => toggleItemLock(itemId)}>
                {locked ? '🔒' : '🔓'}
              </Button>
              {!locked && (
                <>
                  <QtyControl value={qty} max={owned} onChange={(v) => setSellQty((m) => ({ ...m, [itemId]: v }))} />
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => { void pedirAcao({ tipo: 'venderItem', itemId, qtd: qty }, () => { sellItem(useGameStateStore.getState(), itemId, qty) }) }}
                  >
                    Vender ({qty})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => {
                      void pedirAcao({ tipo: 'venderItem', itemId, qtd: owned }, () => { sellItem(useGameStateStore.getState(), itemId, owned) })
                      toast(`Vendeu ${item.name} x${owned}.`, 'success', 'trade')
                    }}
                  >
                    Vender Tudo
                  </Button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface PendingSell {
  title: string
  message: string
  onConfirm: () => void
}

function PokemonsTab() {
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const showProfile = usePokeProfileStore((s) => s.showProfile)

  const [search, setSearch] = useState('')
  const [ivMin, setIvMin] = useState(0)
  const [ivMax, setIvMax] = useState(100)
  const [sortDesc, setSortDesc] = useState(true)
  const [shinyOnly, setShinyOnly] = useState(false)
  const [selectedRarities, setSelectedRarities] = useState<Set<RarityKey>>(
    () => new Set(Object.keys(RARITIES) as RarityKey[]),
  )
  const [selectedUids, setSelectedUids] = useState<Set<string>>(() => new Set())
  const [pending, setPending] = useState<PendingSell | null>(null)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    // Os limites podem ser digitados fora de ordem (min > max) — compara
    // contra o par ordenado pra nunca resultar numa lista vazia por engano;
    // os campos continuam mostrando exatamente o que foi digitado.
    const lo = Math.min(ivMin, ivMax)
    const hi = Math.max(ivMin, ivMax)
    return bagPokes
      .filter((poke) => SPECIES[poke.speciesId] && poke.ivs)
      .map((poke) => ({ poke, ivPct: averageIvPercent(poke.ivs) }))
      .filter(({ poke, ivPct }) =>
        ivPct >= lo && ivPct <= hi
        && selectedRarities.has(rarityOf(poke).key)
        && (!shinyOnly || poke.isShiny)
        && (!term || SPECIES[poke.speciesId].name.toLowerCase().includes(term)))
      .sort((a, b) => (sortDesc ? b.ivPct - a.ivPct : a.ivPct - b.ivPct))
  }, [bagPokes, search, ivMin, ivMax, sortDesc, shinyOnly, selectedRarities])

  // POKEs trancados nunca entram na selecao em lote. Shinies so entram
  // quando o filtro "Somente Shiny" esta ativo (e ai a venda exige confirm) —
  // mesma regra de seguranca do "Vender Tudo", que nunca toca em shiny.
  const selectable = filtered.filter(({ poke }) => !poke.locked && (shinyOnly || !poke.isShiny))
  const selectableUids = selectable.map(({ poke }) => poke.uid)
  const allSelected = selectableUids.length > 0 && selectableUids.every((uid) => selectedUids.has(uid))
  // Uids que sairam do filtro (vendidos, ou nao batem mais) nao contam.
  const activeSelection = [...selectedUids].filter((uid) => selectableUids.includes(uid))

  function toggleRarity(key: RarityKey, on: boolean) {
    setSelectedRarities((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  }

  function sellSelected() {
    const uids = activeSelection
    const doSell = () => {
      const res = { gold: 0, pokeCount: uids.length }; void pedirAcao({ tipo: 'venderPokes', pokeUids: uids }, () => { sellAllBagPokes(useGameStateStore.getState(), uids) })
      setSelectedUids(new Set())
      if (res.pokeCount > 0) toast(`Vendeu ${res.pokeCount} POKEs por ${res.gold} ouro.`, 'success', 'trade')
    }
    // A selecao so contem shiny enquanto "Somente Shiny" esta ativo (ver
    // `selectable`) — nesse caso todo uid e shiny, contagem direta basta.
    if (shinyOnly && uids.length > 0) {
      setPending({
        title: 'Vender POKEs Shiny?',
        message: `Voce esta vendendo ${uids.length} POKE(s) Shiny! Essa acao nao pode ser desfeita. Confirmar venda?`,
        onConfirm: doSell,
      })
    } else {
      doSell()
    }
  }

  function sellAll() {
    const shinyCount = filtered.filter(({ poke }) => poke.isShiny).length
    const lockedCount = filtered.filter(({ poke }) => poke.locked).length
    const uids = filtered.filter(({ poke }) => !poke.isShiny && !poke.locked).map(({ poke }) => poke.uid)
    const res = { gold: 0, pokeCount: uids.length }; void pedirAcao({ tipo: 'venderPokes', pokeUids: uids }, () => { sellAllBagPokes(useGameStateStore.getState(), uids) })
    setSelectedUids(new Set())
    if (res.pokeCount > 0) toast(`Vendeu ${res.pokeCount} POKEs por ${res.gold} ouro.`, 'success', 'trade')
    if (shinyCount > 0) toast(`${shinyCount} POKE(s) Shiny nao foram vendidos automaticamente.`, 'info', 'trade')
    if (lockedCount > 0) toast(`${lockedCount} POKE(s) trancado(s) nao foram vendidos.`, 'info', 'trade')
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold tracking-wide text-muted-foreground">VENDER POKES EXTRAS (MOCHILA)</div>

      <Input placeholder="Buscar POKE por nome..." value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="flex flex-wrap items-center gap-2">
        <Label className="flex items-center gap-1 text-xs">
          IV min%
          <Input
            type="number" className="h-8 w-16 text-xs" min={0} max={100} value={ivMin}
            onChange={(e) => setIvMin(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          />
        </Label>
        <Label className="flex items-center gap-1 text-xs">
          IV max%
          <Input
            type="number" className="h-8 w-16 text-xs" min={0} max={100} value={ivMax}
            onChange={(e) => setIvMax(Math.max(0, Math.min(100, Number(e.target.value) || 100)))}
          />
        </Label>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setSortDesc((d) => !d)}>
          Ordenar por IV {sortDesc ? '↓' : '↑'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {Object.values(RARITIES).map((r) => (
          <Label key={r.key} className="flex items-center gap-1.5 text-xs" style={{ color: r.color }}>
            <Checkbox
              checked={selectedRarities.has(r.key)}
              onCheckedChange={(c) => toggleRarity(r.key, c === true)}
            />
            {r.label}
          </Label>
        ))}
        <Label className="flex items-center gap-1.5 text-xs">
          <Checkbox
            checked={shinyOnly}
            onCheckedChange={(c) => {
              setShinyOnly(c === true)
              setSelectedUids(new Set()) // trocar de modo muda o que e selecionavel
            }}
          />
          Somente Shiny ✨
        </Label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-xs">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(c) => setSelectedUids(c === true ? new Set(selectableUids) : new Set())}
          />
          Selecionar tudo
        </Label>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="text-xs" disabled={activeSelection.length === 0} onClick={sellSelected}>
            {activeSelection.length > 0 ? `Vender Selecionados (${activeSelection.length})` : 'Vender Selecionados'}
          </Button>
          <Button size="sm" variant="outline" className="text-xs" onClick={sellAll}>
            Vender Tudo
          </Button>
        </div>
      </div>

      {ivMin > ivMax && (
        <p className="text-xs text-muted-foreground">
          Aviso: IV min% é maior que IV max% — invertido automaticamente para filtrar.
        </p>
      )}
      {bagPokes.length === 0 && <p className="text-sm text-muted-foreground">Nenhum POKE extra na mochila.</p>}
      {bagPokes.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum POKE corresponde ao filtro de IV.</p>
      )}

      <div className="space-y-2">
        {filtered.map(({ poke, ivPct }) => {
          const species = SPECIES[poke.speciesId]
          const value = pokemonSellValue(poke.level, species.baseExp, poke.rarity)
          const showCheckbox = !poke.locked && (shinyOnly || !poke.isShiny)
          return (
            <div
              key={poke.uid}
              className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/40"
              onClick={() => showProfile(poke, species)}
            >
              {showCheckbox ? (
                <span onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedUids.has(poke.uid)}
                    onCheckedChange={(c) =>
                      setSelectedUids((prev) => {
                        const next = new Set(prev)
                        if (c === true) next.add(poke.uid)
                        else next.delete(poke.uid)
                        return next
                      })
                    }
                  />
                </span>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <PokeSwatch species={species} isShiny={poke.isShiny} poke={poke} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <PokeNameTag poke={poke} species={species} />
                  <span className="text-muted-foreground">Lv{poke.level}</span>
                </div>
                <div className="text-xs text-muted-foreground">IV: {ivPct.toFixed(0)}%</div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                disabled={poke.locked}
                title={poke.locked ? 'Trancado - destranque na Mochila' : undefined}
                onClick={(e) => {
                  e.stopPropagation()
                  if (poke.locked) return
                  const doSell = () => {
                    setSelectedUids((prev) => {
                      const next = new Set(prev)
                      next.delete(poke.uid)
                      return next
                    })
                    sellBagPoke(useGameStateStore.getState(), poke.uid)
                  }
                  if (poke.isShiny) {
                    setPending({
                      title: 'Vender POKE Shiny?',
                      message: `${species.name} eh Shiny! Essa acao nao pode ser desfeita. Vender mesmo assim por ${value} ouro?`,
                      onConfirm: doSell,
                    })
                  } else {
                    doSell()
                  }
                }}
              >
                {poke.locked ? '🔒 Trancado' : `Vender (${value} ouro)`}
              </Button>
            </div>
          )
        })}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                pending?.onConfirm()
                setPending(null)
              }}
            >
              Vender
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function ShopMenu() {
  const [tab, setTab] = useState('itens')
  const gold = useGameStateStore((s) => s.wallet.gold)
  const diamonds = useGameStateStore((s) => s.wallet.diamonds)

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Loja</h2>
      <div className="text-sm font-medium">
        Ouro: {gold} | Diamantes: {diamonds}
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="itens">Itens</TabsTrigger>
          <TabsTrigger value="pokemons">Pokemons</TabsTrigger>
        </TabsList>
        <TabsContent value="itens" className="mt-3">
          <ItensTab />
        </TabsContent>
        <TabsContent value="pokemons" className="mt-3">
          <PokemonsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
