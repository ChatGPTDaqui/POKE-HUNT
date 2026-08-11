// Mercado entre jogadores — abas Comprar, Vender, Anuncios Ativos e Historico.
//
// Dois modelos coexistem aqui, e a tela deixa isso explicito em vez de fingir
// que sao a mesma coisa (ver o cabecalho de server/src/mercado.ts):
//   ITEM  -> livro de ofertas: o jogador escolhe preco e quantidade, e a ordem
//            casa sozinha com o lado oposto.
//   POKE  -> anuncio de preco fixo em Ouro ou Diamante, com filtros de busca.
//
// Nada aqui calcula preco, taxa ou quem recebe o que: o cliente manda
// intencao, o servidor responde com o estado novo. Mesmo contrato do resto do
// jogo sob autoridade.
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowsLeftRight, Coin, Diamond, Gavel, Storefront, Tag, X } from '@phosphor-icons/react'
import {
  servidor, servidorAtivo, ErroServidor,
  type AnuncioMercado, type NegocioMercado, type OrdemMercado, type ResumoItemMercado,
} from '@/data/remote/servidor'
import { aplicarEstadoDoServidor } from '@/data/remote/autoridade'
import { ITEMS, getItem } from '@/data/items'
import { SPECIES, averageIvPercent } from '@/data/pokes'
import { itemIconUrl, itemIconBorderColor, faceIconUrl } from '@/data/sprites'
import { RARITIES, rarityOf, type RarityKey } from '@/data/rarity'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { ItemTooltip } from '@/components/shared/ItemTooltip'
import {
  ComingSoon, GameButton, GameCard, GameCheck, GameInput, GameSelect,
  SectionLabel, SegmentedTabs, StickyHeader,
} from '@/components/game/controls'
import { cn } from '@/lib/utils'

const fmt = new Intl.NumberFormat('pt-BR')
// Vitrine muda com o que os outros fazem, entao o cache e curto — mas nao
// zero: trocar de aba nao pode virar uma rajada de requests.
const STALE_MS = 10000

type Aba = 'comprar' | 'vender' | 'ativos' | 'historico'

const ABAS: { value: Aba; label: string }[] = [
  { value: 'comprar', label: 'Comprar' },
  { value: 'vender', label: 'Vender' },
  { value: 'ativos', label: 'Anúncios Ativos' },
  { value: 'historico', label: 'Histórico' },
]

function toast(mensagem: string, tipo: 'success' | 'error' | 'info' = 'success') {
  useToastStore.getState().pushToast(mensagem, tipo, 'trade')
}

/** Toda mutacao do Mercado segue o mesmo ciclo: manda intencao, sobrescreve o
 *  estado local com a resposta, invalida a vitrine. Centralizado pra nenhuma
 *  acao esquecer um dos tres passos — esquecer o segundo faria o ouro na HUD
 *  ficar defasado ate o proximo flush. */
function useAcaoMercado<T>(fn: (arg: T) => Promise<{ estado?: unknown; mensagem?: string }>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (r.estado) aplicarEstadoDoServidor(r.estado)
      if (r.mensagem) toast(r.mensagem)
      void qc.invalidateQueries({ queryKey: ['mercado'] })
    },
    onError: (erro) => {
      toast(erro instanceof ErroServidor ? erro.message : 'Nao foi possivel falar com o Mercado.', 'error')
    },
  })
}

function IconeItem({ itemId }: { itemId: string }) {
  const url = itemIconUrl(itemId)
  const borda = itemIconBorderColor(itemId)
  if (!url) return null
  return (
    <img
      src={url}
      alt=""
      className="h-[1.9em] w-[1.9em] shrink-0 rounded-[.35em] object-contain"
      style={borda ? { border: `2px solid ${borda}` } : undefined}
    />
  )
}

