// Historico do ginasio (24/10/2026, pedido do dono): os ultimos 10 desafios
// resolvidos — quem desafiou, o duelo, quem venceu, em quanto tempo e o que o
// lider ganhou. Le pela RPC `historico_do_ginasio` (a tabela so mostra os
// proprios desafios).
import { useQuery } from '@tanstack/react-query'
import { ClockCounterClockwise, Medal, Sword } from '@phosphor-icons/react'
import { historicoDoGinasio, type DesafioNoHistorico } from '@/data/remote/ginasiosRpc'

const fmt = new Intl.NumberFormat('pt-BR')

function haQuanto(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`
}

function Linha({ d }: { d: DesafioNoHistorico }) {
  const desafianteVenceu = d.resultado === 'vitoria'
  const vencedor = d.resultado === 'empate' ? 'Empate' : desafianteVenceu ? `${d.desafiante} venceu` : `${d.lider} defendeu`
  return (
    <li className="flex items-center gap-[.4em] border-t border-menu-line py-[.3em] text-[.75em] first:border-t-0">
      {d.duelo === 'insignia'
        ? <Medal className="shrink-0 text-gold" weight="fill" aria-label="Pela insígnia" />
        : <Sword className="shrink-0 text-bad" weight="fill" aria-label="Para destronar" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate"><b>{d.desafiante}</b> × {d.lider}</span>
        <span className={desafianteVenceu ? 'text-ok' : 'text-menu-muted'}>
          {vencedor}{d.ticks != null ? ` · ${Math.round(d.ticks / 60)}s` : ''}
          {d.repasse > 0 && <span className="text-gold"> · +{fmt.format(d.repasse)} ao líder</span>}
        </span>
      </span>
      <span className="shrink-0 text-menu-muted">{haQuanto(d.quando)}</span>
    </li>
  )
}

export function HistoricoDoGinasio({ ginasioId }: { ginasioId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['historico-do-ginasio', ginasioId],
    queryFn: () => historicoDoGinasio(ginasioId),
    staleTime: 30_000,
  })
  return (
    <section className="flex flex-col gap-[.2em]" aria-label="Últimos desafios">
      <div className="flex items-center gap-[.3em] text-[.75em] text-menu-muted"><ClockCounterClockwise aria-hidden /> Últimos desafios</div>
      {isLoading && <p className="text-[.72em] text-menu-muted">Carregando…</p>}
      {isError && <p className="text-[.72em] text-menu-muted">Não foi possível carregar o histórico.</p>}
      {data && data.length === 0 && <p className="text-[.72em] text-menu-muted">Ninguém desafiou este ginásio ainda.</p>}
      {data && data.length > 0 && <ul>{data.map((d, i) => <Linha key={`${d.quando}-${i}`} d={d} />)}</ul>}
    </section>
  )
}
