// Loja: aba Itens (colunas comprar/vender) e aba Pokemons (venda em lote com
// filtros).
//
// Todo botao daqui faz round-trip ao servidor de autoridade, entao todos passam
// por `useAcaoPendente` (fica desabilitado enquanto a intencao esta no ar) e por
// `pedirAcaoComLocal` (o toast reporta o resultado REAL, nao um literal fixo —
// ver a nota naquele helper).
import { useMemo, useState } from 'react'
import { Coin, Diamond, LockSimple, LockSimpleOpen } from '@phosphor-icons/react'
import { pedirAcao, pedirAcaoComLocal } from '@/data/remote/autoridade'
import { SHOP_STOCK, getItem, ITEMS } from '@/data/items'
import { SPECIES, averageIvPercent } from '@/data/pokes'
import { itemIconUrl, itemIconBorderColor } from '@/data/sprites'
import { RARITIES, rarityOf, type RarityKey } from '@/data/rarity'
import {
  buyItem, sellItem, sellAllItems, sellAllBagPokes, pokemonSellValue,
} from '@/engine/systems/economySystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useBreakpoints } from '@/stores/uiStore'
import { useToastStore, type ToastType } from '@/stores/toastStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useConfirmDialogStore } from '@/stores/confirmDialogStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { PokeNameTag } from '@/components/shared/PokeNameTag'
import {
  GameButton, GameCard, GameCheck, GameIconButton, GameInput, SectionLabel, SegmentedTabs,
} from '@/components/game/controls'

const fmt = new Intl.NumberFormat('pt-BR')

function toast(message: string, type: ToastType = 'success') {
  useToastStore.getState().pushToast(message, type, 'trade')
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
      className="h-[2.2em] w-[2.2em] shrink-0 rounded-[.4em] object-contain"
      style={borderColor ? { border: `3px solid ${borderColor}` } : undefined}
    />
  )
}

function QtyInput({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <GameInput
      type="number"
      min={1}
      max={max}
      value={value}
      onChange={(e) => onChange(Math.max(1, Math.min(max, Math.floor(Number(e.target.value) || 1))))}
      className="w-[3.4em] text-center"
    />
  )
}

