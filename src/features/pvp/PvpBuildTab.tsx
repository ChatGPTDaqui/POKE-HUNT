// Time dedicado ao PvP (PH-530): 6 slots, separados do time de aventura.
// Ranqueado exige os 6 preenchidos, todos nivel 80+, com os 4 golpes ativos
// escolhidos — a trava de verdade e server-side (`entrar_fila_ranqueada`),
// aqui e so sinalizacao visual pro jogador montar certo antes de tentar.
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle, Warning, X } from '@phosphor-icons/react'
import { GameButton, GameCard, SectionLabel, Carregando } from '@/components/game/controls'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { faceIconUrl } from '@/data/sprites'
import { SPECIES, type PokeInstance } from '@/data/pokes'
import { MAX_ACTIVE_ABILITIES } from '@/data/activeAbilities'
import { getAbility } from '@/data/abilities'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useMochilaStore } from '@/stores/mochilaStore'
import { useToastStore } from '@/stores/toastStore'
import * as pvpRpc from '@/data/remote/pvpRpc'

export const NIVEL_MINIMO_PVP = 80
const SLOTS = 6

function pokeProntoPraRanqueado(poke: PokeInstance): boolean {
  return poke.level >= NIVEL_MINIMO_PVP && (poke.activeAbilities?.length ?? 0) >= MAX_ACTIVE_ABILITIES
}

function nomeDosGolpes(poke: PokeInstance): string {
  const ids = poke.activeAbilities ?? []
  if (ids.length === 0) return 'Nenhum golpe escolhido'
  return ids.map((id) => getAbility(id)?.name ?? id).join(', ')
}

