// Port de js/ui/panels/PokedexMenu.js — toda especie registrada no jogo,
// independente de o jogador ja ter possuido uma: status base, learnset
// completo, em quais hunts aparece, e um contador de abates por especie.
import { useMemo, useState } from 'react'
import { SPECIES, createPokeInstance, type Species } from '@/data/pokes'
// Preview da Pokedex nao e simulacao: usa uma sequencia DERIVADA do id da
// especie em vez da do mundo. Consumir a sequencia principal pra desenhar um
// cartao dessincronizaria o replay que o servidor verifica (Fase D) — e de
// quebra, assim o mesmo POKE aparece igual toda vez que o cartao abre.
import { deriveRng } from '@/core/rng'
import { getAbility } from '@/data/abilities'
import { colorForType } from '@/data/typeColors'
import { MAPS } from '@/data/maps'
import type { HuntMapDef } from '@/data/huntTypes'
import { getEncounter } from '@/data/enemies'
import type { ElementType } from '@/data/generated/types'
import { useGameStateStore, type PokedexKillCount } from '@/stores/gameStateStore'
import { useUiStore } from '@/stores/uiStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { TypeWeaknessSection } from '@/components/shared/TypeWeaknessSection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { focusHunt } from '@/features/hunt/HuntMenu'

// Instancia so-pra-exibicao do botao "abrir cartao": uma especie sozinha
// (sem poke possuido) nao alimenta o modal de perfil, que espera uma
// instancia real (nivel/HP/EXP/IVs/raridade). Deterministica e fixa,
// puramente visual — nunca entra em bagPokes/team e nunca e salva.
const DEX_PREVIEW_LEVEL = 50
const DEX_PREVIEW_IVS = { hp: 31, atkFis: 31, atkEsp: 31, def: 31, defEsp: 31, speed: 31 }

// O campo `description` de cada especie e texto da planilha tipo "Pokedex
// Nº4 - tipo FIRE." — o dado gerado nao tem um campo numerico de dex
// separado, entao esse e o unico lugar onde esse numero vive. Usado so pra
// uma ordem de listagem estavel/familiar.
function dexNumber(species: Species): number {
  const match = /N[ºo]\s*(\d+)/.exec(species.description || '')
  return match ? parseInt(match[1], 10) : 99999
}

// Toda hunt (Johto/Kanto/BOSS) cujo enemyPool pode spawnar essa especie —
// exclui os espelhos do Modo Pesadelo (prefixo `nightmare_`), que sao as
// mesmas hunts em nivel maior, nao um local distinto; hunts BOSS ficam, ja
// que sao a UNICA fonte de um lendario.
function huntsForSpecies(speciesId: string): HuntMapDef[] {
  return Object.values(MAPS).filter((map) => {
    if (map.id.startsWith('nightmare_')) return false
    return map.enemyPool.some((encId) => {
      const enc = getEncounter(encId)
      return enc != null && enc.speciesId === speciesId
    })
  })
}

function TypeChip({ type }: { type: ElementType }) {
  return (
    <span className="rounded px-1 py-0.5 text-[10px] font-semibold text-white" style={{ background: colorForType(type) }}>
      {type.slice(0, 3)}
    </span>
  )
}

// Mesma formula de engine/systems/pokedexSystem.ts#pokedexKillCount, so que
// sobre o slice `pokedexKills` ja assinado por selector, em vez do store
// inteiro: aquela versao recebe o GameStateStore completo, e chamar
// getState() no meio do render leria o valor certo mas NAO re-renderizaria
// quando um abate novo chegasse.
function killCountFrom(kills: Record<string, PokedexKillCount>, speciesId: string, shinyOnly: boolean): number {
  const entry = kills[speciesId]
  if (!entry) return 0
  return shinyOnly ? entry.shiny : entry.normal + entry.shiny
}

