// Equipe do desafio (24/10/2026, pedido do dono): quem desafia escolhe o
// duelo e monta a equipe no MontadorDeEquipe — 6 POKEs, golpes e
// Rotacao/Inteligente — sem mexer na equipe de caca. Comeca com a equipe
// atual; lembra a ultima usada (insignia, e destronar por tipo) neste aparelho.
import { useEffect, useMemo, useState } from 'react'
import { Medal, PencilSimple, Sword } from '@phosphor-icons/react'
import { MontadorDeEquipe, type SlotDeEquipe } from '@/components/montador/MontadorDeEquipe'
import { GameButton, SegmentedTabs } from '@/components/game/controls'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { motivoDeEquipeInvalida, TAMANHO_DA_EQUIPE_DE_GINASIO, type TipoDeDuelo } from '@/data/ginasios'
import type { ElementType } from '@/data/generated/types'
import { SPECIES, type PokeInstance } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useMochilaStore } from '@/stores/mochilaStore'
import { useSecureStorage } from '@/hooks/useSecureStorage'

const chaveDaEquipe = (duelo: TipoDeDuelo, tipo: ElementType) =>
  duelo === 'insignia' ? 'ginasio:desafio:insignia' : `ginasio:desafio:destronar:${tipo}`

const temOTipo = (p: PokeInstance, tipo: ElementType) => {
  const s = SPECIES[p.speciesId]
  return Boolean(s && (s.type === tipo || s.type2 === tipo))
}

export function EquipeDoDesafio({ tipo, bloqueio, ocupado, aoDesafiar }: {
  tipo: ElementType
  /** Motivo de fora da equipe (lider, limite do dia, ouro); null = livre. */
  bloqueio: string | null
  ocupado: boolean
  aoDesafiar: (duelo: TipoDeDuelo, slots: SlotDeEquipe[]) => void
}) {
  const team = useGameStateStore((s) => s.team)
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const carregarMochila = useMochilaStore((s) => s.carregar)
  const mochilaCarregada = useMochilaStore((s) => s.carregada)
  const { getItem, setItem } = useSecureStorage()
  const [duelo, setDuelo] = useState<TipoDeDuelo>('insignia')
  const [editando, setEditando] = useState(false)

  useEffect(() => { if (!mochilaCarregada) void carregarMochila() }, [mochilaCarregada, carregarMochila])

  const candidatos = useMemo(() => {
    const mapa = new Map<string, PokeInstance>()
    for (const p of [...team, ...bagPokes]) if (SPECIES[p.speciesId]) mapa.set(p.uid, p)
    return mapa
  }, [team, bagPokes])
  const serve = (p: PokeInstance) => duelo === 'insignia' || temOTipo(p, tipo)

  // Equipe inicial: a ultima usada neste duelo (so o que ainda e seu e serve),
  // senao a equipe de caca atual.
  const inicial = useMemo((): SlotDeEquipe[] => {
    const salva = (getItem<SlotDeEquipe[]>(chaveDaEquipe(duelo, tipo)) ?? [])
      .filter((s) => candidatos.get(s.pokemonId) && serve(candidatos.get(s.pokemonId)!))
    if (salva.length) return salva.slice(0, TAMANHO_DA_EQUIPE_DE_GINASIO)
    return team.filter(serve).slice(0, TAMANHO_DA_EQUIPE_DE_GINASIO)
      .map((p) => ({ pokemonId: p.uid, golpes: [], rotacao: false }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelo, tipo, getItem, candidatos.size])
  const [slots, setSlots] = useState<SlotDeEquipe[]>(inicial)
  useEffect(() => { setSlots(inicial) }, [inicial])

  const especies = slots.map((s) => candidatos.get(s.pokemonId)?.speciesId).filter((id): id is string => !!id)
  const faltam = TAMANHO_DA_EQUIPE_DE_GINASIO - especies.length
  const motivo = bloqueio ?? (faltam > 0
    ? `Faltam ${faltam} POKE${faltam > 1 ? 's' : ''}${duelo === 'destronar' ? ` ${tipo}` : ''} na equipe.`
    : motivoDeEquipeInvalida(especies, duelo === 'destronar' ? tipo : null))

  function mudar(novos: SlotDeEquipe[]) {
    setSlots(novos)
    setItem(chaveDaEquipe(duelo, tipo), novos)
  }

  return (
    <section className="flex flex-col gap-[.45em] rounded-[.6em] border border-menu-line p-[.5em]" aria-label="Equipe do desafio">
      <SegmentedTabs<TipoDeDuelo> value={duelo} onChange={(d) => { setDuelo(d); setEditando(false) }}
        options={[
          { value: 'insignia', label: 'Pela insígnia', icone: <Medal className="mr-[.25em] inline" aria-hidden /> },
          { value: 'destronar', label: 'Para destronar', icone: <Sword className="mr-[.25em] inline" aria-hidden /> },
        ]} />
      <p className="text-[.75em] text-menu-muted">
        {duelo === 'insignia'
          ? 'Qualquer equipe de 6. Vencendo, a insígnia é sua.'
          : `Só POKEs ${tipo}. No fim do mandato, assume quem venceu no menor tempo — e defende com esta equipe.`}
      </p>

      <div className="flex items-center gap-[.4em]">
        <div className="flex flex-1 flex-wrap gap-[.2em]" aria-label="Equipe escolhida">
          {Array.from({ length: TAMANHO_DA_EQUIPE_DE_GINASIO }, (_, i) => {
            const p = slots[i] ? candidatos.get(slots[i].pokemonId) : undefined
            return p
              ? <PokeSwatch key={i} species={SPECIES[p.speciesId]} isShiny={p.isShiny} size={2.2} />
              : <span key={i} className="h-[2.2em] w-[2.2em] rounded-[.4em] border border-dashed border-menu-line" />
          })}
        </div>
        <GameButton variant={editando ? 'primary' : 'secondary'} onClick={() => setEditando((v) => !v)}>
          <PencilSimple aria-hidden /> {editando ? 'Fechar' : 'Montar equipe'}
        </GameButton>
      </div>

      {editando && (
        <MontadorDeEquipe
          slots={slots}
          onMudar={mudar}
          candidatos={candidatos}
          vagas={TAMANHO_DA_EQUIPE_DE_GINASIO}
          desabilitado={ocupado}
          carregandoCandidatos={!mochilaCarregada}
          filtro={duelo === 'destronar' ? (p) => temOTipo(p, tipo) : undefined}
          textoDoFiltro={duelo === 'destronar' ? `Só POKEs do tipo ${tipo}. Máximo de 2 da mesma espécie.` : 'Máximo de 2 da mesma espécie.'}
        />
      )}

      <GameButton variant="primary" disabled={ocupado || motivo != null} carregando={ocupado} onClick={() => aoDesafiar(duelo, slots)}>
        {duelo === 'insignia' ? <Medal aria-hidden /> : <Sword aria-hidden />} {duelo === 'insignia' ? 'Desafiar pela insígnia' : 'Desafiar para destronar'}
      </GameButton>
      {motivo && <span className="text-[.72em] text-menu-muted">{motivo}</span>}
    </section>
  )
}