function ItensTab() {
  const gold = useGameStateStore((s) => s.wallet.gold)
  const items = useGameStateStore((s) => s.items)
  const lockedItems = useGameStateStore((s) => s.lockedItems)
  const toggleItemLock = useGameStateStore((s) => s.toggleItemLock)
  const { colStack } = useBreakpoints()
  const acao = useAcaoPendente()

  const [buyQty, setBuyQty] = useState<Record<string, number>>({})
  const [sellQty, setSellQty] = useState<Record<string, number>>({})

  const ownedItemIds = Object.keys(items).filter((id) => items[id] > 0 && ITEMS[id])

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
    <div className={colStack ? 'flex flex-col gap-[1em]' : 'grid grid-cols-2 gap-[1em]'}>
      <div className="flex flex-col gap-[.5em]">
        <SectionLabel>COMPRAR</SectionLabel>
        {SHOP_STOCK.map((stock) => {
          const item = getItem(stock.itemId)
          if (!item || item.kind === 'stone') return null
          const maxAffordable = Math.max(1, Math.floor(gold / item.buyPrice))
          const qty = Math.min(buyQty[item.id] ?? 1, maxAffordable)
          const key = `buy:${item.id}`
          return (
            <GameCard key={item.id} className="flex flex-wrap items-center gap-[.6em] p-[.55em]">
              <ItemIcon itemId={item.id} name={item.name} description={item.description} />
              <div className="min-w-[6em] flex-1">
                <div className="font-medium">
                  {item.name} <span className="text-[.78em] text-n500">(tem: {items[item.id] || 0})</span>
                </div>
                <div className="text-[.78em] text-gold">{fmt.format(item.buyPrice)} ouro</div>
              </div>
              <QtyInput value={qty} max={maxAffordable} onChange={(v) => setBuyQty((m) => ({ ...m, [item.id]: v }))} />
              <GameButton
                disabled={acao.pendingKey != null}
                onClick={() => void acao.run(key, () => comprar(item.id, qty, item.name))}
              >
                {acao.isPending(key) ? '...' : `Comprar (${fmt.format(item.buyPrice * qty)})`}
              </GameButton>
            </GameCard>
          )
        })}
      </div>

      <div className="flex flex-col gap-[.5em]">
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

        {ownedItemIds.map((itemId) => {
          const item = ITEMS[itemId]
          const owned = items[itemId]
          const locked = Boolean(lockedItems[itemId])
          const qty = Math.min(sellQty[itemId] ?? 1, owned)
          return (
            <GameCard key={itemId} className="flex flex-wrap items-center gap-[.6em] p-[.55em]">
              <ItemIcon itemId={itemId} name={item.name} description={item.description} />
              <div className="min-w-[6em] flex-1">
                <div className="font-medium">
                  {item.name} <span className="text-n400">x{owned}</span>
                </div>
                <div className="text-[.78em] text-n500">
                  Venda: <span className="text-gold">{fmt.format(item.sellPrice)} ouro</span>
                </div>
              </div>
              <GameIconButton
                variant="ghost"
                title={locked ? 'Destrancar' : 'Trancar'}
                aria-label={locked ? 'Destrancar' : 'Trancar'}
                className={locked ? 'text-gold' : undefined}
                onClick={() =>
                  void acao.run(`lock:${itemId}`, () =>
                    pedirAcao({ tipo: 'alternarTravaItem', itemId }, () => toggleItemLock(itemId)),
                  )
                }
              >
                {locked ? <LockSimple weight="fill" /> : <LockSimpleOpen />}
              </GameIconButton>
              {!locked && (
                <>
                  <QtyInput value={qty} max={owned} onChange={(v) => setSellQty((m) => ({ ...m, [itemId]: v }))} />
                  <GameButton
                    disabled={acao.pendingKey != null}
                    onClick={() => void acao.run(`sell:${itemId}`, () => vender(itemId, qty, item.name))}
                  >
                    Vender ({fmt.format(item.sellPrice * qty)})
                  </GameButton>
                </>
              )}
            </GameCard>
          )
        })}
      </div>
    </div>
  )
}

