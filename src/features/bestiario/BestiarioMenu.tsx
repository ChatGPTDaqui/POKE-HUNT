// Bestiario: progresso de abates por especie.
//
// SOBRE O DADO: o save guarda `pokedexKills[speciesId] = {normal, shiny}` — e
// so isso. Nao existe contador de capturas por especie nem de bolas
// arremessadas, e nao existe economia de tokens/runas no jogo. Entao este
// painel mostra os numeros REAIS que existem e os estagios derivados deles, e
// diz explicitamente que a recompensa ainda nao existe — em vez de exibir um
// "165 TOKENS" que nao sai de lugar nenhum e nao compra nada.
//
// Os limiares de estagio sao decisao de design (nao vem da planilha, como
// BG_ROUTE ou KANTO_BANDS ja eram), mas o progresso contra eles e dado real.
import { useMemo, useState } from 'react'
import { CheckCircle } from '@phosphor-icons/react'
import { SPECIES, type Species } from '@/data/pokes'
import { pokedexNumber } from '@/data/regions'
import { faceIconUrl } from '@/data/sprites'
import { useGameStateStore, type PokedexKillCount } from '@/stores/gameStateStore'
import { useBreakpoints } from '@/stores/uiStore'
import { TypeChip } from '@/components/shared/TypeChip'
import { GameCheck, GameInput, GameSelect, Meter, SectionLabel } from '@/components/game/controls'
import { cn } from '@/lib/utils'

const STAGE_THRESHOLDS = [500, 2500, 10_000, 50_000]
const fmt = new Intl.NumberFormat('pt-BR')

interface Progresso {
  normal: number
  shiny: number
  total: number
  /** Indice do estagio ATUAL (0-based). Igual a STAGE_THRESHOLDS.length = completo. */
  stage: number
  completo: boolean
}

function progressoDe(kills: Record<string, PokedexKillCount>, speciesId: string): Progresso {
  const entry = kills[speciesId]
  const normal = entry?.normal ?? 0
  const shiny = entry?.shiny ?? 0
  const total = normal + shiny
  const stage = STAGE_THRESHOLDS.filter((t) => total >= t).length
  return { normal, shiny, total, stage, completo: stage >= STAGE_THRESHOLDS.length }
}

type Filtro = 'todos' | 'progresso' | 'completo'

