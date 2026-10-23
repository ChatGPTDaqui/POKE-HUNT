// Montador de equipe (23/10/2026, design aprovado pelo dono): um componente so
// pra escalar POKEs em vagas, escolher os golpes de cada um e COMO ele escolhe
// o golpe na luta — Rotacao (ordem 1→2→3→4) ou Inteligente (le o oponente e
// usa o de mais dano). Usado no Build do PvP e na defesa do ginasio.
//
// Saiu do PvpBuildTab (PH-564): vagas arrastaveis, caixa com busca e editor de
// golpes eram dele; a rotacao por POKE entrou aqui junto.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowsClockwise, Brain, DotsSixVertical, Lock, Warning, X } from '@phosphor-icons/react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GameButton, SectionLabel } from '@/components/game/controls'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { TypeChip } from '@/components/shared/TypeChip'
import { Explicacao } from '@/components/shared/Explicacao'
import { SPECIES, averageIvPercent, type PokeInstance, type Species } from '@/data/pokes'
import { MAX_ACTIVE_ABILITIES, golpesAprendidosAte } from '@/data/activeAbilities'
import { getAbility } from '@/data/abilities'
import { useToastStore } from '@/stores/toastStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { Paginacao, usePaginacao } from '@/components/game/Paginacao'

export interface SlotDeEquipe {
  pokemonId: string
  /** Vazio = usa os golpes ativos do POKE. */
  golpes: string[]
  /** true = Rotacao (segue a ordem); false = Inteligente. */
  rotacao: boolean
}

export const EXPLICA_INTELIGENTE = 'Analisa o oponente da vez — tipo, resistências e defesas — e usa o golpe que causa mais dano nele.'
export const EXPLICA_ROTACAO = 'Usa os golpes na ordem 1 → 2 → 3 → 4 e recomeça. Golpe em recarga é pulado até ficar pronto.'

function golpesConhecidos(poke: PokeInstance, species: Species): string[] {
  return [...new Set([...golpesAprendidosAte(species, poke.level), ...(poke.golpesDeMaquina ?? [])])]
}

