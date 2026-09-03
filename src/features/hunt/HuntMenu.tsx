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
import {
  GRUPOS_INICIAIS, SUB_BIOMA_POR_CHAVE, grupoLiberado,
  type SubBiomaDef,
} from '@/data/biomas'
import { parseEstagioId, quantidadeDeSalas } from '@/data/estagios'
import { bloqueioDoEstagio, bloqueioDoLance, type ProgressoPorBioma } from '@/data/progressoDeBioma'
import { LANCE_MAP_ID } from '@/data/nightmareMaps'
import { MapaDeBiomas, TrilhaDoBioma } from './TrilhaDeEstagios'
import { POOL_POR_SALA, STARTER_HUNT_ID } from '@/data/huntSpawnOverrides'
import { contextoDeSpawn } from '@/engine/systems/salaSystem'
import type { HuntMapDef } from '@/data/huntTypes'
import { getEncounter } from '@/data/enemies'
import { SPECIES, type Species } from '@/data/pokes'
import { colorForType, TYPE_COLORS } from '@/data/typeColors'
import { bestOffensiveMultiplier } from '@/data/typeMatchups'
import { faceIconUrl } from '@/data/sprites'
import type { ElementType } from '@/data/generated/types'
import { unlockMap } from '@/engine/systems/economySystem'
import { controller } from '@/engine/controller'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorldStore } from '@/stores/worldStore'
import { useToastStore } from '@/stores/toastStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { TypeChip } from '@/components/shared/TypeChip'
import { GameButton, GameCard, GameInput, GameSelect, SectionLabel, SegmentedTabs, StickyHeader } from '@/components/game/controls'
import { cn } from '@/lib/utils'
// As abas do menu de hunts. `continent` deixou de ser regiao e virou o grupo de
// gate; com a PH-432 sobraram DOIS (ver data/biomas.ts): o que nasce aberto e o
// Modo Pesadelo, que sai do Campeao Lance.
const CONTINENT_LABELS: Record<string, string> = {
  biomas: "Mundo",
  nightmare: "Modo Pesadelo",
}
const TYPE_LIST = (Object.keys(TYPE_COLORS) as ElementType[]).sort()
const fmt = new Intl.NumberFormat('pt-BR')

/**
 * Mensagem de bloqueio do gate de estagio (PH-430).
 *
 * ELA ENCOLHEU PORQUE A REGRA ENCOLHEU. Ate a PH-429 esta funcao espelhava a
 * do servidor a mao — cada lado montava o indice na ordem dos biomas, olhava a
 * faixa certa do progresso e escrevia a MESMA string, com um comentario em
 * cada arquivo pedindo que ninguem os deixasse divergir. Agora as duas pontas
 * chamam `bloqueioDoEstagio` (data/progressoDeBioma.ts), que e um modulo puro
 * e importavel dos dois lados: a regra e o texto passaram a ter uma fonte so.
 */
function bloqueioDeBiomaClient(mapId: string, progresso: ProgressoPorBioma): string | null {
  // PH-432: o Campeao Lance tem gate proprio — progresso 5 nos 12 biomas.
  if (mapId === LANCE_MAP_ID) return bloqueioDoLance(progresso)
  const doMapa = parseEstagioId(mapId)
  // Hunt sem estagio (inicial, BOSS, Lance, Pesadelo) nao passa por este gate.
  if (!doMapa) return null
  return bloqueioDoEstagio(progresso, doMapa.bioma, doMapa.estagio)
}