function Moeda({ valor, tipo }: { valor: number; tipo: 'gold' | 'diamond' }) {
  return (
    <span className={cn('inline-flex items-center gap-[.25em]', tipo === 'gold' ? 'text-gold' : 'text-diamond')}>
      {tipo === 'gold' ? <Coin weight="fill" /> : <Diamond weight="fill" />}
      {fmt.format(valor)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Comprar
// ---------------------------------------------------------------------------

function LivroDoItem({ itemId }: { itemId: string }) {
  const item = getItem(itemId)
  const gold = useGameStateStore((s) => s.wallet.gold)
  const [preco, setPreco] = useState(0)
  const [qtd, setQtd] = useState(1)
  const { data } = useQuery({
    queryKey: ['mercado', 'livro', itemId],
    queryFn: () => servidor.mercadoLivro(itemId),
    staleTime: STALE_MS,
  })
  const criar = useAcaoMercado(servidor.criarOrdem)
  const acao = useAcaoPendente()

  const melhorVenda = data?.vendas[0]?.unitPrice ?? 0
  // O campo nasce no melhor preco disponivel: e o que o jogador quer em 90% dos
  // casos, e ele ainda pode baixar pra deixar a ordem descansando no livro.
  const precoEfetivo = preco > 0 ? preco : melhorVenda
  const custo = precoEfetivo * qtd

  return (
    <div className="flex flex-col gap-[.45em]">
      <div className="grid grid-cols-2 gap-[.45em]">
        <div>
          <SectionLabel>OFERTAS DE VENDA</SectionLabel>
          {(data?.vendas.length ?? 0) === 0 && <p className="text-n500">Ninguem vendendo.</p>}
          {data?.vendas.map((n) => (
            <div key={`v${n.unitPrice}`} className="flex justify-between text-[.85em]">
              <span className="text-gold">{fmt.format(n.unitPrice)}</span>
              <span className="text-n400">x{fmt.format(n.quantity)}</span>
            </div>
          ))}
        </div>
        <div>
          <SectionLabel>PROCURAS</SectionLabel>
          {(data?.compras.length ?? 0) === 0 && <p className="text-n500">Ninguem procurando.</p>}
          {data?.compras.map((n) => (
            <div key={`c${n.unitPrice}`} className="flex justify-between text-[.85em]">
              <span className="text-ok">{fmt.format(n.unitPrice)}</span>
              <span className="text-n400">x{fmt.format(n.quantity)}</span>
            </div>
          ))}
        </div>
      </div>

      <GameCard className="flex flex-wrap items-end gap-[.5em] p-[.6em]">
        <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
          Preco por unidade
          <GameInput
            type="number" min={1} className="w-[7em]"
            value={precoEfetivo || ''} placeholder={String(melhorVenda || 1)}
            onChange={(e) => setPreco(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          />
        </label>
        <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
          Quantidade
          <GameInput
            type="number" min={1} className="w-[6em]" value={qtd}
            onChange={(e) => setQtd(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          />
        </label>
        <div className="flex-1 text-[.8em] text-n400">
          Total: <b className={custo > gold ? 'text-bad' : 'text-gold'}>{fmt.format(custo)}</b>
          <div className="text-[.9em] text-n500">
            {melhorVenda > 0
              ? `Melhor venda agora: ${fmt.format(melhorVenda)}`
              : 'Sem oferta — sua ordem fica no livro esperando.'}
          </div>
        </div>
        <GameButton
          variant="primary"
          disabled={acao.isPending('criar-ordem') || precoEfetivo <= 0 || custo > gold}
          // `useAcaoPendente.run` cobre o round-trip inteiro pra fechar a janela de
          // duplo clique (PH-8, mesmo defeito do PH-13) — `mutateAsync` rejeita no
          // erro (diferente de `mutate`), e o `.catch` aqui e so pra `run` nao
          // propagar unhandled rejection; o toast de erro ja vem do onError de
          // useAcaoMercado.
          onClick={() => void acao.run('criar-ordem', () => criar.mutateAsync({ itemId, side: 'compra', unitPrice: precoEfetivo, quantity: qtd }).catch(() => {}))}
        >
          {acao.isPending('criar-ordem') ? '...' : 'Comprar'}
        </GameButton>
      </GameCard>

      <SectionLabel>ULTIMOS NEGOCIOS</SectionLabel>
      {(data?.negocios.length ?? 0) === 0 && <p className="text-n500">Nenhum negocio ainda.</p>}
      {data?.negocios.map((n) => (
        <div key={n.id} className="flex justify-between text-[.8em] text-n400">
          <span>{item?.name ?? itemId} x{n.quantity}</span>
          <span className="text-gold">{fmt.format(n.unit_price)} / un.</span>
        </div>
      ))}
    </div>
  )
}

function ComprarItens() {
  const [aberto, setAberto] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['mercado', 'itens'],
    queryFn: () => servidor.mercadoItens(),
    staleTime: STALE_MS,
  })

  // SO item com proposta ativa (pedido explicito). Antes a lista trazia os ~30
  // itens do jogo com "sem oferta" na maioria das linhas, e achar o que
  // realmente estava a venda virava garimpo.
  //
  // Nao se perde nada: quem quer ser o PRIMEIRO a anunciar um item usa a aba
  // "Vender", que lista o inventario inteiro. O livro daquele item passa a
  // existir na hora.
  const linhas = useMemo(() => {
    const porId = new Map<string, ResumoItemMercado>((data?.itens ?? []).map((i) => [i.itemId, i]))
    return Object.values(ITEMS)
      .filter((item) => porId.has(item.id))
      .map((item) => ({ item, resumo: porId.get(item.id) ?? null }))
  }, [data])

  if (isLoading) return <p className="text-n500">Carregando o Mercado...</p>

  if (linhas.length === 0) {
    return (
      <GameCard className="flex flex-col items-center gap-[.3em] p-[1em] text-center">
        <Tag className="text-[1.6em] text-n500" />
        <b className="font-medium">Nenhuma proposta existente no momento.</b>
        <span className="text-[.85em] text-n500">
          Ninguém está anunciando itens agora. Use a aba <b>Vender</b> para ser o primeiro.
        </span>
      </GameCard>
    )
  }

  return (
    <div className="flex flex-col gap-[.4em]">
      {linhas.map(({ item, resumo }) => (
        <div key={item.id}>
          <GameCard
            onClick={() => setAberto(aberto === item.id ? null : item.id)}
            className="flex flex-wrap items-center gap-[.5em] p-[.5em]"
          >
            <ItemTooltip item={item}>
              <span className="flex cursor-help items-center gap-[.5em]">
                <IconeItem itemId={item.id} />
                <b className="font-medium">{item.name}</b>
              </span>
            </ItemTooltip>
            <span className="flex-1" />
            {/* A lista so traz item com ordem ativa, mas a ordem pode ser de
                COMPRA — e ai nao ha nada a venda. Dizer "sem oferta" seria
                confuso ao lado de uma linha que so aparece porque tem gente
                querendo comprar: mostra a procura em vez de um vazio. */}
            <span className="text-[.8em] text-n400">
              {resumo?.melhorVenda != null ? (
                <>a partir de <b className="text-gold">{fmt.format(resumo.melhorVenda)}</b> · {fmt.format(resumo.emVenda)} un.</>
              ) : resumo?.melhorCompra != null ? (
                <>procura-se a <b className="text-ok">{fmt.format(resumo.melhorCompra)}</b> · {fmt.format(resumo.emCompra)} un.</>
              ) : (
                <span className="text-n600">sem oferta</span>
              )}
            </span>
          </GameCard>
          {aberto === item.id && (
            <div className="mt-[.4em] rounded-[.6em] border border-n800 p-[.6em]">
              <LivroDoItem itemId={item.id} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Filtro rapido de um toque: botao que liga/desliga (pedido explicito).
 *
 * `GameCheck` nao serve aqui — a caixinha some no meio de uma fileira de
 * filtros e o alvo de toque fica pequeno demais no celular. Aqui o botao
 * INTEIRO e o alvo, e o estado ligado e legivel pela cor.
 */
function FiltroToggle({
  ativo, cor, onClick, children,
}: {
  ativo: boolean
  cor?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        'flex cursor-pointer items-center gap-[.3em] rounded-full border px-[.6em] py-[.25em] text-[.8em] transition-colors',
        ativo ? 'border-current bg-n800 font-medium' : 'border-n700 text-n500 hover:border-n600',
      )}
      style={ativo && cor ? { color: cor } : undefined}
    >
      {children}
    </button>
  )
}

function ComprarPokes() {
  const showProfile = usePokeProfileStore((s) => s.showProfile)
  const [busca, setBusca] = useState('')
  // Tres filtros independentes (pedido explicito). Moeda comeca com as duas
  // ligadas; "Somente Oferta" comeca desligado — ele RESTRINGE, e um filtro
  // restritivo ligado por padrao esconderia a maioria dos anuncios sem o
  // jogador ter pedido.
  const [verGold, setVerGold] = useState(true)
  const [verDiamante, setVerDiamante] = useState(true)
  const [somenteOferta, setSomenteOferta] = useState(false)
  const [lance, setLance] = useState<Record<string, number>>({})
  const [shinyOnly, setShinyOnly] = useState(false)
  const [nivelMin, setNivelMin] = useState(0)
  const [ivMin, setIvMin] = useState(0)
  const [raridades, setRaridades] = useState<Set<RarityKey>>(() => new Set(Object.keys(RARITIES) as RarityKey[]))
  const [ordem, setOrdem] = useState<'preco' | 'nivel' | 'iv'>('preco')

  const { data, isLoading } = useQuery({
    queryKey: ['mercado', 'pokes'],
    queryFn: () => servidor.mercadoPokes(),
    staleTime: STALE_MS,
  })
  const comprar = useAcaoMercado((anuncioId: string) => servidor.comprarAnuncio(anuncioId))
  const ofertar = useAcaoMercado(servidor.ofertar)

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (data?.anuncios ?? [])
      .filter((a) => {
        const species = SPECIES[a.species_id]
        if (!species) return false
        if (termo && !species.name.toLowerCase().includes(termo)) return false
        if (a.currency === 'gold' && !verGold) return false
        if (a.currency === 'diamond' && !verDiamante) return false
        if (somenteOferta && !a.apenas_oferta) return false
        if (shinyOnly && !a.is_shiny) return false
        if (a.level < nivelMin) return false
        if (a.iv_percent < ivMin) return false
        return raridades.has(a.rarity as RarityKey)
      })
      .sort((a, b) => {
        if (ordem === 'nivel') return b.level - a.level
        if (ordem === 'iv') return b.iv_percent - a.iv_percent
        // Anuncio de lance nao tem preco: vai pro fim da ordenacao por preco em
        // vez de virar 0 e fingir ser o mais barato do Mercado.
        return (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER)
      })
  }, [data, busca, verGold, verDiamante, somenteOferta, shinyOnly, nivelMin, ivMin, raridades, ordem])

  if (isLoading) return <p className="text-n500">Carregando anuncios...</p>

  return (
    <div className="flex flex-col gap-[.45em]">
      <div className="flex flex-wrap items-center gap-[.5em]">
        <GameInput
          placeholder="Buscar especie..." value={busca}
          onChange={(e) => setBusca(e.target.value)} className="min-w-[9em] flex-1"
        />
        <GameSelect value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}>
          <option value="preco">Menor preco</option>
          <option value="nivel">Maior nivel</option>
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

      <div className="flex flex-wrap items-center gap-[.5em] text-[.8em] text-n400">
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
        <GameCheck checked={shinyOnly} onChange={setShinyOnly}>Somente Shiny</GameCheck>
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

      {filtrados.length === 0 && <p className="text-n500">Nenhum POKE a venda com esses filtros.</p>}

      {filtrados.map((a) => {
        const species = SPECIES[a.species_id]
        const cor = RARITIES[a.rarity as RarityKey]?.color
        return (
          <GameCard key={a.id} className="flex flex-wrap items-center gap-[.45em] p-[.55em]">
            <img
              src={faceIconUrl(a.species_id, a.is_shiny) ?? undefined}
              alt=""
              className="h-[2.4em] w-[2.4em] shrink-0 rounded-[.4em] object-cover"
              style={cor ? { border: `2px solid ${cor}` } : undefined}
            />
            <div className="min-w-[8em] flex-1">
              <div className="flex flex-wrap items-center gap-[.35em]">
                <b className={cn('font-medium', a.is_shiny && 'text-shiny')}>
                  {a.is_shiny ? '✨ ' : ''}{species?.name ?? a.species_id}
                </b>
                <span className="text-n400">Lv{a.level}</span>
                <span className="text-[.78em]" style={cor ? { color: cor } : undefined}>
                  {RARITIES[a.rarity as RarityKey]?.label ?? a.rarity}
                </span>
              </div>
              <div className="text-[.75em] text-n500">
                IV {a.iv_percent}% · vendedor {a.vendedor}
                {a.apenas_oferta && ` · ${a.ofertas ?? 0} oferta(s)`}
              </div>
            </div>
            {a.apenas_oferta ? (
              <>
                <span className="flex flex-col text-[.78em] text-n400">
                  <span className="flex items-center gap-[.25em] text-warn">
                    <Gavel weight="fill" /> Somente lance
                  </span>
                  {a.melhorOferta != null && (
                    <span>maior: <Moeda valor={a.melhorOferta} tipo={a.currency} /></span>
                  )}
                </span>
                <GameInput
                  type="number"
                  min={1}
                  className="w-[6.5em]"
                  placeholder="Seu lance"
                  value={lance[a.id] ?? ''}
                  onChange={(e) => setLance((m) => ({ ...m, [a.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                />
                <GameButton
                  variant="primary"
                  disabled={ofertar.isPending || !(lance[a.id] > 0)}
                  onClick={() => ofertar.mutate({ anuncioId: a.id, valor: lance[a.id] })}
                >
                  Ofertar
                </GameButton>
              </>
            ) : (
              <>
                <Moeda valor={a.price ?? 0} tipo={a.currency} />
                <GameButton
                  variant="primary"
                  disabled={comprar.isPending}
                  onClick={() => comprar.mutate(a.id)}
                >
                  Comprar
                </GameButton>
              </>
            )}
            {species && (
              <GameButton variant="ghost" onClick={() => showProfile(anuncioComoPoke(a), species)}>
                Ver
              </GameButton>
            )}
          </GameCard>
        )
      })}
    </div>
  )
}

/**
 * O cartao de perfil espera um POKE completo, e o anuncio so guarda o resumo
 * da vitrine (especie, nivel, raridade, shiny, IV medio).
 *
 * Os atributos exibidos sao entao os da especie NAQUELE nivel — o que e
 * verdade sobre o que esta a venda — mas os IVs individuais nao vem no anuncio,
 * so a media. Preencher os seis com a media seria inventar numero: aqui eles
 * vao zerados e o cartao mostra a media real na linha do anuncio.
 */
function anuncioComoPoke(a: AnuncioMercado) {
  const species = SPECIES[a.species_id]
  const ivs = { hp: 0, atkFis: 0, atkEsp: 0, def: 0, defEsp: 0, speed: 0 }
  return {
    uid: `anuncio-${a.id}`,
    speciesId: a.species_id,
    level: a.level,
    exp: 0,
    hp: species?.base.hp ?? 1,
    isShiny: a.is_shiny,
    rarity: a.rarity as RarityKey,
    ivs,
    stats: { hp: 1, atkFis: 1, atkEsp: 1, def: 1, defEsp: 1, speed: 1 },
    unlockedAbilities: [],
  }
}

// ---------------------------------------------------------------------------
// Vender
// ---------------------------------------------------------------------------

function VenderItens() {
  const items = useGameStateStore((s) => s.items)
  const lockedItems = useGameStateStore((s) => s.lockedItems)
  const [itemId, setItemId] = useState('')
  const [preco, setPreco] = useState(100)
  const [qtd, setQtd] = useState(1)
  const criar = useAcaoMercado(servidor.criarOrdem)
  const acao = useAcaoPendente()

  const disponiveis = Object.keys(items).filter((id) => items[id] > 0 && ITEMS[id] && !lockedItems[id])
  const escolhido = itemId || disponiveis[0] || ''
  const maximo = items[escolhido] ?? 0

  if (disponiveis.length === 0) {
    return <p className="text-n500">Nenhum item destravado na mochila para anunciar.</p>
  }

  return (
    <GameCard className="flex flex-col gap-[.45em] p-[.55em]">
      <SectionLabel>ANUNCIAR ITEM</SectionLabel>
      <div className="flex flex-wrap items-end gap-[.5em]">
        <label className="flex min-w-[10em] flex-1 flex-col gap-[.2em] text-[.78em] text-n400">
          Item
          <GameSelect value={escolhido} onChange={(e) => setItemId(e.target.value)}>
            {disponiveis.map((id) => (
              <option key={id} value={id}>{ITEMS[id].name} (x{items[id]})</option>
            ))}
          </GameSelect>
        </label>
        <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
          Preco/un.
          <GameInput
            type="number" min={1} className="w-[7em]" value={preco}
            onChange={(e) => setPreco(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          />
        </label>
        <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
          Quantidade
          <GameInput
            type="number" min={1} max={maximo} className="w-[6em]" value={Math.min(qtd, maximo)}
            onChange={(e) => setQtd(Math.max(1, Math.min(maximo, Math.floor(Number(e.target.value) || 1))))}
          />
        </label>
      </div>
      <div className="text-[.8em] text-n400">
        Voce recebe ate <b className="text-gold">{fmt.format(preco * Math.min(qtd, maximo))}</b> de ouro.
        Os itens saem da mochila assim que a ordem e criada e voltam se voce cancelar.
      </div>
      <GameButton
        variant="primary"
        disabled={acao.isPending('criar-ordem') || maximo === 0}
        onClick={() => void acao.run('criar-ordem', () => criar.mutateAsync({ itemId: escolhido, side: 'venda', unitPrice: preco, quantity: Math.min(qtd, maximo) }).catch(() => {}))}
      >
        {acao.isPending('criar-ordem') ? '...' : 'Colocar a venda'}
      </GameButton>
    </GameCard>
  )
}

function VenderPokes() {
  const bagPokes = useGameStateStore((s) => s.bagPokes)
  const [uid, setUid] = useState('')
  const [preco, setPreco] = useState(5000)
  const [moeda, setMoeda] = useState<'gold' | 'diamond'>('gold')
  const [apenasOferta, setApenasOferta] = useState(false)
  const anunciar = useAcaoMercado(servidor.anunciarPoke)

  // POKE travado nao aparece: a trava existe justamente pra ele nao sair da
  // mochila por engano, e anunciar e sair da mochila.
  const elegiveis = bagPokes.filter((p) => !p.locked && SPECIES[p.speciesId])
  const escolhido = elegiveis.find((p) => p.uid === uid) ?? elegiveis[0]

  if (elegiveis.length === 0) {
    return <p className="text-n500">Nenhum POKE destravado na mochila para anunciar.</p>
  }

  return (
    <GameCard className="flex flex-col gap-[.45em] p-[.55em]">
      <SectionLabel>ANUNCIAR POKE</SectionLabel>
      <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
        POKE
        <GameSelect value={escolhido?.uid ?? ''} onChange={(e) => setUid(e.target.value)}>
          {elegiveis.map((p) => (
            <option key={p.uid} value={p.uid}>
              {p.isShiny ? '✨ ' : ''}{SPECIES[p.speciesId].name} Lv{p.level} · {rarityOf(p).label} · IV {averageIvPercent(p.ivs).toFixed(0)}%
            </option>
          ))}
        </GameSelect>
      </label>
      <div className="flex flex-wrap items-end gap-[.5em]">
        {/* Em "somente lance" nao existe preco de compra direta — o campo sai da
            tela em vez de ficar desabilitado com um numero que nao vale nada. */}
        {!apenasOferta && (
          <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
            Preco
            <GameInput
              type="number" min={1} className="w-[8em]" value={preco}
              onChange={(e) => setPreco(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
            />
          </label>
        )}
        <label className="flex flex-col gap-[.2em] text-[.78em] text-n400">
          Moeda
          <GameSelect value={moeda} onChange={(e) => setMoeda(e.target.value as typeof moeda)}>
            <option value="gold">Ouro</option>
            <option value="diamond">Diamante</option>
          </GameSelect>
        </label>
        <div className="flex-1 text-[.8em] text-n400">
          O POKE sai da sua mochila enquanto o anuncio estiver de pe.
        </div>
      </div>
      <GameCheck checked={apenasOferta} onChange={setApenasOferta}>
        <span className="inline-flex items-center gap-[.3em]">
          <Gavel /> Somente Lance (sem compra direta)
        </span>
      </GameCheck>
      {apenasOferta && (
        <p className="text-[.78em] text-n500">
          O anúncio sai sem preço: outros jogadores enviam ofertas em {moeda === 'gold' ? 'ouro' : 'diamante'} e
          você aceita ou recusa em <b>Anúncios Ativos</b>. O valor de quem oferta fica retido até você responder.
        </p>
      )}
      <GameButton
        variant="primary"
        disabled={anunciar.isPending || !escolhido}
        onClick={() => escolhido && anunciar.mutate({
          pokeUid: escolhido.uid,
          price: apenasOferta ? null : preco,
          currency: moeda,
          apenasOferta,
        })}
      >
        {anunciar.isPending ? '...' : apenasOferta ? 'Abrir para lances' : 'Colocar a venda'}
      </GameButton>
    </GameCard>
  )
}

// ---------------------------------------------------------------------------
// Anuncios ativos e historico
// ---------------------------------------------------------------------------

function Ativos() {
  const { data, isLoading } = useQuery({
    queryKey: ['mercado', 'meus'],
    queryFn: () => servidor.mercadoMeus(),
    staleTime: STALE_MS,
  })
  const cancelarOrdem = useAcaoMercado((id: string) => servidor.cancelarOrdem(id))
  const cancelarAnuncio = useAcaoMercado((id: string) => servidor.cancelarAnuncio(id))
  const responder = useAcaoMercado(({ id, aceitar }: { id: string; aceitar: boolean }) =>
    servidor.responderOferta(id, aceitar))
  const cancelarOferta = useAcaoMercado((id: string) => servidor.cancelarOferta(id))

  if (isLoading) return <p className="text-n500">Carregando...</p>
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
                  disabled={responder.isPending}
                  onClick={() => responder.mutate({ id: o.id, aceitar: true })}
                >
                  Aceitar
                </GameButton>
                <GameButton
                  variant="ghost"
                  disabled={responder.isPending}
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
              <GameButton variant="danger" disabled={cancelarOferta.isPending} onClick={() => cancelarOferta.mutate(o.id)}>
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
          <GameButton variant="danger" disabled={cancelarOrdem.isPending} onClick={() => cancelarOrdem.mutate(o.id)}>
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
          <GameButton variant="danger" disabled={cancelarAnuncio.isPending} onClick={() => cancelarAnuncio.mutate(a.id)}>
            <X /> Retirar
          </GameButton>
        </GameCard>
      ))}
    </div>
  )
}

function Historico() {
  const { data, isLoading } = useQuery({
    queryKey: ['mercado', 'historico'],
    queryFn: () => servidor.mercadoHistorico(),
    staleTime: STALE_MS,
  })
  if (isLoading) return <p className="text-n500">Carregando...</p>
  const negocios: NegocioMercado[] = data?.negocios ?? []
  if (negocios.length === 0) return <p className="text-n500">Voce ainda nao negociou nada.</p>

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
          <span className="text-[.85em] text-n600">
            {new Date(n.created_at).toLocaleDateString('pt-BR')}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function MercadoMenu() {
  const [aba, setAba] = useState<Aba>('comprar')
  const [tipo, setTipo] = useState<'itens' | 'pokes'>('itens')
  const gold = useGameStateStore((s) => s.wallet.gold)
  const diamonds = useGameStateStore((s) => s.wallet.diamonds)

  if (!servidorAtivo()) {
    return (
      <ComingSoon icon={<Storefront />} title="O Mercado exige o servidor">
        Negociar com outros jogadores depende do servidor de autoridade — ele é quem guarda as ordens, o
        escrow e as entregas. Rodando sem <code>VITE_SERVIDOR_URL</code> não há com quem negociar.
      </ComingSoon>
    )
  }

  return (
    <div className="flex flex-col gap-[.5em]">
      <StickyHeader>
        <div className="flex flex-wrap items-center gap-[.5em]">
          <SegmentedTabs value={aba} onChange={setAba} options={ABAS} />
          <span className="flex items-center gap-[.45em] text-[.85em]">
            <Moeda valor={gold} tipo="gold" />
            <Moeda valor={diamonds} tipo="diamond" />
          </span>
        </div>

        {(aba === 'comprar' || aba === 'vender') && (
          <SegmentedTabs
            value={tipo}
            onChange={setTipo}
            options={[{ value: 'itens', label: 'Itens' }, { value: 'pokes', label: 'Pokémon' }]}
          />
        )}
      </StickyHeader>

      {aba === 'comprar' && (tipo === 'itens' ? <ComprarItens /> : <ComprarPokes />)}
      {aba === 'vender' && (tipo === 'itens' ? <VenderItens /> : <VenderPokes />)}
      {aba === 'ativos' && <Ativos />}
      {aba === 'historico' && <Historico />}

      {aba === 'comprar' && tipo === 'itens' && (
        <p className="flex items-start gap-[.4em] text-[.75em] text-n500">
          <Tag className="mt-[.2em] shrink-0" />
          Itens usam livro de ofertas: sua ordem casa com a melhor do outro lado e você paga o preço de
          quem já estava lá — o troco volta na hora. O que não casar fica esperando.
        </p>
      )}
    </div>
  )
}
