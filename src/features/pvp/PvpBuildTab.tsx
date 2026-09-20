// Presets de PvP (PH-564): 3 de ataque + 3 de defesa, cada slot com kit
// proprio de golpes. A autoridade valida e salva cada preset inteiro.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle, DotsSixVertical, Warning, X } from '@phosphor-icons/react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GameButton, GameInput, SectionLabel, SegmentedTabs, Carregando } from '@/components/game/controls'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { TypeChip } from '@/components/shared/TypeChip'
import { SPECIES, averageIvPercent, type PokeInstance, type Species } from '@/data/pokes'
import { MAX_ACTIVE_ABILITIES, golpesAprendidosAte } from '@/data/activeAbilities'
import { BASIC_ATTACK, getAbility } from '@/data/abilities'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useMochilaStore } from '@/stores/mochilaStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useToastStore } from '@/stores/toastStore'
import { Paginacao, usePaginacao } from '@/components/game/Paginacao'
import * as pvpRpc from '@/data/remote/pvpRpc'
import type { PresetPvp, TipoPresetPvp } from '@/data/remote/pvpRpc'

export const NIVEL_MINIMO_PVP = 80
const SLOTS = 6
const POSICOES = [1, 2, 3] as const
const DEBOUNCE_MS = 400
// PH-539: corresponde ao gate temporário da migration 20260914210000.
const GATE_RANQUEADO_RELAXADO = true

function pokeProntoPraRanqueado(poke: PokeInstance): boolean {
  return GATE_RANQUEADO_RELAXADO || (poke.level >= NIVEL_MINIMO_PVP && (poke.activeAbilities?.length ?? 0) >= MAX_ACTIVE_ABILITIES)
}

function nomeDoPreset(p: PresetPvp): string {
  return p.nome.trim() || `Time ${p.posicao}`
}

function golpesConhecidos(poke: PokeInstance, species: Species): string[] {
  return [...new Set([BASIC_ATTACK.id, ...golpesAprendidosAte(species, poke.level), ...(poke.golpesDeMaquina ?? [])])]
}

