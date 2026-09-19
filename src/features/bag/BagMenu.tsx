// Mochila: abas Pokemons/Itens.
//
// O vanilla filtrava os cards ja renderizados via `display:none` em vez de
// re-renderizar, so pra nao perder o foco do input de busca a cada tecla (o
// `refresh()` dele reconstruia o painel inteiro). Em React o input e um node
// estavel entre renders, entao da pra filtrar o array de verdade — esse
// workaround nao precisa ser portado.
import { useEffect, useMemo, useState, type UIEvent } from 'react'
import { ArrowDown, ArrowUp, Backpack, LockSimple, LockSimpleOpen } from '@phosphor-icons/react'
import { MenuHeading, MenuScene, SelectionHint } from '@/components/game/MenuScene'
import { TypeChip } from '@/components/shared/TypeChip'
import { pedirAcao } from '@/data/remote/autoridade'
import { SPECIES, averageIvPercent, type PokeInstance } from '@/data/pokes'
import { ITEMS } from '@/data/items'
import { TM_ITEMS } from '@/data/maquinas'
import { getAbility, type Ability } from '@/data/abilities'
import type { ElementType } from '@/data/generated/types'
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
import { EnsinarTm } from './EnsinarTm'

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
      <div className="inventory-toolbar">
        <GameInput
          placeholder="Buscar POKE..."
          aria-label="Buscar POKE na mochila"
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
        <div className="inventory-workspace">
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

          {pokeEmFoco ? (
            <GameCard
              title="Clique para ver o perfil · Shift+clique para linkar no chat"
              onClick={(e) => {
                const species = SPECIES[pokeEmFoco.speciesId]
                if (tratouComoLink(e, () => linkarPoke(pokeEmFoco, species))) return
                showProfile(pokeEmFoco, species)
              }}
              className="inventory-detail"
            >
              <PokeSwatch
                species={SPECIES[pokeEmFoco.speciesId]}
                isShiny={pokeEmFoco.isShiny}
                poke={pokeEmFoco}
                size={3.8}
              />
              <div className="detail-identity">
                <div className="flex flex-wrap items-center gap-[.4em]">
                  <PokeNameTag poke={pokeEmFoco} species={SPECIES[pokeEmFoco.speciesId]} />
                  <span className="text-n400">Lv{pokeEmFoco.level}</span>
                </div>
                <div className="text-[.75em] text-n500">
                  HP {Math.floor(pokeEmFoco.hp)}/{pokeEmFoco.stats.hp} · IV {averageIvPercent(pokeEmFoco.ivs).toFixed(0)}%
                </div>
                <div className="mt-[.4em] flex flex-wrap gap-[.25em]">
                  {[SPECIES[pokeEmFoco.speciesId].type, SPECIES[pokeEmFoco.speciesId].type2].map((type) => type && <TypeChip key={type} type={type} />)}
                </div>
              </div>
              <div className="detail-actions">
              <GameButton onClick={(e) => { e.stopPropagation(); showProfile(pokeEmFoco, SPECIES[pokeEmFoco.speciesId]) }}>Ver perfil</GameButton>
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
                  variant="primary"
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
              </div>
            </GameCard>
          ) : <SelectionHint>Selecione um Pokémon para ver seus atributos e colocar na equipe.</SelectionHint>}
        </div>
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

  const [busca, setBusca] = useState('')

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
  const filtrados = useMemo(() => ids.filter((id) => ITEMS[id].name.toLocaleLowerCase().includes(busca.trim().toLocaleLowerCase())), [ids, busca])
  const paginado = usePaginacao(filtrados)

  if (ids.length === 0) return <p className="text-n500">Nenhum item.</p>

  // Da lista inteira e nao da pagina, pelo mesmo motivo da aba Pokemons. Item
  // que zerou (usado, vendido) sai de `ids` e a ficha fecha junto.
  const itemEmFoco = foco != null && ids.includes(foco) ? ITEMS[foco] : null
  const podeUsar = itemEmFoco != null && hasStarter && (itemEmFoco.kind === 'revive'
    ? fainted
    : itemEmFoco.kind === 'potion' ? !fainted && !vidaCheia : false)

  return (
    <div className="flex flex-col gap-[.3em]">
      <label className="inventory-toolbar">
        <span className="text-[.8em] text-n400">Buscar item</span>
        <GameInput aria-label="Buscar item" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do item…" className="flex-1" />
        <span className="text-[.75em] text-n400">{filtrados.length} {filtrados.length === 1 ? 'tipo' : 'tipos'}</span>
      </label>
      <div className="inventory-workspace">
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

      {itemEmFoco ? (
        <GameCard
          title="Shift+clique para linkar no chat"
          onClick={(e) => { tratouComoLink(e, () => linkarItem(itemEmFoco, items[itemEmFoco.id])) }
          }
          className={cn('inventory-detail', lockedItems[itemEmFoco.id] && 'border-gold/40')}
        >
          <ItemTooltip item={itemEmFoco}>
            <span className="cursor-help">
              <IconeDeItemNaGrade itemId={itemEmFoco.id} nome={itemEmFoco.name} tamanho="3.8em" />
            </span>
          </ItemTooltip>
          <ItemTooltip item={itemEmFoco}>
            <div className="detail-identity cursor-help">
              <div className="font-medium">
                {itemEmFoco.name} <span className="text-n400">x{items[itemEmFoco.id]}</span>
              </div>
              <div className="text-[.75em] text-n500">{itemEmFoco.description}</div>
            </div>
          </ItemTooltip>
          <div className="detail-actions">
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
            <GameButton variant="primary" onClick={(e) => { e.stopPropagation(); controller.useItem(itemEmFoco.id) }}>Usar</GameButton>
          )}
          </div>
        </GameCard>
      ) : <SelectionHint>Selecione um item para ver seu efeito e as ações disponíveis.</SelectionHint>}
      </div>

      {filtrados.length === 0 && <p className="text-[.85em] text-n400">Nenhum item encontrado.</p>}
      <Paginacao estado={paginado} rotulo="itens" />
      {itemEmFoco?.kind === 'tm' && <EnsinarTm key={itemEmFoco.id} itemId={itemEmFoco.id} />}
    </div>
  )
}

