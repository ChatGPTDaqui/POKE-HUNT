// Port de js/ui/panels/HuntMenu.js.
import { useMemo, useState } from 'react'
// `MAPS` guarda HuntMapDef (a definicao crua). `MapDef` e a forma RESOLVIDA
// que getMap() devolve (collisionGrid ja aplicado/anulado, respawnDelay ja
// multiplicado) — so o unlockMap do engine exige essa forma, por isso a
// chamada de getMap() abaixo em vez de repassar o objeto cru.
import { MAPS, getMap } from '@/data/maps'
import type { HuntMapDef } from '@/data/huntTypes'
import { getEncounter } from '@/data/enemies'
import { SPECIES, type Species } from '@/data/pokes'
import { colorForType, TYPE_COLORS } from '@/data/typeColors'
import { faceIconUrl } from '@/data/sprites'
import type { ElementType } from '@/data/generated/types'
import { unlockMap } from '@/engine/systems/economySystem'
import { controller } from '@/engine/controller'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useUiStore } from '@/stores/uiStore'
import { useToastStore } from '@/stores/toastStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const CONTINENT_LABELS: Record<string, string> = {
  johto: 'Johto',
  kanto: 'Novo Continente (Kanto)',
  nightmare: 'Modo Pesadelo',
}
const TYPE_LIST = (Object.keys(TYPE_COLORS) as ElementType[]).sort()

// Chamado pela Pokedex antes de trocar de tela — pre-preenche a aba de
// continente + a busca pra hunt alvo ja aparecer filtrada assim que o painel
// renderiza. Escreve no uiStore porque e estado que dois paineis tocam (ver
// nota la), nao no useState local daqui.
export function focusHunt(map: HuntMapDef) {
  const ui = useUiStore.getState()
  ui.setHuntContinent(map.continent || 'johto')
  ui.setHuntSearchTerm(map.name)
  ui.setHuntType('all')
}

interface HuntOdds {
  species: { species: Species; pct: number }[]
  dominantTypes: [ElementType, number][]
}

// O peso de cada encontro vem da taxa de captura real Gen2 (ver
// sync-planilha.js#syncMapsAndEncounters + spawnEnemyAt, que spawna
// proporcionalmente a ele) — especies raras aparecem menos, e a "dominancia"
// de um tipo e a soma das odds de toda especie que o carrega.
function huntOdds(map: HuntMapDef): HuntOdds {
  const encounters = map.enemyPool.map(getEncounter).filter((e) => e != null)
  const totalWeight = encounters.reduce((sum, enc) => sum + enc.weight, 0)
  const species = encounters
    .map((enc) => ({ species: SPECIES[enc.speciesId], pct: (enc.weight / totalWeight) * 100 }))
    .filter((entry) => entry.species != null)
    .sort((a, b) => b.pct - a.pct)

  const typeTotals = new Map<ElementType, number>()
  for (const { species: sp, pct } of species) {
    for (const type of [sp.type, sp.type2].filter((t) => t != null)) {
      typeTotals.set(type, (typeTotals.get(type) || 0) + pct)
    }
  }
  const dominantTypes = [...typeTotals.entries()].sort((a, b) => b[1] - a[1])
  return { species, dominantTypes }
}

// Cor do icone da hunt: o tipo elemental que domina as odds reais de spawn
// (mesma ponderacao que huntOdds ja calcula pro tooltip). Substitui a antiga
// cor de tema (map.bg.primary, so 3 valores distintos no jogo inteiro).
function huntSwatchColor(map: HuntMapDef): string {
  const { dominantTypes } = huntOdds(map)
  return dominantTypes.length > 0 ? colorForType(dominantTypes[0][0]) : map.bg.primary
}

function TypeChip({ type }: { type: ElementType }) {
  return (
    <span className="rounded px-1 py-0.5 text-[10px] font-semibold text-white" style={{ background: colorForType(type) }}>
      {type.slice(0, 3)}
    </span>
  )
}

function SpeciesRow({ sp, pct }: { sp: Species; pct: number }) {
  const url = faceIconUrl(sp.id)
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {url ? (
        <img src={url} alt={sp.name} className="h-5 w-5 shrink-0 object-contain" />
      ) : (
        <span className="h-5 w-5 shrink-0 rounded" style={{ background: sp.color }} />
      )}
      <TypeChip type={sp.type} />
      {sp.type2 && <TypeChip type={sp.type2} />}
      <span className="truncate">{sp.name}</span>
      <span className="text-muted-foreground">— {pct.toFixed(1)}%</span>
    </div>
  )
}

// Uma hunt "bate" na busca pelo proprio nome OU por qualquer especie que
// possa aparecer nela.
function huntMatches(map: HuntMapDef, term: string): boolean {
  if (!term) return true
  if (map.name.toLowerCase().includes(term)) return true
  return map.enemyPool.some((id) => {
    const enc = getEncounter(id)
    const species = enc && SPECIES[enc.speciesId]
    return species != null && species.name.toLowerCase().includes(term)
  })
}

// Se alguma especie spawnavel nessa hunt carrega o tipo dado (primario ou
// secundario).
function huntHasType(map: HuntMapDef, type: string): boolean {
  if (type === 'all') return true
  return map.enemyPool.some((id) => {
    const enc = getEncounter(id)
    const species = enc && SPECIES[enc.speciesId]
    return species != null && (species.type === type || species.type2 === type)
  })
}

