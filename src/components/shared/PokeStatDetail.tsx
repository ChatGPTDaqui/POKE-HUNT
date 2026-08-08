// Pecas do perfil de POKE: cabecalho (sprite gen5 animada + identidade +
// barras), grid de stats/IVs, e a tabela de moveset completo.
//
// O cabecalho fica FORA do corpo trocado pelas abas (ver PokeProfileModal): se
// fosse remontado a cada clique de aba, a animacao do GIF reiniciaria do zero.
import type { ReactNode } from 'react'
import { expProgressForInstance } from '@/engine/systems/progressionSystem'
import { getAbility } from '@/data/abilities'
import { resolveAbilityCategory } from '@/data/abilityCategory'
import { gen5SpriteUrl } from '@/data/gen5Sprites'
import { rarityOf } from '@/data/rarity'
import type { PokeInstance, Species } from '@/data/pokes'
import { PokeNameTag } from './PokeNameTag'
import { TypeChip } from './TypeChip'
import { Meter } from '@/components/game/controls'

export function ProfileHero({ poke, species }: { poke: PokeInstance; species: Species }) {
  const url = gen5SpriteUrl(poke.speciesId, poke.isShiny)
  const hpPct = Math.max(0, (poke.hp / poke.stats.hp) * 100)
  const progress = expProgressForInstance(poke, species)
  const expPct = Math.max(0, Math.min(100, (progress.into / progress.needed) * 100))

  return (
    <div className="flex items-start gap-[.9em] border-b border-n800 p-[1em]">
      <div
        // `object-contain` num box fixo: o GIF nativo varia muito de tamanho
        // (Charmander 41x42, Gyarados 102x84) e sem o box a arte "pula" de
        // tamanho a cada POKE aberto.
        className="flex h-[7em] w-[7em] shrink-0 items-center justify-center rounded-[.7em] border-2 bg-n900"
        style={{ borderColor: rarityOf(poke).color }}
      >
        {/* `h-full w-full` (e nao `max-h/max-w`): os GIFs nativos variam muito
            de tamanho — Charmander e 41x42, Gyarados e 102x84 — e com `max-*` os
            pequenos ficavam perdidos no meio de um box de 7em. Assim toda
            especie preenche o mesmo espaco, com upscale pixelado. */}
        <img
          src={url}
          alt={species.name}
          className="h-full w-full object-contain [image-rendering:pixelated]"
          onError={(e) => e.currentTarget.remove()}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-[.35em]">
        <div className="flex flex-wrap items-center gap-[.4em]">
          <PokeNameTag poke={poke} species={species} />
          <span className="text-n400">Lv{poke.level}</span>
        </div>
        <div className="flex gap-[.3em]">
          <TypeChip type={species.type} />
          {species.type2 && <TypeChip type={species.type2} />}
        </div>
        <div className="text-[.75em] text-n400">
          HP {Math.floor(poke.hp)}/{poke.stats.hp}
        </div>
        <Meter pct={hpPct} height=".45em" color={hpPct < 30 ? 'var(--color-hp-low)' : 'var(--color-hp)'} />
        <Meter pct={expPct} height=".3em" color="var(--color-exp)" />
      </div>
    </div>
  )
}

const IV_LABELS: Record<string, string> = {
  hp: 'HP', atkFis: 'AF', atkEsp: 'AE', def: 'DF', defEsp: 'DE', speed: 'VL',
}
// Um IV so e "perfeito" em 31 — e o teto do dado. Destacar em verde faz a
// leitura de "vale a pena investir neste POKE" ser instantanea.
const IV_MAX = 31

export function StatDetail({ poke, weaknessSection }: { poke: PokeInstance; weaknessSection: ReactNode }) {
  return (
    <div className="flex flex-col gap-[.7em]">
      {/* Ausente em POKE anterior a coluna `original_trainer` que o backfill
          nao alcancou (nenhum hoje) — a linha some em vez de mostrar vazio. */}
      {poke.originalTrainer && (
        <div className="flex items-center justify-between rounded-[.4em] border border-n800 bg-n900 px-[.55em] py-[.4em] text-[.85em]">
          <span className="text-n500">Treinador original</span>
          <b className="min-w-0 truncate font-medium">{poke.originalTrainer}</b>
        </div>
      )}
      <div className="grid grid-cols-3 gap-[.4em]">
        {([
          ['Atk Fis', poke.stats.atkFis],
          ['Atk Esp', poke.stats.atkEsp],
          ['Defesa', poke.stats.def],
          ['Def Esp', poke.stats.defEsp],
          ['Velocidade', poke.stats.speed],
        ] as const).map(([label, value]) => (
          <div key={label} className="flex justify-between rounded-[.4em] border border-n800 bg-n900 px-[.55em] py-[.4em]">
            <span className="text-[.85em] text-n500">{label}</span>
            <b className="font-medium">{value}</b>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-[.3em]">
        {Object.entries(poke.ivs).map(([key, value]) => {
          const perfeito = value >= IV_MAX
          return (
            <span
              key={key}
              className="rounded-[.4em] border px-[.5em] py-[.15em] text-[.72em]"
              style={{
                color: perfeito ? '#4ade80' : 'var(--color-n400)',
                borderColor: perfeito ? '#4ade80' : 'var(--color-n700)',
              }}
            >
              {IV_LABELS[key] || key} {value}
            </span>
          )
        })}
      </div>

      {weaknessSection}
    </div>
  )
}

const MOVE_GRID = 'grid grid-cols-[2.4em_1fr_3.4em_3.8em_3em_2.4em] items-center gap-[.4em]'

export function MovesetTable({ poke, species }: { poke: PokeInstance; species: Species }) {
  // O learnset COMPLETO da especie, nao so `poke.unlockedAbilities`: a tabela
  // tambem serve como preview de "o que vem por ai".
  const rows = species.abilities
    .map((entry) => ({ entry, ability: getAbility(entry.key) }))
    .filter((r): r is { entry: typeof r.entry; ability: NonNullable<typeof r.ability> } => Boolean(r.ability))
    .sort((a, b) => a.entry.levelReq - b.entry.levelReq)

  return (
    <div className="overflow-hidden rounded-[.4em] border border-n800 text-[.8em]">
      <div className={`${MOVE_GRID} border-b border-n800 bg-n800/60 px-[.5em] py-[.3em] font-medium`}>
        <span>Nv</span><span>Golpe</span><span>Tipo</span><span>Cat.</span><span>Dano</span><span>AOE</span>
      </div>
      <div className="max-h-[18em] overflow-y-auto">
        {rows.map(({ entry, ability }, index) => {
          const learned = entry.levelReq <= poke.level
          return (
            <div
              // A chave inclui o indice porque uma especie PODE aprender o
              // mesmo golpe em dois niveis (forma evoluida herda no nivel 1 e
              // reaprende no nivel real dela) — so a chave do golpe duplicaria.
              key={`${entry.key}-${index}`}
              className={`${MOVE_GRID} border-b border-n800 px-[.5em] py-[.3em] last:border-b-0 ${
                learned ? 'bg-n900 text-foreground' : 'text-n500 opacity-45'
              }`}
            >
              <span className="text-n400">{entry.levelReq}</span>
              <span className="truncate">{ability.name}</span>
              <span><TypeChip type={ability.type} /></span>
              <span className="text-n400">
                {resolveAbilityCategory(ability, poke) === 'physical' ? 'Fisico' : 'Especial'}
              </span>
              <span>{ability.power > 0 ? ability.power : '—'}</span>
              <span className="text-n400">{ability.target === 'aoe' ? '✓' : '—'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