export function PvpBuildTab() {
  const team = useGameStateStore((s) => s.team)
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const carregarMochila = useMochilaStore((s) => s.carregar)
  const mochilaCarregada = useMochilaStore((s) => s.carregada)
  const [slots, setSlots] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [escolhendoSlot, setEscolhendoSlot] = useState<number | null>(null)

  useEffect(() => { if (!mochilaCarregada) void carregarMochila() }, [mochilaCarregada, carregarMochila])

  useEffect(() => {
    let vivo = true
    void pvpRpc.meuTimePvp().then((time) => {
      if (vivo) setSlots(time?.pokemonIds ?? [])
    }).finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [])

  const candidatos = useMemo(() => {
    const mapa = new Map<string, PokeInstance>()
    for (const p of team) mapa.set(p.uid, p)
    for (const p of bagPokes) mapa.set(p.uid, p)
    return mapa
  }, [team, bagPokes])

  const jaEscolhidos = new Set(slots)
  const disponiveis = [...candidatos.values()]
    .filter((p) => !jaEscolhidos.has(p.uid))
    .sort((a, b) => b.level - a.level)

  async function salvar(novosSlots: string[]) {
    setSalvando(true)
    try {
      const salvo = await pvpRpc.salvarTimePvp(novosSlots)
      setSlots(salvo.pokemonIds)
    } catch (e) {
      useToastStore.getState().pushToast(
        e instanceof Error ? e.message : 'Não foi possível salvar o time de PvP.', 'error', 'world',
      )
    } finally {
      setSalvando(false)
    }
  }

  function escolher(indice: number, uid: string) {
    const novos = [...slots]
    novos[indice] = uid
    setEscolhendoSlot(null)
    void salvar(novos)
  }

  function remover(indice: number) {
    void salvar(slots.filter((_, i) => i !== indice))
  }

  if (carregando) return <Carregando texto="Carregando time de PvP..." />

  const prontos = slots.filter((uid) => {
    const p = candidatos.get(uid)
    return p && pokeProntoPraRanqueado(p)
  }).length

  return (
    <div className="flex flex-col gap-[.75em]">
      <div className="rounded-[.7em] border border-n800 bg-n900 p-[.65em]">
        <div className="mb-[.45em] flex items-center justify-between">
          <SectionLabel>TIME DE PVP</SectionLabel>
          <span className={`text-[.8em] ${slots.length === SLOTS && prontos === SLOTS ? 'text-green-400' : 'text-n400'}`}>
            {prontos}/{SLOTS} prontos pro ranqueado
          </span>
        </div>
        <p className="mb-[.55em] text-[.78em] text-n500">
          Time separado do time de aventura. Ranqueado exige os 6 slots preenchidos,
          nível {NIVEL_MINIMO_PVP}+ e os 4 golpes escolhidos em cada POKE (Equipe → Golpes).
        </p>

        <div className="grid grid-cols-2 gap-[.5em] sm:grid-cols-3">
          {Array.from({ length: SLOTS }, (_, indice) => {
            const uid = slots[indice]
            const poke = uid ? candidatos.get(uid) : undefined
            const species = poke ? SPECIES[poke.speciesId] : undefined

            if (escolhendoSlot === indice) {
              return (
                <GameCard key={indice} className="col-span-2 p-[.45em] sm:col-span-3">
                  <div className="mb-[.3em] flex items-center justify-between">
                    <SectionLabel>ESCOLHER POKE — SLOT {indice + 1}</SectionLabel>
                    <GameButton variant="ghost" onClick={() => setEscolhendoSlot(null)}><X /></GameButton>
                  </div>
                  <div className="flex max-h-[14em] flex-col gap-[.2em] overflow-y-auto">
                    {disponiveis.length === 0 ? (
                      <span className="p-[.4em] text-[.82em] text-n500">Nenhum POKE disponível.</span>
                    ) : disponiveis.map((p) => (
                      <button
                        key={p.uid}
                        type="button"
                        disabled={salvando}
                        onClick={() => escolher(indice, p.uid)}
                        className="flex items-center gap-[.4em] rounded-[.4em] px-[.35em] py-[.25em] text-left transition-colors hover:bg-n800 disabled:opacity-40"
                      >
                        <img src={faceIconUrl(p.speciesId) ?? undefined} alt="" className="h-[1.6em] w-[1.6em] shrink-0 object-contain" />
                        <span className="min-w-0 flex-1 truncate">{SPECIES[p.speciesId]?.name ?? p.speciesId}</span>
                        <span className="shrink-0 text-[.8em] text-n300">Lv {p.level}</span>
                        {pokeProntoPraRanqueado(p)
                          ? <CheckCircle className="shrink-0 text-green-400" />
                          : <Warning className="shrink-0 text-n500" />}
                      </button>
                    ))}
                  </div>
                </GameCard>
              )
            }

            if (!poke || !species) {
              return (
                <GameCard
                  key={indice}
                  onClick={() => setEscolhendoSlot(indice)}
                  className="flex h-[7em] flex-col items-center justify-center gap-[.2em] border-dashed p-[.4em] text-n500"
                >
                  <span className="text-[1.4em]">+</span>
                  <span className="text-[.78em]">Slot {indice + 1}</span>
                </GameCard>
              )
            }

            const pronto = pokeProntoPraRanqueado(poke)
            return (
              <GameCard key={indice} className="flex flex-col gap-[.3em] p-[.45em]">
                <div className="flex items-start justify-between gap-[.3em]">
                  <div className="flex min-w-0 items-center gap-[.35em]">
                    <PokeSwatch species={species} isShiny={poke.isShiny} poke={poke} size={2.4} />
                    <div className="min-w-0">
                      <div className="truncate text-[.88em] font-medium">{species.name}</div>
                      <div className="text-[.78em] text-n400">Lv {poke.level}</div>
                    </div>
                  </div>
                  <GameButton variant="ghost" className="shrink-0" title="Remover do time" onClick={() => remover(indice)}>
                    <X />
                  </GameButton>
                </div>
                <div className={`flex items-center gap-[.3em] text-[.75em] ${pronto ? 'text-green-400' : 'text-bad'}`}>
                  {pronto ? <CheckCircle /> : <Warning />}
                  <span className="truncate" title={nomeDosGolpes(poke)}>
                    {pronto ? 'Pronto pro ranqueado' : poke.level < NIVEL_MINIMO_PVP ? `Precisa nível ${NIVEL_MINIMO_PVP}+` : 'Faltam golpes ativos'}
                  </span>
                </div>
              </GameCard>
            )
          })}
        </div>
      </div>
    </div>
  )
}
