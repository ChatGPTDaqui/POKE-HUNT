import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Coin, Diamond, Gavel } from '@phosphor-icons/react'
import * as mercadoRpc from '@/data/remote/mercadoRpc'
import { type AnuncioMercado } from '@/data/remote/servidor'
import { SPECIES } from '@/data/pokes'
import { faceIconUrl } from '@/data/sprites'
import { RARITIES, type RarityKey } from '@/data/rarity'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { GameButton, GameCard, GameCheck, GameInput, GameSelect, Recolhivel } from '@/components/game/controls'
import { cn } from '@/lib/utils'
import { useAcaoMercado } from '../hooks/useAcaoMercado'
import { fmt, STALE_MS } from '../utils'
import { Carregando, Moeda } from './shared'
import { TempoRestante } from './TempoRestante'
import { useSegundosRestantes, proximoLanceMinimo } from '../tempoDeLeilao'

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
  const [ordem, setOrdem] = useState<'preco' | 'nivel' | 'iv' | 'termina'>('preco')

  const { data, isLoading } = useQuery({
    queryKey: ['mercado', 'pokes'],
    queryFn: () => mercadoRpc.mercadoPokes(),
    staleTime: STALE_MS,
  })
  const comprar = useAcaoMercado((anuncioId: string) => mercadoRpc.comprarAnuncio(anuncioId))
  const ofertar = useAcaoMercado(mercadoRpc.ofertar)
  const darLance = useAcaoMercado(mercadoRpc.darLance)

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
        if (ordem === 'termina') {
          // Leilao primeiro, por quem acaba antes; o resto (preco fixo e
          // somente-lance) nao tem prazo e vai pro fim.
          const ta = a.modo === 'leilao' && a.expira_em ? new Date(a.expira_em).getTime() : Number.MAX_SAFE_INTEGER
          const tb = b.modo === 'leilao' && b.expira_em ? new Date(b.expira_em).getTime() : Number.MAX_SAFE_INTEGER
          return ta - tb
        }
        // Anuncio de lance nao tem preco: vai pro fim da ordenacao por preco em
        // vez de virar 0 e fingir ser o mais barato do Mercado.
        const pa = a.price ?? Number.MAX_SAFE_INTEGER
        const pb = b.price ?? Number.MAX_SAFE_INTEGER
        if (pa !== pb) return pa - pb
        // Empate no fim da lista: dois anuncios sem preco. Sem desempate eles
        // sairiam na ordem que o `sort` resolvesse, e o jogador veria a lista
        // de leiloes se reembaralhar a cada refetch de 10s. Quem acaba antes
        // primeiro — e a informacao que importa num leilao.
        const ea = a.modo === 'leilao' && a.expira_em ? new Date(a.expira_em).getTime() : Number.MAX_SAFE_INTEGER
        const eb = b.modo === 'leilao' && b.expira_em ? new Date(b.expira_em).getTime() : Number.MAX_SAFE_INTEGER
        return ea - eb
      })
  }, [data, busca, verGold, verDiamante, somenteOferta, shinyOnly, nivelMin, ivMin, raridades, ordem])

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

  return (
    <div className="flex flex-col gap-[.45em]">
      {/* Quatro fileiras de filtro (busca, moeda, faixa, raridades) somavam
          ~330px antes do primeiro anuncio — mais da metade do painel util no
          celular. Recolhidas, a vitrine comeca no topo. */}
      <Recolhivel titulo="Filtros" resumo={resumo}>
      <div className="flex flex-col gap-[.45em]">
      <div className="flex flex-wrap items-center gap-[.5em]">
        <GameInput
          placeholder="Buscar especie..." value={busca}
          onChange={(e) => setBusca(e.target.value)} className="min-w-[9em] flex-1"
        />
        <GameSelect value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}>
          <option value="preco">Menor preco</option>
          <option value="termina">Leilão terminando</option>
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
      </div>
      </Recolhivel>

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
                IV {a.iv_percent}% · vendedor {a.vendedor}
                {a.apenas_oferta && ` · ${a.ofertas ?? 0} oferta(s)`}
              </div>
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
          </GameCard>
        )
      })}
    </div>
  )
}
