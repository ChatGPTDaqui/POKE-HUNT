// Port de js/ui/panels/BagMenu.js — abas Pokemons/Itens.
//
// O vanilla filtrava os cards ja renderizados via `display:none` em vez de
// re-renderizar, so pra nao perder o foco do input de busca a cada tecla
// (o `refresh()` dele reconstruia o painel inteiro). Em React o input e um
// node estavel entre renders, entao da pra filtrar o array de verdade —
// esse workaround nao precisa ser portado.
import { useMemo, useState } from 'react'
import { pedirAcao } from '@/data/remote/autoridade'
import { SPECIES, averageIvPercent, type PokeInstance } from '@/data/pokes'
import { ITEMS } from '@/data/items'
import { itemIconUrl, itemIconBorderColor } from '@/data/sprites'
import { rarityRank } from '@/data/rarity'
import { controller } from '@/engine/controller'
import { useGameStateStore, MAX_TEAM_SIZE } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { PokeNameTag } from '@/components/shared/PokeNameTag'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type SortKey = 'rarity' | 'iv' | 'level'
const SORT_LABELS: Record<SortKey, string> = { rarity: 'Raridade', iv: 'IV', level: 'Nivel' }

function sortValue(poke: PokeInstance, key: SortKey): number {
  if (key === 'rarity') return rarityRank(poke.rarity)
  if (key === 'iv') return averageIvPercent(poke.ivs)
  return poke.level
}

function PokemonsTab() {
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const teamLength = useGameStateStore((s) => s.team.length)
  const moveBagToTeam = useGameStateStore((s) => s.moveBagToTeam)
  const updatePokeInstance = useGameStateStore((s) => s.updatePokeInstance)
  const showProfile = usePokeProfileStore((s) => s.showProfile)

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('rarity')
  const [sortDesc, setSortDesc] = useState(true)
  const [shinyOnly, setShinyOnly] = useState(false)

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return [...bagPokes]
      .filter((poke) => {
        const species = SPECIES[poke.speciesId]
        // Guard herdado do vanilla: POKE com dado quebrado (save legado sem
        // ivs) nao pode derrubar a lista inteira.
        if (!species || !poke.ivs) {
          console.warn('BagMenu: pulando POKE com dados invalidos', poke)
          return false
        }
        if (shinyOnly && !poke.isShiny) return false
        return !term || species.name.toLowerCase().includes(term)
      })
      .sort((a, b) => {
        const diff = sortValue(a, sortKey) - sortValue(b, sortKey)
        return sortDesc ? -diff : diff
      })
  }, [bagPokes, search, sortKey, sortDesc, shinyOnly])

  if (bagPokes.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum POKE na mochila.</p>
  }

  const canMove = teamLength < MAX_TEAM_SIZE

  return (
    <div className="space-y-3">
      <Input placeholder="Buscar POKE por nome..." value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs text-muted-foreground">Ordenar por</Label>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8" onClick={() => setSortDesc((d) => !d)}>
          {sortDesc ? '↓' : '↑'}
        </Button>
        <Label className="flex items-center gap-1.5 text-xs">
          <Checkbox checked={shinyOnly} onCheckedChange={(c) => setShinyOnly(c === true)} />
          Somente Shiny ✨
        </Label>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum POKE encontrado.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((poke) => {
            const species = SPECIES[poke.speciesId]
            return (
              <div
                key={poke.uid}
                className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/40"
                onClick={() => showProfile(poke, species)}
              >
                <PokeSwatch species={species} isShiny={poke.isShiny} poke={poke} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <PokeNameTag poke={poke} species={species} />
                    <span className="text-muted-foreground">Lv{poke.level}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    HP {Math.floor(poke.hp)}/{poke.stats.hp}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  title={poke.locked ? 'Destrancar' : 'Trancar'}
                  onClick={(e) => {
                    e.stopPropagation()
                    void pedirAcao({ tipo: 'alternarTravaPoke', pokeUid: poke.uid }, () => updatePokeInstance(poke.uid, (p) => ({ ...p, locked: !p.locked })))
                  }}
                >
                  {poke.locked ? '🔒' : '🔓'}
                </Button>
                {canMove ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={(e) => {
                      e.stopPropagation()
                      void pedirAcao({ tipo: 'porNaEquipe', pokeUid: poke.uid }, () => { moveBagToTeam(poke.uid) })
                    }}
                  >
                    Mover p/ equipe
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Equipe cheia</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ItensTab() {
  const items = useGameStateStore((s) => s.items)
  const lockedItems = useGameStateStore((s) => s.lockedItems)
  const toggleItemLock = useGameStateStore((s) => s.toggleItemLock)
  const hasStarter = useGameStateStore((s) => s.team.length > 0)
  const fainted = useWorldStore((s) => Boolean(s.player?.fainted))

  const ids = Object.keys(items).filter((id) => items[id] > 0 && ITEMS[id])
  if (ids.length === 0) return <p className="text-sm text-muted-foreground">Nenhum item.</p>

  return (
    <div className="space-y-2">
      {ids.map((itemId) => {
        const item = ITEMS[itemId]
        const locked = Boolean(lockedItems[itemId])
        const canUse =
          hasStarter && (item.kind === 'revive' ? fainted : item.kind === 'potion' ? !fainted : false)
        const iconUrl = itemIconUrl(itemId)
        const borderColor = itemIconBorderColor(itemId)

        return (
          <div key={itemId} className="flex items-center gap-3 rounded-lg border bg-card p-3">
            {iconUrl && (
              <img
                src={iconUrl}
                alt={item.name}
                title={item.description}
                className="h-10 w-10 shrink-0 rounded-md object-contain"
                style={borderColor ? { border: `3px solid ${borderColor}` } : undefined}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {item.name} x{items[itemId]}
              </div>
              <div className="text-xs text-muted-foreground">{item.description}</div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              title={locked ? 'Destrancar' : 'Trancar'}
              onClick={() => { void pedirAcao({ tipo: 'alternarTravaItem', itemId }, () => toggleItemLock(itemId)) }}
            >
              {locked ? '🔒' : '🔓'}
            </Button>
            {canUse && (
              <Button size="sm" variant="outline" className="text-xs" onClick={() => controller.useItem(itemId)}>
                Usar
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function BagMenu() {
  const [tab, setTab] = useState('pokemons')
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Mochila</h2>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pokemons">Pokemons</TabsTrigger>
          <TabsTrigger value="itens">Itens</TabsTrigger>
        </TabsList>
        <TabsContent value="pokemons" className="mt-3">
          <PokemonsTab />
        </TabsContent>
        <TabsContent value="itens" className="mt-3">
          <ItensTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
