// Card do POKE ativo — topo-esquerdo, a superficie mais permanente da HUD.
//
// FONTE DE HP/EXP: `useWorldStore((s) => s.player?.poke)`, NAO
// `gameStateStore.team`. Decisao de arquitetura da Fase 4 (ver comentario no
// topo de engine/controller.ts): durante uma hunt o HP muda a cada tick no
// worldStore e so e sincronizado de volta pro gameStateStore periodicamente —
// ler do gameState mostraria HP defasado no meio do combate.
import { SPECIES, type PokeInstance } from '@/data/pokes'
import { faceIconUrl, spriteUrl } from '@/data/sprites'
import { rarityOf } from '@/data/rarity'
import { stoneName } from '@/data/stones'
import {
  canEvolve, evolutionStoneRequirement, expProgressForInstance,
} from '@/engine/systems/progressionSystem'
import { controller } from '@/engine/controller'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { Meter } from '@/components/game/controls'
import { cn } from '@/lib/utils'

export function ActivePokeCard() {
  const worldPoke = useWorldStore((s) => s.player?.poke ?? null)
  const fainted = useWorldStore((s) => s.player?.fainted ?? false)
  const teamPoke = useGameStateStore((s) => s.team[s.activeIndex] ?? null)
  const showProfile = usePokeProfileStore((s) => s.showProfile)

  // Sem mundo montado ainda (boot), cai pro time salvo so pra nao piscar vazio.
  const poke = worldPoke ?? teamPoke
  if (!poke) return null
  const species = SPECIES[poke.speciesId]
  if (!species) return null

  return (
    <div
      onClick={() => showProfile(poke, species)}
      title={`Ver perfil de ${species.name}`}
      className="hud-surface pointer-events-auto flex cursor-pointer gap-[.55em] rounded-xl border border-n800 p-[.6em] shadow-lg"
    >
      <PokeArt poke={poke} name={species.name} />
      <div className="flex min-w-[9em] flex-col gap-[.25em]">
        <div className="flex flex-wrap items-center gap-[.4em] font-medium">
          {poke.isShiny && <span aria-hidden>✨</span>}
          <RarityBadge poke={poke} />
          <span className={cn(poke.isShiny && 'text-shiny')}>{species.name}</span>
        </div>
        <PokeVitals poke={poke} species={species} />
        {fainted && <span className="text-[.75em] font-medium text-bad">Desmaiado!</span>}
        <EvolveButton poke={poke} species={species} />
      </div>
    </div>
  )
}

// A sprite de FACE (`assets/sprites-face/`, o retrato 40x40 do PMD) e a arte
// certa pra uma moldura quadrada: ela e enquadrada no rosto e ja vem quadrada.
// `spriteUrl` (o icone "grande", recorte de fan sheet) tem proporcao e padding
// variaveis por especie, e com `object-contain` sobrava faixa vazia de um dos
// lados — era esse o "nao preenche a moldura".
//
// `object-cover` + `h-full w-full` faz o retrato ocupar a moldura inteira; como
// os dois sao quadrados, cover nao corta nada na pratica. `pixelated` porque e
// upscale de 40px (o mesmo tratamento que a sprite do perfil ja usa).
function PokeArt({ poke, name }: { poke: PokeInstance; name: string }) {
  const url = faceIconUrl(poke.speciesId, poke.isShiny) ?? spriteUrl(poke.speciesId, poke.isShiny)
  const rarity = rarityOf(poke)
  return (
    <div
      className="h-[5em] w-[5em] shrink-0 overflow-hidden rounded-[.7em] border-2 bg-n900"
      style={{ borderColor: rarity.color }}
    >
      {url && (
        <img
          src={url}
          alt={name}
          className="h-full w-full object-cover [image-rendering:pixelated]"
        />
      )}
    </div>
  )
}

function RarityBadge({ poke }: { poke: { rarity?: string | null } }) {
  const rarity = rarityOf(poke)
  return (
    <span
      className="rounded-full border px-[.45em] py-[.1em] text-[.68em] tracking-[.05em]"
      style={{ color: rarity.color, borderColor: rarity.color }}
    >
      {rarity.label}
    </span>
  )
}

function PokeVitals({ poke, species }: { poke: PokeInstance; species: (typeof SPECIES)[string] }) {
  const hpPct = Math.max(0, (poke.hp / poke.stats.hp) * 100)
  const progress = expProgressForInstance(poke, species)
  const expPct = Math.max(0, Math.min(100, (progress.into / progress.needed) * 100))

  return (
    <>
      <div className="text-[.8em] text-n300">
        Lv {poke.level} · XP {expPct.toFixed(0)}%
      </div>
      <Meter pct={hpPct} height=".45em" color={hpPct < 30 ? 'var(--color-hp-low)' : 'var(--color-hp)'} />
      <Meter pct={expPct} height=".3em" color="var(--color-exp)" />
      <div className="text-[.72em] text-n400">
        HP {Math.floor(poke.hp)}/{poke.stats.hp}
      </div>
    </>
  )
}

// Evoluir fica DENTRO do card clicavel, entao precisa parar a propagacao: sem
// isso o clique tambem abriria o modal de perfil por cima da evolucao.
function EvolveButton({ poke, species }: { poke: PokeInstance; species: (typeof SPECIES)[string] }) {
  if (!canEvolve(poke, species)) return null
  const stoneReq = evolutionStoneRequirement(species)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        controller.evolvePoke(poke.uid)
      }}
      className="mt-[.15em] cursor-pointer self-start rounded-[.4em] border border-gold px-[.6em] py-[.15em] text-[.72em] text-gold hover:bg-gold/12"
    >
      {stoneReq ? `Evoluir (${stoneReq.count}x ${stoneName(stoneReq.type)})` : 'Evoluir'}
    </button>
  )
}