async function acionarHunt(
  map: HuntMapDef, unlocked: boolean, continentGated: boolean, bloqueioDeBioma: string | null,
) {
  if (unlocked) {
    // A tela so fecha se o jogador REALMENTE entrou. Fechar antes
    // esconderia a recusa do servidor e deixaria o jogador olhando um
    // combate que nao rende nada.
    if (await controller.enterMap(map.id)) useUiStore.getState().closeScreen()
    return
  }
  if (continentGated) {
    const mapContinent = map.continent || GRUPOS_INICIAIS[0]
    useToastStore.getState().pushToast(
      `Derrote o Campeão Lance antes de acessar ${CONTINENT_LABELS[mapContinent] || mapContinent}.`,
      'error', 'world',
    )
    return
  }
  // PH-229: mesma ordem de prioridade do servidor (PH-227) — continente
  // primeiro, bioma depois, custo em ouro por ultimo. Sem isto o clique
  // tentava comprar o desbloqueio (unlockMap) num bioma so travado por
  // progresso, gastando ouro numa acao que o servidor ia recusar de
  // qualquer jeito.
  if (bloqueioDeBioma) {
    useToastStore.getState().pushToast(bloqueioDeBioma, 'error', 'world')
    return
  }
  const resolved = getMap(map.id)
  if (!resolved) {
    // Nao deveria acontecer (a lista sai de MAPS), mas era o terceiro `return`
    // mudo deste caminho — e um botao que nao faz nada e sempre lido como
    // clique perdido, nunca como erro.
    useToastStore.getState().pushToast(`Hunt "${map.id}" não existe mais.`, 'error', 'world')
    return
  }
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

// Chamado pela Pokedex antes de trocar de tela — pre-preenche a aba de
// continente + a busca pra hunt alvo ja aparecer filtrada assim que o painel
// renderiza. Escreve no uiStore porque e estado que dois paineis tocam (ver
// nota la), nao no useState local daqui.
export function focusHunt(map: HuntMapDef) {
  const ui = useUiStore.getState()
  ui.setHuntContinent(map.continent ?? GRUPOS_INICIAIS[0])
  ui.setHuntSearchTerm(map.name)
  ui.setHuntType('all')
}

export interface HuntOdds {
  species: { id: string; species: Species; pct: number }[]
  dominantTypes: [ElementType, number][]
}

/** As salas desta hunt, com o pool de cada uma. Vazio se a hunt nao tem salas. */
function salasDaHunt(mapId: string): { sub: SubBiomaDef; pool: string[] }[] {
  const porSala = POOL_POR_SALA[mapId]
  if (!porSala) return []
  return Object.entries(porSala)
    .map(([chave, pool]) => ({ sub: SUB_BIOMA_POR_CHAVE[chave]?.sub, pool }))
    .filter((x): x is { sub: SubBiomaDef; pool: string[] } => x.sub != null && x.pool.length > 0)
}

/**
 * Chance de cada encontro na hunt.
 *
 * A "dominancia" de um tipo e a soma das odds de toda especie que o carrega.
 *
 * COM SALAS, A CHANCE E UMA MEDIA SOBRE AS SALAS DO ESTAGIO, e a conta passa
 * pelo MESMO `contextoDeSpawn` que o motor usa pra sortear:
 *
 *   P(especie) = (1/SALAS) x SOMA_indice SOMA_sub  P(sub) x peso(sub, indice)
 *
 * Cada indice de sala pesa igual porque o ciclo passa uma vez por cada um; o
 * sub-bioma pesa pelo `peso` dele em data/biomas.ts.
 *
 * O INDICE ENTRA NA CONTA, E ELE NAO ENTRAVA. A versao anterior somava
 * `P(sala) x peso do encontro / soma do pool` uma vez por sub-bioma, e isso
 * errava por dois motivos que so pioraram com a chance vindo do tier:
 *
 *   1. Ignorava a JANELA DE NIVEL. A hunt afunda conforme as salas sao limpas
 *      (salaSystem#janelaDaSala), entao metade do pool de um sub-bioma nem
 *      existe na sala 1 — e o cartao contava esse pedaco como se existisse.
 *   2. Lia `encounter.weight`, que desde a chance-por-tier e o peso do
 *      FALLBACK (hunt inicial, BOSS, Lance) e nao o peso que vale dentro de uma
 *      sala. O cartao anunciaria uma distribuicao que o jogo nao produz.
 *
 * Hunt sem salas (inicial, BOSS, Lance) cai na conta simples de sempre, que la
 * e a certa: sem sala, `encounter.weight` E o peso do sorteio.
 */
export function huntOdds(map: HuntMapDef): HuntOdds {
  const encounters = map.enemyPool.map(getEncounter).filter((e) => e != null)
  const pesoPorEncontro = new Map<string, number>()

  const salas = salasDaHunt(map.id)
  if (salas.length > 0) {
    // PH-427: quantas salas o estagio tem, e nao 10 fixas. Alem de errar a
    // media, a constante antiga avaliava indices de sala que NAO EXISTEM (0 a 9
    // num estagio de 3 salas): `janelaDaSala` devolvia janelas de nivel fora do
    // caminho do jogador, entao o cartao anunciava especie que aquele estagio
    // nunca sorteia. A soma continuava dando 100%, o que esconde o erro.
    const totalDeSalas = quantidadeDeSalas(map.id)
    const somaPesoDeSala = salas.reduce((s, x) => s + x.sub.peso, 0)
    for (const { sub } of salas) {
      const pSala = sub.peso / somaPesoDeSala / totalDeSalas
      for (let indice = 0; indice < totalDeSalas; indice++) {
        const ctx = contextoDeSpawn(
          map.id, map.levelRange, { chave: sub.chave, indice, abates: 0, ciclos: 0 }, map.enemyPool,
        )
        const soma = ctx.pool.reduce((s, id) => s + ctx.peso(id), 0)
        if (!(soma > 0)) continue
        for (const id of ctx.pool) {
          pesoPorEncontro.set(id, (pesoPorEncontro.get(id) ?? 0) + pSala * (ctx.peso(id) / soma))
        }
      }
    }
  } else {
    const total = encounters.reduce((sum, enc) => sum + enc.weight, 0)
    for (const enc of encounters) pesoPorEncontro.set(enc.id, total > 0 ? enc.weight / total : 0)
  }

  // A chave e o id do ENCONTRO, nao o da especie: a hunt do Campeao Lance tem
  // tres Dragonites (composicao real dele), e keyar por especie fazia o React
  // reclamar de chave duplicada e arriscar omitir linhas da lista.
  const species = encounters
    .map((enc) => ({ id: enc.id, species: SPECIES[enc.speciesId], pct: (pesoPorEncontro.get(enc.id) ?? 0) * 100 }))
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

// As salas da hunt e a chance de cada uma cair. O jogador precisa disso pra
// saber se vale entrar caçando um sub-bioma especifico — e a chance de sala e
// o unico numero do sistema que ele nao consegue deduzir de nada na tela.
function SalasDaHunt({ mapId }: { mapId: string }) {
  const salas = salasDaHunt(mapId)
  if (salas.length === 0) return null
  const total = salas.reduce((s, x) => s + x.sub.peso, 0)

  return (
    <div className="flex flex-col gap-[.25em] rounded-[.5em] bg-n800/50 p-[.45em]">
      <div className="text-[.75em] text-n500">
        {quantidadeDeSalas(mapId)} salas · cada uma sorteia um sub-bioma
      </div>
      <div className="flex flex-wrap gap-[.35em]">
        {salas
          .slice()
          .sort((a, b) => b.sub.peso - a.sub.peso)
          .map(({ sub, pool }) => (
            <span
              key={sub.chave}
              className="rounded-[.35em] border border-n700 px-[.45em] py-[.2em] text-[.72em]"
              title={`${pool.length} espécies · loot ${sub.loot}`}
            >
              {sub.nome}{' '}
              <b className="tabular-nums font-medium text-n300">{((sub.peso / total) * 100).toFixed(0)}%</b>
            </span>
          ))}
      </div>
    </div>
  )
}

// Cor/rotulo do multiplicador ofensivo, mesma paleta de
// `TypeWeaknessSection` (vantagem verde, fraqueza laranja/vermelha, imune
// cinza) — nao inventa cor nova pro mesmo conceito.
function badgeEfetividade(mult: number): { rotulo: string; cor: string } | null {
  if (mult === 1) return null // neutro: nao informa nada, so ruido na lista
  if (mult === 0) return { rotulo: 'imune', cor: 'var(--color-n500)' }
  if (mult >= 4) return { rotulo: '4x', cor: '#4ade80' }
  if (mult >= 2) return { rotulo: '2x', cor: '#4ade80' }
  if (mult <= 0.25) return { rotulo: '¼x', cor: 'var(--color-warn)' }
  return { rotulo: '½x', cor: 'var(--color-warn)' }
}

function SpeciesRow({ sp, pct, activeSpecies }: { sp: Species; pct: number; activeSpecies: Species | null }) {
  const url = faceIconUrl(sp.id)
  const badge = activeSpecies ? badgeEfetividade(bestOffensiveMultiplier(activeSpecies, sp)) : null
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
      {badge && (
        <span
          className="tabular-nums text-[.9em] font-semibold"
          style={{ color: badge.cor }}
          title={`Seu POKE ativo (${activeSpecies!.name}) contra ${sp.name}`}
        >
          {badge.rotulo}
        </span>
      )}
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
  const biomaProgress = useGameStateStore((s) => s.biomaProgress)

  const continent = useUiStore((s) => s.huntContinent)
  const setContinent = useUiStore((s) => s.setHuntContinent)
  const search = useUiStore((s) => s.huntSearchTerm)
  const setSearch = useUiStore((s) => s.setHuntSearchTerm)
  const typeFilter = useUiStore((s) => s.huntType)
  const setTypeFilter = useUiStore((s) => s.setHuntType)

  const [expandedMapId, setExpandedMapId] = useState<string | null>(null)
  // Qual bioma o jogador abriu — `null` e o nivel 1 (os 12 cartoes). Estado
  // LOCAL: ele nao precisa sobreviver a troca de tela, e o `focusHunt` da
  // Pokedex, que e o unico caminho externo pra ca, aponta pra hunt especial ou
  // pro bioma pelo uiStore.
  const [biomaAberto, setBiomaAberto] = useState<string | null>(null)
  const acao = useAcaoPendente()

  // PH-244: qual hunt esta rodando AGORA.
  //
  // Vem do `worldStore` (efemero) e nao de `gameState.currentMapId`: aquele e
  // estado persistido que o servidor zera no fim do flush quando a sessao para
  // cedo (ver progresso.ts), entao ele pode dizer "nenhuma" com o jogador
  // parado dentro da hunt. `mapDef` e o que o canvas esta desenhando — se ha
  // mapa, o jogador esta la.
  const mapaAtivoId = useWorldStore((s) => s.mapDef?.id ?? null)
  const mapaAtivo = mapaAtivoId ? MAPS[mapaAtivoId] : null

  const continents = useMemo(
    () => [...new Set(Object.values(MAPS).map((m) => m.continent ?? GRUPOS_INICIAIS[0]))],
    [],
  )

  const activePoke = team[activeIndex] ?? null
  const activeSpecies = activePoke ? (SPECIES[activePoke.speciesId] ?? null) : null

  // A LISTA DE CARDS SO MOSTRA O QUE NAO E ESTAGIO DE BIOMA (PH-431).
  //
  // As 120 hunts de bioma sairam daqui e viraram a navegacao de dois niveis
  // (`MapaDeBiomas` -> `TrilhaDoBioma`). O que sobra na lista e o que nao tem
  // trilha: a hunt inicial, as 11 BOSS, o Campeao Lance e o espelho do Modo
  // Pesadelo. Sao poucas, curadas a mao e sem progressao entre si — cartao e a
  // forma certa pra elas, e continuar listando as 120 junto seria devolver a
  // tela de 121 linhas que esta issue existe pra desfazer.
  const visibleMaps = useMemo(() => {
    const term = search.trim().toLowerCase()
    return Object.values(MAPS)
      .filter((m) => parseEstagioId(m.id) == null)
      .filter((m) => (m.continent ?? GRUPOS_INICIAIS[0]) === continent)
      .filter((m) => huntHasType(m, typeFilter))
      .filter((m) => huntMatches(m, term))
      .sort((a, b) => a.levelRange[0] - b.levelRange[0] || a.name.localeCompare(b.name))
  }, [continent, typeFilter, search])

  /**
   * A Rota 46 inicial, separada do resto da lista (PH-448).
   *
   * Ela e renderizada ACIMA dos 12 biomas, e as outras hunts de cartao (as 11
   * BOSS, o Campeao Lance, o espelho do Pesadelo) continuam embaixo. O motivo
   * e a ordem de leitura de quem acabou de escolher o inicial: a Rota 46 e a
   * PRIMEIRA cacada do jogo, Lv 1 a 2, e estava no mesmo balde do conteudo de
   * fim de jogo — abaixo dos 12 biomas, exigindo rolar a tela inteira.
   *
   * SAI DE `visibleMaps`, E NAO DE `MAPS`: assim ela obedece a aba de
   * continente, a busca e o filtro de elemento como qualquer outro card. Um
   * card fixo no topo que ignora o filtro ativo e um card que o jogador nao
   * entende por que continua ali depois de filtrar.
   *
   * `?? null` e nao `undefined`: o JSX abaixo testa a variavel direto, e
   * `undefined` renderizaria igual — mas `null` diz "procurei e nao esta na
   * lista filtrada", que e a unica razao pela qual ela pode faltar.
   */
  const huntInicial = useMemo(
    () => visibleMaps.find((m) => m.id === STARTER_HUNT_ID) ?? null,
    [visibleMaps],
  )
  const huntsEspeciais = useMemo(
    () => visibleMaps.filter((m) => m.id !== STARTER_HUNT_ID),
    [visibleMaps],
  )

  if (team.length === 0) {
    return (
      <GameCard className="p-[.6em]">
        Volte ao Hospital e escolha seu primeiro POKE antes de sair para caçar.
      </GameCard>
    )
  }
  if (activePoke && activePoke.hp <= 0) {
    return (
      <GameCard className="p-[.6em]">
        Seu POKE esta desmaiado! Volte ao Hospital para cura-lo antes de sair para caçar.
      </GameCard>
    )
  }

  // NIVEL 2: o jogador escolheu um bioma e esta na trilha dele. A tela inteira
  // troca — sem abas de faixa, sem busca, sem filtro de elemento: dentro de um
  // bioma sao dez estagios em ordem, e filtrar dez itens nao ajuda ninguem.
  if (biomaAberto) {
    return (
      <div className="flex flex-col gap-[.5em]">
        <TrilhaDoBioma
          biomaChave={biomaAberto}
          progresso={biomaProgress}
          mapaAtivoId={mapaAtivoId}
          abertoId={expandedMapId}
          entrandoId={acao.pendingKey?.startsWith('map:') ? acao.pendingKey.slice(4) : null}
          onAbrir={setExpandedMapId}
          onEntrar={(mapId) => {
            const map = MAPS[mapId]
            if (!map) return
            const mapContinent = map.continent ?? GRUPOS_INICIAIS[0]
            // PH-447: `grupoLiberado`, e nao `includes` na mao — era esta linha
            // que fazia o estagio 1 de todo bioma pedir o Campeao Lance.
            const continentGated = !grupoLiberado(mapContinent, unlockedContinents)
            const bloqueio = continentGated ? null : bloqueioDeBiomaClient(mapId, biomaProgress)
            const liberado = !continentGated && !bloqueio
              && (map.unlockCost == null || unlockedMaps.includes(mapId))
            if (mapId === mapaAtivoId) {
              useUiStore.getState().closeScreen()
              return
            }
            void acao.run(`map:${mapId}`, () => acionarHunt(map, liberado, continentGated, bloqueio))
          }}
          onVoltar={() => { setBiomaAberto(null); setExpandedMapId(null) }}
        />
      </div>
    )
  }

  // PH-448: O CORPO DO CARD SAIU DO `.map()` E VIROU FUNCAO, e a razao e a
  // ordem da tela, nao estetica. A Rota 46 inicial passou a ser renderizada
  // ACIMA dos 12 biomas, e o resto das hunts de cartao continua embaixo — sao
  // duas posicoes com o MESMO card. Duplicar ~135 linhas de marcacao pra isso
  // seria garantir que as duas versoes divergem na primeira mudanca.
  //
  // Funcao no corpo do componente, e nao componente proprio: ela fecha sobre
  // dez pecas de estado (`acao`, `expandedMapId`, `mapaAtivoId`,
  // `unlockedContinents`, `biomaProgress`, `activeSpecies`, ...) que um
  // componente extraido teria que receber como prop uma por uma. Nao e hook,
  // entao nao ha ordem de hook pra respeitar.
  const cardDeHunt = (map: HuntMapDef) => {
    // Gate por continente (hoje: so o Modo Pesadelo, premio do Campeao
    // Lance) — separado do gate de custo em ouro por mapa, e checado antes
    // dele.
    //
    // PH-447: por `grupoLiberado`, e nao por `includes` na mao. O grupo que
    // nasce aberto e liberado por definicao; perguntar se a coluna do banco
    // o contem foi o que trancou o jogo inteiro quando a PH-434 renomeou o
    // grupo e nenhuma migration reescreveu a coluna.
    const mapContinent = map.continent ?? GRUPOS_INICIAIS[0]
    const continentGated = !grupoLiberado(mapContinent, unlockedContinents)
    // PH-229: gate de bioma (PH-207/226/227) — checado DEPOIS do
    // continente e ANTES do custo em ouro, mesma prioridade do servidor.
    const bloqueioDeBioma = continentGated ? null : bloqueioDeBiomaClient(map.id, biomaProgress)
    const temProtetor = parseEstagioId(map.id) != null
    // Mesma regra do servidor (server/src/app.ts#abrirSessao): hunt sem
    // custo nasce liberada. Checar so a lista trancava visualmente as hunts
    // do Modo Pesadelo e as BOSS, que sao geradas em runtime e nunca entram
    // na coluna `unlocked_maps` do banco.
    const unlocked = !continentGated && !bloqueioDeBioma
      && (map.unlockCost == null || unlockedMaps.includes(map.id))
    const odds = huntOdds(map)
    const expanded = expandedMapId === map.id
    const key = `map:${map.id}`
    const pending = acao.isPending(key)

    // PH-244: esta e a hunt em que o jogador esta agora.
    const ehAtiva = map.id === mapaAtivoId

    return (
      <div
        key={map.id}
        className={cn(
          'overflow-hidden rounded-[.7em] border bg-n900',
          // Borda, e nao so o selo: a borda le de relance na lista rolando,
          // e o selo responde "por que este esta diferente" quando o olho
          // para nele. Um canal sozinho obriga a ler cada card.
          ehAtiva ? 'border-ok' : 'border-n800',
        )}
      >
        <div
          onClick={() => setExpandedMapId(expanded ? null : map.id)}
          className="flex cursor-pointer items-center gap-[.5em] px-[.5em] py-[.4em] hover:bg-n800"
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
              {/* PH-229/236: selo de protetor — motor exige Guardian/Lord
                  em toda sala de todo bioma (PH-225), entao vale pra
                  qualquer hunt que pertenca a ORDEM_DOS_BIOMAS. Selo
                  generico ("PROTETOR", nao "GUARDIAN"/"LORD"): este card
                  e da tela de SELEÇÃO de hunt, uma hunt inteira tem os
                  DOIS tipos (Guardian nas salas 1-9, Lord na 10) — nao
                  ha um "tipo" unico pra condicionar aqui, so a tag
                  dentro da hunt ativa (drawNameLevelTag, sprites.ts)
                  sabe qual protetor esta na tela agora. */}
              {temProtetor && (
                <span className="ml-[.4em] rounded-[.3em] bg-[#ff4d4d33] px-[.35em] py-[.05em] align-middle text-[.65em] font-bold text-[#ff4d4d]">
                  ★ PROTETOR
                </span>
              )}
              {/* PH-244: o segundo canal da hunt ativa. Depois do selo de
                  boss porque os dois podem coexistir, e "onde eu estou" e
                  a informacao mais recente das duas. */}
              {ehAtiva && (
                <span className="ml-[.4em] rounded-[.3em] bg-ok/20 px-[.35em] py-[.05em] align-middle text-[.65em] font-bold text-ok">
                  EM CAÇADA
                </span>
              )}
            </div>
            {/* A linha de custo/gate so aparece quando ha bloqueio: com a
                hunt liberada, "Desbloqueado" seria ruido — o proprio botao
                "Entrar" ja diz isso. */}
            {!unlocked && (
              <div className="mt-[.15em] text-[.75em] text-warn">
                {continentGated
                  ? 'Derrote o Campeão Lance para desbloquear'
                  : bloqueioDeBioma
                    ? bloqueioDeBioma
                    : `Custo: ${fmt.format(map.unlockCost ?? 0)} ouro`}
              </div>
            )}
          </div>
          {/* PH-244: na hunt ATIVA o botao volta pro campo em vez de
              "entrar" de novo.
              Nao e so o rotulo: `controller.enterMap` no MESMO mapa abre uma
              sessao nova no servidor, remonta o mundo e chama `resetStats`
              — ou seja, zera o painel de taxa de farm sem o jogador ter
              pedido nada. Um botao "Entrar" ao lado de um selo "EM CAÇADA"
              e uma contradicao que convida exatamente a esse clique. */}
          {ehAtiva ? (
            <GameButton variant="primary" onClick={(e) => {
              e.stopPropagation()
              useUiStore.getState().closeScreen()
            }}>
              Voltar ao campo
            </GameButton>
          ) : (
            <GameButton
              variant={unlocked ? 'primary' : 'ghost'}
              disabled={pending || acao.pendingKey != null}
              onClick={(e) => {
                e.stopPropagation()
                void acao.run(key, () => acionarHunt(map, unlocked, continentGated, bloqueioDeBioma))
              }}
            >
              {pending ? 'Entrando...' : unlocked ? 'Entrar' : continentGated || bloqueioDeBioma ? 'Bloqueado' : 'Desbloquear'}
            </GameButton>
          )}
        </div>

        {expanded && (
          <div className="flex flex-col gap-[.4em] border-t border-n800 p-[.55em]">
            <SalasDaHunt mapId={map.id} />
            <div className="text-[.75em] text-n500">
              Pokemons de {map.name}
              {/* A % ja e a real: P(sala) x P(especie | sala). Sem dizer
                  isso, o jogador soma as porcentagens do card com as da
                  sala em que esta e nao fecham. */}
              <span className="text-n600"> — chance considerando o sorteio de sala</span>
            </div>
            {odds.species.map(({ id, species: sp, pct }) => (
              <SpeciesRow key={id} sp={sp} pct={pct} activeSpecies={activeSpecies} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // NIVEL 1: os 12 biomas, mais a lista curta do que nao tem trilha.
  return (
    <div className="flex flex-col gap-[.5em]">
      <StickyHeader>
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

        {/* PH-244: a hunt em andamento, no cabecalho FIXO.
            O selo no card sozinho nao resolve: o card so aparece se a aba de
            faixa, a busca e o filtro de elemento deixarem — e o jogador chega
            aqui justamente pra procurar OUTRA hunt, com os filtros mexidos. A
            linha aqui responde "onde eu estou" sem depender de nada disso.
            O botao leva ate o card (mesmo `focusHunt` que a Pokedex usa), senao
            o aviso diz onde voce esta e nao ajuda a chegar la. */}
        {mapaAtivo && (
          <div className="flex flex-wrap items-center gap-[.4em] text-[.8em]">
            <span className="rounded-[.3em] bg-ok/20 px-[.35em] py-[.05em] text-[.85em] font-bold text-ok">
              EM CAÇADA
            </span>
            <span className="min-w-0 truncate text-n300">{mapaAtivo.name}</span>
            <GameButton variant="ghost" onClick={() => focusHunt(mapaAtivo)}>
              Ver na lista
            </GameButton>
          </div>
        )}
      </StickyHeader>

      {/* PH-448: A ROTA 46 VEM ANTES DOS BIOMAS.
          Ela e a PRIMEIRA cacada do jogo (Lv 1 a 2, so tipo Normal) e estava
          no mesmo balde das hunts de fim de jogo, embaixo dos 12 biomas:
          quem acabava de escolher o inicial tinha que rolar a tela inteira
          pra achar a unica hunt feita pra ele.

          Ela continua sujeita a busca e ao filtro de elemento — sai de
          `visibleMaps`, e nao de `MAPS` — porque um card que ignora o filtro
          ativo e um card que o jogador nao entende por que esta ali. */}
      {huntInicial && cardDeHunt(huntInicial)}

      {/* Os 12 biomas — o nivel 1 da navegacao. Vem ANTES da lista de cartao
          porque e onde o jogador vai 99% das vezes: o que sobra na lista sao
          as hunts de fim de jogo. */}
      <SectionLabel>Biomas</SectionLabel>
      <MapaDeBiomas progresso={biomaProgress} onEscolher={setBiomaAberto} />

      {huntsEspeciais.length > 0 && <SectionLabel>Hunts especiais</SectionLabel>}
      {huntsEspeciais.length === 0 && !huntInicial && (
        <p className="text-[.8em] text-n600">
          Nenhuma hunt especial nesta aba (as hunts de bioma estão acima, na trilha de cada um).
        </p>
      )}

      {huntsEspeciais.map(cardDeHunt)}
    </div>
  )
}
