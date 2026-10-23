// Defesa do ginasio (23/10/2026): o lider escolhe 6 POKEs do tipo, os golpes
// de cada um e Rotacao/Inteligente, no MontadorDeEquipe (o mesmo do PvP). O
// servidor guarda a REFERENCIA e le os POKEs atuais a cada desafio; os POKEs
// da defesa ficam trancados enquanto defendem.
import { useEffect, useMemo, useState } from 'react'
import { Lock, ShieldCheck } from '@phosphor-icons/react'
import { MontadorDeEquipe, type SlotDeEquipe } from '@/components/montador/MontadorDeEquipe'
import { GameButton } from '@/components/game/controls'
import { motivoDeEquipeInvalida, TAMANHO_DA_EQUIPE_DE_GINASIO } from '@/data/ginasios'
import type { ElementType } from '@/data/generated/types'
import { SPECIES, type PokeInstance } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useMochilaStore } from '@/stores/mochilaStore'
import { useToastStore } from '@/stores/toastStore'
import { definirDefesaDoGinasio, slotsDaDefesa, type GinasioNoEstado } from '@/data/remote/ginasiosRpc'

const mesmos = (a: SlotDeEquipe[], b: SlotDeEquipe[]) => JSON.stringify(a) === JSON.stringify(b)

export function DefesaDoGinasio({ g, aoSalvar }: { g: GinasioNoEstado; aoSalvar: () => Promise<void> }) {
  const tipo = g.tipo as ElementType
  const team = useGameStateStore((s) => s.team)
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const carregarMochila = useMochilaStore((s) => s.carregar)
  const mochilaCarregada = useMochilaStore((s) => s.carregada)
  const salva = useMemo(() => slotsDaDefesa(g.defesa), [g.defesa])
  const [slots, setSlots] = useState<SlotDeEquipe[]>(salva)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (!mochilaCarregada) void carregarMochila() }, [mochilaCarregada, carregarMochila])
  useEffect(() => { setSlots(salva) }, [salva])

  const candidatos = useMemo(() => {
    const mapa = new Map<string, PokeInstance>()
    for (const p of [...team, ...bagPokes]) if (SPECIES[p.speciesId]) mapa.set(p.uid, p)
    return mapa
  }, [team, bagPokes])
  const doTipo = (p: PokeInstance) => {
    const s = SPECIES[p.speciesId]
    return s.type === tipo || s.type2 === tipo
  }

  const especies = slots.map((s) => candidatos.get(s.pokemonId)?.speciesId).filter((id): id is string => !!id)
  const faltam = TAMANHO_DA_EQUIPE_DE_GINASIO - especies.length
  const motivo = faltam > 0 ? `Faltam ${faltam} POKE${faltam > 1 ? 's' : ''} ${tipo}.` : motivoDeEquipeInvalida(especies, tipo)
  const alterada = !mesmos(slots, salva)

  async function salvar() {
    setSalvando(true)
    try {
      useToastStore.getState().pushToast((await definirDefesaDoGinasio(g.id, slots)).mensagem, 'success', 'world')
      // O servidor tranca os POKEs da defesa; a mochila mostra o cadeado ja.
      const ids = new Set(slots.map((s) => s.pokemonId))
      const tranca = (lista: PokeInstance[]) => lista.map((p) => (ids.has(p.uid) ? { ...p, locked: true } : p))
      useGameStateStore.setState((s) => ({ team: tranca(s.team), bagPokes: tranca(s.bagPokes) }))
      await aoSalvar()
    } catch (err) {
      useToastStore.getState().pushToast(err instanceof Error ? err.message : String(err), 'error', 'world')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="flex flex-col gap-[.45em] rounded-[.6em] border border-menu-line p-[.5em]" aria-label="Equipe de defesa">
      <div className="flex items-center gap-[.35em] text-[.9em] font-bold"><ShieldCheck weight="fill" aria-hidden /> Equipe de defesa</div>
      <p className="text-[.75em] text-menu-muted">
        Escolha 6 POKEs {tipo}, os golpes de cada um e como ele escolhe o golpe. Cada desafiante enfrenta seus POKEs como estão no momento do desafio.
      </p>
      <p className="flex items-center gap-[.3em] text-[.72em] text-menu-muted">
        <Lock aria-hidden /> Enquanto defendem, os POKEs ficam trancados: não podem ser vendidos, anunciados nem trocados.
      </p>
      <MontadorDeEquipe
        slots={slots}
        onMudar={setSlots}
        candidatos={candidatos}
        vagas={TAMANHO_DA_EQUIPE_DE_GINASIO}
        desabilitado={salvando}
        carregandoCandidatos={!mochilaCarregada}
        filtro={doTipo}
        textoDoFiltro={`Só POKEs do tipo ${tipo}. Máximo de 2 da mesma espécie.`}
      />
      <div className="flex flex-wrap items-center gap-[.4em]">
        <GameButton variant="primary" disabled={salvando || !alterada || motivo != null} carregando={salvando} onClick={() => void salvar()}>
          Salvar defesa
        </GameButton>
        {alterada && <GameButton variant="ghost" disabled={salvando} onClick={() => setSlots(salva)}>Descartar mudanças</GameButton>}
        <span className={`text-[.75em] ${motivo ? 'text-menu-muted' : 'text-ok'}`}>
          {motivo ?? (alterada ? 'Pronta para salvar.' : 'Defesa salva.')}
        </span>
      </div>
    </section>
  )
}
