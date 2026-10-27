// Pagina de um GRUPO de POKE no Mercado, estilo Steam (28/10/2026).
// Spec: docs/planos/2026-10-27-mercado-preco-medio-design.md
//
// O assunto da pagina e o PRECO: numero grande no topo, com o "a partir de" e
// o botao de comprar o mais barato logo ao lado. Embaixo, o grafico de 30 dias
// do grupo e os anuncios do mais barato pro mais caro — os mesmos cartoes da
// vitrine antiga, com os mesmos fluxos de compra, lance e oferta.
import { ArrowLeft, Sparkle } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import * as mercadoRpc from '@/data/remote/mercadoRpc'
import { SPECIES } from '@/data/pokes'
import { faceIconUrl } from '@/data/sprites'
import { useGameStateStore } from '@/stores/gameStateStore'
import { GameButton, GameCard, SectionLabel } from '@/components/game/controls'
import { cn } from '@/lib/utils'
import { useAcaoMercado } from '../hooks/useAcaoMercado'
import { chaveDePoke, faixaDeIv, ivPercentDoPoke, ROTULO_DA_FAIXA } from '../faixaDeIv'
import { precoNaMoeda, simbolo, usePrecoDeReferencia } from '../precoDeReferencia'
import { useMercadoStore, type GrupoAberto } from '../mercadoStore'
import { fmt, STALE_MS } from '../utils'
import { Carregando } from './shared'
import { CartaoDeAnuncio } from './CartaoDeAnuncio'
import { HistoricoDePreco } from './HistoricoDePreco'

/** Chave de preco do grupo — a faixa vira um IV representativo dela. */
function chaveDoGrupo(g: GrupoAberto): string {
  const ivDaFaixa = { f0: 0, f60: 60, f80: 80, f95: 95 }[g.ivFaixa]
  return chaveDePoke(g.speciesId, g.isShiny, ivDaFaixa)
}

export function SelosDoGrupo({ isShiny, ivFaixa }: { isShiny: boolean; ivFaixa: GrupoAberto['ivFaixa'] }) {
  return (
    <span className="flex flex-wrap items-center gap-[.3em] text-[.72em]">
      {isShiny && (
        <span className="flex items-center gap-[.15em] rounded-full bg-shiny/15 px-[.45em] py-[.05em] text-shiny">
          <Sparkle weight="fill" aria-hidden /> shiny
        </span>
      )}
      <span className={cn(
        'rounded-full px-[.45em] py-[.05em]',
        ivFaixa === 'f95' ? 'bg-gold/15 text-gold' : 'bg-menu-wash text-menu-muted',
      )}>
        {ROTULO_DA_FAIXA[ivFaixa]}
      </span>
    </span>
  )
}

