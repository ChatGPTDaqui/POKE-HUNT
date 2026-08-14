// Pecas do perfil de POKE: cabecalho (sprite gen5 animada + identidade +
// barras), grid de stats/IVs, e a tabela de moveset completo.
//
// O cabecalho fica FORA do corpo trocado pelas abas (ver PokeProfileModal): se
// fosse remontado a cada clique de aba, a animacao do GIF reiniciaria do zero.
import type { ReactNode } from 'react'
import { expProgressForInstance } from '@/engine/systems/progressionSystem'
import { getAbility } from '@/data/abilities'
import { activeAbilitiesPadrao, ehGolpeAoeDeNivel50, MAX_ACTIVE_ABILITIES } from '@/data/activeAbilities'
import { resolveAbilityCategory } from '@/data/abilityCategory'
import { controller } from '@/engine/controller'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'
import { cn } from '@/lib/utils'
import { gen5SpriteUrl } from '@/data/gen5Sprites'
import { rarityOf } from '@/data/rarity'
import type { PokeInstance, Species } from '@/data/pokes'
import { PokeNameTag } from './PokeNameTag'
import { StatusBadge } from './StatusBadge'
import { TypeChip } from './TypeChip'
import { AbilityTooltip } from './AbilityTooltip'
import { Meter } from '@/components/game/controls'
import type { AbilityCategory } from '@/data/generated/types'

// Rotulo das 3 categorias reais. Antes era um ternario `physical ? ... : ...`,
// que passou a mentir quando 'status' virou categoria de verdade com os dados
// do Ultra Sun: todo golpe de status apareceria como "Especial".
const ROTULO_CATEGORIA: Record<AbilityCategory, string> = {
  physical: 'Fisico',
  special: 'Especial',
  status: 'Status',
}

export function ProfileHero({ poke, species }: { poke: PokeInstance; species: Species }) {
  const url = gen5SpriteUrl(poke.speciesId, poke.isShiny)
  const hpPct = Math.max(0, (poke.hp / poke.stats.hp) * 100)
  const progress = expProgressForInstance(poke, species)
  const expPct = Math.max(0, Math.min(100, (progress.into / progress.needed) * 100))

  return (
    <div className="flex items-start gap-[.6em] border-b border-n800 p-[.7em]">
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
        <div className="flex items-center gap-[.4em] text-[.75em] text-n400">
          <span>HP {Math.floor(poke.hp)}/{poke.stats.hp}</span>
          {/* So o nao-volatil aqui: a ficha abre pra qualquer POKE da equipe ou
              da mochila, e confusao so existe pra quem esta em campo. */}
          <StatusBadge status={poke.status} />
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
    <div className="flex flex-col gap-[.5em]">
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

const MOVE_GRID = 'grid grid-cols-[2.4em_1fr_3.4em_3.8em_3em_2.4em_2.6em] items-center gap-[.4em]'

// A celula da coluna "Usar". Tres estados sem toggle: golpe ainda nao
// aprendido (nada), o AOE de nivel 50 (sempre disponivel, fora dos 4 slots) e
// dentro de hunt (mostra a marca, mas nao clica).
function CelulaUsar(
  { aoe50, aprendido, ativo, habilitado, onClick }:
  { aoe50: boolean; aprendido: boolean; ativo: boolean; habilitado: boolean; onClick: () => void },
) {
  if (!aprendido) return <span className="text-n700">—</span>
  if (aoe50) return <span className="text-n500" title="Golpe de area do Nivel 50: sempre disponivel, nao ocupa slot.">fixo</span>
  return (
    <button
      type="button"
      disabled={!habilitado}
      onClick={onClick}
      title={habilitado ? (ativo ? 'Remover dos golpes ativos' : 'Usar este golpe') : 'Saia da hunt para trocar de golpe'}
      className={cn(
        'h-[1.4em] w-[1.4em] rounded-[.25em] border font-[inherit] leading-none',
        ativo ? 'border-primary bg-primary text-n900' : 'border-n700 bg-transparent text-transparent',
        habilitado ? 'cursor-pointer' : 'cursor-not-allowed opacity-45',
      )}
    >
      ✓
    </button>
  )
}

export function MovesetTable({ poke, species }: { poke: PokeInstance; species: Species }) {
  // O learnset COMPLETO da especie, nao so `poke.unlockedAbilities`: a tabela
  // tambem serve como preview de "o que vem por ai".
  const rows = species.abilities
    .map((entry) => ({ entry, ability: getAbility(entry.key) }))
    .filter((r): r is { entry: typeof r.entry; ability: NonNullable<typeof r.ability> } => Boolean(r.ability))
    .sort((a, b) => a.entry.levelReq - b.entry.levelReq)

  // A selecao dos 4 so aparece pra POKE QUE E SEU. Este mesmo componente abre
  // na Pokedex com um POKE de preview (createPokeInstance com uid solto), e la
  // nao ha nada a configurar — dai a checagem por uid no estado, e nao uma prop
  // que cada chamador teria que lembrar de passar.
  const equipe = useGameStateStore((s) => s.team)
  const mochila = useGameStateStore((s) => s.bagPokes)
  const emHunt = useGameStateStore((s) => s.currentMapId) != null
  const meu = [...equipe, ...mochila].some((p) => p.uid === poke.uid)

  const ativos = poke.activeAbilities ?? activeAbilitiesPadrao(species, poke.level)
  const podeEscolher = meu && !emHunt

  function alternar(key: string): void {
    if (!podeEscolher) return
    const ja = ativos.includes(key)
    if (!ja && ativos.length >= MAX_ACTIVE_ABILITIES) {
      useToastStore.getState().pushToast(`Maximo de ${MAX_ACTIVE_ABILITIES} golpes — desmarque um primeiro.`, 'info', 'world')
      return
    }
    controller.setActiveAbilities(poke.uid, ja ? ativos.filter((k) => k !== key) : [...ativos, key])
  }

  return (
    <div className="overflow-hidden rounded-[.4em] border border-n800 text-[.8em]">
      {meu && (
        <div className="flex items-center justify-between border-b border-n800 bg-n900 px-[.5em] py-[.35em]">
          <span className="text-n400">
            Golpes ativos <span className="text-foreground">{ativos.length}/{MAX_ACTIVE_ABILITIES}</span>
          </span>
          <span className="text-n500">
            {emHunt ? 'Saia da hunt para trocar de golpe.' : 'Clique na coluna Usar para escolher.'}
          </span>
        </div>
      )}
      <div className={`${MOVE_GRID} border-b border-n800 bg-n800/60 px-[.5em] py-[.3em] font-medium`}>
        <span>Nv</span><span>Golpe</span><span>Tipo</span><span>Cat.</span><span>Dano</span><span>AOE</span><span>Usar</span>
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
              <AbilityTooltip ability={ability} poke={poke}>
                <span className="cursor-help truncate underline decoration-dotted underline-offset-2">
                  {ability.name}
                </span>
              </AbilityTooltip>
              <span><TypeChip type={ability.type} /></span>
              <span className="text-n400">
                {ROTULO_CATEGORIA[resolveAbilityCategory(ability, poke)]}
              </span>
              <span>{ability.power > 0 ? ability.power : '—'}</span>
              <span className="text-n400">{ability.target === 'aoe' ? '✓' : '—'}</span>
              <span>{meu && <CelulaUsar
                aoe50={ehGolpeAoeDeNivel50(entry.key)}
                aprendido={learned}
                ativo={ativos.includes(entry.key)}
                habilitado={podeEscolher}
                onClick={() => alternar(entry.key)}
              />}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
