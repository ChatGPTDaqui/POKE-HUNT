// Time dedicado ao PvP; a autoridade valida e salva cada escolha.
import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle, Warning, X } from '@phosphor-icons/react'
import { GameButton, SectionLabel, Carregando } from '@/components/game/controls'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { TypeChip } from '@/components/shared/TypeChip'
import { SPECIES, averageIvPercent, type PokeInstance } from '@/data/pokes'
import { MAX_ACTIVE_ABILITIES } from '@/data/activeAbilities'
import { getAbility } from '@/data/abilities'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useMochilaStore } from '@/stores/mochilaStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useToastStore } from '@/stores/toastStore'
import { Paginacao, usePaginacao } from '@/components/game/Paginacao'
import * as pvpRpc from '@/data/remote/pvpRpc'

export const NIVEL_MINIMO_PVP = 80
const SLOTS = 6
// PH-539: corresponde ao gate temporário da migration 20260914210000.
const GATE_RANQUEADO_RELAXADO = true

function pokeProntoPraRanqueado(poke: PokeInstance): boolean {
  return GATE_RANQUEADO_RELAXADO || (poke.level >= NIVEL_MINIMO_PVP && (poke.activeAbilities?.length ?? 0) >= MAX_ACTIVE_ABILITIES)
}