export function BestiarioMenu() {
  const pokedexKills = useGameStateStore((s) => s.pokedexKills)
  const { colStack } = useBreakpoints()
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [shinyOnly, setShinyOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Ordem oficial da Pokedex (pedido explicito). `Object.values(SPECIES)` sai na
  // ordem do arquivo gerado, que e a ordem de curadoria das hunts — util pro
  // sync, arbitraria pro jogador que procura "o numero 25". O numero real vem de
  // `data/regions.ts#pokedexNumber`, que ja o extrai da descricao emitida pelo
  // sync (e estoura se alguma especie nao tiver).
  const todas = useMemo(
    () => Object.values(SPECIES).sort((a, b) => pokedexNumber(a.id) - pokedexNumber(b.id)),
    [],
  )

  const resumo = useMemo(() => {
    let completos = 0
    let emProgresso = 0
    let abates = 0
    for (const species of todas) {
      const p = progressoDe(pokedexKills, species.id)
      abates += p.total
      if (p.completo) completos++
      else if (p.total > 0) emProgresso++
    }
    return { completos, emProgresso, abates, total: todas.length }
  }, [todas, pokedexKills])

  const visiveis = useMemo(() => {
    const term = search.trim().toLowerCase()
    return todas.filter((species) => {
      if (term && !species.name.toLowerCase().includes(term)) return false
      const p = progressoDe(pokedexKills, species.id)
      if (shinyOnly && p.shiny === 0) return false
      if (filtro === 'completo') return p.completo
      if (filtro === 'progresso') return p.total > 0 && !p.completo
      return true
    })
  }, [todas, pokedexKills, search, filtro, shinyOnly])

  const selecionada = selectedId ? SPECIES[selectedId] : null
  const pctCompleto = Math.round((resumo.completos / resumo.total) * 100)

  return (
    <div className="flex flex-col gap-[.8em]">
      <div className="flex flex-wrap items-center gap-[1em]">
        <div className="flex h-[3.4em] w-[3.4em] shrink-0 items-center justify-center rounded-full border-2 border-primary font-medium text-n200">
          {pctCompleto}%
        </div>
        <div>
          <div className="font-medium">{resumo.completos} / {resumo.total} completos</div>
          <div className="text-[.78em] text-n500">
            {resumo.emProgresso} em progresso · {fmt.format(resumo.abates)} abates no total
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-[.5em]">
        <GameInput
          className="min-w-[9em] flex-1"
          placeholder="Buscar Pokemon..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <GameSelect value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
          <option value="todos">Todos</option>
          <option value="progresso">Em progresso</option>
          <option value="completo">Completo</option>
        </GameSelect>
        <GameCheck checked={shinyOnly} onChange={setShinyOnly}>✨ Shiny</GameCheck>
      </div>

      <div className={colStack ? 'flex flex-col gap-[1em]' : 'grid grid-cols-[1.4fr_1fr] gap-[1em]'}>
        <div className="grid content-start gap-[.5em] [grid-template-columns:repeat(auto-fill,minmax(6em,1fr))]">
          {visiveis.map((species) => {
            const p = progressoDe(pokedexKills, species.id)
            const selecionado = selectedId === species.id
            const url = faceIconUrl(species.id)
            return (
              <button
                key={species.id}
                type="button"
                onClick={() => setSelectedId(species.id)}
                className={cn(
                  'relative flex cursor-pointer flex-col items-center gap-[.3em] rounded-[.6em] border bg-n900 px-[.3em] py-[.6em] font-[inherit]',
                  selecionado ? 'border-primary' : p.completo ? 'border-gold' : 'border-n800 hover:border-primary',
                )}
              >
                {p.completo && (
                  <CheckCircle weight="fill" className="absolute top-[.25em] right-[.25em] text-gold" />
                )}
                {url ? (
                  <img src={url} alt="" className="h-[2.8em] w-[2.8em] object-contain" />
                ) : (
                  <span className="h-[2.8em] w-[2.8em] rounded-[.5em]" style={{ background: species.color }} />
                )}
                <span className="max-w-full truncate text-[.78em] font-medium">{species.name}</span>
                <span className="text-[.72em] tabular-nums text-n400">{fmt.format(p.total)}</span>
              </button>
            )
          })}
          {visiveis.length === 0 && <p className="text-n500">Nenhum Pokemon corresponde aos filtros.</p>}
        </div>

        <DetalheEspecie species={selecionada} kills={pokedexKills} />
      </div>
    </div>
  )
}

function DetalheEspecie({
  species, kills,
}: {
  species: Species | null
  kills: Record<string, PokedexKillCount>
}) {
  if (!species) {
    return (
      <div className="self-start rounded-[.7em] border border-dashed border-n700 p-[1em] text-[.85em] text-n500">
        Escolha um Pokemon na grade para ver o progresso dele.
      </div>
    )
  }

  const p = progressoDe(kills, species.id)
  const proximoLimiar = STAGE_THRESHOLDS[p.stage]

  return (
    <div className="flex flex-col gap-[.6em] self-start rounded-[.7em] border border-n800 bg-n900 p-[.8em]">
      <div className="text-[1.05em] font-medium">{species.name}</div>
      <div className="flex gap-[.3em]">
        <TypeChip type={species.type} />
        {species.type2 && <TypeChip type={species.type2} />}
      </div>

      <div className="grid grid-cols-2 gap-[.4em] text-[.8em]">
        <Caixa label="Abates normais" valor={fmt.format(p.normal)} />
        <Caixa label="Abates shiny" valor={fmt.format(p.shiny)} />
        <Caixa label="Total" valor={fmt.format(p.total)} />
        <Caixa label="Estagio" valor={`${p.stage}/${STAGE_THRESHOLDS.length}`} />
      </div>

      {proximoLimiar != null ? (
        <div className="text-[.78em] text-n400">
          Proximo: faltam{' '}
          <b className="font-medium text-warn">{fmt.format(proximoLimiar - p.total)}</b>{' '}
          derrotas para o Estagio {p.stage + 1}
        </div>
      ) : (
        <div className="text-[.78em] text-gold">Todos os estagios concluidos.</div>
      )}

      <SectionLabel>ESTAGIOS</SectionLabel>
      {STAGE_THRESHOLDS.map((limiar, i) => {
        const anterior = i === 0 ? 0 : STAGE_THRESHOLDS[i - 1]
        const dentro = Math.max(0, Math.min(limiar - anterior, p.total - anterior))
        const pct = (dentro / (limiar - anterior)) * 100
        const atual = p.stage === i
        const concluido = p.stage > i
        return (
          <div key={limiar} className="rounded-[.5em] border border-n800 bg-background p-[.5em]">
            <div className="flex items-center gap-[.5em] text-[.85em]">
              <span
                className="flex h-[1.4em] w-[1.4em] items-center justify-center rounded-full border text-[.8em]"
                style={{
                  color: concluido ? 'var(--color-gold)' : atual ? 'var(--color-n200)' : 'var(--color-n500)',
                  borderColor: concluido ? 'var(--color-gold)' : atual ? 'var(--color-n200)' : 'var(--color-n600)',
                }}
              >
                {i + 1}
              </span>
              <b className="flex-1 font-medium">Estagio {i + 1}</b>
              <span className="text-[.8em] text-n500">
                {concluido ? 'CONCLUIDO' : atual ? 'ATUAL' : 'BLOQUEADO'}
              </span>
            </div>
            <Meter pct={pct} height=".3em" color="var(--color-primary)" className="mt-[.4em]" />
            <div className="mt-[.2em] text-right text-[.7em] text-n500">
              {fmt.format(Math.min(p.total, limiar))} / {fmt.format(limiar)}
            </div>
          </div>
        )
      })}

      {/* Honestidade sobre o que ainda nao existe: o handoff desenhava tokens e
          Runas como recompensa de estagio, mas nao ha economia de token no jogo
          — nenhum sistema concede nem consome. Mostrar um saldo aqui seria um
          numero que nao faz nada. */}
      <p className="text-[.75em] text-n500">
        As recompensas de estagio (tokens e Runas) ainda nao existem no jogo — por enquanto o Bestiario so
        acompanha o progresso real de abates.
      </p>
    </div>
  )
}

function Caixa({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-[.4em] border border-n800 bg-background px-[.5em] py-[.4em]">
      <div className="text-[.85em] text-n500">{label}</div>
      <b className="font-medium tabular-nums">{valor}</b>
    </div>
  )
}
