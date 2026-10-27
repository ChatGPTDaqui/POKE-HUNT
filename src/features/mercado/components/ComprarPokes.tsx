// Vitrine de POKE do Mercado, agrupada estilo Steam (28/10/2026).
//
// Um card por GRUPO (espécie + shiny + faixa de IV + moeda) com o preco medio
// e o "a partir de". Os filtros continuam valendo sobre os ANUNCIOS (o servidor
// filtra antes de agrupar — vitrine_de_pokes), e o total de grupos vem do
// banco, nunca de `.length`. O cartao de anuncio individual mora em
// CartaoDeAnuncio.tsx e aparece na pagina do grupo.
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Coin, Diamond, Gavel } from '@phosphor-icons/react'
import * as mercadoRpc from '@/data/remote/mercadoRpc'
import { SPECIES } from '@/data/pokes'
import { faceIconUrl } from '@/data/sprites'
import { RARITIES, type RarityKey } from '@/data/rarity'
import { GameButton, GameCard, GameCheck, GameInput, GameSelect, Recolhivel } from '@/components/game/controls'
import { cn } from '@/lib/utils'
import { fmt, STALE_MS } from '../utils'
import { faixaDaPagina } from '../paginacao'
import { precoNaMoeda, simbolo, usePrecoDeReferencia } from '../precoDeReferencia'
import { useMercadoStore } from '../mercadoStore'
import { Carregando } from './shared'
import { FiltroToggle } from './FiltroToggle'
import { PaginaDoGrupo, SelosDoGrupo } from './PaginaDoGrupo'

/** Grupos por pagina: grade de 2 colunas, entao par. */
const POR_PAGINA = 24

function CardDoGrupo({ grupo: g, onAbrir }: { grupo: mercadoRpc.GrupoDaVitrine; onAbrir: () => void }) {
  const { data } = usePrecoDeReferencia(`poke:${g.speciesId}:${g.isShiny ? 1 : 0}:${g.ivFaixa}`)
  const preco = precoNaMoeda(data, g.currency)
  const s = simbolo(g.currency)
  const corMoeda = g.currency === 'gold' ? 'text-gold' : 'text-diamond'
  return (
    <GameCard
      onClick={onAbrir}
      className="flex cursor-pointer items-center gap-[.55em] p-[.5em] transition-colors hover:border-menu-brand/50"
    >
      <img
        src={faceIconUrl(g.speciesId, g.isShiny) ?? undefined}
        alt=""
        className="h-[3em] w-[3em] shrink-0 rounded-[.45em] bg-menu-wash object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-[.15em]">
        <b className={cn('truncate font-medium', g.isShiny && 'text-shiny')}>{SPECIES[g.speciesId]?.name ?? g.speciesId}</b>
        <SelosDoGrupo isShiny={g.isShiny} ivFaixa={g.ivFaixa} />
        <span className="text-[.72em] text-menu-muted tabular-nums">
          {preco?.medianaDe7Dias != null
            ? <>preço médio <span className={corMoeda}>{s} {fmt.format(preco.medianaDe7Dias)}</span></>
            : 'sem vendas recentes'}
        </span>
      </div>
      <div className="flex flex-col items-end text-right tabular-nums">
        <span className="text-[.7em] text-menu-muted">{fmt.format(g.anuncios)} à venda</span>
        {g.aPartirDe != null
          ? <span className={cn('font-semibold', corMoeda)}>{s} {fmt.format(g.aPartirDe)}</span>
          : <span className="text-[.78em] text-menu-muted">só lance</span>}
      </div>
    </GameCard>
  )
}

