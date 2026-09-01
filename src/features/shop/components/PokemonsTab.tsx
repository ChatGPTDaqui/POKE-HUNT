import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, LockSimple } from '@phosphor-icons/react'
import { pedirAcaoComLocal } from '@/data/remote/autoridade'
import { SPECIES, averageIvPercent } from '@/data/pokes'
import { RARITIES, rarityOf, type RarityKey } from '@/data/rarity'
import { sellAllBagPokes, pokemonSellValue } from '@/engine/systems/economySystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useConfirmDialogStore } from '@/stores/confirmDialogStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { PokeNameTag } from '@/components/shared/PokeNameTag'
import { linkarPoke, tratouComoLink } from '@/components/shared/linkarNoChat'
import {
  GameButton, GameCard, GameCheck, GameInput, Recolhivel, SectionLabel,
} from '@/components/game/controls'
import { GradeDeInventario } from '@/components/game/GradeDeInventario'
import { Paginacao, usePaginacao } from '@/components/game/Paginacao'
import type { ConfirmRequest } from '@/stores/confirmDialogStore'
import { fmt, toast } from '../utils'
import { useMochila } from '@/features/bag/useMochila'
import { EstadoDaMochila } from '@/features/bag/EstadoDaMochila'
import type { PokeInstance, Species } from '@/data/pokes'

function venderUmPoke(
  poke: PokeInstance,
  species: Species,
  { askConfirm, acao, venderLote, fmt: format }: {
    askConfirm: (request: ConfirmRequest) => void
    acao: ReturnType<typeof useAcaoPendente>
    venderLote: (uids: string[], extras?: { shiny: number; locked: number }) => Promise<void>
    fmt: typeof fmt
  },
) {
  const value = pokemonSellValue(poke.level, species.baseExp, poke.rarity)
  const key = `sell:${poke.uid}`
  // Venda individual passa pelo MESMO endpoint em lote: antes ela
  // chamava `sellBagPoke` local direto, sem `pedirAcao`, entao sob
  // autoridade do servidor o POKE reaparecia no sincronismo seguinte.
  const executar = () => void acao.run(key, () => venderLote([poke.uid]))
  if (poke.isShiny) {
    askConfirm({
      title: 'Vender POKE Shiny?',
      message: `${species.name} e Shiny. Essa ação não pode ser desfeita. Vender por ${format.format(value)} ouro?`,
      confirmLabel: 'Vender',
      onConfirm: executar,
    })
  } else {
    executar()
  }
}

