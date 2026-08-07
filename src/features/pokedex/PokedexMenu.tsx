// Pokedex: toda especie registrada no jogo, independente de o jogador ja ter
// possuido uma. Status base, learnset completo, em quais hunts aparece, e um
// contador de abates por especie.
//
// Correcao da auditoria (item 8): clicar no card SO expande. Antes o mesmo
// clique expandia o card E abria o modal de perfil, que cobria justamente o
// detalhe que tinha acabado de abrir. Abrir o perfil agora e um botao explicito
// dentro do detalhe.
import { useMemo, useState } from 'react'
import { SPECIES, createPokeInstance, type Species } from '@/data/pokes'
// Preview da Pokedex nao e simulacao: usa uma sequencia DERIVADA do id da
// especie em vez da do mundo. Consumir a sequencia principal pra desenhar um
// cartao dessincronizaria o replay que o servidor verifica (Fase D) — e de
// quebra, assim o mesmo POKE aparece igual toda vez que o cartao abre.
import { deriveRng } from '@/core/rng'
import { getAbility } from '@/data/abilities'
import { MAPS } from '@/data/maps'
import type { HuntMapDef } from '@/data/huntTypes'
import { getEncounter } from '@/data/enemies'
import { useGameStateStore, type PokedexKillCount } from '@/stores/gameStateStore'
import { useUiStore } from '@/stores/uiStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { TypeChip } from '@/components/shared/TypeChip'
import { TypeWeaknessSection } from '@/components/shared/TypeWeaknessSection'
import { GameButton, GameInput } from '@/components/game/controls'
import { focusHunt } from '@/features/hunt/HuntMenu'

// Instancia so-pra-exibicao do botao "Ver perfil completo": uma especie sozinha
// (sem poke possuido) nao alimenta o modal de perfil, que espera uma instancia
// real (nivel/HP/EXP/IVs/raridade). Deterministica e fixa, puramente visual —
// nunca entra em bagPokes/team e nunca e salva.
const DEX_PREVIEW_LEVEL = 50
const DEX_PREVIEW_IVS = { hp: 31, atkFis: 31, atkEsp: 31, def: 31, defEsp: 31, speed: 31 }

// O campo `description` de cada especie e texto da planilha tipo "Pokedex Nº4 -
// tipo FIRE." — o dado gerado nao tem um campo numerico de dex separado, entao
// esse e o unico lugar onde esse numero vive. Usado so pra uma ordem de
// listagem estavel/familiar.
function dexNumber(species: Species): number {
  const match = /N[ºo]\s*(\d+)/.exec(species.description || '')
  return match ? parseInt(match[1], 10) : 99999
}

// Toda hunt (Johto/Kanto/BOSS) cujo enemyPool pode spawnar essa especie —
// exclui os espelhos do Modo Pesadelo (prefixo `nightmare_`), que sao as mesmas
// hunts em nivel maior, nao um local distinto; hunts BOSS ficam, ja que sao a
// UNICA fonte de um lendario.
function huntsForSpecies(speciesId: string): HuntMapDef[] {
  return Object.values(MAPS).filter((map) => {
    if (map.id.startsWith('nightmare_')) return false
    return map.enemyPool.some((encId) => {
      const enc = getEncounter(encId)
      return enc != null && enc.speciesId === speciesId
    })
  })
}

// Mesma formula de engine/systems/pokedexSystem.ts#pokedexKillCount, so que
// sobre o slice `pokedexKills` ja assinado por selector, em vez do store
// inteiro: aquela versao recebe o GameStateStore completo, e chamar getState()
// no meio do render leria o valor certo mas NAO re-renderizaria quando um abate
// novo chegasse.
function killCountFrom(kills: Record<string, PokedexKillCount>, speciesId: string, shinyOnly: boolean): number {
  const entry = kills[speciesId]
  if (!entry) return 0
  return shinyOnly ? entry.shiny : entry.normal + entry.shiny
}

const BASE_STAT_ROWS = [
  ['HP', 'hp'], ['Atk Fis', 'atkFis'], ['Atk Esp', 'atkEsp'],
  ['Defesa', 'def'], ['Def Esp', 'defEsp'], ['Velocidade', 'speed'],
] as const

