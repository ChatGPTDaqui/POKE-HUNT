// Aba Objetivos: o passo atual dos Primeiros Passos e a faixa de prêmios no
// topo (o que era o botão "Objetivos" do campo) e, abaixo, a Rota do Treinador
// com o jogo inteiro em três fases.
import { useEffect, useMemo } from 'react'
import { CheckCircle } from '@phosphor-icons/react'
import { Meter } from '@/components/game/controls'
import { CartaoDoPasso } from '@/features/primeirosPassos/CartaoDoPasso'
import { FaixaDePremios } from '@/features/primeirosPassos/FaixaDePremios'
import { useGameStateStore } from '@/stores/gameStateStore'
import { usePassosStore } from '@/stores/passosStore'
import { useConquistasStore } from '@/stores/conquistasStore'
import { passoCumprido, PRIMEIROS_PASSOS } from '@/data/primeirosPassos'
import { CATALOGO_DE_CONQUISTAS } from '@/data/generated/conquistas.generated'
import { concluido, faseAtual, rotaDoTreinador, type Fase, type MarcoDaRota } from '@/data/rotaDoTreinador'

const fmt = new Intl.NumberFormat('pt-BR')
const OURO = new Set(CATALOGO_DE_CONQUISTAS.filter((c) => c.nivel === 'ouro').map((c) => c.id))

// Seletores que devolvem NUMERO (ou a mesma referencia): a aba fica aberta
// durante a caca, e assinar o estado inteiro re-renderizaria a cada abate.
function useRota(): Fase[] {
  const reivindicados = usePassosStore((p) => p.reivindicados)
  const passosCumpridos = useGameStateStore((s) => PRIMEIROS_PASSOS.filter((p) => passoCumprido(p.id, s, reivindicados)).length)
  const nivelDoTreinador = useGameStateStore((s) => s.trainer.level)
  const progresso = useGameStateStore((s) => s.biomaProgress)
  const lanceVencido = useGameStateStore((s) => s.unlockedContinents.includes('nightmare'))
  const maiorEspecialidade = useGameStateStore((s) => Object.values(s.especialidades ?? {})
    .reduce((m, e) => Math.max(m, e?.dano ?? 0, e?.defesa ?? 0), 0))
  const maiorPesquisa = useGameStateStore((s) => Object.values(s.pokedexKills as Record<string, { normal?: number; shiny?: number } | undefined>)
    .reduce((m, k) => Math.max(m, (k?.normal ?? 0) + (k?.shiny ?? 0)), 0))
  const conquistas = useConquistasStore((c) => c.desbloqueadas)
  const carregadas = useConquistasStore((c) => c.carregado)
  return useMemo(() => {
    const ids = Object.keys(conquistas)
    return rotaDoTreinador({
      passosCumpridos, nivelDoTreinador, progresso, lanceVencido, maiorEspecialidade, maiorPesquisa,
      conquistas: { carregadas, total: ids.length, ouro: ids.filter((id) => OURO.has(id)).length },
    })
  }, [passosCumpridos, nivelDoTreinador, progresso, lanceVencido, maiorEspecialidade, maiorPesquisa, conquistas, carregadas])
}

function LinhaDoMarco({ m }: { m: MarcoDaRota }) {
  const feito = concluido(m)
  const medido = m.medido !== false
  return (
    <li className="rounded-[.5em] border border-menu-line p-[.45em] text-[.8em]">
      <div className="flex items-baseline gap-[.4em]">
        {feito && <CheckCircle weight="fill" className="shrink-0 text-ok" aria-label="Concluído" />}
        <span className="font-medium text-menu-ink">{m.titulo}</span>
        <span className="ml-auto tabular-nums text-menu-ink">
          {!medido ? '—' : feito ? 'Concluído' : `${fmt.format(Math.min(m.atual, m.alvo))}/${fmt.format(m.alvo)}`}
        </span>
      </div>
      <Meter pct={medido ? Math.min(100, (m.atual / m.alvo) * 100) : 0} height=".28em"
        color={feito ? 'var(--color-ok)' : 'var(--color-primary)'} className="my-[.25em]" />
      <p className="text-[.9em] text-menu-muted">{m.libera}</p>
    </li>
  )
}

export function AbaObjetivos() {
  const fases = useRota()
  const atual = faseAtual(fases)
  const carregadas = useConquistasStore((c) => c.carregado)
  useEffect(() => { if (!carregadas) void useConquistasStore.getState().carregar() }, [carregadas])

  return (
    <div className="flex flex-col gap-[.6em]">
      <CartaoDoPasso />
      <FaixaDePremios />
      <h3 className="mt-[.3em] text-[.9em] font-medium text-menu-ink">Rota do Treinador</h3>
      <p className="text-[.75em] text-menu-muted">O que você tem para alcançar no jogo inteiro. São metas, não travas.</p>
      {fases.map((f) => {
        const feitos = f.marcos.filter(concluido).length
        return (
          <details key={f.fase} open={f.fase === atual} className="rounded-[.6em] border border-menu-line bg-menu-card p-[.5em]">
            <summary className="cursor-pointer font-medium text-menu-ink">
              {f.titulo} · {feitos}/{f.marcos.length}{f.fase === atual ? ' · você está aqui' : ''}
            </summary>
            <p className="my-[.35em] text-[.75em] text-menu-muted">{f.resumo}</p>
            <ul className="flex flex-col gap-[.4em]">
              {f.marcos.map((m) => <LinhaDoMarco key={m.id} m={m} />)}
            </ul>
          </details>
        )
      })}
    </div>
  )
}