export function PvpBuildTab() {
  const team = useGameStateStore((s) => s.team)
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const carregarMochila = useMochilaStore((s) => s.carregar)
  const mochilaCarregada = useMochilaStore((s) => s.carregada)
  const erroMochila = useMochilaStore((s) => s.erro)
  const showProfile = usePokeProfileStore((s) => s.showProfile)
  const [presets, setPresets] = useState<PresetPvp[]>([])
  const [tipo, setTipo] = useState<TipoPresetPvp>('ataque')
  const [posicaoEscolhida, setPosicaoEscolhida] = useState<Partial<Record<TipoPresetPvp, number>>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [escolhendoSlot, setEscolhendoSlot] = useState<number | null>(null)
  const [editandoGolpes, setEditandoGolpes] = useState<number | null>(null)
  const [busca, setBusca] = useState('')
  const [tentativa, setTentativa] = useState(0)
  const buscaRef = useRef<HTMLInputElement>(null)
  const formacaoRef = useRef<HTMLElement>(null)
  const ultimoSlot = useRef<number | null>(null)
  const pendente = useRef<PresetPvp | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emVoo = useRef(false)
  const reenviar = useRef(false)

  useEffect(() => { if (!mochilaCarregada) void carregarMochila() }, [mochilaCarregada, carregarMochila])
  useEffect(() => {
    let vivo = true
    setCarregando(true)
    setErro(null)
    void pvpRpc.meusPresetsPvp().then((lista) => {
      if (vivo) setPresets(lista)
    }).catch(() => { if (vivo) setErro('Não foi possível carregar seus times de PvP.') })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [tentativa])
  useEffect(() => {
    if (escolhendoSlot != null) {
      ultimoSlot.current = escolhendoSlot
      buscaRef.current?.focus()
    } else if (ultimoSlot.current != null) {
      formacaoRef.current?.querySelector<HTMLButtonElement>(`[data-slot="${ultimoSlot.current}"]`)?.focus()
      ultimoSlot.current = null
    }
  }, [escolhendoSlot])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const candidatos = useMemo(() => {
    const mapa = new Map<string, PokeInstance>()
    for (const p of [...team, ...bagPokes]) if (SPECIES[p.speciesId]) mapa.set(p.uid, p)
    return mapa
  }, [team, bagPokes])

  const ativoDoTipo = presets.find((p) => p.tipo === tipo && p.ativo)
  const posicao = posicaoEscolhida[tipo] ?? ativoDoTipo?.posicao ?? 1
  const atual = presets.find((p) => p.tipo === tipo && p.posicao === posicao)
  const slots = useMemo(() => atual?.slots ?? [], [atual])
  const disponiveis = useMemo(() => [...candidatos.values()]
    .filter((p) => !slots.some((s) => s.pokemonId === p.uid) && SPECIES[p.speciesId].name.toLocaleLowerCase().includes(busca.trim().toLocaleLowerCase()))
    .sort((a, b) => b.level - a.level), [candidatos, slots, busca])
  const paginado = usePaginacao(disponiveis)

  const substituir = useCallback((preset: PresetPvp) => {
    setPresets((lista) => lista.map((p) => (p.tipo === preset.tipo && p.posicao === preset.posicao ? preset : p)))
  }, [])

  const enviar = useCallback(async () => {
    if (emVoo.current) { reenviar.current = true; return }
    const preset = pendente.current
    if (!preset) return
    emVoo.current = true
    setSalvando(true)
    try {
      const salvo = await pvpRpc.salvarPresetPvp(preset)
      if (!reenviar.current) substituir(salvo)
    } catch (e) {
      useToastStore.getState().pushToast(e instanceof Error ? e.message : 'Não foi possível salvar o time de PvP.', 'error', 'world')
      reenviar.current = false
      pendente.current = null
      const lista = await pvpRpc.meusPresetsPvp().catch(() => null)
      if (lista) setPresets(lista)
    } finally {
      emVoo.current = false
      if (reenviar.current) { reenviar.current = false; void enviar() } else setSalvando(false)
    }
  }, [substituir])

  // Otimista + debounce: arrastar dispara varias mudancas por segundo e cada
  // uma seria um round-trip; so a ultima versao vai pro servidor.
  function salvar(patch: Partial<Pick<PresetPvp, 'nome' | 'slots'>>) {
    if (!atual) return
    const novo = { ...atual, ...patch }
    substituir(novo)
    pendente.current = novo
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { timer.current = null; void enviar() }, DEBOUNCE_MS)
  }

  async function ativar(p: PresetPvp) {
    if (p.ativo) return
    setSalvando(true)
    try {
      const salvo = await pvpRpc.ativarPresetPvp(p.tipo, p.posicao)
      setPresets((lista) => lista.map((x) => (x.tipo !== p.tipo ? x : x.posicao === salvo.posicao ? salvo : { ...x, ativo: false })))
    } catch (e) {
      useToastStore.getState().pushToast(e instanceof Error ? e.message : 'Não foi possível ativar o time.', 'error', 'world')
    } finally {
      setSalvando(false)
    }
  }

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
    salvar({ slots: arrayMove(slots, de, para) })
  }

  if (carregando) return <Carregando texto="Carregando times de PvP..." />
  if (erro || !atual) return <div role="alert">{erro ?? 'Times de PvP indisponíveis.'} <GameButton onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</GameButton></div>

  const ataqueAtivo = presets.find((p) => p.tipo === 'ataque' && p.ativo)
  const defesaAtiva = presets.find((p) => p.tipo === 'defesa' && p.ativo)
  const validos = (p: PresetPvp | undefined) => (p?.slots ?? []).filter((s) => candidatos.has(s.pokemonId))
  const prontos = validos(ataqueAtivo).filter((s) => pokeProntoPraRanqueado(candidatos.get(s.pokemonId)!)).length
  const defesaVazia = mochilaCarregada && validos(defesaAtiva).length === 0
  const slotEditado = editandoGolpes != null ? slots[editandoGolpes] : undefined
  const pokeEditado = slotEditado ? candidatos.get(slotEditado.pokemonId) : undefined

  return (
    <section ref={formacaoRef} aria-label="Formação PvP">
      <div className="mb-[.6em] flex flex-wrap items-center justify-between gap-[.4em]">
        <SegmentedTabs<TipoPresetPvp> value={tipo} onChange={(t) => { setTipo(t); setEscolhendoSlot(null); setEditandoGolpes(null) }}
          options={[{ value: 'ataque', label: 'Ataque' }, { value: 'defesa', label: 'Defesa' }]} />
        <span role="status" className="text-[.8em] text-n300">{salvando ? 'Salvando…' : `${prontos} prontos no ataque · salvamento automático`}</span>
      </div>
      <div className="mb-[.6em] grid grid-cols-3 gap-[.4em]" role="tablist" aria-label={`Times de ${tipo}`}>
        {POSICOES.map((pos) => {
          const p = presets.find((x) => x.tipo === tipo && x.posicao === pos)
          if (!p) return null
          const selecionado = pos === posicao
          return (
            <div key={pos} className={`formation-slot !min-h-0 gap-[.3em] ${selecionado ? 'is-selected' : ''}`}>
              <button type="button" role="tab" aria-selected={selecionado} className="text-left"
                onClick={() => { setPosicaoEscolhida((m) => ({ ...m, [tipo]: pos })); setEscolhendoSlot(null); setEditandoGolpes(null) }}>
                <strong className="block truncate text-[.85em]">{nomeDoPreset(p)}</strong>
                <span className="text-[.75em] text-n400">{p.slots.length}/{SLOTS}{p.ativo ? ' · ATIVO' : ''}</span>
              </button>
              {!p.ativo && <GameButton className="text-[.75em]" disabled={salvando} onClick={() => { void ativar(p) }}>Usar este</GameButton>}
            </div>
          )
        })}
      </div>
      <div className="mb-[.6em] flex flex-wrap items-center gap-[.5em]">
        <SectionLabel>{tipo === 'ataque' ? 'TIME DE ATAQUE' : 'TIME DE DEFESA'} · {slots.length}/{SLOTS}</SectionLabel>
        <GameInput aria-label="Nome do time" value={atual.nome} maxLength={24} placeholder={`Time ${atual.posicao}`}
          onChange={(e) => salvar({ nome: e.target.value })} className="w-[12em] text-[.85em]" />
      </div>
      {defesaVazia && <p role="note" className="mb-[.7em] text-[.8em] text-bad">Sua defesa está vazia: você não aparece como alvo até montar e ativar um time de defesa.</p>}
      <p className="mb-[.7em] text-[.8em] text-n400">
        {GATE_RANQUEADO_RELAXADO
          ? 'Arraste para reordenar. Cada slot pode ter golpes próprios (inclusive de TM). Durante os testes, basta 1 POKE no ataque para o ranqueado.'
          : `Arraste para reordenar. Preencha os 6 slots com POKEs nível ${NIVEL_MINIMO_PVP}+ e 4 golpes.`}
      </p>
      <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
        <SortableContext items={slots.map((s) => s.pokemonId)} strategy={rectSortingStrategy}>
          <div className="formation-grid">
            {Array.from({ length: SLOTS }, (_, indice) => {
              const slot = slots[indice]
              const poke = slot ? candidatos.get(slot.pokemonId) : undefined
              const species = poke && SPECIES[poke.speciesId]
              const abrir = () => { setBusca(''); setEditandoGolpes(null); setEscolhendoSlot(indice) }
              const remover = () => { setEditandoGolpes(null); salvar({ slots: slots.filter((_, i) => i !== indice) }) }
              if (!slot) return (
                <button key={`vazio-${indice}`} type="button" data-slot={indice} disabled={salvando || !mochilaCarregada || indice > slots.length}
                  onClick={abrir} aria-label={`Adicionar Pokémon ao slot ${indice + 1}`}
                  className={`formation-slot formation-empty ${escolhendoSlot === indice ? 'is-selected' : ''}`}>
                  <span className="font-mono text-[.75em]">{String(indice + 1).padStart(2, '0')}</span>
                  <span aria-hidden className="text-[1.8em]">+</span>
                  <span className="text-[.8em]">{indice > slots.length ? 'Preencha o anterior' : 'Adicionar Pokémon'}</span>
                </button>
              )
              if (!poke || !species) return (
                <article key={slot.pokemonId} className="formation-slot">
                  <div className="flex items-center justify-between">
                    <span className="team-position">{String(indice + 1).padStart(2, '0')}</span>
                    <GameButton variant="ghost" aria-label={`Remover slot ${indice + 1}`} disabled={salvando} onClick={remover}><X /></GameButton>
                  </div>
                  <p className="flex items-center gap-[.3em] text-[.8em] text-bad"><Warning /> POKE não está mais com você</p>
                </article>
              )
              const pronto = pokeProntoPraRanqueado(poke)
              const kit = slot.golpes.length ? slot.golpes : (poke.activeAbilities ?? [])
              return (
                <SlotArrastavel key={slot.pokemonId} id={slot.pokemonId} selecionado={escolhendoSlot === indice || editandoGolpes === indice} desabilitado={salvando}>
                  <div className="flex items-center justify-between">
                    <span className="team-position">{String(indice + 1).padStart(2, '0')}</span>
                    <GameButton variant="ghost" aria-label={`Remover ${species.name} do time`} disabled={salvando} onClick={remover}><X /></GameButton>
                  </div>
                  <div className="flex flex-wrap items-center gap-[.5em]">
                    <PokeSwatch species={species} isShiny={poke.isShiny} size={3.2} />
                    <div className="min-w-0 flex-1"><strong className="break-words text-[.9em]">{species.name}</strong><p className="text-[.78em] text-n400">Lv {poke.level} · IV {averageIvPercent(poke.ivs).toFixed(0)}%</p></div>
                  </div>
                  <div className="flex flex-wrap gap-[.25em]">{[species.type, species.type2].map((type) => type && <TypeChip key={type} type={type} />)}</div>
                  <p className={`flex items-center gap-[.3em] text-[.75em] ${pronto ? 'text-ok' : 'text-bad'}`}>
                    {pronto ? <CheckCircle /> : <Warning />}{pronto ? 'Pronto para lutar' : poke.level < NIVEL_MINIMO_PVP ? `Precisa nível ${NIVEL_MINIMO_PVP}+` : 'Faltam golpes ativos'}
                  </p>
                  <p className="text-[.75em] leading-relaxed text-n400">
                    {kit.map((id) => getAbility(id)?.name ?? id).join(' · ') || 'Nenhum golpe escolhido'}
                    {!slot.golpes.length && kit.length > 0 && <span className="text-n500"> (do POKE)</span>}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-[.3em]">
                    <GameButton data-slot={indice} disabled={salvando || !mochilaCarregada} onClick={abrir}>Trocar</GameButton>
                    <GameButton variant={editandoGolpes === indice ? 'primary' : 'secondary'} disabled={salvando}
                      onClick={() => { setEscolhendoSlot(null); setEditandoGolpes(editandoGolpes === indice ? null : indice) }}>Golpes</GameButton>
                    <GameButton variant="ghost" onClick={() => showProfile(poke, species, 'golpes')}>Ficha</GameButton>
                  </div>
                </SlotArrastavel>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
      {!mochilaCarregada && (erroMochila
        ? <div role="alert" className="mt-[.5em] text-[.85em]">{erroMochila} <GameButton onClick={() => { void carregarMochila() }}>Recarregar mochila</GameButton></div>
        : <Carregando texto="Carregando Pokémon disponíveis…" />)}
      {escolhendoSlot != null && (
        <section className="formation-picker" aria-label={`Escolher Pokémon para slot ${escolhendoSlot + 1}`}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEscolhendoSlot(null) } }}>
          <div className="mb-[.5em] flex items-center justify-between gap-[.5em]">
            <SectionLabel>ESCOLHER POKÉMON · SLOT {escolhendoSlot + 1}</SectionLabel>
            <GameButton variant="ghost" aria-label="Fechar seleção" onClick={() => setEscolhendoSlot(null)}><X /></GameButton>
          </div>
          <input ref={buscaRef} aria-label="Buscar Pokémon para PvP" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome…" className="jogo-campo w-full rounded-[.45em] border border-n700 bg-n900 p-[.5em] text-[.85em]" />
          <div className="candidate-list">
            {paginado.pagina.map((p) => (
              <button type="button" className="candidate" key={p.uid} onClick={() => {
                const novos = [...slots]; novos[escolhendoSlot] = { pokemonId: p.uid, golpes: [] }
                salvar({ slots: novos }); setEscolhendoSlot(null)
              }}>
                <PokeSwatch species={SPECIES[p.speciesId]} isShiny={p.isShiny} size={2.5} />
                <span className="min-w-0 flex-1"><strong className="block text-[.85em]">{SPECIES[p.speciesId].name}</strong><span className="text-[.75em] text-n400">Lv {p.level} · IV {averageIvPercent(p.ivs).toFixed(0)}%</span></span>
                <span className="text-[.75em] text-n400">{pokeProntoPraRanqueado(p) ? 'Pronto' : 'Pendente'}</span>
              </button>
            ))}
          </div>
          {disponiveis.length === 0 && <p className="p-[.6em] text-[.85em] text-n400">Nenhum Pokémon disponível para esta busca.</p>}
          <Paginacao estado={paginado} rotulo="candidatos" />
        </section>
      )}
      {editandoGolpes != null && slotEditado && pokeEditado && (
        <EditorDeGolpes
          indice={editandoGolpes}
          poke={pokeEditado}
          species={SPECIES[pokeEditado.speciesId]}
          escolhidos={slotEditado.golpes}
          onFechar={() => setEditandoGolpes(null)}
          onMudar={(golpes) => {
            const novos = slots.map((s, i) => (i === editandoGolpes ? { ...s, golpes } : s))
            salvar({ slots: novos })
          }}
        />
      )}
    </section>
  )
}

