import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Coin, Diamond, Gavel } from '@phosphor-icons/react'
import * as mercadoRpc from '@/data/remote/mercadoRpc'
import { type AnuncioMercado } from '@/data/remote/servidor'
import { SPECIES } from '@/data/pokes'
import { faceIconUrl } from '@/data/sprites'
import { RARITIES, type RarityKey } from '@/data/rarity'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { GameButton, GameCard, GameCheck, GameInput, GameSelect } from '@/components/game/controls'
import { cn } from '@/lib/utils'
import { useAcaoMercado } from '../hooks/useAcaoMercado'
import { STALE_MS } from '../utils'
import { Carregando, Moeda } from './shared'

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
  const [ordem, setOrdem] = useState<'preco' | 'nivel' | 'iv'>('preco')

  const { data, isLoading } = useQuery({
    queryKey: ['mercado', 'pokes'],
    queryFn: () => mercadoRpc.mercadoPokes(),
    staleTime: STALE_MS,
  })
  const comprar = useAcaoMercado((anuncioId: string) => mercadoRpc.comprarAnuncio(anuncioId))
  const ofertar = useAcaoMercado(mercadoRpc.ofertar)

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

  if (isLoading) return <Carregando />

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
