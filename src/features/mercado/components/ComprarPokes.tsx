import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookmarkSimple, ChatCircleDots, Coin, Diamond, Gavel } from '@phosphor-icons/react'
import * as mercadoRpc from '@/data/remote/mercadoRpc'
import { type AnuncioMercado } from '@/data/remote/servidor'
import { SPECIES } from '@/data/pokes'
import { faceIconUrl } from '@/data/sprites'
import { RARITIES, type RarityKey } from '@/data/rarity'
import { useUiStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { GameButton, GameCard, GameCheck, GameInput, GameSelect, Recolhivel } from '@/components/game/controls'
import { cn } from '@/lib/utils'
import { useAcaoMercado } from '../hooks/useAcaoMercado'
import { anuncioParaConversa, fmt, STALE_MS } from '../utils'
import { Carregando, Moeda } from './shared'
import { TempoRestante } from './TempoRestante'
import { useSegundosRestantes, proximoLanceMinimo } from '../tempoDeLeilao'
import { HistoricoDePreco } from './HistoricoDePreco'
import { faixaDaPagina } from '../paginacao'

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
  children: ReactNode
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

/**
 * Anuncios por pagina.
 *
 * 25 e o meio-termo medido no painel: no celular (~470px uteis) cabem 5 ou 6
 * cartoes na tela, entao 25 e uma rolagem curta; e a consulta pagina traz uma
 * fracao do que a vitrine inteira trazia. Numero muito menor multiplicaria os
 * cliques de paginacao e, com eles, as requisicoes.
 */
const POR_PAGINA = 25

/**
 * A linha de um LEILAO na vitrine (PH-101).
 *
 * Separada num componente proprio porque ela e a unica da lista que precisa de
 * um relogio: `useSegundosRestantes` assina o tique de 1s, e um hook nao pode
 * ficar dentro do `.map` do cartao (a ordem de hooks mudaria a cada filtro
 * aplicado, que e exatamente o que o React proibe).
 */
function LinhaDeLeilao({
  anuncio, valor, onValor, onLance, pendente,
}: {
  anuncio: AnuncioMercado
  valor: number | undefined
  onValor: (v: number) => void
  onLance: (valor: number) => void
  pendente: boolean
}) {
  const segundos = useSegundosRestantes(anuncio.expira_em)
  // Ja venceu e o cron ainda nao passou: o servidor recusa lance depois de
  // `expira_em`, entao a tela desabilita em vez de deixar o jogador tentar e
  // levar um erro.
  const encerrado = segundos != null && segundos <= 0

  // O minimo do PROXIMO lance sai da mesma regra que o servidor aplica: sem
  // lance ainda e o piso do leilao, com lance e o maior + o incremento.
  const minimo = proximoLanceMinimo(anuncio.melhorOferta, anuncio.lance_minimo, anuncio.incremento_minimo)

  return (
    <>
      <span className="flex flex-col text-[.78em] text-n400">
        <span className="flex items-center gap-[.25em] text-warn">
          <Gavel weight="fill" /> Leilão · <TempoRestante expiraEm={anuncio.expira_em} />
        </span>
        <span>
          {anuncio.melhorOferta != null
            ? <>maior: <Moeda valor={anuncio.melhorOferta} tipo={anuncio.currency} /></>
            : <>sem lance ainda</>}
          {' · '}mínimo {fmt.format(minimo)}
        </span>
      </span>
      <GameInput
        type="number"
        min={minimo}
        className="w-[6.5em]"
        // O campo nasce VAZIO com o mínimo no placeholder, e não preenchido com
        // ele: um valor já digitado num campo de lance convida a clicar sem ler,
        // e aqui clicar sem ler tira ouro do bolso na hora.
        placeholder={String(minimo)}
        disabled={encerrado}
        value={valor ?? ''}
        onChange={(e) => onValor(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      />
      <GameButton
        variant="primary"
        carregando={pendente}
        disabled={encerrado || !(valor != null && valor >= minimo)}
        onClick={() => valor != null && onLance(valor)}
      >
        {encerrado ? 'Encerrado' : 'Dar lance'}
      </GameButton>
    </>
  )
}

export function ComprarPokes() {
  const abrirPerfilPublico = useUiStore((s) => s.abrirPerfilPublico)
  const abrirSocialCom = useUiStore((s) => s.abrirSocialCom)
  const meuId = useAuthStore((s) => s.user?.id ?? null)
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
  const [ordem, setOrdem] = useState<'preco' | 'recente' | 'nivel' | 'iv' | 'termina'>('preco')
  // Um anuncio com o historico aberto por vez — ver a nota no botao "Preco".
  const [precoAberto, setPrecoAberto] = useState<string | null>(null)
  const [pagina, setPagina] = useState(0)

  // Filtro do SERVIDOR (PH-99). Montado num `useMemo` porque ele e a
  // `queryKey`: sem isso um objeto novo a cada render invalidaria o cache em
  // todo re-render e a vitrine viraria uma rajada de requests.
  const filtro = useMemo((): mercadoRpc.FiltroDaVitrine => ({
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
    queryKey: ['mercado', 'pokes', filtro],
    queryFn: () => mercadoRpc.mercadoPokes(filtro),
    staleTime: STALE_MS,
    // Segura a pagina anterior enquanto a nova carrega, em vez de piscar o
    // estado de carregamento e a lista sumir a cada clique de paginacao.
    placeholderData: (anterior) => anterior,
  })
  const comprar = useAcaoMercado((anuncioId: string) => mercadoRpc.comprarAnuncio(anuncioId))
  const ofertar = useAcaoMercado(mercadoRpc.ofertar)
  const darLance = useAcaoMercado(mercadoRpc.darLance)

  // A lista chega da pagina JA filtrada e ordenada pelo servidor (PH-99). O
  // unico descarte que sobra aqui e a especie que o cliente nao conhece —
  // anuncio de POKE renomeado num sync posterior, que nao tem como desenhar.
  //
  // Filtrar isso no servidor exigiria ele saber qual catalogo ESTE cliente tem,
  // e as duas pontas divergem por deploy. Ele fica de fora do total tambem: o
  // contador vem do `count` do banco, entao ele conta o anuncio que a tela
  // descartou. Preferi um total honesto ("34 anuncios") com uma linha faltando
  // a um total que muda de acordo com a versao do navegador.
  //
  // A ordenacao por prazo de leilao (PH-101) tambem desceu pro servidor: o
  // `.sort()` que ficava aqui so via a PAGINA, e ordenar 25 de 300 anuncios
  // daria uma lista que parece ordenada e nao esta.
  const filtrados = useMemo(
    () => (data?.anuncios ?? []).filter((a) => SPECIES[a.species_id]),
    [data],
  )

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
          <option value="recente">Mais recente</option>
          <option value="termina">Leilão terminando</option>
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

      {/* O TOTAL vem do `count` do banco, e nao de `data.length` (PH-99): acima
          de 1000 linhas o `.length` do PostgREST corta e nao avisa, e a vitrine
          pararia de mostrar anuncio parecendo que o Mercado esta vazio. */}
      {total > 0 && (
        <div className="flex items-center justify-between text-[.78em] text-n500">
          <span>
            {inicio}–{fim} de {fmt.format(total)}
          </span>
          {paginas > 1 && <span>página {pagina + 1} de {fmt.format(paginas)}</span>}
        </div>
      )}

      {filtrados.length === 0 && <p className="text-n500">Nenhum POKE a venda com esses filtros.</p>}

      {filtrados.map((a) => {
        const species = SPECIES[a.species_id]
        const cor = RARITIES[a.rarity as RarityKey]?.color
        return (
          <GameCard key={a.id} className="flex flex-wrap items-center gap-[.45em] p-[.4em]">
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
                IV {a.iv_percent}% · vendedor{' '}
                {/* PH-119: o nome do vendedor era texto morto. Vira o caminho
                    pro perfil dele, e de lá pra conversa — negociar preço era
                    o pedido, e antes exigia achar o sujeito no Painel de
                    Amigos, que só lista quem já é amigo.

                    O PRÓPRIO anúncio fica sem link: a vitrine NÃO esconde o que
                    você mesmo anunciou, e o caminho terminaria num botão
                    "Conversar" que o servidor recusa com "Voce nao pode mandar
                    mensagem pra si mesmo" — erro depois do clique, para uma
                    situação que dava pra não oferecer. */}
                {a.seller_id === meuId ? (
                  <span className="text-n400">{a.vendedor} (você)</span>
                ) : (
                  <>
                    <button
                      type="button"
                      className="underline decoration-dotted underline-offset-2 transition-colors hover:text-n200"
                      onClick={() => abrirPerfilPublico({ userId: a.seller_id, nome: a.vendedor ?? '?' })}
                    >
                      {a.vendedor}
                    </button>
                    {/* PH-435: negociar direto, sem passar pelo perfil.
                        O caminho do PH-119 tinha três telas (vitrine → perfil →
                        conversa) e perdia o anúncio na primeira: o vendedor
                        recebia "aceita 1.8M?" sem saber de qual POKE se tratava.
                        Aqui o anúncio vai junto e vira card no fio dos dois. */}
                    {' · '}
                    <button
                      type="button"
                      aria-label={`Negociar ${SPECIES[a.species_id]?.name ?? a.species_id} com ${a.vendedor ?? 'o vendedor'}`}
                      className="inline-flex items-center gap-[.2em] text-primary underline decoration-dotted underline-offset-2 transition-colors hover:text-n200"
                      onClick={() => abrirSocialCom({
                        userId: a.seller_id,
                        nick: a.vendedor ?? '?',
                        anuncio: anuncioParaConversa(a),
                      })}
                    >
                      <ChatCircleDots aria-hidden /> negociar
                    </button>
                  </>
                )}
                {a.apenas_oferta && ` · ${a.ofertas ?? 0} oferta(s)`}
              </div>
              {/* PH-437: este anuncio esta na vitrine DELE e de mais ninguem.
                  Sem dizer isso, o comprador ve um preco que nao existe pra
                  outros jogadores e nao tem como saber que ele foi combinado
                  nem que ninguem vai passar na frente. */}
              {a.reservado_para && a.reservado_para === meuId && (
                <span className="mt-[.15em] flex w-fit items-center gap-[.2em] rounded-full bg-primary/15 px-[.4em] text-[.72em] text-primary">
                  <BookmarkSimple aria-hidden weight="fill" /> reservado para você
                </span>
              )}
            </div>
            {a.modo === 'leilao' ? (
              <LinhaDeLeilao
                anuncio={a}
                valor={lance[a.id]}
                onValor={(v) => setLance((m) => ({ ...m, [a.id]: v }))}
                onLance={(valor) => darLance.mutate({ anuncioId: a.id, valor })}
                pendente={darLance.isPending}
              />
            ) : a.apenas_oferta ? (
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
                  carregando={ofertar.isPending}
                  disabled={!(lance[a.id] > 0)}
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
                  carregando={comprar.isPending}
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
            {/* Historico SOB DEMANDA e UM POR VEZ (PH-97).

                A issue pedia o grafico "no cartão do anúncio", mas montar um por
                linha seriam DUAS leituras por anuncio numa vitrine que pode ter
                centenas — o mesmo tipo de custo que o PH-65 existiu pra cortar
                (dois polls de badge gastando 90 requisicoes por hora por aba).

                Um por vez, e nao um conjunto de abertos: comparar duas especies
                lado a lado nao e o que se faz aqui (a vitrine e uma lista de
                anuncios individuais), e o teto de uma leitura ativa e o que
                garante que abrir 40 cartoes nao vire 80 requests. */}
            <GameButton
              variant="ghost"
              onClick={() => setPrecoAberto((atual) => (atual === a.id ? null : a.id))}
            >
              {precoAberto === a.id ? 'Fechar preço' : 'Preço'}
            </GameButton>
            {precoAberto === a.id && (
              <div className="w-full border-t border-n700 pt-[.4em]">
                <HistoricoDePreco speciesId={a.species_id} currency={a.currency} />
              </div>
            )}
          </GameCard>
        )
      })}

      {/* Paginacao no FIM da lista, e nao no topo: e onde o dedo esta depois de
          rolar os 25 cartoes. Só aparece quando ha mais de uma pagina — dois
          botoes desabilitados em cima de uma vitrine de 3 anuncios sao ruido. */}
      {paginas > 1 && (
        <div className="flex items-center justify-center gap-[.5em] pt-[.3em]">
          <GameButton
            variant="ghost"
            disabled={pagina === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
          >
            ← Anterior
          </GameButton>
          <span className="text-[.8em] tabular-nums text-n400">
            {pagina + 1} / {fmt.format(paginas)}
          </span>
          <GameButton
            variant="ghost"
            disabled={pagina + 1 >= paginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima →
          </GameButton>
        </div>
      )}
    </div>
  )
}
