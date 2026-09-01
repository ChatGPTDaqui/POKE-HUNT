// Especialidades (PH-198): progressao de dano/defesa por tipo elemental.
// Layout master-detail copiado de features/bestiario/BestiarioMenu.tsx (grade
// a esquerda, detalhe a direita/sheet no celular) — mesmo padrao de tela de
// progresso que ja existe no jogo.
import { useMemo, useState } from 'react'
import {
  ESPECIALIDADE_TYPES, ESPECIALIDADE_NIVEL_MAX, custoDoProximoNivel, progressoGlobal, tituloDoProgresso,
  type EspecialidadeTrilha,
} from '@/data/especialidades'
import { stoneItemId, stoneName } from '@/data/stones'
import type { ElementType } from '@/data/generated/types'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useDeviceMode } from '@/stores/uiStore'
import { useToastStore } from '@/stores/toastStore'
import { pedirAcaoComLocal } from '@/data/remote/autoridade'
import { subirNivelEspecialidade } from '@/engine/systems/especialidadeSystem'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { Sheet } from '@/components/game/Sheet'
import { TypeChip } from '@/components/shared/TypeChip'
import { GameButton, Meter, SectionLabel } from '@/components/game/controls'
import { colorForType } from '@/data/typeColors'
import { cn } from '@/lib/utils'

const fmt = new Intl.NumberFormat('pt-BR')

function toast(message: string, type: 'success' | 'error' = 'success') {
  useToastStore.getState().pushToast(message, type, 'trade')
}

export function EspecialidadesMenu() {
  const especialidades = useGameStateStore((s) => s.especialidades)
  const { compacto } = useDeviceMode()
  const [selecionado, setSelecionado] = useState<ElementType | null>(null)

  const global = useMemo(() => progressoGlobal(especialidades), [especialidades])
  const titulo = tituloDoProgresso(global.atual, global.max)

  return (
    <div className="flex flex-col gap-[.55em]">
      <div className="flex flex-wrap items-center gap-[.65em]">
        <div className="flex h-[3.4em] w-[3.4em] shrink-0 items-center justify-center rounded-full border-2 border-primary font-medium text-n200">
          {Math.round((global.atual / global.max) * 100)}%
        </div>
        <div>
          <div className="font-medium">{global.atual} / {global.max} níveis · {titulo}</div>
          <div className="text-[.78em] text-n500">Progresso de dano/defesa por tipo elemental.</div>
        </div>
      </div>

      <div className={compacto ? 'flex flex-col gap-[.65em]' : 'grid grid-cols-[1.4fr_1fr] gap-[.65em]'}>
        <div className="grid content-start gap-[.5em] [grid-template-columns:repeat(auto-fill,minmax(7em,1fr))]">
          {ESPECIALIDADE_TYPES.map((tipo) => {
            const p = especialidades[tipo]
            const total = p.dano + p.defesa
            const ativo = selecionado === tipo
            return (
              <button
                key={tipo}
                type="button"
                onClick={() => setSelecionado(tipo)}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-[.3em] rounded-[.6em] border bg-n900 px-[.3em] py-[.6em] font-[inherit]',
                  ativo ? 'border-primary' : total > 0 ? 'border-gold' : 'border-n800 hover:border-primary',
                )}
              >
                <span
                  className="flex h-[2.4em] w-[2.4em] items-center justify-center rounded-full text-[.7em] font-semibold text-[#0b0e18]"
                  style={{ background: colorForType(tipo) }}
                >
                  {tipo.slice(0, 3)}
                </span>
                <span className="max-w-full truncate text-[.78em] font-medium">{tipo}</span>
                <span className="text-[.72em] tabular-nums text-n400">{total}/{ESPECIALIDADE_NIVEL_MAX * 2}</span>
              </button>
            )
          })}
        </div>

        {!compacto && <DetalheEspecialidade tipo={selecionado} />}
      </div>

      {compacto && selecionado && (
        <Sheet
          winKey="especialidades-detalhe"
          snap="conteudo"
          zIndex={33}
          onClose={() => setSelecionado(null)}
          title={selecionado}
        >
          <DetalheEspecialidade tipo={selecionado} semTitulo />
        </Sheet>
      )}
    </div>
  )
}

