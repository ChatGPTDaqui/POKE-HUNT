import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Tag } from '@phosphor-icons/react'
import * as mercadoRpc from '@/data/remote/mercadoRpc'
import { type ResumoItemMercado } from '@/data/remote/servidor'
import { ITEMS, getItem } from '@/data/items'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { ItemTooltip } from '@/components/shared/ItemTooltip'
import { GameButton, GameCard, GameInput, SectionLabel } from '@/components/game/controls'
import { useAcaoMercado } from '../hooks/useAcaoMercado'
import { fmt, STALE_MS } from '../utils'
import { Carregando, IconeItem } from './shared'
import { HistoricoDePreco } from './HistoricoDePreco'

function LivroDoItem({ itemId }: { itemId: string }) {
  const item = getItem(itemId)
  const gold = useGameStateStore((s) => s.wallet.gold)
  const [preco, setPreco] = useState(0)
  const [qtd, setQtd] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['mercado', 'livro', itemId],
    queryFn: () => mercadoRpc.mercadoLivro(itemId),
    staleTime: STALE_MS,
  })
  const criar = useAcaoMercado(mercadoRpc.criarOrdem)
  const acao = useAcaoPendente()

  const melhorVenda = data?.vendas[0]?.unitPrice ?? 0
  // O campo nasce no melhor preco disponivel: e o que o jogador quer em 90% dos
  // casos, e ele ainda pode baixar pra deixar a ordem descansando no livro.
  const precoEfetivo = preco > 0 ? preco : melhorVenda
  const custo = precoEfetivo * qtd

  // Sai antes de desenhar qualquer coisa porque TUDO aqui depende do livro, e
  // sem essa guarda o painel mentia em quatro lugares ao mesmo tempo enquanto
  // a query estava no ar: "Ninguem vendendo", "Ninguem procurando", "Nenhum
  // negocio ainda" — e, pior que os tres textos, o campo de preco nascia em 0
  // (`melhorVenda` sem dado e 0), que e um numero em que da pra clicar.
  if (isLoading) return <Carregando />

  return (
    <div className="flex flex-col gap-[.45em]">
      <div className="grid grid-cols-2 gap-[.45em]">
        <div>
          <SectionLabel>OFERTAS DE VENDA</SectionLabel>
          {(data?.vendas.length ?? 0) === 0 && <p className="text-n500">Ninguém vendendo.</p>}
          {data?.vendas.map((n) => (
            <div key={`v${n.unitPrice}`} className="flex justify-between text-[.85em]">
              <span className="text-gold">{fmt.format(n.unitPrice)}</span>
              <span className="text-n400">x{fmt.format(n.quantity)}</span>
            </div>
          ))}
        </div>
        <div>
          <SectionLabel>PROCURAS</SectionLabel>
          {(data?.compras.length ?? 0) === 0 && <p className="text-n500">Ninguém procurando.</p>}
          {data?.compras.map((n) => (
            <div key={`c${n.unitPrice}`} className="flex justify-between text-[.85em]">
              <span className="text-ok">{fmt.format(n.unitPrice)}</span>
              <span className="text-n400">x{fmt.format(n.quantity)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ANTES do formulario de propósito (PH-97): o campo de preco nasce no
          melhor preco do livro, que diz o que esta a venda AGORA e nao o que a
          coisa vale. Quem digita um preco antes de ver a mediana de 7 dias
          ancora no primeiro numero que apareceu na tela. */}
      <HistoricoDePreco itemId={itemId} />

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
          carregando={acao.isPending('criar-ordem')}
          disabled={precoEfetivo <= 0 || custo > gold}
          // `useAcaoPendente.run` cobre o round-trip inteiro pra fechar a janela de
          // duplo clique (PH-8, mesmo defeito do PH-13) — `mutateAsync` rejeita no
          // erro (diferente de `mutate`), e o `.catch` aqui e so pra `run` nao
          // propagar unhandled rejection; o toast de erro ja vem do onError de
          // useAcaoMercado.
          onClick={() => void acao.run('criar-ordem', () => criar.mutateAsync({ itemId, side: 'compra', unitPrice: precoEfetivo, quantity: qtd }).catch(() => {}))}
        >
          Comprar
        </GameButton>
      </GameCard>

      <SectionLabel>ÚLTIMOS NEGOCIOS</SectionLabel>
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

export function ComprarItens() {
  const [aberto, setAberto] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['mercado', 'itens'],
    queryFn: () => mercadoRpc.mercadoItens(),
    staleTime: STALE_MS,
  })

  // SO item com proposta ativa (pedido explicito). Antes a lista trazia os ~30
  // itens do jogo com "sem oferta" na maioria das linhas, e achar o que
  // realmente estava a venda virava garimpo.
  //
  // Nao se perde nada: quem quer ser o PRIMEIRO a anunciar um item usa a aba
  // "Vender", que lista o inventario inteiro. O livro daquele item passa a
  // existir na hora.
  // BUSCA NO CLIENTE, e isso e o certo AQUI — o oposto do que o PH-99 fez com a
  // vitrine de POKE.
  //
  // A diferenca e o teto: `mercado_resumo_itens` agrupa por `item_id`, entao ela
  // tem no maximo UMA linha por item que existe no jogo — 19 gerados mais as
  // pedras de evolucao, uns 30 no total. Essa lista nao cresce com o Mercado, e
  // por isso nao pode cair na armadilha das 1000 linhas do PostgREST nem
  // justifica um round-trip por tecla digitada.
  //
  // A vitrine de POKE e o contrario: uma linha por ANUNCIO ativo, sem teto
  // nenhum. La a busca teve que ir pro servidor.
  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const porId = new Map<string, ResumoItemMercado>((data?.itens ?? []).map((i) => [i.itemId, i]))
    return Object.values(ITEMS)
      .filter((item) => porId.has(item.id))
      .filter((item) => !termo || item.name.toLowerCase().includes(termo) || item.id.includes(termo))
      .map((item) => ({ item, resumo: porId.get(item.id) ?? null }))
  }, [data, busca])

  if (isLoading) return <Carregando />

  // Dois vazios diferentes, e confundi-los mandaria o jogador pro lugar errado:
  // "ninguem esta anunciando" pede pra ele ir VENDER; "sua busca nao achou nada"
  // pede pra ele limpar a busca. A distincao e ter termo digitado.
  if (linhas.length === 0 && busca.trim()) {
    return (
      <div className="flex flex-col gap-[.4em]">
        <GameInput
          placeholder="Buscar item..." value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <p className="text-n500">Nenhum item a venda com esse nome.</p>
      </div>
    )
  }

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
      <GameInput
        placeholder="Buscar item..." value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      {linhas.map(({ item, resumo }) => (
        <div key={item.id}>
          <GameCard
            onClick={() => setAberto(aberto === item.id ? null : item.id)}
            className="flex flex-wrap items-center gap-[.5em] p-[.4em]"
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