function SpeciesDetail({ species }: { species: Species }) {
  const hunts = huntsForSpecies(species.id)
  const openScreen = useUiStore((s) => s.openScreen)
  const showProfile = usePokeProfileStore((s) => s.showProfile)

  const moves = species.abilities
    .map((entry) => ({ entry, ability: getAbility(entry.key) }))
    .filter((r): r is { entry: typeof r.entry; ability: NonNullable<typeof r.ability> } => r.ability != null)
    .sort((a, b) => a.entry.levelReq - b.entry.levelReq)

  return (
    <div className="flex flex-col gap-[.8em] border-t border-n800 p-[.7em]">
      <div>
        <div className="mb-[.4em] font-medium">Status base</div>
        <div className="grid grid-cols-3 gap-[.4em]">
          {BASE_STAT_ROWS.map(([label, key]) => (
            <div key={key} className="flex justify-between rounded-[.4em] border border-n800 bg-background px-[.5em] py-[.35em] text-[.8em]">
              <span className="text-n500">{label}</span>
              <b className="font-medium">{species.base[key]}</b>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-[.4em] font-medium">Fraquezas e resistencias</div>
        <TypeWeaknessSection species={species} />
      </div>

      <div>
        <div className="mb-[.4em] font-medium">Golpes aprendidos</div>
        <div className="overflow-hidden rounded-[.4em] border border-n800 text-[.8em]">
          <div className="grid grid-cols-[2.4em_1fr_3.4em_4em_3em_2.4em] gap-[.4em] border-b border-n800 bg-n800/60 px-[.5em] py-[.3em] font-medium">
            <span>Nv</span><span>Golpe</span><span>Tipo</span><span>Cat.</span><span>Dano</span><span>AOE</span>
          </div>
          <div className="max-h-[16em] overflow-y-auto">
            {moves.map(({ entry, ability }) => {
              // Sem instancia especifica na Pokedex (visao so-de-especie) —
              // aproxima a categoria do golpe AoE dinamico pelos stats BASE da
              // especie, em vez dos de uma instancia real.
              const category =
                ability.category === 'dynamic'
                  ? species.base.atkFis >= species.base.atkEsp ? 'physical' : 'special'
                  : ability.category
              return (
                <div
                  key={entry.key}
                  className="grid grid-cols-[2.4em_1fr_3.4em_4em_3em_2.4em] items-center gap-[.4em] border-b border-n800 px-[.5em] py-[.3em] last:border-b-0"
                >
                  <span className="text-n400">{entry.levelReq}</span>
                  <span className="truncate">{ability.name}</span>
                  <span><TypeChip type={ability.type} /></span>
                  <span className="text-n400">{category === 'physical' ? 'Fisico' : 'Especial'}</span>
                  <span>{ability.power > 0 ? ability.power : '—'}</span>
                  <span className="text-n400">{ability.target === 'aoe' ? '✓' : '—'}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-[.4em] font-medium">Onde encontrar</div>
        {hunts.length === 0 ? (
          <span className="text-[.8em] text-n500">Nenhuma hunt conhecida ainda.</span>
        ) : (
          <div className="flex flex-wrap gap-[.4em]">
            {hunts.map((map) => (
              <GameButton
                key={map.id}
                onClick={(e) => {
                  e.stopPropagation()
                  focusHunt(map)
                  openScreen('hunts')
                }}
              >
                {map.name} (Lv {map.levelRange[0]}-{map.levelRange[1]})
              </GameButton>
            ))}
          </div>
        )}
      </div>

      <GameButton
        variant="primary"
        className="self-start"
        onClick={(e) => {
          e.stopPropagation()
          showProfile(
            createPokeInstance(deriveRng(0, species.id), species.id, DEX_PREVIEW_LEVEL, {
              ivs: DEX_PREVIEW_IVS,
              rarity: 'comum',
            }),
            species,
          )
        }}
      >
        Ver perfil completo
      </GameButton>
    </div>
  )
}

export function PokedexMenu() {
  const pokedexKills = useGameStateStore((s) => s.pokedexKills)
  const [search, setSearch] = useState('')
  const [expandedSpeciesId, setExpandedSpeciesId] = useState<string | null>(null)
  const [shinyView, setShinyView] = useState(false)

  const allSpecies = useMemo(
    () => Object.values(SPECIES).sort((a, b) => dexNumber(a) - dexNumber(b)),
    [],
  )

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term ? allSpecies.filter((s) => s.name.toLowerCase().includes(term)) : allSpecies
  }, [allSpecies, search])

  return (
    <div className="flex flex-col gap-[.6em]">
      <div className="flex gap-[.5em]">
        <GameInput
          className="flex-1"
          placeholder="Buscar Pokemon..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <GameButton variant={shinyView ? 'primary' : 'secondary'} onClick={() => setShinyView((v) => !v)}>
          ✨ {shinyView ? 'Abates Shiny' : 'Abates Totais'}
        </GameButton>
      </div>

      {visible.length === 0 && <p className="text-n500">Nenhum Pokemon encontrado.</p>}

      {visible.map((species) => {
        const kills = killCountFrom(pokedexKills, species.id, shinyView)
        const expanded = expandedSpeciesId === species.id

        return (
          <div key={species.id} className="overflow-hidden rounded-[.6em] border border-n800 bg-n900">
            <div
              onClick={() => setExpandedSpeciesId(expanded ? null : species.id)}
              className="flex cursor-pointer items-center gap-[.7em] px-[.7em] py-[.55em] hover:bg-n800"
            >
              <PokeSwatch species={species} size={2.4} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-[.4em]">
                  <span className="text-n500">#{dexNumber(species)}</span>
                  <span className="font-medium">{species.name}</span>
                  <TypeChip type={species.type} />
                  {species.type2 && <TypeChip type={species.type2} />}
                </div>
              </div>
              <span className="shrink-0 text-[.8em] text-n400">
                {shinyView ? `✨ ${kills}` : `Abates: ${kills}`}
              </span>
            </div>
            {expanded && <SpeciesDetail species={species} />}
          </div>
        )
      })}
    </div>
  )
}