// Catalogo derivado uma vez (como `TMS_DROPAVEIS` em maquinas.ts): o golpe de
// cada TM nao muda em runtime, entao resolver `getAbility` por TM a cada
// render da aba seria trabalho refeito atoa.
const ABILITY_POR_TM: Record<string, Ability | null> = Object.fromEntries(
  Object.values(TM_ITEMS).map((tm) => [tm.id, getAbility(tm.golpe)]),
)

const TODOS_OS_TIPOS = 'todos' as const

// PH-557: quantas TMs a grade mostra de saida, e quantas soma por vez ao
// chegar perto do fim da rolagem. Numeros redondos, sem relacao com o antigo
// `TAMANHO_PAGINA=30` de Paginacao.tsx — este e so o passo do carregamento
// incremental, nao mais um corte de "pagina" que o jogador precisa navegar.
export const LOTE_DE_TMS = 24

// Aba dedicada as TMs (PH-556): a lista generica de Itens ja misturava TM com
// pocao e bola, sem jeito de ver dano/categoria/AoE sem abrir uma por uma. Ela
// SO lista o que esta na mochila (igual as outras duas abas) — nao e um
// catalogo do jogo inteiro, que exigiria uma fonte de dado nova e destacar
// posse. Reaproveita `EnsinarTm` pro detalhe+ensino: a logica de compatibilidade
// por especie e o fluxo de consumo da TM ja vivem la, e duplicar aqui divergiria
// cedo ou tarde.
// Exportada pra tmsTab.test.tsx, mesmo motivo de `ItensTab`.
export function TmsTab() {
  const items = useGameStateStore((s) => s.items)
  const lockedItems = useGameStateStore((s) => s.lockedItems)
  const toggleItemLock = useGameStateStore((s) => s.toggleItemLock)
  const acao = useAcaoPendente()
  const [foco, setFoco] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<ElementType | typeof TODOS_OS_TIPOS>(TODOS_OS_TIPOS)
  const [sortDesc, setSortDesc] = useState(true)
  // Quantas TMs a rolagem ja revelou, das filtradas/ordenadas. Reseta pro lote
  // inicial sempre que o filtro muda — senao trocar de tipo no meio da rolagem
  // deixaria a contagem de um filtro vazando pro outro.
  const [visivel, setVisivel] = useState(LOTE_DE_TMS)

  const idsTm = useMemo(
    () => Object.keys(items).filter((id) => items[id] > 0 && ITEMS[id]?.kind === 'tm'),
    [items],
  )

  const tiposComTm = useMemo(() => {
    const presentes = new Set<ElementType>()
    for (const id of idsTm) {
      const tipo = ABILITY_POR_TM[id]?.type
      if (tipo) presentes.add(tipo)
    }
    return [...presentes].sort()
  }, [idsTm])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase()
    return idsTm
      .filter((id) => {
        const ability = ABILITY_POR_TM[id]
        if (tipoFiltro !== TODOS_OS_TIPOS && ability?.type !== tipoFiltro) return false
        return !termo || ITEMS[id].name.toLocaleLowerCase().includes(termo)
          || (ability?.name.toLocaleLowerCase().includes(termo) ?? false)
      })
      .sort((a, b) => {
        const diff = (ABILITY_POR_TM[a]?.power ?? 0) - (ABILITY_POR_TM[b]?.power ?? 0)
        return sortDesc ? -diff : diff
      })
  }, [idsTm, busca, tipoFiltro, sortDesc])

  useEffect(() => { setVisivel(LOTE_DE_TMS) }, [busca, tipoFiltro, sortDesc])

  const mostradas = filtrados.slice(0, visivel)
  // PH-557: rolagem incremental em vez de seta de pagina — a paginacao por
  // seta cortava a grade num numero fixo (30) que raramente batia com um
  // multiplo exato de colunas responsivas, sobrando celulas vazias na ultima
  // linha que pareciam "acabou aqui" mesmo com mais TM na pagina seguinte.
  // Rolar e revelar mais e a mesma UX de qualquer feed: a ultima linha parcial
  // e so "o que carregou ate agora", nao um limite artificial.
  function aoRolarAGrade(evento: UIEvent<HTMLDivElement>) {
    const el = evento.currentTarget
    const permaneceu = filtrados.length - visivel
    if (permaneceu > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 96) {
      setVisivel((v) => Math.min(v + LOTE_DE_TMS, filtrados.length))
    }
  }

  if (idsTm.length === 0) return <p className="text-n500">Nenhuma TM na mochila.</p>

  const itemEmFoco = foco != null && idsTm.includes(foco) ? TM_ITEMS[foco] : null
  const abilityEmFoco = itemEmFoco ? ABILITY_POR_TM[itemEmFoco.id] : null

  return (
    <div className="flex flex-col gap-[.3em]">
      <div className="inventory-toolbar">
        <GameInput
          placeholder="Buscar TM ou golpe..."
          aria-label="Buscar TM"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="min-w-[6em] flex-1"
        />
        <GameSelect
          aria-label="Filtrar por tipo de golpe"
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value as ElementType | typeof TODOS_OS_TIPOS)}
        >
          <option value={TODOS_OS_TIPOS}>Todos os tipos</option>
          {tiposComTm.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
        </GameSelect>
        <GameButton
          onClick={() => setSortDesc((d) => !d)}
          aria-label={sortDesc ? 'Maior poder primeiro' : 'Menor poder primeiro'}
          title={sortDesc ? 'Maior poder primeiro' : 'Menor poder primeiro'}
        >
          {sortDesc ? <ArrowDown /> : <ArrowUp />}
        </GameButton>
      </div>

      <div className="inventory-workspace">
        <GradeDeInventario
          rotuloDoGrupo="TMs da mochila"
          alturaMaxEm={20}
          selecionado={foco}
          onScroll={aoRolarAGrade}
          onSelecionar={(id, evento) => {
            if (tratouComoLink(evento, () => linkarItem(ITEMS[id], items[id]))) return
            setFoco(id)
          }}
          slots={mostradas.map((id) => {
            const travado = Boolean(lockedItems[id])
            const ability = ABILITY_POR_TM[id]
            return {
              id,
              rotulo: [
                `${TM_ITEMS[id].name} (x${items[id]})`,
                ability ? `${ability.type} · Poder ${ability.power > 0 ? ability.power : '—'}` : null,
                travado ? 'trancado' : null,
              ].filter(Boolean).join(' · '),
              contador: items[id],
              aro: travado ? 'border-gold/50' : undefined,
              marca: travado ? <LockSimple weight="fill" className="text-gold" /> : undefined,
              conteudo: <IconeDeItemNaGrade itemId={id} nome={TM_ITEMS[id].name} />,
            }
          })}
        />

        {itemEmFoco ? (
          <GameCard
            title="Shift+clique para linkar no chat"
            onClick={(e) => { tratouComoLink(e, () => linkarItem(itemEmFoco, items[itemEmFoco.id])) }}
            className={cn('inventory-detail', lockedItems[itemEmFoco.id] && 'border-gold/40')}
          >
            <IconeDeItemNaGrade itemId={itemEmFoco.id} nome={itemEmFoco.name} tamanho="3.8em" />
            <div className="detail-identity">
              <div className="font-medium">
                {itemEmFoco.name} <span className="text-n400">x{items[itemEmFoco.id]}</span>
              </div>
              {abilityEmFoco && (
                <div className="mt-[.2em] flex flex-wrap items-center gap-[.3em]">
                  <TypeChip type={abilityEmFoco.type} full />
                </div>
              )}
            </div>
            <div className="detail-actions">
              <LockButton
                locked={Boolean(lockedItems[itemEmFoco.id])}
                carregando={acao.isPending(`lock:${itemEmFoco.id}`)}
                onToggle={() => {
                  void acao.run(`lock:${itemEmFoco.id}`, () =>
                    pedirAcao({ tipo: 'alternarTravaItem', itemId: itemEmFoco.id }, () => toggleItemLock(itemEmFoco.id)),
                  )
                }}
              />
            </div>
          </GameCard>
        ) : <SelectionHint>Selecione uma TM para ver o golpe e ensiná-lo.</SelectionHint>}
      </div>

      {filtrados.length === 0 ? (
        <p className="text-[.85em] text-n400">Nenhuma TM encontrada.</p>
      ) : (
        <p className="text-[.75em] text-n500">
          {mostradas.length} de {filtrados.length} TMs{mostradas.length < filtrados.length ? ' · role para ver mais' : ''}
        </p>
      )}
      {itemEmFoco && <EnsinarTm key={itemEmFoco.id} itemId={itemEmFoco.id} />}
    </div>
  )
}

export function BagMenu() {
  const [tab, setTab] = useState<'pokemons' | 'itens' | 'tms'>('pokemons')
  const [autoVendaAberta, setAutoVendaAberta] = useState(false)
  return (
    <MenuScene>
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
              { value: 'tms', label: 'TMs' },
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
      <MenuHeading icon={<Backpack weight="duotone" />} title="Sua coleção" description="Pokémon e recursos para a próxima aventura." />
      {tab === 'pokemons' ? <PokemonsTab /> : tab === 'itens' ? <ItensTab /> : <TmsTab />}
    </MenuScene>
  )
}
