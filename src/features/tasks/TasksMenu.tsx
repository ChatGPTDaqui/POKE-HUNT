// Tasks & Missoes (PH-199): cadeia de missoes de abate por tipo elemental,
// sequencial — layout master-detail no mesmo modelo de
// features/bestiario/BestiarioMenu.tsx e features/especialidades (PH-198).
import { useMemo, useState } from 'react'
import { cadeiaDoTipo, chaveDaMissao, MISSAO_TYPES, type MissaoInfo } from '@/data/missoes'
import { SPECIES } from '@/data/pokes'
import { faceIconUrl } from '@/data/sprites'
import type { ElementType } from '@/data/generated/types'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useDeviceMode } from '@/stores/uiStore'
import { useToastStore } from '@/stores/toastStore'
import { pedirAcaoComLocal } from '@/data/remote/autoridade'
import { reivindicarMissao } from '@/engine/systems/missaoSystem'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { Sheet } from '@/components/game/Sheet'
import { TypeChip } from '@/components/shared/TypeChip'
import { GameButton, Meter } from '@/components/game/controls'
import { colorForType } from '@/data/typeColors'
import { cn } from '@/lib/utils'

const fmt = new Intl.NumberFormat('pt-BR')

function toast(message: string, type: 'success' | 'error' = 'success') {
  useToastStore.getState().pushToast(message, type, 'trade')
}

// Cadeia e pura funcao de `SPECIES` (nao muda em runtime) — computada uma vez
// por tipo, fora do componente, em vez de em todo render.
const CADEIAS: Partial<Record<ElementType, MissaoInfo[]>> = {}
function cadeiaCache(tipo: ElementType): MissaoInfo[] {
  return CADEIAS[tipo] ??= cadeiaDoTipo(tipo)
}

export function TasksMenu() {
  const missoesReivindicadas = useGameStateStore((s) => s.missoesReivindicadas)
  const { compacto } = useDeviceMode()
  const [selecionado, setSelecionado] = useState<ElementType | null>(null)

  const resumo = useMemo(() => {
    let total = 0
    let reivindicadas = 0
    for (const tipo of MISSAO_TYPES) {
      const cadeia = cadeiaCache(tipo)
      total += cadeia.length
      for (const missao of cadeia) {
        if (missoesReivindicadas[chaveDaMissao(tipo, missao.speciesId)]) reivindicadas++
      }
    }
    return { total, reivindicadas }
  }, [missoesReivindicadas])

  return (
    <div className="flex flex-col gap-[.55em]">
      <div className="flex flex-wrap items-center gap-[.65em]">
        <div className="flex h-[3.4em] w-[3.4em] shrink-0 items-center justify-center rounded-full border-2 border-primary font-medium text-n200">
          {Math.round((resumo.reivindicadas / resumo.total) * 100)}%
        </div>
        <div>
          <div className="font-medium">{resumo.reivindicadas} / {resumo.total} missões reivindicadas</div>
          <div className="text-[.78em] text-n500">Cadeia de abate por tipo elemental — mata a espécie N, libera a N+1.</div>
        </div>
      </div>

      <div className={compacto ? 'flex flex-col gap-[.65em]' : 'grid grid-cols-[1.2fr_1.4fr] gap-[.65em]'}>
        <div className="grid content-start gap-[.5em] [grid-template-columns:repeat(auto-fill,minmax(7em,1fr))]">
          {MISSAO_TYPES.map((tipo) => {
            const cadeia = cadeiaCache(tipo)
            const reivindicadasDoTipo = cadeia.filter((m) => missoesReivindicadas[chaveDaMissao(tipo, m.speciesId)]).length
            const ativo = selecionado === tipo
            return (
              <button
                key={tipo}
                type="button"
                onClick={() => setSelecionado(tipo)}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-[.3em] rounded-[.6em] border bg-n900 px-[.3em] py-[.6em] font-[inherit]',
                  ativo ? 'border-primary' : reivindicadasDoTipo > 0 ? 'border-gold' : 'border-n800 hover:border-primary',
                )}
              >
                <span
                  className="flex h-[2.4em] w-[2.4em] items-center justify-center rounded-full text-[.7em] font-semibold text-[#0b0e18]"
                  style={{ background: colorForType(tipo) }}
                >
                  {tipo.slice(0, 3)}
                </span>
                <span className="max-w-full truncate text-[.78em] font-medium">{tipo}</span>
                <span className="text-[.72em] tabular-nums text-n400">{reivindicadasDoTipo}/{cadeia.length}</span>
              </button>
            )
          })}
        </div>

        {!compacto && <CadeiaDoTipo tipo={selecionado} />}
      </div>

      {compacto && selecionado && (
        <Sheet
          winKey="tasks-cadeia"
          snap="conteudo"
          zIndex={33}
          onClose={() => setSelecionado(null)}
          title={selecionado}
        >
          <CadeiaDoTipo tipo={selecionado} semTitulo />
        </Sheet>
      )}
    </div>
  )
}