export function PvpBuildTab() {
  const team = useGameStateStore((s) => s.team)
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const carregarMochila = useMochilaStore((s) => s.carregar)
  const mochilaCarregada = useMochilaStore((s) => s.carregada)
  const erroMochila = useMochilaStore((s) => s.erro)
  const showProfile = usePokeProfileStore((s) => s.showProfile)
  const [slots, setSlots] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [escolhendoSlot, setEscolhendoSlot] = useState<number | null>(null)
  const [busca, setBusca] = useState('')
  const [tentativa, setTentativa] = useState(0)
  const emVoo = useRef(false)
  const buscaRef = useRef<HTMLInputElement>(null)
  const formacaoRef = useRef<HTMLElement>(null)
  const ultimoSlot = useRef<number | null>(null)

  useEffect(() => { if (!mochilaCarregada) void carregarMochila() }, [mochilaCarregada, carregarMochila])
  useEffect(() => {
    let vivo = true
    setCarregando(true)
    setErro(null)
    void pvpRpc.meuTimePvp().then((time) => {
      if (vivo) setSlots(time?.pokemonIds ?? [])
    }).catch(() => { if (vivo) setErro('Não foi possível carregar seu time de PvP.') })
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

  const candidatos = useMemo(() => {
    const mapa = new Map<string, PokeInstance>()
    for (const p of [...team, ...bagPokes]) if (SPECIES[p.speciesId]) mapa.set(p.uid, p)
    return mapa
  }, [team, bagPokes])
  const disponiveis = useMemo(() => [...candidatos.values()]
    .filter((p) => !slots.includes(p.uid) && SPECIES[p.speciesId].name.toLocaleLowerCase().includes(busca.trim().toLocaleLowerCase()))
    .sort((a, b) => b.level - a.level), [candidatos, slots, busca])
  const paginado = usePaginacao(disponiveis)

  async function salvar(novosSlots: string[]) {
    if (emVoo.current) return
    emVoo.current = true
    setSalvando(true)
    try {
      const salvo = await pvpRpc.salvarTimePvp(novosSlots)
      setSlots(salvo.pokemonIds)
      setEscolhendoSlot(null)
    } catch (e) {
      useToastStore.getState().pushToast(e instanceof Error ? e.message : 'Não foi possível salvar o time de PvP.', 'error', 'world')
    } finally {
      emVoo.current = false
      setSalvando(false)
    }
  }

  if (carregando) return <Carregando texto="Carregando time de PvP..." />
  if (erro) return <div role="alert">{erro} <GameButton onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</GameButton></div>
  const prontos = slots.filter((uid) => { const p = candidatos.get(uid); return p && pokeProntoPraRanqueado(p) }).length

  return (
    <section ref={formacaoRef} aria-label="Formação PvP">
      <div className="mb-[.6em] flex flex-wrap items-center justify-between gap-[.4em]">
        <SectionLabel>TIME DE PVP · {slots.length}/{SLOTS}</SectionLabel>
        <span role="status" className="text-[.8em] text-n300">{salvando ? 'Salvando…' : `${prontos} prontos · salvamento automático`}</span>
      </div>
      <p className="mb-[.7em] text-[.8em] text-n400">
        {GATE_RANQUEADO_RELAXADO
          ? 'Time separado da aventura. Durante os testes, basta 1 POKE para o ranqueado; os bots estão no nível 80.'
          : `Preencha os 6 slots com POKEs nível ${NIVEL_MINIMO_PVP}+ e 4 golpes ativos.`}
      </p>
      <div className="formation-grid">
        {Array.from({ length: SLOTS }, (_, indice) => {
          const poke = candidatos.get(slots[indice])
          const species = poke && SPECIES[poke.speciesId]
          const abrir = () => { setBusca(''); setEscolhendoSlot(indice) }
          if (!poke || !species) return (
            <button key={indice} type="button" data-slot={indice} disabled={salvando || !mochilaCarregada || indice > slots.length}
              onClick={abrir} aria-label={`Adicionar Pokémon ao slot ${indice + 1}`}
              className={`formation-slot formation-empty ${escolhendoSlot === indice ? 'is-selected' : ''}`}>
              <span className="font-mono text-[.75em]">{String(indice + 1).padStart(2, '0')}</span>
              <span aria-hidden className="text-[1.8em]">+</span>
              <span className="text-[.8em]">{indice > slots.length ? 'Preencha o anterior' : 'Adicionar Pokémon'}</span>
            </button>
          )
          const pronto = pokeProntoPraRanqueado(poke)
          return (
            <article key={indice} className={`formation-slot ${escolhendoSlot === indice ? 'is-selected' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="team-position">{String(indice + 1).padStart(2, '0')}</span>
                <GameButton variant="ghost" aria-label={`Remover ${species.name} do time`} disabled={salvando}
                  onClick={() => { void salvar(slots.filter((_, i) => i !== indice)) }}><X /></GameButton>
              </div>
              <div className="flex flex-wrap items-center gap-[.5em]">
                <PokeSwatch species={species} isShiny={poke.isShiny} size={3.2} />
                <div className="min-w-0 flex-1"><strong className="break-words text-[.9em]">{species.name}</strong><p className="text-[.78em] text-n400">Lv {poke.level} · IV {averageIvPercent(poke.ivs).toFixed(0)}%</p></div>
              </div>
              <div className="flex flex-wrap gap-[.25em]">{[species.type, species.type2].map((type) => type && <TypeChip key={type} type={type} />)}</div>
              <p className={`flex items-center gap-[.3em] text-[.75em] ${pronto ? 'text-ok' : 'text-bad'}`}>
                {pronto ? <CheckCircle /> : <Warning />}{pronto ? 'Pronto para lutar' : poke.level < NIVEL_MINIMO_PVP ? `Precisa nível ${NIVEL_MINIMO_PVP}+` : 'Faltam golpes ativos'}
              </p>
              <p className="text-[.75em] leading-relaxed text-n400">{(poke.activeAbilities ?? []).map((id) => getAbility(id)?.name ?? id).join(' · ') || 'Nenhum golpe escolhido'}</p>
              <div className="mt-auto flex flex-wrap gap-[.3em]">
                <GameButton data-slot={indice} disabled={salvando || !mochilaCarregada} onClick={abrir}>Trocar</GameButton>
                <GameButton variant="ghost" onClick={() => showProfile(poke, species, 'golpes')}>Golpes</GameButton>
              </div>
            </article>
          )
        })}
      </div>
      {!mochilaCarregada && (erroMochila
        ? <div role="alert" className="mt-[.5em] text-[.85em]">{erroMochila} <GameButton onClick={() => { void carregarMochila() }}>Recarregar mochila</GameButton></div>
        : <Carregando texto="Carregando Pokémon disponíveis…" />)}
      {escolhendoSlot != null && (
        <section className="formation-picker" aria-label={`Escolher Pokémon para slot ${escolhendoSlot + 1}`}
          onKeyDown={(e) => { if (e.key === 'Escape' && !salvando) { e.stopPropagation(); setEscolhendoSlot(null) } }}>
          <div className="mb-[.5em] flex items-center justify-between gap-[.5em]">
            <SectionLabel>ESCOLHER POKÉMON · SLOT {escolhendoSlot + 1}</SectionLabel>
            <GameButton variant="ghost" aria-label="Fechar seleção" disabled={salvando} onClick={() => setEscolhendoSlot(null)}><X /></GameButton>
          </div>
          <input ref={buscaRef} aria-label="Buscar Pokémon para PvP" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome…" className="jogo-campo w-full rounded-[.45em] border border-n700 bg-n900 p-[.5em] text-[.85em]" />
          <div className="candidate-list">
            {paginado.pagina.map((p) => (
              <button type="button" className="candidate" key={p.uid} disabled={salvando} onClick={() => {
                const novos = [...slots]; novos[escolhendoSlot] = p.uid; void salvar(novos)
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
    </section>
  )
}