function SlotArrastavel({ id, selecionado, desabilitado, children }: { id: string; selecionado: boolean; desabilitado: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: desabilitado })
  return (
    <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .6 : 1 }}
      className={`formation-slot relative ${selecionado ? 'is-selected' : ''}`}>
      <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners}
        aria-label="Arrastar para reordenar" disabled={desabilitado}
        className="absolute right-[2.4em] top-[.5em] cursor-grab touch-none text-n400 hover:text-foreground focus-visible:outline-2">
        <DotsSixVertical />
      </button>
      {children}
    </article>
  )
}

function EditorDeGolpes({ indice, poke, species, escolhidos, onFechar, onMudar }: {
  indice: number
  poke: PokeInstance
  species: Species
  escolhidos: string[]
  onFechar: () => void
  onMudar: (golpes: string[]) => void
}) {
  const conhecidos = golpesConhecidos(poke, species)
  const porTm = new Set(poke.golpesDeMaquina ?? [])
  const usaDoPoke = escolhidos.length === 0
  function alternar(id: string) {
    if (escolhidos.includes(id)) {
      onMudar(escolhidos.filter((g) => g !== id))
      return
    }
    if (escolhidos.length >= MAX_ACTIVE_ABILITIES) {
      useToastStore.getState().pushToast(`Máximo de ${MAX_ACTIVE_ABILITIES} golpes — desmarque um primeiro.`, 'info', 'world')
      return
    }
    onMudar([...escolhidos, id])
  }
  return (
    <section className="formation-picker" aria-label={`Golpes do slot ${indice + 1}`}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onFechar() } }}>
      <div className="mb-[.5em] flex items-center justify-between gap-[.5em]">
        <SectionLabel>GOLPES · SLOT {indice + 1} · {species.name} · {escolhidos.length}/{MAX_ACTIVE_ABILITIES}</SectionLabel>
        <div className="flex gap-[.3em]">
          <GameButton className="text-[.75em]" disabled={usaDoPoke} onClick={() => onMudar([])}>Usar golpes do POKE</GameButton>
          <GameButton variant="ghost" aria-label="Fechar golpes" onClick={onFechar}><X /></GameButton>
        </div>
      </div>
      <p className="mb-[.4em] text-[.75em] text-n400">
        {usaDoPoke ? 'Este slot usa os golpes ativos do POKE. Marque golpes para dar um kit só deste time.' : 'A ordem marcada é a rotação de combate.'}
      </p>
      <div className="candidate-list">
        {conhecidos.map((id) => {
          const ability = getAbility(id)
          if (!ability) return null
          const ordem = escolhidos.indexOf(id)
          return (
            <button type="button" key={id} className={`candidate ${ordem >= 0 ? 'is-selected border-[var(--menu-accent)]' : ''}`}
              aria-pressed={ordem >= 0} onClick={() => alternar(id)}>
              <span className={`w-[1.6em] text-center font-mono text-[.8em] ${ordem >= 0 ? 'text-foreground' : 'text-n500'}`}>{ordem >= 0 ? ordem + 1 : '·'}</span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[.85em]">{ability.name}{porTm.has(id) && <span className="ml-[.4em] text-[.8em] text-sky-400">TM</span>}</strong>
                <span className="text-[.75em] text-n400">Dano {ability.power > 0 ? ability.power : '—'}</span>
              </span>
              <TypeChip type={ability.type} />
            </button>
          )
        })}
      </div>
    </section>
  )
}
