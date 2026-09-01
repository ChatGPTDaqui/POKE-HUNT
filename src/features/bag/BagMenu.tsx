// Mochila: abas Pokemons/Itens.
//
// O vanilla filtrava os cards ja renderizados via `display:none` em vez de
// re-renderizar, so pra nao perder o foco do input de busca a cada tecla (o
// `refresh()` dele reconstruia o painel inteiro). Em React o input e um node
// estavel entre renders, entao da pra filtrar o array de verdade — esse
// workaround nao precisa ser portado.
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, LockSimple, LockSimpleOpen } from '@phosphor-icons/react'
import { pedirAcao } from '@/data/remote/autoridade'
import { SPECIES, averageIvPercent, type PokeInstance } from '@/data/pokes'
import { ITEMS } from '@/data/items'
import { rarityRank } from '@/data/rarity'
import { controller } from '@/engine/controller'
import { useGameStateStore, MAX_TEAM_SIZE } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useDeviceMode } from '@/stores/uiStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { PokeNameTag } from '@/components/shared/PokeNameTag'
import { linkarItem, linkarPoke, tratouComoLink } from '@/components/shared/linkarNoChat'
import { ItemTooltip } from '@/components/shared/ItemTooltip'
import {
  GameButton, GameCard, GameCheck, GameIconButton, GameInput, GameSelect, SegmentedTabs, StickyHeader,
} from '@/components/game/controls'
import { GradeDeInventario } from '@/components/game/GradeDeInventario'
import { IconeDeItemNaGrade } from '@/components/shared/IconeDeItemNaGrade'
import { Paginacao, usePaginacao } from '@/components/game/Paginacao'
import { cn } from '@/lib/utils'
import { AutoVendaPanel, ChipAutoVenda } from './AutoVendaPanel'
import { useMochila } from './useMochila'
import { EstadoDaMochila } from './EstadoDaMochila'

type SortKey = 'rarity' | 'iv' | 'level'
const SORT_LABELS: Record<SortKey, string> = { rarity: 'Raridade', iv: 'IV', level: 'Nivel' }

function sortValue(poke: PokeInstance, key: SortKey): number {
  if (key === 'rarity') return rarityRank(poke.rarity)
  if (key === 'iv') return averageIvPercent(poke.ivs)
  return poke.level
}

