import { useQuery } from '@tanstack/react-query'
import { Gavel, X } from '@phosphor-icons/react'
import * as mercadoRpc from '@/data/remote/mercadoRpc'
import { type AnuncioMercado, type OrdemMercado } from '@/data/remote/servidor'
import { ITEMS } from '@/data/items'
import { SPECIES } from '@/data/pokes'
import { faceIconUrl } from '@/data/sprites'
import { GameButton, GameCard, SectionLabel } from '@/components/game/controls'
import { useAcaoMercado } from '../hooks/useAcaoMercado'
import { fmt, STALE_MS } from '../utils'
import { Carregando, IconeItem, Moeda } from './shared'

export function Ativos() {
  const { data, isLoading } = useQuery({
    queryKey: ['mercado', 'meus'],
    queryFn: () => mercadoRpc.mercadoMeus(),
    staleTime: STALE_MS,
  })
  const cancelarOrdem = useAcaoMercado((id: string) => mercadoRpc.cancelarOrdem(id))
  const cancelarAnuncio = useAcaoMercado((id: string) => mercadoRpc.cancelarAnuncio(id))
  const responder = useAcaoMercado(({ id, aceitar }: { id: string; aceitar: boolean }) =>
    mercadoRpc.responderOferta(id, aceitar))
  const cancelarOferta = useAcaoMercado((id: string) => mercadoRpc.cancelarOferta(id))

  if (isLoading) return <Carregando />
  const ordens: OrdemMercado[] = data?.ordens ?? []
  const anuncios: AnuncioMercado[] = data?.anuncios ?? []
  const recebidas = data?.ofertasRecebidas ?? []
  const minhas = data?.minhasOfertas ?? []

  return (
    <div className="flex flex-col gap-[.45em]">
      {/* Ofertas recebidas ficam no TOPO: sao a unica linha desta aba que exige
          uma decisao do jogador — o resto e so "cancelar se quiser". */}
      {recebidas.length > 0 && (
        <>
          <SectionLabel>LANCES RECEBIDOS ({recebidas.length})</SectionLabel>
          {recebidas.map((o) => (
            <GameCard key={o.id} className="flex flex-wrap items-center gap-[.5em] border-primary/40 p-[.55em]">
              {o.anuncio && (
                <img
                  src={faceIconUrl(o.anuncio.species_id, o.anuncio.is_shiny) ?? undefined}
                  alt=""
                  className="h-[2.2em] w-[2.2em] rounded-[.4em] object-cover"
                />
              )}
              <div className="min-w-[8em] flex-1">
                <b className="font-medium">
                  {o.anuncio ? SPECIES[o.anuncio.species_id]?.name ?? o.anuncio.species_id : 'POKE'}
                  {o.anuncio ? ` Lv${o.anuncio.level}` : ''}
                </b>
                <div className="text-[.78em] text-n500">lance de {o.comprador}</div>
              </div>
              <Moeda valor={o.valor} tipo={o.currency} />
              <div className="flex gap-[.35em]">
                <GameButton
                  variant="primary"
                  carregando={responder.isPending}
                  onClick={() => responder.mutate({ id: o.id, aceitar: true })}
                >
                  Aceitar
                </GameButton>
                <GameButton
                  variant="ghost"
                  carregando={responder.isPending}
                  onClick={() => responder.mutate({ id: o.id, aceitar: false })}
                >
                  Recusar
                </GameButton>
              </div>
            </GameCard>
          ))}
        </>
      )}

      {minhas.length > 0 && (
        <>
          <SectionLabel>MEUS LANCES ({minhas.length})</SectionLabel>
          {minhas.map((o) => (
            <GameCard key={o.id} className="flex flex-wrap items-center gap-[.5em] p-[.55em]">
              <Gavel className="text-warn" />
              <div className="min-w-[8em] flex-1 text-[.85em] text-n400">
                Lance enviado · valor retido até o vendedor responder
              </div>
              <Moeda valor={o.valor} tipo={o.currency} />
              <GameButton variant="danger" carregando={cancelarOferta.isPending} onClick={() => cancelarOferta.mutate(o.id)}>
                <X /> Cancelar
              </GameButton>
            </GameCard>
          ))}
        </>
      )}

      <SectionLabel>MINHAS ORDENS DE ITEM</SectionLabel>
      {ordens.length === 0 && <p className="text-n500">Nenhuma ordem ativa.</p>}
      {ordens.map((o) => (
        <GameCard key={o.id} className="flex flex-wrap items-center gap-[.5em] p-[.55em]">
          <IconeItem itemId={o.item_id} />
          <div className="min-w-[8em] flex-1">
            <b className="font-medium">{ITEMS[o.item_id]?.name ?? o.item_id}</b>
            <div className="text-[.78em] text-n500">
              {o.side === 'venda' ? 'Vendendo' : 'Comprando'} {fmt.format(o.remaining)} de {fmt.format(o.quantity)}
              {' · '}<span className="text-gold">{fmt.format(o.unit_price)}/un.</span>
              {o.side === 'compra' && o.gold_retido > 0 && ` · ${fmt.format(o.gold_retido)} de ouro retido`}
            </div>
          </div>
          <GameButton variant="danger" carregando={cancelarOrdem.isPending} onClick={() => cancelarOrdem.mutate(o.id)}>
            <X /> Cancelar
          </GameButton>
        </GameCard>
      ))}

      <SectionLabel>MEUS POKES ANUNCIADOS</SectionLabel>
      {anuncios.length === 0 && <p className="text-n500">Nenhum POKE anunciado.</p>}
      {anuncios.map((a) => (
        <GameCard key={a.id} className="flex flex-wrap items-center gap-[.5em] p-[.55em]">
          <img src={faceIconUrl(a.species_id, a.is_shiny) ?? undefined} alt="" className="h-[2.2em] w-[2.2em] rounded-[.4em] object-cover" />
          <div className="min-w-[8em] flex-1">
            <b className="font-medium">{SPECIES[a.species_id]?.name ?? a.species_id} Lv{a.level}</b>
            <div className="text-[.78em] text-n500">
              IV {a.iv_percent}%{a.apenas_oferta && ` · ${a.ofertas ?? 0} lance(s)`}
            </div>
          </div>
          {a.apenas_oferta
            ? <span className="flex items-center gap-[.25em] text-[.8em] text-warn"><Gavel weight="fill" /> lances</span>
            : <Moeda valor={a.price ?? 0} tipo={a.currency} />}
          <GameButton variant="danger" carregando={cancelarAnuncio.isPending} onClick={() => cancelarAnuncio.mutate(a.id)}>
            <X /> Retirar
          </GameButton>
        </GameCard>
      ))}
    </div>
  )
}