export function HuntMenu() {
  const team = useGameStateStore((s) => s.team)
  const activeIndex = useGameStateStore((s) => s.activeIndex)
  const unlockedMaps = useGameStateStore((s) => s.unlockedMaps)
  const unlockedContinents = useGameStateStore((s) => s.unlockedContinents)

  const continent = useUiStore((s) => s.huntContinent)
  const setContinent = useUiStore((s) => s.setHuntContinent)
  const search = useUiStore((s) => s.huntSearchTerm)
  const setSearch = useUiStore((s) => s.setHuntSearchTerm)
  const typeFilter = useUiStore((s) => s.huntType)
  const setTypeFilter = useUiStore((s) => s.setHuntType)

  const [expandedMapId, setExpandedMapId] = useState<string | null>(null)

  const continents = useMemo(
    () => [...new Set(Object.values(MAPS).map((m) => m.continent || 'johto'))],
    [],
  )

  const activePoke = team[activeIndex] ?? null

  const visibleMaps = useMemo(() => {
    const term = search.trim().toLowerCase()
    return Object.values(MAPS)
      .filter((m) => (m.continent || 'johto') === continent)
      .filter((m) => huntHasType(m, typeFilter))
      .filter((m) => huntMatches(m, term))
  }, [continent, typeFilter, search])

  if (team.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Hunts</h2>
        <p className="rounded-lg border bg-card p-3 text-sm">
          Volte ao Hospital e escolha seu primeiro POKE antes de sair para caçar.
        </p>
      </div>
    )
  }
  if (activePoke && activePoke.hp <= 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Hunts</h2>
        <p className="rounded-lg border bg-card p-3 text-sm">
          Seu POKE esta desmaiado! Volte ao Hospital para cura-lo antes de sair para caçar.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Selecione um mapa</h2>

      {continents.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {continents.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={c === continent ? 'default' : 'outline'}
              className="text-xs"
              onClick={() => setContinent(c)}
            >
              {CONTINENT_LABELS[c] || c}
            </Button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          className="flex-1"
          placeholder="Buscar local ou POKE..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? 'all')}>
          <SelectTrigger className="w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os elementos</SelectItem>
            {TYPE_LIST.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {visibleMaps.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma hunt encontrada (pode estar oculta pelo filtro de elemento).
        </p>
      )}

      <div className="space-y-2">
        {visibleMaps.map((map) => {
          // Gate por continente (Kanto so depois do Campeao Lance) — separado
          // do gate de custo em ouro por mapa, e checado antes dele.
          const mapContinent = map.continent || 'johto'
          const continentGated = !unlockedContinents.includes(mapContinent)
          const unlocked = !continentGated && unlockedMaps.includes(map.id)
          // `unlockCost` e number|null no dado real (ouro) — o vanilla ainda
          // tratava como {gold,diamonds}, um formato que nenhum mapa usa.
          const costLabel = map.unlockCost ? `Custo: ${map.unlockCost} ouro` : 'Gratis'
          const odds = huntOdds(map)
          const expanded = expandedMapId === map.id

          return (
            <div key={map.id}>
              <div
                className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/40"
                onClick={() => setExpandedMapId(expanded ? null : map.id)}
              >
                <span className="h-8 w-8 shrink-0 rounded-full" style={{ background: huntSwatchColor(map) }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">
                      {map.name} (Lv {map.levelRange[0]}-{map.levelRange[1]})
                    </span>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            tabIndex={0}
                            className="flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border text-[10px]"
                            onClick={(e) => e.stopPropagation()}
                          />
                        }
                      >
                        ?
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs border bg-popover px-3 py-2 text-popover-foreground">
                        <div className="mb-1 text-xs font-semibold">Pokemons na area</div>
                        <div className="max-h-48 space-y-0.5 overflow-y-auto">
                          {odds.species.map(({ species: sp, pct }) => (
                            <SpeciesRow key={sp.id} sp={sp} pct={pct} />
                          ))}
                        </div>
                        <div className="mt-1.5 mb-1 text-xs font-semibold">Tipos dominantes</div>
                        <div className="flex flex-wrap gap-1.5">
                          {odds.dominantTypes.map(([type, pct]) => (
                            <span key={type} className="flex items-center gap-1 text-xs">
                              <TypeChip type={type} /> {pct.toFixed(0)}%
                            </span>
                          ))}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  {!unlocked && (
                    <div className="text-xs text-muted-foreground">
                      {continentGated ? 'Derrote o Campeao Lance (Johto) para desbloquear' : costLabel}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  className="text-xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (unlocked) {
                      controller.enterMap(map.id)
                      useUiStore.getState().closeScreen()
                    } else if (continentGated) {
                      useToastStore.getState().pushToast(
                        `Derrote o Campeao Lance em Johto antes de acessar ${CONTINENT_LABELS[mapContinent] || mapContinent}.`,
                        'error', 'world',
                      )
                    } else {
                      const resolved = getMap(map.id)
                      if (!resolved) return
                      const result = unlockMap(useGameStateStore.getState(), resolved)
                      if (result.success) {
                        controller.enterMap(map.id)
                        useUiStore.getState().closeScreen()
                      } else {
                        useToastStore.getState().pushToast(
                          `Recursos insuficientes para desbloquear ${map.name}.`, 'error', 'world',
                        )
                      }
                    }
                  }}
                >
                  {unlocked ? 'Entrar' : continentGated ? 'Bloqueado' : 'Desbloquear'}
                </Button>
              </div>

              {expanded && (
                <div className="mt-1 rounded-lg border bg-muted/30 p-3">
                  <div className="mb-1.5 text-sm font-medium">Pokemons de {map.name}</div>
                  <div className="space-y-0.5">
                    {odds.species.map(({ species: sp, pct }) => (
                      <SpeciesRow key={sp.id} sp={sp} pct={pct} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