function LockButton({ locked, onToggle, carregando }: { locked: boolean; onToggle: () => void; carregando?: boolean }) {
  return (
    <GameIconButton
      variant="ghost"
      carregando={carregando}
      title={locked ? 'Destrancar' : 'Trancar (nunca será vendido)'}
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
  // A mochila nao vem mais no carregamento da pagina — chega quando uma tela
  // que a usa abre. Ver `useMochila`/`mochilaStore`.
  const { carregada } = useMochila()
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const teamLength = useGameStateStore((s) => s.team.length)
  const moveBagToTeam = useGameStateStore((s) => s.moveBagToTeam)
  const updatePokeInstance = useGameStateStore((s) => s.updatePokeInstance)
  const showProfile = usePokeProfileStore((s) => s.showProfile)
  const acao = useAcaoPendente()
  const { compacto } = useDeviceMode()

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('rarity')
  const [sortDesc, setSortDesc] = useState(true)
  const [shinyOnly, setShinyOnly] = useState(false)
  // Qual POKE a ficha embaixo da grade mostra. A grade e um quadrado com sprite:
  // nome, HP, IV e as acoes que ficavam na linha nao cabem dentro do slot, e o
  // que os recebe e a ficha.
  const [foco, setFoco] = useState<string | null>(null)

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

  if (!carregada) return <EstadoDaMochila />
  if (bagPokes.length === 0) return <p className="text-n500">Nenhum POKE na mochila.</p>

  const canMove = teamLength < MAX_TEAM_SIZE
  // Da lista FILTRADA e nao da pagina: trocar de pagina ou de filtro nao pode
  // apagar a ficha do POKE escolhido, mas mover um POKE pra equipe (que o tira
  // de `bagPokes`) tem que apagar.
  const pokeEmFoco = foco != null ? visible.find((p) => p.uid === foco) ?? null : null

  return (
    <div className="flex flex-col gap-[.3em]">
      {/* Uma linha so. Com o checkbox de shiny em linha propria (ele ocupa a
          largura inteira por ser um `<label>` com 44px de alvo), o cabeçalho de
          filtros comia 180px dos ~470px uteis do celular. Como CHIP ele cabe ao
          lado dos outros tres controles e o estado continua obvio. */}
      <div className="flex items-center gap-[.4em]">
        <GameInput
          placeholder="Buscar POKE..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[6em] flex-1"
        />
        <GameSelect value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
            <option key={key} value={key}>{SORT_LABELS[key]}</option>
          ))}
        </GameSelect>
        <GameButton
          onClick={() => setSortDesc((d) => !d)}
          aria-label={sortDesc ? 'Maior primeiro' : 'Menor primeiro'}
          title={sortDesc ? 'Maior primeiro' : 'Menor primeiro'}
        >
          {sortDesc ? <ArrowDown /> : <ArrowUp />}
        </GameButton>
        {/* Caixa, e nao botao (PH-112). Aqui havia um `GameButton` justamente
            porque "a caixinha some no meio de uma fileira de filtros e o alvo de
            toque fica pequeno demais no celular" — decisao revertida por pedido
            explicito, pra o filtro de Shiny ter UMA forma so no jogo inteiro em
            vez de quatro. Se o alvo pequeno incomodar em 390px, o caminho e dar
            padding ao `GameCheck` da fileira, e nao voltar o botao so aqui: isso
            traria de volta a inconsistencia que o pedido veio resolver. */}
        <GameCheck checked={shinyOnly} onChange={setShinyOnly} className="shrink-0">Shiny</GameCheck>
      </div>

      {visible.length === 0 ? (
        <p className="text-n500">Nenhum POKE encontrado.</p>
      ) : (
        <>
          {/* Grade, e nao uma linha por POKE (PH-118). Trancado e shiny
              aparecem no proprio slot: numa grade o texto sai, e sem a marca o
              jogador so descobriria a trava ao tentar usar o POKE. */}
          <GradeDeInventario
            rotuloDoGrupo="POKEs da mochila"
            alturaMaxEm={14}
            selecionado={foco}
            onSelecionar={(uid, evento) => {
              const poke = visible.find((p) => p.uid === uid)
              // Shift+clique continua linkando no chat, como fazia na linha.
              if (poke && tratouComoLink(evento, () => linkarPoke(poke, SPECIES[poke.speciesId]))) return
              setFoco(uid)
            }}
            slots={paginado.pagina.map((poke) => {
              const species = SPECIES[poke.speciesId]
              return {
                id: poke.uid,
                rotulo: [
                  `${species.name} Lv${poke.level}`,
                  `IV ${averageIvPercent(poke.ivs).toFixed(0)}%`,
                  poke.isShiny ? 'shiny' : null,
                  poke.locked ? 'trancado' : null,
                ].filter(Boolean).join(' · '),
                aro: poke.locked ? 'border-gold/50' : undefined,
                marca: poke.locked
                  ? <LockSimple weight="fill" className="text-gold" />
                  : poke.isShiny ? <span aria-hidden>✨</span> : undefined,
                conteudo: <PokeSwatch species={species} isShiny={poke.isShiny} poke={poke} size={2.4} />,
              }
            })}
          />

          {pokeEmFoco && (
            <GameCard
              title="Clique para ver o perfil · Shift+clique para linkar no chat"
              onClick={(e) => {
                const species = SPECIES[pokeEmFoco.speciesId]
                if (tratouComoLink(e, () => linkarPoke(pokeEmFoco, species))) return
                showProfile(pokeEmFoco, species)
              }}
              className="flex items-center gap-[.5em] p-[.4em]"
            >
              <PokeSwatch
                species={SPECIES[pokeEmFoco.speciesId]}
                isShiny={pokeEmFoco.isShiny}
                poke={pokeEmFoco}
                size={2.6}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-[.4em]">
                  <PokeNameTag poke={pokeEmFoco} species={SPECIES[pokeEmFoco.speciesId]} />
                  <span className="text-n400">Lv{pokeEmFoco.level}</span>
                </div>
                <div className="text-[.75em] text-n500">
                  HP {Math.floor(pokeEmFoco.hp)}/{pokeEmFoco.stats.hp} · IV {averageIvPercent(pokeEmFoco.ivs).toFixed(0)}%
                </div>
              </div>
              <LockButton
                locked={Boolean(pokeEmFoco.locked)}
                carregando={acao.isPending(`lock:${pokeEmFoco.uid}`)}
                onToggle={() => {
                  void acao.run(`lock:${pokeEmFoco.uid}`, () =>
                    pedirAcao({ tipo: 'alternarTravaPoke', pokeUid: pokeEmFoco.uid }, () =>
                      updatePokeInstance(pokeEmFoco.uid, (p) => ({ ...p, locked: !p.locked }))),
                  )
                }}
              />
              {canMove ? (
                <GameButton
                  carregando={acao.isPending(`team:${pokeEmFoco.uid}`)}
                  disabled={acao.pendingKey != null}
                  title="Mover para a equipe"
                  aria-label="Mover para a equipe"
                  onClick={(e) => {
                    e.stopPropagation()
                    void acao.run(`team:${pokeEmFoco.uid}`, () =>
                      pedirAcao({ tipo: 'porNaEquipe', pokeUid: pokeEmFoco.uid }, () => { moveBagToTeam(pokeEmFoco.uid) }),
                    )
                  }}
                >
                  {compacto ? 'Equipar' : 'Mover p/ equipe'}
                </GameButton>
              ) : (
                <span className="text-[.78em] text-n500">Equipe cheia</span>
              )}
            </GameCard>
          )}
        </>
      )}

      <Paginacao estado={paginado} rotulo="POKEs" />
    </div>
  )
}

