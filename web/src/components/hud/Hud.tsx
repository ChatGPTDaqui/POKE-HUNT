// Port de js/ui/panels/HUD.js — barra sempre-visivel no topo: linha do
// Treinador (nome/nivel/EXP) e linha do POKE ativo (icone/nome/nivel/HP/EXP)
// mais a carteira.
//
// FONTE DE HP/EXP: `useWorldStore((s) => s.player?.poke)`, NAO
// `gameStateStore.team`. Decisao de arquitetura da Fase 4 (ver comentario no
// topo de engine/controller.ts): durante uma hunt o HP muda a cada tick no
// worldStore e so e sincronizado de volta pro gameStateStore periodicamente
// — ler do gameState mostraria HP defasado no meio do combate.
//
// O padrao de "DOM incremental" do arquivo vanilla (construir uma vez,
// cachear refs, nunca innerHTML por frame) NAO foi portado de proposito: ele
// existia so pra evitar que o botao "Evoluir" fosse destruido no meio de um
// clique quando o painel era reconstruido a 60fps. O reconciler do React ja
// preserva o node entre renders.
import { SPECIES } from '@/data/pokes'
import { spriteUrl } from '@/data/sprites'
import { rarityOf } from '@/data/rarity'
import { stoneName } from '@/data/stones'
import { canEvolve, evolutionStoneRequirement, expProgressForInstance, trainerExpProgress } from '@/engine/systems/progressionSystem'
import { controller } from '@/engine/controller'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { cn } from '@/lib/utils'

export function Hud() {
  // POKE ao vivo do mundo (HP/EXP corretos durante combate). Quando nao ha
  // mundo montado ainda, cai pro time salvo so pra nao piscar vazio.
  const worldPoke = useWorldStore((s) => s.player?.poke ?? null)
  const fainted = useWorldStore((s) => s.player?.fainted ?? false)
  const teamPoke = useGameStateStore((s) => s.team[s.activeIndex] ?? null)
  const trainer = useGameStateStore((s) => s.trainer)
  const gold = useGameStateStore((s) => s.wallet.gold)
  const diamonds = useGameStateStore((s) => s.wallet.diamonds)
  const showProfile = usePokeProfileStore((s) => s.showProfile)

  const poke = worldPoke ?? teamPoke
  const trainerProgress = trainerExpProgress(trainer)
  const trainerExpPct = Math.max(0, Math.min(1, trainerProgress.into / trainerProgress.needed))

  return (
    <div className="pointer-events-auto flex flex-col gap-1 rounded-lg border bg-background/85 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">{trainer.name}</span>
        <span className="text-muted-foreground">Lv{trainer.level}</span>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-amber-400" style={{ width: `${trainerExpPct * 100}%` }} />
        </div>
      </div>

      {!poke ? (
        <div className="text-muted-foreground">Nenhum POKE ainda</div>
      ) : (
        <ActivePokeRow poke={poke} fainted={fainted} onOpenProfile={() => showProfile(poke, SPECIES[poke.speciesId])} />
      )}

      <div className="flex gap-3 text-muted-foreground">
        <span>🪙 {gold}</span>
        <span>Diamantes: {diamonds}</span>
      </div>
    </div>
  )
}

function ActivePokeRow({
  poke,
  fainted,
  onOpenProfile,
}: {
  poke: NonNullable<ReturnType<typeof useGameStateStore.getState>['team'][number]>
  fainted: boolean
  onOpenProfile: () => void
}) {
  const species = SPECIES[poke.speciesId]
  const rarity = rarityOf(poke)
  const hpPct = Math.max(0, poke.hp / poke.stats.hp)
  const progress = expProgressForInstance(poke, species)
  const expPct = Math.max(0, Math.min(1, progress.into / progress.needed))
  const url = spriteUrl(poke.speciesId, poke.isShiny)

  const eligible = canEvolve(poke, species)
  const stoneReq = evolutionStoneRequirement(species)

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onOpenProfile}
        className="relative shrink-0 cursor-pointer"
        title={`Ver perfil de ${species.name}`}
      >
        {url ? (
          <img
            src={url}
            alt={species.name}
            className="h-10 w-10 rounded-md border-2 object-contain"
            style={{ borderColor: rarity.color }}
          />
        ) : (
          <span
            className="block h-10 w-10 rounded-md border-2"
            style={{ background: species.color, borderColor: rarity.color }}
          />
        )}
        {poke.isShiny && (
          <span className="absolute -top-1 -left-1 text-[10px] leading-none" aria-hidden>
            ✨
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {poke.isShiny && <span aria-hidden>✨</span>}
          <span
            className="rounded border px-1 py-px text-[10px] leading-tight font-semibold"
            style={{ color: rarity.color, borderColor: rarity.color }}
          >
            {rarity.label}
          </span>
          <span className={cn('font-medium', poke.isShiny && 'text-violet-400')}>{species.name}</span>
          <span className="text-muted-foreground">Lv{poke.level}</span>
          {eligible && (
            <button
              type="button"
              onClick={() => controller.evolvePoke(poke.uid)}
              className="cursor-pointer rounded border border-amber-500 px-1.5 py-px text-[10px] font-semibold text-amber-500 hover:bg-amber-500/10"
            >
              {stoneReq ? `Evoluir (${stoneReq.count}x ${stoneName(stoneReq.type)})` : 'Evoluir'}
            </button>
          )}
          {fainted && <span className="text-destructive">- Desmaiado!</span>}
        </div>
        <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={hpPct < 0.3 ? 'h-full bg-destructive' : 'h-full bg-emerald-500'}
            style={{ width: `${hpPct * 100}%` }}
          />
        </div>
        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-sky-500" style={{ width: `${expPct * 100}%` }} />
        </div>
      </div>
    </div>
  )
}
