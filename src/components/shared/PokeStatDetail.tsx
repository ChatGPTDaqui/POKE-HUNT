// Port de js/ui/panels/PokeStatDetail.js — cabecalho de perfil (sprite gen5
// animada + nome/tipos/HP/EXP), grid de stats/IVs, e tabela de moveset
// completo. Usado pelo PokeProfileModal (Fase 6) e por qualquer lugar que
// precise mostrar detalhe de um POKE.
import type { ReactNode } from 'react'
import { expProgressForInstance } from '@/engine/systems/progressionSystem'
import { getAbility, isDamagingAbility, resolveAbilityCategory } from '@/data/abilities'
import { gen5SpriteUrl } from '@/data/gen5Sprites'
import { colorForType } from '@/data/typeColors'
import { rarityOf } from '@/data/rarity'
import type { PokeInstance, Species } from '@/data/pokes'
import type { ElementType } from '@/data/generated/types'
import { PokeNameTag } from './PokeNameTag'

function TypeChip({ type }: { type: ElementType }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: colorForType(type) }}>
      {type.slice(0, 3)}
    </span>
  )
}

export function ProfileHero({ poke, species }: { poke: PokeInstance; species: Species }) {
  const url = gen5SpriteUrl(poke.speciesId, poke.isShiny)
  const hpPct = Math.max(0, poke.hp / poke.stats.hp)
  const progress = expProgressForInstance(poke, species)
  const expPct = Math.max(0, Math.min(1, progress.into / progress.needed))

  return (
    <div className="flex gap-3">
      <div
        className="flex h-[132px] w-[132px] shrink-0 items-center justify-center rounded-lg border-2 bg-muted/40"
        style={{ borderColor: rarityOf(poke).color }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={species.name}
          className="max-h-full max-w-full object-contain [image-rendering:pixelated]"
          onError={(e) => e.currentTarget.remove()}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <div className="flex items-center gap-2">
          <PokeNameTag poke={poke} species={species} />
          <span className="text-sm text-muted-foreground">Lv{poke.level}</span>
        </div>
        <div className="flex gap-1">
          <TypeChip type={species.type} />
          {species.type2 && <TypeChip type={species.type2} />}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-8 text-muted-foreground">HP</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={hpPct < 0.3 ? 'h-full bg-destructive' : 'h-full bg-emerald-500'}
              style={{ width: `${hpPct * 100}%` }}
            />
          </div>
          <span className="text-muted-foreground">{Math.floor(poke.hp)}/{poke.stats.hp}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-8 text-muted-foreground">EXP</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-sky-500" style={{ width: `${expPct * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

const IV_LABELS: Record<string, string> = { hp: 'HP', atkFis: 'AF', atkEsp: 'AE', def: 'DF', defEsp: 'DE', speed: 'VL' }

export function StatDetail({ poke, weaknessSection }: { poke: PokeInstance; weaknessSection: ReactNode }) {
  const abilityNames = poke.unlockedAbilities
    .map((id) => getAbility(id))
    .filter(isDamagingAbility)
    .map((a) => a!.name)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          ['Atk Fis', poke.stats.atkFis],
          ['Atk Esp', poke.stats.atkEsp],
          ['Defesa', poke.stats.def],
          ['Def Esp', poke.stats.defEsp],
          ['Velocidade', poke.stats.speed],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col rounded-md border bg-muted/30 px-2 py-1 text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold">{value}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(poke.ivs).map(([key, value]) => (
          <span key={key} className="rounded border px-1.5 py-0.5 text-[10px]">
            {IV_LABELS[key] || key} <b>{value}</b>
          </span>
        ))}
      </div>
      <div className="text-xs text-muted-foreground">
        Habilidades: {abilityNames.length ? abilityNames.join(', ') : 'Nenhuma ainda'}
      </div>
      <div>
        <div className="mb-1.5 text-sm font-medium">Fraquezas e resistencias</div>
        {weaknessSection}
      </div>
    </div>
  )
}

export function MovesetTable({ poke, species }: { poke: PokeInstance; species: Species }) {
  const rows = species.abilities
    .map((entry) => ({ entry, ability: getAbility(entry.key) }))
    .filter((r): r is { entry: typeof r.entry; ability: NonNullable<typeof r.ability> } => Boolean(r.ability))
    .sort((a, b) => a.entry.levelReq - b.entry.levelReq)

  return (
    <div className="overflow-hidden rounded-md border text-xs">
      <div className="grid grid-cols-[2rem_1fr_2.5rem_3rem_2.5rem_2rem] gap-1 border-b bg-muted/50 px-2 py-1 font-medium">
        <span>Nv</span><span>Golpe</span><span>Tipo</span><span>Cat.</span><span>Dano</span><span>AOE</span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {rows.map(({ entry, ability }) => {
          const learned = entry.levelReq <= poke.level
          const dmg = ability.power > 0 ? ability.power : '—'
          const category = resolveAbilityCategory(ability, poke) === 'physical' ? 'Fisico' : 'Especial'
          const aoe = ability.target === 'aoe' ? '✓' : '—'
          return (
            <div
              key={entry.key}
              className={
                'grid grid-cols-[2rem_1fr_2.5rem_3rem_2.5rem_2rem] gap-1 border-b px-2 py-1 last:border-b-0' +
                (learned ? ' bg-accent/40 text-foreground' : ' text-muted-foreground')
              }
            >
              <span>{entry.levelReq}</span>
              <span className="truncate">{ability.name}</span>
              <span><TypeChip type={ability.type} /></span>
              <span>{category}</span>
              <span>{dmg}</span>
              <span>{aoe}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