function DetalheEspecialidade({ tipo, semTitulo }: { tipo: ElementType | null; semTitulo?: boolean }) {
  if (!tipo) {
    return (
      <div className="self-start rounded-[.7em] border border-dashed border-n700 p-[.7em] text-[.85em] text-n500">
        Escolha um tipo elemental na grade pra ver o progresso.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[.5em] self-start rounded-[.7em] border border-n800 bg-n900 p-[.6em]">
      {!semTitulo && (
        <div className="flex items-center gap-[.4em]">
          <TypeChip type={tipo} full />
          <span className="text-[1.05em] font-medium">Maestria {tipo}</span>
        </div>
      )}
      {/*
        Os rotulos dizem o que a mecanica FAZ, nao o que o nome da trilha
        sugere (PH-246). A trilha de defesa e `reducaoDeDefesa`: ela multiplica
        o dano RECEBIDO daquele tipo por 1 - 0,01 x nivel. "+5% de defesa" e
        outra coisa — o jogador estava pagando por uma leitura errada.
      */}
      <Trilha tipo={tipo} trilha="dano" rotulo="DANO" descricao={`+1% a +5% de dano causado com golpes ${tipo}`} />
      <Trilha tipo={tipo} trilha="defesa" rotulo="DEFESA" descricao={`-1% a -5% de dano recebido de golpes ${tipo}`} />
    </div>
  )
}

function Trilha({
  tipo, trilha, rotulo, descricao,
}: {
  tipo: ElementType
  trilha: EspecialidadeTrilha
  rotulo: string
  descricao: string
}) {
  const nivel = useGameStateStore((s) => s.especialidades[tipo][trilha])
  const gold = useGameStateStore((s) => s.wallet.gold)
  const stoneQtd = useGameStateStore((s) => s.items[stoneItemId(tipo)] ?? 0)
  const acao = useAcaoPendente()

  const custo = custoDoProximoNivel(tipo, nivel)
  const noMax = custo == null
  const key = `${tipo}:${trilha}`

  async function subir() {
    if (!custo) return
    await acao.run(key, async () => {
      const { ok, local } = await pedirAcaoComLocal(
        { tipo: 'subirNivelEspecialidade', especialidadeTipo: tipo, trilha },
        () => subirNivelEspecialidade(useGameStateStore.getState(), tipo, trilha),
      )
      if (!ok) return // pedirAcao ja avisou o erro do servidor
      if (!local) return // caminho remoto: a mensagem certa vem do servidor
      if (local.success) toast(`Maestria ${tipo} (${trilha}) subiu para o nível ${nivel + 1}.`)
      else toast(
        local.reason === 'insufficient_gold' ? 'Ouro insuficiente.'
          : local.reason === 'stone_insuficiente' ? `${stoneName(tipo)} insuficiente.`
            : 'Não foi possível subir de nível.',
        'error',
      )
    })
  }

  const podeSubir = !noMax && !acao.isPending(key)
    && custo != null && gold >= custo.gold && stoneQtd >= custo.stoneQtd

  return (
    <div className="rounded-[.5em] border border-n800 bg-background p-[.5em]">
      <div className="flex items-center justify-between text-[.85em]">
        <b className="font-medium">{rotulo}</b>
        <span className="text-n500">{nivel}/{ESPECIALIDADE_NIVEL_MAX}</span>
      </div>
      <div className="text-[.72em] text-n500">{descricao}</div>
      <Meter pct={(nivel / ESPECIALIDADE_NIVEL_MAX) * 100} height=".3em" color="var(--color-primary)" className="mt-[.35em]" />

      {noMax ? (
        <div className="mt-[.4em] text-[.78em] text-gold">Nível máximo.</div>
      ) : (
        <>
          <SectionLabel className="mt-[.45em]">PRÓXIMO NÍVEL {nivel + 1}</SectionLabel>
          <div className="mt-[.2em] flex flex-wrap items-center gap-[.6em] text-[.78em]">
            <span className={cn('tabular-nums', stoneQtd >= custo!.stoneQtd ? 'text-n300' : 'text-warn')}>
              {stoneName(tipo)} {fmt.format(stoneQtd)}/{fmt.format(custo!.stoneQtd)}
            </span>
            <span className={cn('tabular-nums', gold >= custo!.gold ? 'text-n300' : 'text-warn')}>
              Gold {fmt.format(gold)}/{fmt.format(custo!.gold)}
            </span>
          </div>
          <GameButton
            variant="primary"
            className="mt-[.45em] w-full"
            disabled={!podeSubir}
            carregando={acao.isPending(key)}
            onClick={subir}
          >
            Subir
          </GameButton>
        </>
      )}
    </div>
  )
}