export function PaginaDoGrupo({ grupo }: { grupo: GrupoAberto }) {
  const fechar = useMercadoStore((s) => s.fecharGrupo)
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const species = SPECIES[grupo.speciesId]
  const chave = chaveDoGrupo(grupo)
  const { data: precos } = usePrecoDeReferencia(chave)
  const preco = precoNaMoeda(precos, grupo.currency)
  const comprar = useAcaoMercado((anuncioId: string) => mercadoRpc.comprarAnuncio(anuncioId))

  const { data: anuncios, isLoading } = useQuery({
    queryKey: ['mercado', 'grupo', grupo.speciesId, grupo.isShiny, grupo.ivFaixa],
    queryFn: () => mercadoRpc.anunciosDoGrupo(grupo),
    staleTime: STALE_MS,
  })
  const daMoeda = (anuncios ?? []).filter((a) => a.currency === grupo.currency)
  // "Comprar o mais barato" so vale pra PRECO FIXO: leilao e "somente lance"
  // exigem decidir um valor, e um botao que comprasse por um lance seria outra
  // coisa com o mesmo nome.
  const maisBarato = daMoeda.find((a) => a.modo !== 'leilao' && !a.apenas_oferta && a.price != null) ?? null
  // "Tenho um desses?" — mesmo grupo, destravado (o travado nem pode ser anunciado).
  const tenho = bagPokes.some((p) => !p.locked && p.speciesId === grupo.speciesId
    && !!p.isShiny === grupo.isShiny && faixaDeIv(ivPercentDoPoke(p.ivs)) === grupo.ivFaixa)
  const s = simbolo(grupo.currency)

  return (
    <div className="flex flex-col gap-[.6em]">
      <button
        type="button"
        onClick={fechar}
        className="flex w-fit items-center gap-[.3em] text-[.8em] text-menu-muted transition-colors hover:text-menu-ink"
      >
        <ArrowLeft aria-hidden /> Voltar à vitrine
      </button>

      <GameCard className="flex flex-wrap items-center gap-[.8em] p-[.7em]">
        <img
          src={faceIconUrl(grupo.speciesId, grupo.isShiny) ?? undefined}
          alt=""
          className="h-[4.5em] w-[4.5em] shrink-0 rounded-[.6em] bg-menu-wash object-cover"
        />
        <div className="flex min-w-[10em] flex-1 flex-col gap-[.25em]">
          <h3 className={cn('text-[1.15em] font-semibold', grupo.isShiny && 'text-shiny')}>
            {species?.name ?? grupo.speciesId}
          </h3>
          <SelosDoGrupo isShiny={grupo.isShiny} ivFaixa={grupo.ivFaixa} />
        </div>
        <div className="flex flex-col items-end gap-[.1em] tabular-nums">
          <span className="text-[.7em] tracking-[.08em] text-menu-muted">PREÇO MÉDIO (7 DIAS)</span>
          {preco?.medianaDe7Dias != null ? (
            <>
              <span className={cn('text-[1.6em] font-bold', grupo.currency === 'gold' ? 'text-gold' : 'text-diamond')}>
                {s} {fmt.format(preco.medianaDe7Dias)}
              </span>
              <span className="text-[.72em] text-menu-muted">
                {preco.vendasDe7Dias === 1 ? '1 venda' : `${fmt.format(preco.vendasDe7Dias)} vendas`} em 7 dias
              </span>
            </>
          ) : (
            <span className="text-[1em] text-menu-muted">Sem vendas recentes</span>
          )}
        </div>
      </GameCard>

      <GameCard className="flex flex-wrap items-center gap-[.6em] p-[.55em]">
        <div className="flex flex-1 flex-col text-[.85em]">
          <span className="text-menu-muted">
            {daMoeda.length === 0 ? 'Nenhum à venda agora' : `${fmt.format(daMoeda.length)} à venda`}
          </span>
          {preco?.aPartirDe != null && (
            <span className="tabular-nums">a partir de <b className={grupo.currency === 'gold' ? 'text-gold' : 'text-diamond'}>{s} {fmt.format(preco.aPartirDe)}</b></span>
          )}
        </div>
        {maisBarato && (
          <GameButton
            variant="primary"
            carregando={comprar.isPending}
            onClick={() => comprar.mutate(maisBarato.id)}
          >
            Comprar o mais barato · {s} {fmt.format(maisBarato.price ?? 0)}
          </GameButton>
        )}
        {tenho && (
          <GameButton variant="ghost" onClick={() => useMercadoStore.getState().pedirVenda(grupo)}>
            Anunciar o meu
          </GameButton>
        )}
      </GameCard>

      <GameCard className="p-[.55em]">
        <HistoricoDePreco grupo={grupo} currency={grupo.currency} />
      </GameCard>

      <SectionLabel>À VENDA</SectionLabel>
      {isLoading && <Carregando />}
      {!isLoading && daMoeda.length === 0 && (
        <p className="text-[.85em] text-menu-muted">Ninguém está vendendo este grupo agora.</p>
      )}
      {daMoeda.map((a) => <CartaoDeAnuncio key={a.id} anuncio={a} />)}
    </div>
  )
}