export function MontadorDeEquipe({
  slots, onMudar, candidatos, vagas = 6, desabilitado = false, carregandoCandidatos = false,
  filtro, motivoDeBloqueio, infoDoPoke, textoDoFiltro,
}: {
  slots: SlotDeEquipe[]
  onMudar: (slots: SlotDeEquipe[]) => void
  candidatos: Map<string, PokeInstance>
  vagas?: number
  desabilitado?: boolean
  carregandoCandidatos?: boolean
  /** Quem pode entrar (ex.: so do tipo do ginasio). */
  filtro?: (p: PokeInstance) => boolean
  /** POKE que aparece na caixa mas nao pode ser escolhido (ex.: preso noutro lugar). */
  motivoDeBloqueio?: (p: PokeInstance) => string | null
  /** Linha extra no cartao do POKE (ex.: pronto pro ranqueado). */
  infoDoPoke?: (p: PokeInstance) => ReactNode
  /** Explica o filtro na caixa (ex.: "Só POKEs FIRE"). */
  textoDoFiltro?: string
}) {
  const showProfile = usePokeProfileStore((s) => s.showProfile)
  const [escolhendo, setEscolhendo] = useState<number | null>(null)
  const [editando, setEditando] = useState<number | null>(null)
  const [busca, setBusca] = useState('')
  const buscaRef = useRef<HTMLInputElement>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const ultimo = useRef<number | null>(null)

  useEffect(() => {
    if (escolhendo != null) {
      ultimo.current = escolhendo
      buscaRef.current?.focus()
    } else if (ultimo.current != null) {
      raiz.current?.querySelector<HTMLButtonElement>(`[data-slot="${ultimo.current}"]`)?.focus()
      ultimo.current = null
    }
  }, [escolhendo])

  const disponiveis = useMemo(() => [...candidatos.values()]
    .filter((p) => !slots.some((s) => s.pokemonId === p.uid) && (!filtro || filtro(p))
      && SPECIES[p.speciesId].name.toLocaleLowerCase().includes(busca.trim().toLocaleLowerCase()))
    .sort((a, b) => b.level - a.level), [candidatos, slots, busca, filtro])
  const paginado = usePaginacao(disponiveis)

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  function aoSoltar(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const de = slots.findIndex((s) => s.pokemonId === active.id)
    const para = slots.findIndex((s) => s.pokemonId === over.id)
    if (de < 0 || para < 0) return
    onMudar(arrayMove(slots, de, para))
  }

  const slotEditado = editando != null ? slots[editando] : undefined
  const pokeEditado = slotEditado ? candidatos.get(slotEditado.pokemonId) : undefined

  return (
    <div ref={raiz} className="flex flex-col gap-[.5em]">
      <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
        <SortableContext items={slots.map((s) => s.pokemonId)} strategy={rectSortingStrategy}>
          <div className="formation-grid">
            {Array.from({ length: vagas }, (_, indice) => {
              const slot = slots[indice]
              const poke = slot ? candidatos.get(slot.pokemonId) : undefined
              const species = poke && SPECIES[poke.speciesId]
              const abrir = () => { setBusca(''); setEditando(null); setEscolhendo(indice) }
              const remover = () => { setEditando(null); onMudar(slots.filter((_, i) => i !== indice)) }
              if (!slot) return (
                <button key={`vazio-${indice}`} type="button" data-slot={indice} disabled={desabilitado || carregandoCandidatos || indice > slots.length}
                  onClick={abrir} aria-label={`Adicionar POKE à vaga ${indice + 1}`}
                  className={`formation-slot formation-empty ${escolhendo === indice ? 'is-selected' : ''}`}>
                  <span className="font-mono text-[.75em]">{String(indice + 1).padStart(2, '0')}</span>
                  <span aria-hidden className="text-[1.8em]">+</span>
                  <span className="text-[.8em]">{indice > slots.length ? 'Preencha a anterior' : 'Escolher POKE'}</span>
                </button>
              )
              if (!poke || !species) return (
                <article key={slot.pokemonId} className="formation-slot">
                  <div className="flex items-center justify-between">
                    <span className="team-position">{String(indice + 1).padStart(2, '0')}</span>
                    <GameButton variant="ghost" aria-label={`Remover vaga ${indice + 1}`} disabled={desabilitado} onClick={remover}><X /></GameButton>
                  </div>
                  <p className="flex items-center gap-[.3em] text-[.8em] text-bad"><Warning /> POKE não está mais com você</p>
                </article>
              )
              const kit = slot.golpes.length ? slot.golpes : (poke.activeAbilities ?? [])
              return (
                <SlotArrastavel key={slot.pokemonId} id={slot.pokemonId} selecionado={escolhendo === indice || editando === indice} desabilitado={desabilitado}>
                  <div className="flex items-center justify-between">
                    <span className="team-position">{String(indice + 1).padStart(2, '0')}</span>
                    <GameButton variant="ghost" aria-label={`Remover ${species.name}`} disabled={desabilitado} onClick={remover}><X /></GameButton>
                  </div>
                  <div className="flex flex-wrap items-center gap-[.5em]">
                    <PokeSwatch species={species} isShiny={poke.isShiny} size={3.2} />
                    <div className="min-w-0 flex-1"><strong className="break-words text-[.9em]">{species.name}</strong><p className="text-[.78em] text-menu-muted">Lv {poke.level} · IV {averageIvPercent(poke.ivs).toFixed(0)}%</p></div>
                  </div>
                  <div className="flex flex-wrap gap-[.25em]">{[species.type, species.type2].map((type) => type && <TypeChip key={type} type={type} />)}</div>
                  {infoDoPoke?.(poke)}
                  <p className="text-[.75em] leading-relaxed text-menu-muted">
                    {kit.map((id, i) => `${slot.rotacao ? `${i + 1}. ` : ''}${getAbility(id)?.name ?? id}`).join(' · ') || 'Nenhum golpe escolhido'}
                    {!slot.golpes.length && kit.length > 0 && <span> (do POKE)</span>}
                  </p>
                  <ModoDoSlot rotacao={slot.rotacao} />
                  <div className="mt-auto flex flex-wrap gap-[.3em]">
                    <GameButton data-slot={indice} disabled={desabilitado || carregandoCandidatos} onClick={abrir}>Trocar</GameButton>
                    <GameButton variant={editando === indice ? 'primary' : 'secondary'} disabled={desabilitado}
                      onClick={() => { setEscolhendo(null); setEditando(editando === indice ? null : indice) }}>Golpes</GameButton>
                    <GameButton variant="ghost" onClick={() => showProfile(poke, species, 'golpes')}>Ficha</GameButton>
                  </div>
                </SlotArrastavel>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

      {escolhendo != null && (
        <section className="formation-picker" aria-label={`Escolher POKE para a vaga ${escolhendo + 1}`}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEscolhendo(null) } }}>
          <div className="mb-[.5em] flex items-center justify-between gap-[.5em]">
            <SectionLabel>ESCOLHER POKE · VAGA {escolhendo + 1}</SectionLabel>
            <GameButton variant="ghost" aria-label="Fechar seleção" onClick={() => setEscolhendo(null)}><X /></GameButton>
          </div>
          {textoDoFiltro && <p className="mb-[.4em] text-[.75em] text-menu-muted">{textoDoFiltro}</p>}
          <input ref={buscaRef} aria-label="Buscar POKE" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome…"
            className="jogo-campo w-full rounded-[.45em] border border-menu-line bg-menu-card p-[.5em] text-[.85em]" />
          <div className="candidate-list">
            {paginado.pagina.map((p) => {
              const bloqueio = motivoDeBloqueio?.(p) ?? null
              return (
                <button type="button" className="candidate" key={p.uid} disabled={bloqueio != null} onClick={() => {
                  const novos = [...slots]; novos[escolhendo] = { pokemonId: p.uid, golpes: [], rotacao: false }
                  onMudar(novos); setEscolhendo(null)
                }}>
                  <PokeSwatch species={SPECIES[p.speciesId]} isShiny={p.isShiny} size={2.5} />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[.85em]">{SPECIES[p.speciesId].name}</strong>
                    <span className="text-[.75em] text-menu-muted">Lv {p.level} · IV {averageIvPercent(p.ivs).toFixed(0)}%</span>
                  </span>
                  {bloqueio && <span className="flex items-center gap-[.2em] text-[.72em] text-menu-muted"><Lock aria-hidden />{bloqueio}</span>}
                </button>
              )
            })}
          </div>
          {disponiveis.length === 0 && <p className="p-[.6em] text-[.85em] text-menu-muted">Nenhum POKE disponível para esta busca.</p>}
          <Paginacao estado={paginado} rotulo="candidatos" />
        </section>
      )}

      {editando != null && slotEditado && pokeEditado && (
        <EditorDeGolpes
          indice={editando}
          poke={pokeEditado}
          species={SPECIES[pokeEditado.speciesId]}
          slot={slotEditado}
          onFechar={() => setEditando(null)}
          onMudar={(patch) => onMudar(slots.map((s, i) => (i === editando ? { ...s, ...patch } : s)))}
        />
      )}
    </div>
  )
}

function ModoDoSlot({ rotacao }: { rotacao: boolean }) {
  return (
    <Explicacao conteudo={rotacao ? EXPLICA_ROTACAO : EXPLICA_INTELIGENTE} classeDoConteudo="max-w-[18em]"
      className={`flex w-fit items-center gap-[.25em] text-[.75em] ${rotacao ? 'text-ok' : 'text-menu-ink'}`}>
      {rotacao ? <ArrowsClockwise aria-hidden /> : <Brain aria-hidden />}{rotacao ? 'Rotação' : 'Inteligente'}
    </Explicacao>
  )
}

function SlotArrastavel({ id, selecionado, desabilitado, children }: { id: string; selecionado: boolean; desabilitado: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: desabilitado })
  return (
    <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .6 : 1 }}
      className={`formation-slot relative ${selecionado ? 'is-selected' : ''}`}>
      <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners}
        aria-label="Arrastar para reordenar" disabled={desabilitado}
        className="absolute right-[2.4em] top-[.5em] cursor-grab touch-none text-menu-muted hover:text-menu-ink focus-visible:outline-2">
        <DotsSixVertical />
      </button>
      {children}
    </article>
  )
}