function SpeciesDetail({ species }: { species: Species }) {
  const hunts = huntsForSpecies(species.id)
  const openScreen = useUiStore((s) => s.openScreen)

  const moves = species.abilities
    .map((entry) => ({ entry, ability: getAbility(entry.key) }))
    .filter((r): r is { entry: typeof r.entry; ability: NonNullable<typeof r.ability> } => r.ability != null)
    .sort((a, b) => a.entry.levelReq - b.entry.levelReq)

  return (
    <div className="mt-1 space-y-3 rounded-lg border bg-muted/30 p-3">
      <div>
        <div className="mb-1.5 text-sm font-medium">Status base</div>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['HP', species.base.hp], ['Atk Fis', species.base.atkFis], ['Atk Esp', species.base.atkEsp],
            ['Defesa', species.base.def], ['Def Esp', species.base.defEsp], ['Velocidade', species.base.speed],
          ] as const).map(([label, value]) => (
            <div key={label} className="flex flex-col rounded-md border bg-card px-2 py-1 text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-semibold">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-sm font-medium">Fraquezas e resistencias</div>
        <TypeWeaknessSection species={species} />
      </div>

      <div>
        <div className="mb-1.5 text-sm font-medium">Golpes aprendidos</div>
        <div className="overflow-hidden rounded-md border text-xs">
          <div className="grid grid-cols-[2rem_1fr_2.5rem_3rem_2.5rem_2rem] gap-1 border-b bg-muted/50 px-2 py-1 font-medium">
            <span>Nv</span><span>Golpe</span><span>Tipo</span><span>Cat.</span><span>Dano</span><span>AOE</span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {moves.map(({ entry, ability }) => {
              // Sem instancia especifica na Pokedex (visao so-de-especie) —
              // aproxima a categoria do golpe AoE dinamico de nivel 50 pelos
              // stats BASE da especie, em vez dos de uma instancia real.
              const category =
                ability.category === 'dynamic'
                  ? species.base.atkFis >= species.base.atkEsp ? 'physical' : 'special'
                  : ability.category
              return (
                <div
                  key={entry.key}
                  className="grid grid-cols-[2rem_1fr_2.5rem_3rem_2.5rem_2rem] gap-1 border-b px-2 py-1 last:border-b-0"
                >
                  <span>{entry.levelReq}</span>
                  <span className="truncate">{ability.name}</span>
                  <span><TypeChip type={ability.type} /></span>
                  <span>{category === 'physical' ? 'Fisico' : 'Especial'}</span>
                  <span>{ability.power > 0 ? ability.power : '—'}</span>
                  <span>{ability.target === 'aoe' ? '✓' : '—'}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-sm font-medium">Onde encontrar</div>
        {hunts.length === 0 ? (
          <span className="text-xs text-muted-foreground">Nenhuma hunt conhecida ainda.</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {hunts.map((map) => (
              <Button
                key={map.id}
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  focusHunt(map)
                  openScreen('hunt')
                }}
              >
                {map.name} (Lv {map.levelRange[0]}-{map.levelRange[1]})
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function PokedexMenu() {
  const pokedexKills = useGameStateStore((s) => s.pokedexKills)
  const showProfile = usePokeProfileStore((s) => s.showProfile)
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
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Pokedex</h2>

      <div className="flex gap-2">
        <Input className="flex-1" placeholder="Buscar Pokemon..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button
          size="sm"
          variant={shinyView ? 'default' : 'outline'}
          className="shrink-0 text-xs"
          onClick={() => setShinyView((v) => !v)}
        >
          ✨ {shinyView ? 'Abates Shiny' : 'Abates Totais'}
        </Button>
      </div>

      {visible.length === 0 && <p className="text-sm text-muted-foreground">Nenhum Pokemon encontrado.</p>}

      <div className="space-y-2">
        {visible.map((species) => {
          const kills = killCountFrom(pokedexKills, species.id, shinyView)
          const expanded = expandedSpeciesId === species.id

          return (
            <div key={species.id}>
              <div
                className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/40"
                onClick={() => {
                  const wasExpanded = expanded
                  setExpandedSpeciesId(wasExpanded ? null : species.id)
                  // Pedido explicito do usuario: o cartao abre automaticamente
                  // no clique que SELECIONA a especie (nao no que recolhe).
                  if (!wasExpanded) {
                    showProfile(
                      createPokeInstance(deriveRng(0, species.id), species.id, DEX_PREVIEW_LEVEL, { ivs: DEX_PREVIEW_IVS, rarity: 'comum' }),
                      species,
                    )
                  }
                }}
              >
                <PokeSwatch species={species} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    <span>#{dexNumber(species)} {species.name}</span>
                    <TypeChip type={species.type} />
                    {species.type2 && <TypeChip type={species.type2} />}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {shinyView ? '✨ Abates shiny' : 'Abates'}: {kills}
                  </div>
                </div>
              </div>
              {expanded && <SpeciesDetail species={species} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