export function PokemonsTab() {
  // Mochila sob demanda: ela nao vem no carregamento da pagina.
  const { carregada } = useMochila()
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
  // Qual POKE a ficha embaixo da grade esta mostrando.
  //
  // SEPARADO da selecao em lote de proposito. Um clique na grade faz as duas
  // coisas (marca pro lote, se aquele POKE pode entrar no lote; e sempre abre a
  // ficha), e sao mesmo duas: POKE trancado e shiny fora do filtro "somente
  // shiny" NAO entram em lote — mas a venda individual deles existe, e com um
  // estado so ela ficaria inalcancavel na grade.
  const [foco, setFoco] = useState<string | null>(null)

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

  // Pagina so a RENDERIZACAO. "Selecionar tudo" e "Vender Tudo" continuam
  // olhando `filtered` inteiro de proposito: um "Selecionar tudo" que marcasse
  // apenas os 30 da pagina visivel seria uma armadilha — o jogador clica, ve
  // "Vender Selecionados (30)" e acha que limpou a mochila.
  const paginado = usePaginacao(filtered)

  // POKEs trancados nunca entram na selecao em lote. Shinies so entram quando o
  // filtro "Somente Shiny" esta ativo (e ai a venda exige confirmacao) — mesma
  // regra de seguranca do "Vender Tudo", que nunca toca em shiny.
  const selectable = filtered.filter(({ poke }) => !poke.locked && (shinyOnly || !poke.isShiny))
  const selectableUids = selectable.map(({ poke }) => poke.uid)
  // Set em vez de `.includes()` no array: a mochila chega a centenas de POKE,
  // e `.includes()` dentro do `.filter()` abaixo virava O(n*m) a cada render.
  const selectableUidSet = new Set(selectableUids)
  const allSelected = selectableUids.length > 0 && selectableUids.every((uid) => selectedUids.has(uid))
  const activeSelection = [...selectedUids].filter((uid) => selectableUidSet.has(uid))

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
    if (extras?.shiny) toast(`${extras.shiny} POKE(s) Shiny não foram vendidos.`, 'info')
    if (extras?.locked) toast(`${extras.locked} POKE(s) trancado(s) não foram vendidos.`, 'info')
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
        message: `Você esta vendendo ${uids.length} POKE(s) Shiny. Essa ação não pode ser desfeita.`,
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
      toast('Nenhum POKE elegível (shiny e trancados são poupados).', 'info')
      return
    }
    void acao.run('sell-all-pokes', () => venderLote(uids, { shiny, locked }))
  }

  // Da lista FILTRADA e nao da pagina: trocar de pagina nao pode fazer a ficha
  // sumir, e um POKE vendido (que sai de `filtered`) tem que fazer ela sumir.
  const pokeEmFoco = foco != null ? filtered.find(({ poke }) => poke.uid === foco) ?? null : null

  // Le do estado dos filtros, e nao da contagem do resultado: o jogador quer
  // saber POR QUE a lista esta curta, e "5 de 6 raridades" responde isso.
  const resumoDosFiltros = [
    search.trim() && `"${search.trim()}"`,
    `${selectedRarities.size}/${Object.keys(RARITIES).length} raridades`,
    (ivMin > 0 || ivMax < 100) && `IV ${ivMin}-${ivMax}`,
    shinyOnly && 'só shiny',
  ].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-col gap-[.45em]">
      <SectionLabel>VENDER POKES EXTRAS (MOCHILA)</SectionLabel>

      {/* Filtros atras de um toque. Somados, busca + faixa de IV + as seis
          raridades + "somente shiny" ocupavam ~330px do painel; com a barra de
          acao logo abaixo, sobravam quatro POKEs visiveis na lista que a tela
          existe pra mostrar. O resumo na barra mantem visivel o que esta
          filtrado — esconder o ESTADO seria pior que a secao sempre aberta. */}
      <Recolhivel titulo="Filtros" resumo={resumoDosFiltros}>
      <div className="flex flex-col gap-[.45em]">
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
        <GameButton onClick={() => setSortDesc((d) => !d)} title={sortDesc ? 'Maior IV primeiro' : 'Menor IV primeiro'}>
          IV {sortDesc ? <ArrowDown /> : <ArrowUp />}
        </GameButton>
      </div>

      <div className="flex flex-wrap items-center gap-x-[.6em] gap-y-[.3em]">
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
          Shiny
        </GameCheck>
      </div>
      </div>
      </Recolhivel>

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
      {!carregada && <EstadoDaMochila />}
      {carregada && bagPokes.length === 0 && <p className="text-n500">Nenhum POKE extra na mochila.</p>}
      {carregada && bagPokes.length > 0 && filtered.length === 0 && (
        <p className="text-n500">Nenhum POKE corresponde aos filtros.</p>
      )}

      {/* Grade, e nao uma linha por POKE (PH-118). O clique MARCA pro lote e
          abre a ficha; quem nao pode entrar no lote (trancado, ou shiny sem o
          filtro de shiny) so abre a ficha, que e onde a venda individual dele
          continua existindo. */}
      {paginado.pagina.length > 0 && (
        <GradeDeInventario
          rotuloDoGrupo="POKEs para vender"
          modo="multiplo"
          selecionado={null}
          selecionados={selectedUids}
          alturaMaxEm={14}
          onSelecionar={(uid) => {
            setFoco(uid)
            if (!selectableUidSet.has(uid)) return
            setSelectedUids((prev) => {
              const next = new Set(prev)
              if (next.has(uid)) next.delete(uid)
              else next.add(uid)
              return next
            })
          }}
          slots={paginado.pagina.map(({ poke, ivPct }) => {
            const species = SPECIES[poke.speciesId]
            const emLote = selectableUidSet.has(poke.uid)
            return {
              id: poke.uid,
              rotulo: [
                `${species.name} Lv${poke.level}`,
                `IV ${ivPct.toFixed(0)}%`,
                poke.isShiny ? 'shiny' : null,
                poke.locked ? 'trancado' : null,
                !emLote && !poke.locked ? 'fora do lote' : null,
              ].filter(Boolean).join(' · '),
              aro: poke.locked ? 'border-gold/50' : undefined,
              marca: poke.locked
                ? <LockSimple weight="fill" className="text-gold" />
                : poke.isShiny ? <span aria-hidden>✨</span> : undefined,
              conteudo: <PokeSwatch species={species} isShiny={poke.isShiny} poke={poke} size={2.4} />,
            }
          })}
        />
      )}

      {/* A ficha do POKE em foco: identidade, valor e a venda individual. Era
          isso que a linha carregava do lado direito. */}
      {pokeEmFoco && (
        <GameCard className="flex items-center gap-[.45em] p-[.4em]">
          <span
            title="Clique para o perfil · Shift+clique para linkar no chat"
            onClick={(e) => {
              const species = SPECIES[pokeEmFoco.poke.speciesId]
              if (tratouComoLink(e, () => linkarPoke(pokeEmFoco.poke, species))) return
              showProfile(pokeEmFoco.poke, species)
            }}
            className="cursor-pointer"
          >
            <PokeSwatch
              species={SPECIES[pokeEmFoco.poke.speciesId]}
              isShiny={pokeEmFoco.poke.isShiny}
              poke={pokeEmFoco.poke}
              size={2.4}
            />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-[.4em]">
              <PokeNameTag poke={pokeEmFoco.poke} species={SPECIES[pokeEmFoco.poke.speciesId]} />
              <span className="text-n400">Lv{pokeEmFoco.poke.level}</span>
              <span className="text-[.78em] text-n500">IV {pokeEmFoco.ivPct.toFixed(0)}%</span>
            </div>
            <div className="text-[.75em] text-n500">
              {selectedUids.has(pokeEmFoco.poke.uid) ? 'Marcado para o lote' : 'Fora do lote'}
            </div>
          </div>
          <GameButton
            disabled={pokeEmFoco.poke.locked || acao.pendingKey != null}
            title={pokeEmFoco.poke.locked ? 'Trancado — destranque na Mochila' : undefined}
            onClick={() => venderUmPoke(pokeEmFoco.poke, SPECIES[pokeEmFoco.poke.speciesId], { askConfirm, acao, venderLote, fmt })}
          >
            {pokeEmFoco.poke.locked
              ? <><LockSimple weight="fill" /> Trancado</>
              : `Vender (${fmt.format(pokemonSellValue(pokeEmFoco.poke.level, SPECIES[pokeEmFoco.poke.speciesId].baseExp, pokeEmFoco.poke.rarity))})`}
          </GameButton>
        </GameCard>
      )}

      <Paginacao estado={paginado} rotulo="POKEs" />
    </div>
  )
}