function CadeiaDoTipo({ tipo, semTitulo }: { tipo: ElementType | null; semTitulo?: boolean }) {
  if (!tipo) {
    return (
      <div className="self-start rounded-[.7em] border border-dashed border-n700 p-[.7em] text-[.85em] text-n500">
        Escolha um tipo elemental na grade pra ver a cadeia de missões.
      </div>
    )
  }
  const cadeia = cadeiaCache(tipo)
  return (
    <div className="flex flex-col gap-[.4em] self-start rounded-[.7em] border border-n800 bg-n900 p-[.6em]">
      {!semTitulo && (
        <div className="flex items-center gap-[.4em]">
          <TypeChip type={tipo} full />
          <span className="text-[1.05em] font-medium">Missões {tipo}</span>
        </div>
      )}
      {cadeia.map((missao, i) => (
        <MissaoCard key={missao.speciesId} tipo={tipo} missao={missao} bloqueada={i > 0 && !useGameStateStore.getState().missoesReivindicadas[chaveDaMissao(tipo, cadeia[i - 1].speciesId)]} />
      ))}
    </div>
  )
}

function MissaoCard({ tipo, missao, bloqueada }: { tipo: ElementType; missao: MissaoInfo; bloqueada: boolean }) {
  const reivindicada = useGameStateStore((s) => Boolean(s.missoesReivindicadas[chaveDaMissao(tipo, missao.speciesId)]))
  const kills = useGameStateStore((s) => s.pokedexKills[missao.speciesId])
  const acao = useAcaoPendente()
  const species = SPECIES[missao.speciesId]
  const abates = (kills?.normal ?? 0) + (kills?.shiny ?? 0)
  const key = chaveDaMissao(tipo, missao.speciesId)
  const podeReivindicar = !reivindicada && !bloqueada && abates >= missao.alvo && !acao.isPending(key)

  async function reivindicar() {
    await acao.run(key, async () => {
      const { ok, local } = await pedirAcaoComLocal(
        { tipo: 'reivindicarMissao', missaoTipo: tipo, speciesId: missao.speciesId },
        () => reivindicarMissao(useGameStateStore.getState(), tipo, missao.speciesId),
      )
      if (!ok) return
      if (!local) return
      if (local.success) toast(`Missão de ${species?.name ?? missao.speciesId} reivindicada — ${fmt.format(missao.recompensa)} de ouro.`)
      else toast(
        local.reason === 'abates_insuficientes' ? 'Abates insuficientes.'
          : local.reason === 'missao_anterior_pendente' ? 'Complete a missão anterior primeiro.'
            : 'Não foi possível reivindicar.',
        'error',
      )
    })
  }

  return (
    <div className={cn('rounded-[.5em] border p-[.5em]', reivindicada ? 'border-gold bg-background' : bloqueada ? 'border-n800 bg-background opacity-60' : 'border-n800 bg-background')}>
      <div className="flex items-center gap-[.5em]">
        {(() => {
          const url = species ? faceIconUrl(species.id) : null
          return url ? (
            <img src={url} alt="" className="h-[2.2em] w-[2.2em] object-contain" />
          ) : (
            <span className="h-[2.2em] w-[2.2em] shrink-0 rounded-[.4em]" style={{ background: species?.color }} />
          )
        })()}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-[.4em]">
            <b className="truncate text-[.9em] font-medium">{species?.name ?? missao.speciesId}</b>
            <span className="text-[.72em] text-n500">#{missao.posicao + 1}</span>
          </div>
          <div className="text-[.72em] text-n500">
            {reivindicada ? 'Reivindicada' : bloqueada ? 'Bloqueada — complete a anterior' : `${fmt.format(abates)} / ${fmt.format(missao.alvo)} abates`}
          </div>
        </div>
        <div className="text-right text-[.78em] tabular-nums text-gold">{fmt.format(missao.recompensa)} G</div>
      </div>

      {!reivindicada && !bloqueada && (
        <>
          <Meter pct={Math.min(100, (abates / missao.alvo) * 100)} height=".3em" color="var(--color-primary)" className="mt-[.35em]" />
          <GameButton
            variant="primary"
            className="mt-[.4em] w-full"
            disabled={!podeReivindicar}
            carregando={acao.isPending(key)}
            onClick={reivindicar}
          >
            Reivindicar
          </GameButton>
        </>
      )}

      {missao.ehUltima && (
        <div className="mt-[.3em] text-[.72em] text-gold">Última da cadeia — inclui bônus de conclusão.</div>
      )}
    </div>
  )
}