export function ComprarPokes() {
  const grupoAberto = useMercadoStore((s) => s.grupoAberto)
  const abrirGrupo = useMercadoStore((s) => s.abrirGrupo)
  const [busca, setBusca] = useState('')
  // Tres filtros independentes (pedido explicito). Moeda comeca com as duas
  // ligadas; "Somente Oferta" comeca desligado — ele RESTRINGE, e um filtro
  // restritivo ligado por padrao esconderia a maioria dos anuncios sem o
  // jogador ter pedido.
  const [verGold, setVerGold] = useState(true)
  const [verDiamante, setVerDiamante] = useState(true)
  const [somenteOferta, setSomenteOferta] = useState(false)
  const [shinyOnly, setShinyOnly] = useState(false)
  const [nivelMin, setNivelMin] = useState(0)
  const [ivMin, setIvMin] = useState(0)
  const [raridades, setRaridades] = useState<Set<RarityKey>>(() => new Set(Object.keys(RARITIES) as RarityKey[]))
  const [ordem, setOrdem] = useState<mercadoRpc.OrdemDaVitrine>('preco')
  const [pagina, setPagina] = useState(0)

  // Filtro do SERVIDOR (PH-99). Montado num `useMemo` porque ele e a
  // `queryKey`: sem isso um objeto novo a cada render invalidaria o cache em
  // todo re-render e a vitrine viraria uma rajada de requests.
  const filtro = useMemo((): mercadoRpc.FiltroDosGrupos => ({
    pagina,
    porPagina: POR_PAGINA,
    termo: busca.trim() || undefined,
    // `undefined` quando as duas estao ligadas: nao restringe nada, e mandar as
    // duas viraria um `in.(gold,diamond)` inutil na URL.
    moedas: verGold && verDiamante ? undefined : [
      ...(verGold ? ['gold' as const] : []),
      ...(verDiamante ? ['diamond' as const] : []),
    ],
    raridades: raridades.size === Object.keys(RARITIES).length ? undefined : [...raridades],
    shinyOnly: shinyOnly || undefined,
    nivelMin: nivelMin || undefined,
    ivMin: ivMin || undefined,
    soLance: somenteOferta || undefined,
    ordem,
  }), [pagina, busca, verGold, verDiamante, raridades, shinyOnly, nivelMin, ivMin, somenteOferta, ordem])

  // Mudar QUALQUER filtro volta pra primeira pagina. Sem isto, quem estava na
  // pagina 5 e digita uma busca que devolve 3 resultados ve uma vitrine VAZIA —
  // e o vazio nao explica que o problema e a pagina, nao o filtro.
  //
  // Efeito, e nao um wrapper em cada um dos oito setters: com oito, o proximo
  // filtro a entrar seria adicionado sem o wrapper e o bug voltaria calado.
  useEffect(() => {
    setPagina(0)
  }, [busca, verGold, verDiamante, raridades, shinyOnly, nivelMin, ivMin, somenteOferta, ordem])

  const { data, isLoading } = useQuery({
    // O filtro INTEIRO entra na chave. Sem ele, trocar de pagina ou de
    // ordenacao leria o cache da combinacao anterior e a tela mostraria a
    // pagina errada com aparencia de certa.
    queryKey: ['mercado', 'grupos', filtro],
    queryFn: () => mercadoRpc.vitrineDePokes(filtro),
    staleTime: STALE_MS,
    // Segura a pagina anterior enquanto a nova carrega, em vez de piscar o
    // estado de carregamento e a lista sumir a cada clique de paginacao.
    placeholderData: (anterior) => anterior,
  })
  // Especie que este cliente nao conhece (renomeada num sync posterior) nao
  // tem como desenhar — mesma regra da vitrine antiga.
  const grupos = useMemo(() => (data?.grupos ?? []).filter((g) => SPECIES[g.speciesId]), [data])

  if (grupoAberto) return <PaginaDoGrupo grupo={grupoAberto} />
  if (isLoading) return <Carregando />

  // Resumo pra barra fechada: o jogador precisa saber POR QUE a vitrine esta
  // curta sem reabrir os filtros.
  const resumo = [
    busca.trim() && `"${busca.trim()}"`,
    !verGold && 'sem gold',
    !verDiamante && 'sem diamante',
    somenteOferta && 'só oferta',
    nivelMin > 0 && `Lv ${nivelMin}+`,
    ivMin > 0 && `IV ${ivMin}%+`,
    shinyOnly && 'só shiny',
    raridades.size < Object.keys(RARITIES).length && `${raridades.size}/${Object.keys(RARITIES).length} raridades`,
  ].filter(Boolean).join(' · ') || 'tudo'

  const total = data?.total ?? 0
  const { paginas, inicio, fim } = faixaDaPagina(total, pagina, POR_PAGINA)

  return (
    <div className="flex flex-col gap-[.45em]">
      {/* Quatro fileiras de filtro (busca, moeda, faixa, raridades) somavam
          ~330px antes do primeiro anuncio — mais da metade do painel util no
          celular. Recolhidas, a vitrine comeca no topo. */}
      <Recolhivel titulo="Filtros" resumo={resumo}>
      <div className="flex flex-col gap-[.45em]">
      <div className="flex flex-wrap items-center gap-[.5em]">
        <GameInput
          placeholder="Buscar espécie..." value={busca}
          onChange={(e) => setBusca(e.target.value)} className="min-w-[9em] flex-1"
        />
        <GameSelect value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}>
          <option value="preco">Menor preço</option>
          <option value="anunciados">Mais anunciados</option>
          <option value="recente">Mais recente</option>
          <option value="nivel">Maior nível</option>
          <option value="iv">Maior IV</option>
        </GameSelect>
      </div>

      <div className="flex flex-wrap items-center gap-[.35em]">
        <FiltroToggle ativo={verGold} cor="var(--color-gold)" onClick={() => setVerGold((v) => !v)}>
          <Coin weight="fill" /> Gold
        </FiltroToggle>
        <FiltroToggle ativo={verDiamante} cor="var(--color-diamond)" onClick={() => setVerDiamante((v) => !v)}>
          <Diamond weight="fill" /> Diamante
        </FiltroToggle>
        <FiltroToggle ativo={somenteOferta} onClick={() => setSomenteOferta((v) => !v)}>
          <Gavel /> Somente Oferta
        </FiltroToggle>
      </div>

      <div className="flex flex-wrap items-center gap-[.5em] text-[.8em] text-menu-muted">
        <label className="flex items-center gap-[.3em]">
          Nivel min
          <GameInput
            type="number" min={0} className="w-[4em] text-center" value={nivelMin}
            onChange={(e) => setNivelMin(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className="flex items-center gap-[.3em]">
          IV min %
          <GameInput
            type="number" min={0} max={100} className="w-[4em] text-center" value={ivMin}
            onChange={(e) => setIvMin(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
          />
        </label>
        <GameCheck checked={shinyOnly} onChange={setShinyOnly}>Shiny</GameCheck>
      </div>

      <div className="flex flex-wrap items-center gap-x-[.6em] gap-y-[.3em]">
        {Object.values(RARITIES).map((r) => (
          <GameCheck
            key={r.key}
            checked={raridades.has(r.key)}
            onChange={(on) => setRaridades((prev) => {
              const next = new Set(prev)
              if (on) next.add(r.key)
              else next.delete(r.key)
              return next
            })}
          >
            <span style={{ color: r.color }}>{r.label}</span>
          </GameCheck>
        ))}
      </div>
      </div>
      </Recolhivel>

      {total > 0 && (
        <div className="flex items-center justify-between text-[.78em] text-menu-muted">
          <span>{inicio}–{fim} de {fmt.format(total)} grupos</span>
          {paginas > 1 && <span>página {pagina + 1} de {fmt.format(paginas)}</span>}
        </div>
      )}

      {grupos.length === 0 && <p className="text-menu-muted">Nenhum POKE à venda com esses filtros.</p>}

      {/* Um card por GRUPO (espécie + shiny + faixa de IV + moeda), estilo
          Steam. Os anuncios do grupo ficam na pagina dele. */}
      <div className="grid grid-cols-1 gap-[.45em] sm:grid-cols-2">
        {grupos.map((g) => (
          <CardDoGrupo key={`${g.speciesId}:${g.isShiny}:${g.ivFaixa}:${g.currency}`} grupo={g} onAbrir={() => abrirGrupo(g)} />
        ))}
      </div>

      {paginas > 1 && (
        <div className="flex items-center justify-center gap-[.5em] pt-[.3em]">
          <GameButton variant="ghost" disabled={pagina === 0} onClick={() => setPagina((p) => Math.max(0, p - 1))}>
            ← Anterior
          </GameButton>
          <span className="text-[.8em] tabular-nums text-menu-muted">{pagina + 1} / {fmt.format(paginas)}</span>
          <GameButton variant="ghost" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>
            Próxima →
          </GameButton>
        </div>
      )}
    </div>
  )
}