function EditorDeGolpes({ indice, poke, species, slot, onFechar, onMudar }: {
  indice: number
  poke: PokeInstance
  species: Species
  slot: SlotDeEquipe
  onFechar: () => void
  onMudar: (patch: Partial<SlotDeEquipe>) => void
}) {
  const escolhidos = slot.golpes
  const conhecidos = golpesConhecidos(poke, species)
  const porTm = new Set(poke.golpesDeMaquina ?? [])
  const usaDoPoke = escolhidos.length === 0
  function alternar(id: string) {
    if (escolhidos.includes(id)) {
      onMudar({ golpes: escolhidos.filter((g) => g !== id) })
      return
    }
    if (escolhidos.length >= MAX_ACTIVE_ABILITIES) {
      useToastStore.getState().pushToast(`Máximo de ${MAX_ACTIVE_ABILITIES} golpes — desmarque um primeiro.`, 'info', 'world')
      return
    }
    onMudar({ golpes: [...escolhidos, id] })
  }
  return (
    <section className="formation-picker" aria-label={`Golpes da vaga ${indice + 1}`}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onFechar() } }}>
      <div className="mb-[.5em] flex items-center justify-between gap-[.5em]">
        <SectionLabel>GOLPES · {species.name} · {escolhidos.length}/{MAX_ACTIVE_ABILITIES}</SectionLabel>
        <div className="flex gap-[.3em]">
          <GameButton className="text-[.75em]" disabled={usaDoPoke} onClick={() => onMudar({ golpes: [] })}>Usar golpes do POKE</GameButton>
          <GameButton variant="ghost" aria-label="Fechar golpes" onClick={onFechar}><X /></GameButton>
        </div>
      </div>

      <div className="mb-[.5em]">
        <div className="mb-[.25em] text-[.75em] text-menu-muted">Como escolher o golpe na luta</div>
        <div className="grid grid-cols-2 gap-[.35em]" role="radiogroup" aria-label="Como escolher o golpe">
          {([
            { rotacao: false, nome: 'Inteligente', Icone: Brain, resumo: 'Golpe de mais dano no oponente', explica: EXPLICA_INTELIGENTE },
            { rotacao: true, nome: 'Rotação', Icone: ArrowsClockwise, resumo: 'Na ordem 1, 2, 3, 4', explica: EXPLICA_ROTACAO },
          ] as const).map((m) => (
            <Explicacao key={m.nome} conteudo={m.explica} envolve="bloco" classeDoConteudo="max-w-[18em]">
              <button type="button" role="radio" aria-checked={slot.rotacao === m.rotacao} onClick={() => onMudar({ rotacao: m.rotacao })}
                className={`flex flex-col items-start rounded-[.55em] border p-[.45em] text-left ${slot.rotacao === m.rotacao ? 'border-[var(--menu-accent)] bg-menu-wash' : 'border-menu-line'}`}>
                <span className="flex items-center gap-[.3em] text-[.85em] font-bold"><m.Icone aria-hidden />{m.nome}</span>
                <span className="text-[.72em] text-menu-muted">{m.resumo}</span>
              </button>
            </Explicacao>
          ))}
        </div>
      </div>

      <p className="mb-[.4em] text-[.75em] text-menu-muted">
        {usaDoPoke ? 'Usa os golpes ativos do POKE. Marque golpes para dar um kit só desta equipe.'
          : slot.rotacao ? 'A ordem marcada é a ordem da rotação.' : 'No Inteligente a ordem não importa.'}
      </p>
      <div className="candidate-list">
        {conhecidos.map((id) => {
          const ability = getAbility(id)
          if (!ability) return null
          const ordem = escolhidos.indexOf(id)
          return (
            <button type="button" key={id} className={`candidate ${ordem >= 0 ? 'is-selected border-[var(--menu-accent)]' : ''}`}
              aria-pressed={ordem >= 0} onClick={() => alternar(id)}>
              <span className={`w-[1.6em] text-center font-mono text-[.8em] ${ordem >= 0 ? 'text-menu-ink' : 'text-menu-muted'}`}>{ordem >= 0 ? ordem + 1 : '·'}</span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[.85em]">{ability.name}{porTm.has(id) && <span className="ml-[.4em] text-[.8em] text-sky-400">TM</span>}</strong>
                <span className="text-[.75em] text-menu-muted">Dano {ability.power > 0 ? ability.power : '—'}</span>
              </span>
              <TypeChip type={ability.type} />
            </button>
          )
        })}
      </div>
    </section>
  )
}
