// Mochila: abas Pokemons/Itens.
//
// O vanilla filtrava os cards ja renderizados via `display:none` em vez de
// re-renderizar, so pra nao perder o foco do input de busca a cada tecla (o
// `refresh()` dele reconstruia o painel inteiro). Em React o input e um node
// estavel entre renders, entao da pra filtrar o array de verdade — esse
// workaround nao precisa ser portado.
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, LockSimple, LockSimpleOpen, Sparkle } from '@phosphor-icons/react'
import { pedirAcao } from '@/data/remote/autoridade'
import { SPECIES, averageIvPercent, type PokeInstance } from '@/data/pokes'
import { ITEMS } from '@/data/items'
import { itemIconUrl, itemIconBorderColor } from '@/data/sprites'
import { rarityRank } from '@/data/rarity'
import { controller } from '@/engine/controller'
import { useGameStateStore, MAX_TEAM_SIZE } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { PokeNameTag } from '@/components/shared/PokeNameTag'
import { linkarItem, linkarPoke, tratouComoLink } from '@/components/shared/linkarNoChat'
import { ItemTooltip } from '@/components/shared/ItemTooltip'
import {
  GameButton, GameCard, GameCheck, GameIconButton, GameInput, GameSelect, SegmentedTabs,
} from '@/components/game/controls'
import { Paginacao, usePaginacao } from '@/components/game/Paginacao'
import { cn } from '@/lib/utils'

type SortKey = 'rarity' | 'iv' | 'level'
const SORT_LABELS: Record<SortKey, string> = { rarity: 'Raridade', iv: 'IV', level: 'Nivel' }

function sortValue(poke: PokeInstance, key: SortKey): number {
  if (key === 'rarity') return rarityRank(poke.rarity)
  if (key === 'iv') return averageIvPercent(poke.ivs)
  return poke.level
}

function LockButton({ locked, onToggle, disabled }: { locked: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <GameIconButton
      variant="ghost"
      disabled={disabled}
      title={locked ? 'Destrancar' : 'Trancar (nunca sera vendido)'}
      aria-label={locked ? 'Destrancar' : 'Trancar'}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className={locked ? 'text-gold' : undefined}
    >
      {locked ? <LockSimple weight="fill" /> : <LockSimpleOpen />}
    </GameIconButton>
  )
}

function PokemonsTab() {
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const teamLength = useGameStateStore((s) => s.team.length)
  const moveBagToTeam = useGameStateStore((s) => s.moveBagToTeam)
  const updatePokeInstance = useGameStateStore((s) => s.updatePokeInstance)
  const showProfile = usePokeProfileStore((s) => s.showProfile)
  const acao = useAcaoPendente()

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
      // Ordena uma COPIA: `bagPokes` e a ordem real de captura, e reordenar o
      // array da store mudaria o save por causa de um filtro de tela.
      .sort((a, b) => {
        const diff = sortValue(a, sortKey) - sortValue(b, sortKey)
        return sortDesc ? -diff : diff
      })
  }, [bagPokes, search, sortKey, sortDesc, shinyOnly])

  // Pagina DEPOIS de filtrar/ordenar: a busca continua varrendo a mochila
  // inteira, so a renderizacao e limitada — ver a nota em Paginacao.tsx.
  const paginado = usePaginacao(visible)

  if (bagPokes.length === 0) return <p className="text-n500">Nenhum POKE na mochila.</p>

  const canMove = teamLength < MAX_TEAM_SIZE

  return (
    <div className="flex flex-col gap-[.45em]">
      <div className="flex flex-wrap items-center gap-[.5em]">
        <GameInput
          placeholder="Buscar POKE por nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[10em] flex-1"
        />
        <GameSelect value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <option key={key} value={key}>{SORT_LABELS[key]}</option>
          ))}
        </GameSelect>
        <GameButton onClick={() => setSortDesc((d) => !d)} title={sortDesc ? 'Maior primeiro' : 'Menor primeiro'}>
          {sortDesc ? <ArrowDown /> : <ArrowUp />}
        </GameButton>
        <GameCheck checked={shinyOnly} onChange={setShinyOnly}>
          <span className="inline-flex items-center gap-[.25em]">
            Somente <Sparkle weight="fill" className="text-shiny" /> Shiny
          </span>
        </GameCheck>
      </div>

      {visible.length === 0 ? (
        <p className="text-n500">Nenhum POKE encontrado.</p>
      ) : (
        paginado.pagina.map((poke) => {
          const species = SPECIES[poke.speciesId]
          return (
            <GameCard
              key={poke.uid}
              title="Clique para ver o perfil · Shift+clique para linkar no chat"
              onClick={(e) => {
                if (tratouComoLink(e, () => linkarPoke(poke, species))) return
                showProfile(poke, species)
              }}
              className="flex items-center gap-[.5em] p-[.6em]"
            >
              <PokeSwatch species={species} isShiny={poke.isShiny} poke={poke} size={2.6} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-[.4em]">
                  <PokeNameTag poke={poke} species={species} />
                  <span className="text-n400">Lv{poke.level}</span>
                </div>
                <div className="text-[.75em] text-n500">
                  HP {Math.floor(poke.hp)}/{poke.stats.hp} · IV {averageIvPercent(poke.ivs).toFixed(0)}%
                </div>
              </div>
              <LockButton
                locked={Boolean(poke.locked)}
                disabled={acao.isPending(`lock:${poke.uid}`)}
                onToggle={() => {
                  void acao.run(`lock:${poke.uid}`, () =>
                    pedirAcao({ tipo: 'alternarTravaPoke', pokeUid: poke.uid }, () =>
                      updatePokeInstance(poke.uid, (p) => ({ ...p, locked: !p.locked }))),
                  )
                }}
              />
              {canMove ? (
                <GameButton
                  disabled={acao.pendingKey != null}
                  onClick={(e) => {
                    e.stopPropagation()
                    void acao.run(`team:${poke.uid}`, () =>
                      pedirAcao({ tipo: 'porNaEquipe', pokeUid: poke.uid }, () => { moveBagToTeam(poke.uid) }),
                    )
                  }}
                >
                  Mover p/ equipe
                </GameButton>
              ) : (
                <span className="text-[.78em] text-n500">Equipe cheia</span>
              )}
            </GameCard>
          )
        })
      )}

      <Paginacao estado={paginado} rotulo="POKEs" />
    </div>
  )
}