function PokemonsTab() {
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const showProfile = usePokeProfileStore((s) => s.showProfile)
  const askConfirm = useConfirmDialogStore((s) => s.confirm)
  const acao = useAcaoPendente()

  const [search, setSearch] = useState('')
  const [ivMin, setIvMin] = useState(0)
  const [ivMax, setIvMax] = useState(100)
  const [sortDesc, setSortDesc] = useState(true)
  const [shinyOnly, setShinyOnly] = useState(false)
  const [selectedRarities, setSelectedRarities] = useState<Set<RarityKey>>(
    () => new Set(Object.keys(RARITIES) as RarityKey[]),
  )
  const [selectedUids, setSelectedUids] = useState<Set<string>>(() => new Set())

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    // Os limites podem ser digitados fora de ordem (min > max) — compara contra
    // o par ordenado pra nunca resultar numa lista vazia por engano; os campos
    // continuam mostrando exatamente o que foi digitado.
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

  // POKEs trancados nunca entram na selecao em lote. Shinies so entram quando o
  // filtro "Somente Shiny" esta ativo (e ai a venda exige confirmacao) — mesma
  // regra de seguranca do "Vender Tudo", que nunca toca em shiny.
  const selectable = filtered.filter(({ poke }) => !poke.locked && (shinyOnly || !poke.isShiny))
  const selectableUids = selectable.map(({ poke }) => poke.uid)
  const allSelected = selectableUids.length > 0 && selectableUids.every((uid) => selectedUids.has(uid))
  const activeSelection = [...selectedUids].filter((uid) => selectableUids.includes(uid))

  async function venderLote(uids: string[], extras?: { shiny: number; locked: number }) {
    const { ok, local } = await pedirAcaoComLocal(
      { tipo: 'venderPokes', pokeUids: uids },
      () => sellAllBagPokes(useGameStateStore.getState(), uids),
    )
    setSelectedUids(new Set())
    if (!ok) return
    if (local && local.pokeCount > 0) {
      toast(`Vendeu ${local.pokeCount} POKE(s) por ${fmt.format(local.gold)} ouro.`)
    }
    // Contagens de poupados sao calculadas do estado LOCAL antes da acao, entao
    // valem nos dois caminhos.
    if (extras?.shiny) toast(`${extras.shiny} POKE(s) Shiny nao foram vendidos ✨`, 'info')
    if (extras?.locked) toast(`${extras.locked} POKE(s) trancado(s) nao foram vendidos.`, 'info')
  }

  function venderSelecionados() {
    const uids = activeSelection
    if (uids.length === 0) return
    const executar = () => void acao.run('sell-selected', () => venderLote(uids))
    // A selecao so contem shiny enquanto "Somente Shiny" esta ativo (ver
    // `selectable`) — nesse caso todo uid e shiny, contagem direta basta.
    if (shinyOnly) {
      askConfirm({
        title: 'Vender POKEs Shiny?',
        message: `Voce esta vendendo ${uids.length} POKE(s) Shiny. Essa acao nao pode ser desfeita.`,
        confirmLabel: 'Vender',
        onConfirm: executar,
      })
    } else {
      executar()
    }
  }

  function venderTudo() {
    const shiny = filtered.filter(({ poke }) => poke.isShiny).length
    const locked = filtered.filter(({ poke }) => poke.locked).length
    const uids = filtered.filter(({ poke }) => !poke.isShiny && !poke.locked).map(({ poke }) => poke.uid)
    if (uids.length === 0) {
      toast('Nenhum POKE elegivel (shiny e trancados sao poupados).', 'info')
      return
    }
    void acao.run('sell-all-pokes', () => venderLote(uids, { shiny, locked }))
  }

  return (
    <div className="flex flex-col gap-[.6em]">
      <SectionLabel>VENDER POKES EXTRAS (MOCHILA)</SectionLabel>

      <div className="flex flex-wrap items-center gap-[.5em]">
        <GameInput
          placeholder="Buscar por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[9em] flex-1"
        />
        <label className="flex items-center gap-[.3em] text-[.8em] text-n400">
          IV min
          <GameInput
            type="number" min={0} max={100} value={ivMin} className="w-[3.4em] text-center"
            onChange={(e) => setIvMin(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          />
        </label>
        <label className="flex items-center gap-[.3em] text-[.8em] text-n400">
          IV max
          <GameInput
            type="number" min={0} max={100} value={ivMax} className="w-[3.4em] text-center"
            onChange={(e) => setIvMax(Math.max(0, Math.min(100, Number(e.target.value) || 100)))}
          />
        </label>
        <GameButton onClick={() => setSortDesc((d) => !d)}>IV {sortDesc ? '↓' : '↑'}</GameButton>
      </div>

      <div className="flex flex-wrap items-center gap-x-[.9em] gap-y-[.3em]">
        {Object.values(RARITIES).map((r) => (
          <GameCheck
            key={r.key}
            checked={selectedRarities.has(r.key)}
            onChange={(on) =>
              setSelectedRarities((prev) => {
                const next = new Set(prev)
                if (on) next.add(r.key)
                else next.delete(r.key)
                return next
              })
            }
          >
            <span style={{ color: r.color }}>{r.label}</span>
          </GameCheck>
        ))}
        <GameCheck
          checked={shinyOnly}
          onChange={(on) => {
            setShinyOnly(on)
            setSelectedUids(new Set()) // trocar de modo muda o que e selecionavel
          }}
        >
          Somente Shiny ✨
        </GameCheck>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-[.5em]">
        <GameCheck
          checked={allSelected}
          onChange={(on) => setSelectedUids(on ? new Set(selectableUids) : new Set())}
        >
          Selecionar tudo
        </GameCheck>
        <div className="flex gap-[.4em]">
          <GameButton
            disabled={activeSelection.length === 0 || acao.pendingKey != null}
            onClick={venderSelecionados}
          >
            Vender Selecionados ({activeSelection.length})
          </GameButton>
          <GameButton variant="ghost" disabled={acao.pendingKey != null} onClick={venderTudo}>
            Vender Tudo
          </GameButton>
        </div>
      </div>

      {ivMin > ivMax && (
        <p className="text-[.78em] text-warn">IV min maior que IV max — invertido automaticamente para filtrar.</p>
      )}
      {bagPokes.length === 0 && <p className="text-n500">Nenhum POKE extra na mochila.</p>}
      {bagPokes.length > 0 && filtered.length === 0 && (
        <p className="text-n500">Nenhum POKE corresponde aos filtros.</p>
      )}

      {filtered.map(({ poke, ivPct }) => {
        const species = SPECIES[poke.speciesId]
        const value = pokemonSellValue(poke.level, species.baseExp, poke.rarity)
        const showCheckbox = !poke.locked && (shinyOnly || !poke.isShiny)
        const key = `sell:${poke.uid}`

        function venderUm() {
          // Venda individual passa pelo MESMO endpoint em lote: antes ela
          // chamava `sellBagPoke` local direto, sem `pedirAcao`, entao sob
          // autoridade do servidor o POKE reaparecia no sincronismo seguinte.
          const executar = () => void acao.run(key, () => venderLote([poke.uid]))
          if (poke.isShiny) {
            askConfirm({
              title: 'Vender POKE Shiny?',
              message: `${species.name} e Shiny. Essa acao nao pode ser desfeita. Vender por ${fmt.format(value)} ouro?`,
              confirmLabel: 'Vender',
              onConfirm: executar,
            })
          } else {
            executar()
          }
        }

        return (
          <GameCard key={poke.uid} className="flex items-center gap-[.6em] p-[.55em]">
            {showCheckbox ? (
              <GameCheck
                checked={selectedUids.has(poke.uid)}
                onChange={(on) =>
                  setSelectedUids((prev) => {
                    const next = new Set(prev)
                    if (on) next.add(poke.uid)
                    else next.delete(poke.uid)
                    return next
                  })
                }
              />
            ) : (
              // Espacador: mantem o alinhamento das colunas quando a linha nao
              // pode ser selecionada (shiny/trancado).
              <span className="w-[1em] shrink-0" />
            )}
            <span onClick={() => showProfile(poke, species)} className="cursor-pointer">
              <PokeSwatch species={species} isShiny={poke.isShiny} poke={poke} size={2.4} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-[.4em]">
                <PokeNameTag poke={poke} species={species} />
                <span className="text-n400">Lv{poke.level}</span>
                <span className="text-[.78em] text-n500">IV {ivPct.toFixed(0)}%</span>
              </div>
            </div>
            <GameButton
              disabled={poke.locked || acao.pendingKey != null}
              title={poke.locked ? 'Trancado — destranque na Mochila' : undefined}
              onClick={venderUm}
            >
              {poke.locked ? '🔒 Trancado' : `Vender (${fmt.format(value)})`}
            </GameButton>
          </GameCard>
        )
      })}
    </div>
  )
}

export function ShopMenu() {
  const [tab, setTab] = useState<'itens' | 'pokemons'>('itens')
  const gold = useGameStateStore((s) => s.wallet.gold)
  const diamonds = useGameStateStore((s) => s.wallet.diamonds)

  return (
    <div className="flex flex-col gap-[.8em]">
      <div className="flex flex-wrap items-center gap-[.8em]">
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'itens', label: 'Itens' },
            { value: 'pokemons', label: 'Pokemons' },
          ]}
        />
        <span className="flex items-center gap-[.6em] text-[.85em] text-n300">
          <span className="flex items-center gap-[.25em] text-gold">
            <Coin weight="fill" /> {fmt.format(gold)}
          </span>
          <span className="flex items-center gap-[.25em] text-diamond">
            <Diamond weight="fill" /> {fmt.format(diamonds)}
          </span>
        </span>
      </div>
      {tab === 'itens' ? <ItensTab /> : <PokemonsTab />}
    </div>
  )
}
