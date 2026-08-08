// Hunts: abas de continente, busca, filtro de elemento, e um card por local.
//
// O tooltip `?` que duplicava a lista de especies foi removido (item 7 da
// auditoria): a MESMA lista aparecia em duas superficies, e a versao expandida
// no card e a que da pra ler com calma e rolar.
import { useMemo, useState } from 'react'
import { pedirAcao } from '@/data/remote/autoridade'
// `MAPS` guarda HuntMapDef (a definicao crua). `MapDef` e a forma RESOLVIDA que
// getMap() devolve (collisionGrid ja aplicado/anulado, respawnDelay ja
// multiplicado) — so o unlockMap do engine exige essa forma, por isso a chamada
// de getMap() abaixo em vez de repassar o objeto cru.
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
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { TypeChip } from '@/components/shared/TypeChip'
import { GameButton, GameCard, GameInput, GameSelect, SegmentedTabs } from '@/components/game/controls'

const CONTINENT_LABELS: Record<string, string> = {
  johto: 'Johto',
  kanto: 'Novo Continente (Kanto)',
  nightmare: 'Modo Pesadelo',
}
const TYPE_LIST = (Object.keys(TYPE_COLORS) as ElementType[]).sort()
const fmt = new Intl.NumberFormat('pt-BR')

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

export interface HuntOdds {
  species: { id: string; species: Species; pct: number }[]
  dominantTypes: [ElementType, number][]
}

// O peso de cada encontro vem do TIER de spawn da especie, derivado da chance
// real de encontro selvagem do Gen1/Gen2 (ver scripts/derive-spawn-tiers.js e a
// migration `spawn_tier_por_especie`; `spawnEnemyAt` spawna proporcionalmente a
// ele). Antes era `species.catchRate` — taxa de CAPTURA, que nao tem relacao com
// frequencia de APARICAO. A "dominancia" de um tipo e a soma das odds de toda
// especie que o carrega.
export function huntOdds(map: HuntMapDef): HuntOdds {
  const encounters = map.enemyPool.map(getEncounter).filter((e) => e != null)
  const totalWeight = encounters.reduce((sum, enc) => sum + enc.weight, 0)
  // A chave e o id do ENCONTRO, nao o da especie: a hunt do Campeao Lance tem
  // tres Dragonites (composicao real dele), e keyar por especie fazia o React
  // reclamar de chave duplicada e arriscar omitir linhas da lista.
  const species = encounters
    .map((enc) => ({ id: enc.id, species: SPECIES[enc.speciesId], pct: (enc.weight / totalWeight) * 100 }))
    .filter((entry) => entry.species != null)
    .sort((a, b) => b.pct - a.pct)

  const typeTotals = new Map<ElementType, number>()
  for (const { species: sp, pct } of species) {
    for (const type of [sp.type, sp.type2].filter((t) => t != null)) {
      typeTotals.set(type, (typeTotals.get(type) || 0) + pct)
    }
  }
  return { species, dominantTypes: [...typeTotals.entries()].sort((a, b) => b[1] - a[1]) }
}

// Cor do circulo do card: o tipo elemental que domina as odds reais de spawn.
// Substitui a antiga cor de tema (map.bg.primary, so 3 valores distintos no
// jogo inteiro).
function huntSwatchColor(map: HuntMapDef): string {
  const { dominantTypes } = huntOdds(map)
  return dominantTypes.length > 0 ? colorForType(dominantTypes[0][0]) : map.bg.primary
}

function SpeciesRow({ sp, pct }: { sp: Species; pct: number }) {
  const url = faceIconUrl(sp.id)
  return (
    <div className="flex items-center gap-[.5em] text-[.85em]">
      {url ? (
        <img src={url} alt="" className="h-[1.6em] w-[1.6em] shrink-0 object-contain" />
      ) : (
        <span className="h-[1.6em] w-[1.6em] shrink-0 rounded-[.3em]" style={{ background: sp.color }} />
      )}
      <TypeChip type={sp.type} />
      {sp.type2 && <TypeChip type={sp.type2} />}
      <span className="flex-1 truncate">{sp.name}</span>
      <span className="tabular-nums text-n400">{pct.toFixed(1)}%</span>
    </div>
  )
}