function ItensTab() {
  const items = useGameStateStore((s) => s.items)
  const lockedItems = useGameStateStore((s) => s.lockedItems)
  const toggleItemLock = useGameStateStore((s) => s.toggleItemLock)
  const hasStarter = useGameStateStore((s) => s.team.length > 0)
  const fainted = useWorldStore((s) => Boolean(s.player?.fainted))
  const acao = useAcaoPendente()

  // Memo pra `usePaginacao` nao recortar um array novo a cada render (o objeto
  // `items` muda de identidade em todo flush do servidor).
  //
  // Item TRANCADO vai pro fim da lista (pedido explicito). O criterio de
  // desempate continua sendo o nome, e nao a ordem de chegada do objeto: sem
  // ele, destrancar um item o mandaria pra uma posicao aleatoria em vez de
  // devolve-lo ao lugar de onde saiu.
  const ids = useMemo(
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
  // A lista de itens tambem pagina: com as 17 Stones + bolas/pocoes/revives ela
  // ja passa de 30 linhas, cada uma com icone proprio.
  const paginado = usePaginacao(ids)

  if (ids.length === 0) return <p className="text-n500">Nenhum item.</p>

  return (
    <div className="flex flex-col gap-[.5em]">
      {paginado.pagina.map((itemId) => {
        const item = ITEMS[itemId]
        const locked = Boolean(lockedItems[itemId])
        // "Usar" so aparece quando de fato faz alguma coisa AGORA: pocao com o
        // POKE de pe, revive com ele desmaiado. Um botao que sempre existe e
        // sempre recusa e pior que a ausencia dele.
        const canUse = hasStarter && (item.kind === 'revive' ? fainted : item.kind === 'potion' ? !fainted : false)
        const iconUrl = itemIconUrl(itemId)
        // Stones compartilham UM icone base; a distincao entre os 17 tipos vem
        // da cor da borda (nao existem 17 sprites no pack de origem).
        const borderColor = itemIconBorderColor(itemId)

        return (
          <GameCard
            key={itemId}
            title="Shift+clique para linkar no chat"
            onClick={(e) => { tratouComoLink(e, () => linkarItem(item, items[itemId])) }}
            className={cn('flex items-center gap-[.5em] p-[.6em]', locked && 'border-gold/40')}
          >
            <ItemTooltip item={item}>
              {iconUrl && (
                <img
                  src={iconUrl}
                  alt={item.name}
                  className="h-[2.6em] w-[2.6em] shrink-0 rounded-[.5em] object-contain"
                  style={borderColor ? { border: `3px solid ${borderColor}` } : undefined}
                />
              )}
            </ItemTooltip>
            <ItemTooltip item={item}>
              <div className="min-w-0 flex-1 cursor-help">
                <div className="font-medium">
                  {item.name} <span className="text-n400">x{items[itemId]}</span>
                </div>
                <div className="text-[.75em] text-n500">{item.description}</div>
              </div>
            </ItemTooltip>
            <LockButton
              locked={locked}
              disabled={acao.isPending(`lock:${itemId}`)}
              onToggle={() => {
                void acao.run(`lock:${itemId}`, () =>
                  pedirAcao({ tipo: 'alternarTravaItem', itemId }, () => toggleItemLock(itemId)),
                )
              }}
            />
            {canUse && (
              <GameButton onClick={() => controller.useItem(itemId)}>Usar</GameButton>
            )}
          </GameCard>
        )
      })}

      <Paginacao estado={paginado} rotulo="itens" />
    </div>
  )
}

export function BagMenu() {
  const [tab, setTab] = useState<'pokemons' | 'itens'>('pokemons')
  return (
    <div className="flex flex-col gap-[.55em]">
      <SegmentedTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pokemons', label: 'Pokemons' },
          { value: 'itens', label: 'Itens' },
        ]}
      />
      {tab === 'pokemons' ? <PokemonsTab /> : <ItensTab />}
    </div>
  )
}
