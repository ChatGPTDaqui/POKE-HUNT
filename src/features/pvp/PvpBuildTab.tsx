// Presets de PvP (PH-564): 3 de ataque + 3 de defesa, cada slot com kit
// proprio de golpes. A autoridade valida e salva cada preset inteiro.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle, Warning } from '@phosphor-icons/react'
import { GameButton, GameInput, SectionLabel, SegmentedTabs, Carregando } from '@/components/game/controls'
import { MontadorDeEquipe } from '@/components/montador/MontadorDeEquipe'
import { SPECIES, type PokeInstance } from '@/data/pokes'
import { MAX_ACTIVE_ABILITIES } from '@/data/activeAbilities'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useMochilaStore } from '@/stores/mochilaStore'
import { useToastStore } from '@/stores/toastStore'
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


export function PvpBuildTab() {
  const team = useGameStateStore((s) => s.team)
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const carregarMochila = useMochilaStore((s) => s.carregar)
  const mochilaCarregada = useMochilaStore((s) => s.carregada)
  const erroMochila = useMochilaStore((s) => s.erro)
  const [presets, setPresets] = useState<PresetPvp[]>([])
  const [tipo, setTipo] = useState<TipoPresetPvp>('ataque')
  const [posicaoEscolhida, setPosicaoEscolhida] = useState<Partial<Record<TipoPresetPvp, number>>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [tentativa, setTentativa] = useState(0)
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


  if (carregando) return <Carregando texto="Carregando times de PvP..." />
  if (erro || !atual) return <div role="alert">{erro ?? 'Times de PvP indisponíveis.'} <GameButton onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</GameButton></div>

  const ataqueAtivo = presets.find((p) => p.tipo === 'ataque' && p.ativo)
  const defesaAtiva = presets.find((p) => p.tipo === 'defesa' && p.ativo)
  const validos = (p: PresetPvp | undefined) => (p?.slots ?? []).filter((s) => candidatos.has(s.pokemonId))
  const prontos = validos(ataqueAtivo).filter((s) => pokeProntoPraRanqueado(candidatos.get(s.pokemonId)!)).length
  const defesaVazia = mochilaCarregada && validos(defesaAtiva).length === 0

  return (
    <section aria-label="Formação PvP">
      <div className="mb-[.6em] flex flex-wrap items-center justify-between gap-[.4em]">
        <SegmentedTabs<TipoPresetPvp> value={tipo} onChange={(t) => { setTipo(t) }}
          options={[{ value: 'ataque', label: 'Ataque' }, { value: 'defesa', label: 'Defesa' }]} />
        <span role="status" className="text-[.8em] text-menu-ink">{salvando ? 'Salvando…' : `${prontos} prontos no ataque · salvamento automático`}</span>
      </div>
      <div className="mb-[.6em] grid grid-cols-3 gap-[.4em]" role="tablist" aria-label={`Times de ${tipo}`}>
        {POSICOES.map((pos) => {
          const p = presets.find((x) => x.tipo === tipo && x.posicao === pos)
          if (!p) return null
          const selecionado = pos === posicao
          return (
            <div key={pos} className={`formation-slot !min-h-0 gap-[.3em] ${selecionado ? 'is-selected' : ''}`}>
              <button type="button" role="tab" aria-selected={selecionado} className="text-left"
                onClick={() => { setPosicaoEscolhida((m) => ({ ...m, [tipo]: pos })) }}>
                <strong className="block truncate text-[.85em]">{nomeDoPreset(p)}</strong>
                <span className="text-[.75em] text-menu-muted">{p.slots.length}/{SLOTS}{p.ativo ? ' · ATIVO' : ''}</span>
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
      <p className="mb-[.7em] text-[.8em] text-menu-muted">
        {GATE_RANQUEADO_RELAXADO
          ? 'Arraste para reordenar. Cada slot pode ter golpes próprios (inclusive de TM). Durante os testes, basta 1 POKE no ataque para o ranqueado.'
          : `Arraste para reordenar. Preencha os 6 slots com POKEs nível ${NIVEL_MINIMO_PVP}+ e 4 golpes.`}
      </p>
      <MontadorDeEquipe
        slots={slots}
        onMudar={(novos) => salvar({ slots: novos })}
        candidatos={candidatos}
        vagas={SLOTS}
        desabilitado={salvando}
        carregandoCandidatos={!mochilaCarregada}
        infoDoPoke={(poke) => {
          const pronto = pokeProntoPraRanqueado(poke)
          return (
            <p className={`flex items-center gap-[.3em] text-[.75em] ${pronto ? 'text-ok' : 'text-bad'}`}>
              {pronto ? <CheckCircle /> : <Warning />}{pronto ? 'Pronto para lutar' : poke.level < NIVEL_MINIMO_PVP ? `Precisa nível ${NIVEL_MINIMO_PVP}+` : 'Faltam golpes ativos'}
            </p>
          )
        }}
      />
      {!mochilaCarregada && (erroMochila
        ? <div role="alert" className="mt-[.5em] text-[.85em]">{erroMochila} <GameButton onClick={() => { void carregarMochila() }}>Recarregar mochila</GameButton></div>
        : <Carregando texto="Carregando Pokémon disponíveis…" />)}
    </section>
  )
}
