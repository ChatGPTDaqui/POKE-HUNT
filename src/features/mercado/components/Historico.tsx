import { useQuery } from '@tanstack/react-query'
import { ArrowsLeftRight } from '@phosphor-icons/react'
import * as mercadoRpc from '@/data/remote/mercadoRpc'
import { type NegocioMercado } from '@/data/remote/servidor'
import { ITEMS } from '@/data/items'
import { SPECIES } from '@/data/pokes'
import { fmt, STALE_MS } from '../utils'
import { Carregando, Moeda } from './shared'

export function Historico() {
  const { data, isLoading } = useQuery({
    queryKey: ['mercado', 'historico'],
    queryFn: () => mercadoRpc.mercadoHistorico(),
    staleTime: STALE_MS,
  })
  if (isLoading) return <Carregando />
  const negocios: NegocioMercado[] = data?.negocios ?? []
  if (negocios.length === 0) return <p className="text-n500">Você ainda não negociou nada.</p>

  return (
    <div className="flex flex-col gap-[.35em]">
      {negocios.map((n) => (
        <div key={n.id} className="flex flex-wrap items-center gap-[.5em] rounded-[.45em] border border-n800 px-[.6em] py-[.4em] text-[.85em]">
          <ArrowsLeftRight className={n.souComprador ? 'text-bad' : 'text-ok'} />
          <span className="min-w-[8em] flex-1">
            {n.souComprador ? 'Comprou' : 'Vendeu'}{' '}
            <b>
              {n.kind === 'item'
                ? `${ITEMS[n.item_id ?? '']?.name ?? n.item_id} x${n.quantity}`
                : SPECIES[n.species_id ?? '']?.name ?? n.species_id}
            </b>
            <span className="text-n500">
              {' '}{n.souComprador ? `de ${n.vendedor}` : `para ${n.comprador}`}
            </span>
          </span>
          <Moeda valor={n.unit_price * n.quantity} tipo={n.currency} />
          {/* A taxa (PH-98) aparece SO pra quem pagou por ela, o vendedor: o
              comprador desembolsou o valor cheio e ver "− taxa" na linha dele
              sugeriria um desconto que nao existiu.

              `!n.taxa` cobre ausente e zero de uma vez — linha de antes do
              PH-98 e venda em diamante (isenta) leem igual, "não houve taxa". */}
          {!n.souComprador && !!n.taxa && (
            <span className="text-[.8em] text-n500" title="Taxa de venda do Mercado">
              − {fmt.format(n.taxa)}
            </span>
          )}
          <span className="text-[.85em] text-n600">
            {new Date(n.created_at).toLocaleDateString('pt-BR')}
          </span>
        </div>
      ))}
    </div>
  )
}