// Exportada pra `mochilaEmGrade.test.tsx` monta-la sem passar pela aba de POKEs,
// que carrega a mochila do servidor na montagem. `BagMenu` continua sendo o
// unico ponto de entrada de verdade.
export function ItensTab() {
  const items = useGameStateStore((s) => s.items)
  const lockedItems = useGameStateStore((s) => s.lockedItems)
  const toggleItemLock = useGameStateStore((s) => s.toggleItemLock)
  const hasStarter = useGameStateStore((s) => s.team.length > 0)
  const fainted = useWorldStore((s) => Boolean(s.player?.fainted))
  // HP do POKE em campo vem do `worldStore` durante a hunt (ver a nota de
  // arquitetura em engine/controller.ts); fora dela o mundo do Hospital carrega
  // o mesmo POKE, entao esta leitura vale nos dois casos.
  const vidaCheia = useWorldStore((s) => {
    const p = s.player?.poke
    return p != null && p.hp >= p.stats.hp
  })
  const acao = useAcaoPendente()
  // Ver a nota da aba Pokemons: o slot e um quadrado com sprite, entao nome,
  // descricao e acoes moram na ficha, e nao dentro dele.
  const [foco, setFoco] = useState<string | null>(null)

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

  // Da lista inteira e nao da pagina, pelo mesmo motivo da aba Pokemons. Item
  // que zerou (usado, vendido) sai de `ids` e a ficha fecha junto.
  const itemEmFoco = foco != null && ids.includes(foco) ? ITEMS[foco] : null
  const podeUsar = itemEmFoco != null && hasStarter && (itemEmFoco.kind === 'revive'
    ? fainted
    : itemEmFoco.kind === 'potion' ? !fainted && !vidaCheia : false)

  return (
    <div className="flex flex-col gap-[.3em]">
      {/* Grade, e nao uma linha por item (PH-118). O contador do slot e o
          "x30" que estava no texto da linha, e ele fica visivel em TODOS os
          itens de uma vez em vez de so no selecionado. */}
      <GradeDeInventario
        rotuloDoGrupo="Itens da mochila"
        alturaMaxEm={14}
        selecionado={foco}
        onSelecionar={(id, evento) => {
          // Shift+clique continua linkando no chat, como fazia na linha.
          if (tratouComoLink(evento, () => linkarItem(ITEMS[id], items[id]))) return
          setFoco(id)
        }}
        slots={paginado.pagina.map((itemId) => {
          const travado = Boolean(lockedItems[itemId])
          return {
            id: itemId,
            rotulo: `${ITEMS[itemId].name} (x${items[itemId]})${travado ? ' — trancado' : ''}`,
            contador: items[itemId],
            aro: travado ? 'border-gold/50' : undefined,
            marca: travado ? <LockSimple weight="fill" className="text-gold" /> : undefined,
            conteudo: <IconeDeItemNaGrade itemId={itemId} nome={ITEMS[itemId].name} />,
          }
        })}
      />

      {itemEmFoco && (
        <GameCard
          title="Shift+clique para linkar no chat"
          onClick={(e) => { tratouComoLink(e, () => linkarItem(itemEmFoco, items[itemEmFoco.id])) }
          }
          className={cn('flex items-center gap-[.5em] p-[.4em]', lockedItems[itemEmFoco.id] && 'border-gold/40')}
        >
          <ItemTooltip item={itemEmFoco}>
            <span className="cursor-help">
              <IconeDeItemNaGrade itemId={itemEmFoco.id} nome={itemEmFoco.name} tamanho="2.6em" />
            </span>
          </ItemTooltip>
          <ItemTooltip item={itemEmFoco}>
            <div className="min-w-0 flex-1 cursor-help">
              <div className="font-medium">
                {itemEmFoco.name} <span className="text-n400">x{items[itemEmFoco.id]}</span>
              </div>
              <div className="text-[.75em] text-n500">{itemEmFoco.description}</div>
            </div>
          </ItemTooltip>
          <LockButton
            locked={Boolean(lockedItems[itemEmFoco.id])}
            carregando={acao.isPending(`lock:${itemEmFoco.id}`)}
            onToggle={() => {
              void acao.run(`lock:${itemEmFoco.id}`, () =>
                pedirAcao({ tipo: 'alternarTravaItem', itemId: itemEmFoco.id }, () => toggleItemLock(itemEmFoco.id)),
              )
            }}
          />
          {/* "Usar" so aparece quando de fato faz alguma coisa AGORA: pocao
              com o POKE ferido, revive com ele desmaiado. Um botao que sempre
              existe e sempre recusa e pior que a ausencia dele.

              `vidaCheia` entrou junto com a recusa no servidor: antes a pocao
              era consumida por nada nesse caso, e so tirar o desperdicio
              deixaria a UI oferecendo um botao que sempre da erro. */}
          {podeUsar && (
            <GameButton onClick={(e) => { e.stopPropagation(); controller.useItem(itemEmFoco.id) }}>Usar</GameButton>
          )}
        </GameCard>
      )}

      <Paginacao estado={paginado} rotulo="itens" />
    </div>
  )
}

export function BagMenu() {
  const [tab, setTab] = useState<'pokemons' | 'itens'>('pokemons')
  const [autoVendaAberta, setAutoVendaAberta] = useState(false)
  return (
    <div className="flex flex-col gap-[.4em]">
      <StickyHeader>
        {/* Abas e gatilho da auto-venda na MESMA fileira. As duas abas usavam
            190px dos 374 uteis e o resto era vidro vazio, enquanto a auto-venda
            gastava uma linha inteira logo abaixo. */}
        <div className="flex items-center gap-[.4em]">
          <SegmentedTabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'pokemons', label: 'Pokemons' },
              { value: 'itens', label: 'Itens' },
            ]}
          />
          {tab === 'pokemons' && (
            <div className="ml-auto min-w-0">
              <ChipAutoVenda
                aberto={autoVendaAberta}
                onToggle={() => setAutoVendaAberta((v) => !v)}
              />
            </div>
          )}
        </div>
        {tab === 'pokemons' && autoVendaAberta && <AutoVendaPanel />}
      </StickyHeader>
      {tab === 'pokemons' ? <PokemonsTab /> : <ItensTab />}
    </div>
  )
}