// Uma hunt "bate" na busca pelo proprio nome OU por qualquer especie que possa
// aparecer nela.
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
  const acao = useAcaoPendente()

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
      <GameCard className="p-[.8em]">
        Volte ao Hospital e escolha seu primeiro POKE antes de sair para caçar.
      </GameCard>
    )
  }
  if (activePoke && activePoke.hp <= 0) {
    return (
      <GameCard className="p-[.8em]">
        Seu POKE esta desmaiado! Volte ao Hospital para cura-lo antes de sair para caçar.
      </GameCard>
    )
  }

  return (
    <div className="flex flex-col gap-[.7em]">
      {continents.length > 1 && (
        <SegmentedTabs
          value={continent}
          onChange={setContinent}
          options={continents.map((c) => ({ value: c, label: CONTINENT_LABELS[c] || c }))}
        />
      )}

      <div className="flex flex-wrap gap-[.5em]">
        <GameInput
          className="min-w-[10em] flex-1"
          placeholder="Buscar local ou POKE..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <GameSelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value || 'all')}>
          <option value="all">Todos os elementos</option>
          {TYPE_LIST.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </GameSelect>
      </div>

      {visibleMaps.length === 0 && (
        <p className="text-n500">Nenhuma hunt encontrada (pode estar oculta pelo filtro de elemento).</p>
      )}

      {visibleMaps.map((map) => {
        // Gate por continente (Kanto so depois do Campeao Lance) — separado do
        // gate de custo em ouro por mapa, e checado antes dele.
        const mapContinent = map.continent || 'johto'
        const continentGated = !unlockedContinents.includes(mapContinent)
        // Mesma regra do servidor (server/src/app.ts#abrirSessao): hunt sem
        // custo nasce liberada. Checar so a lista trancava visualmente as hunts
        // do Modo Pesadelo e as BOSS, que sao geradas em runtime e nunca entram
        // na coluna `unlocked_maps` do banco.
        const unlocked = !continentGated && (map.unlockCost == null || unlockedMaps.includes(map.id))
        const odds = huntOdds(map)
        const expanded = expandedMapId === map.id
        const key = `map:${map.id}`
        const pending = acao.isPending(key)

        async function acionar() {
          if (unlocked) {
            // A tela so fecha se o jogador REALMENTE entrou. Fechar antes
            // esconderia a recusa do servidor e deixaria o jogador olhando um
            // combate que nao rende nada.
            if (await controller.enterMap(map.id)) useUiStore.getState().closeScreen()
            return
          }
          if (continentGated) {
            useToastStore.getState().pushToast(
              `Derrote o Campeao Lance em Johto antes de acessar ${CONTINENT_LABELS[mapContinent] || mapContinent}.`,
              'error', 'world',
            )
            return
          }
          const resolved = getMap(map.id)
          if (!resolved) return
          const desbloqueou = await pedirAcao(
            { tipo: 'desbloquearHunt', mapId: map.id },
            () => unlockMap(useGameStateStore.getState(), resolved).success,
          )
          if (!desbloqueou) {
            useToastStore.getState().pushToast(
              `Recursos insuficientes para desbloquear ${map.name}.`, 'error', 'world',
            )
            return
          }
          if (await controller.enterMap(map.id)) useUiStore.getState().closeScreen()
        }

        return (
          <div key={map.id} className="overflow-hidden rounded-[.7em] border border-n800 bg-n900">
            <div
              onClick={() => setExpandedMapId(expanded ? null : map.id)}
              className="flex cursor-pointer items-center gap-[.7em] p-[.7em] hover:bg-n800"
            >
              <span
                className="h-[2.2em] w-[2.2em] shrink-0 rounded-full"
                style={{
                  background: huntSwatchColor(map),
                  boxShadow: `0 0 10px ${huntSwatchColor(map)}66`,
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {map.name}{' '}
                  <span className="font-normal text-n400">(Lv {map.levelRange[0]}-{map.levelRange[1]})</span>
                </div>
                {/* A linha de custo/gate so aparece quando ha bloqueio: com a
                    hunt liberada, "Desbloqueado" seria ruido — o proprio botao
                    "Entrar" ja diz isso. */}
                {!unlocked && (
                  <div className="mt-[.15em] text-[.75em] text-warn">
                    {continentGated
                      ? 'Derrote o Campeao Lance (Johto) para desbloquear'
                      : `Custo: ${fmt.format(map.unlockCost ?? 0)} ouro`}
                  </div>
                )}
              </div>
              <GameButton
                variant={unlocked ? 'primary' : 'ghost'}
                disabled={pending || acao.pendingKey != null}
                onClick={(e) => {
                  e.stopPropagation()
                  void acao.run(key, acionar)
                }}
              >
                {pending ? 'Entrando...' : unlocked ? 'Entrar' : continentGated ? 'Bloqueado' : 'Desbloquear'}
              </GameButton>
            </div>

            {expanded && (
              <div className="flex flex-col gap-[.4em] border-t border-n800 p-[.7em]">
                <div className="text-[.75em] text-n500">Pokemons de {map.name}</div>
                {odds.species.map(({ id, species: sp, pct }) => (
                  <SpeciesRow key={id} sp={sp} pct={pct} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
