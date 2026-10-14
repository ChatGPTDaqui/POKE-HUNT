// Ranking: Treinadores, Pokemon (por sete criterios) e Hall da Fama.
//
// TUDO vem do servidor. O cliente nao tem como montar isso sozinho — ele so
// enxerga o proprio save, e a RLS (corretamente) nao deixa ler a linha de
// outro jogador. Sem `VITE_SERVIDOR_URL` a tela diz isso em vez de mostrar uma
// lista com um jogador so.
import { useState } from 'react'
import { AvatarDoTreinador } from '@/components/shared/AvatarDoTreinador'
import { Crown, Medal, Sword, UserPlus } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import type { CriterioPoke, EntradaTreinador, EntradaPoke, EntradaHall } from '@/data/remote/servidor'
import * as rankingRpc from '@/data/remote/rankingRpc'
import { usePedirAmizade } from '@/features/social/usePedirAmizade'
import { BotaoConvidarTroca } from '@/features/troca/BotaoConvidarTroca'
import { SPECIES } from '@/data/pokes'
import { faceIconUrl } from '@/data/sprites'
import { rarityOf } from '@/data/rarity'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { SegmentedTabs, GameSelect, SectionLabel, GameButton } from '@/components/game/controls'
import { cn } from '@/lib/utils'
import { entrarNaArena } from '@/features/arena/arena'
import { randomSeed } from '@/core/rng'
import { rankingConquistas, type EntradaRankingConquistas } from '@/data/remote/conquistasRpc'
import { CATALOGO_DE_CONQUISTAS } from '@/data/generated/conquistas.generated'
import { COR_DO_NIVEL_DE_CONQUISTA } from '@/features/conquistas/nivelDeConquista'
import { nivelDaMoldura, resumoDaPlatina } from '@/features/conquistas/resumoDeConquistas'
import { TituloDoTreinador } from '@/features/conquistas/ConquistasDoTreinador'

type Aba = 'treinadores' | 'pokemon' | 'hall' | 'conquistas'

const ABAS: { value: Aba; label: string }[] = [
  { value: 'treinadores', label: 'Treinadores' },
  { value: 'pokemon', label: 'Pokémon' },
  { value: 'hall', label: 'Hall da Fama' },
  { value: 'conquistas', label: 'Conquistas' },
]

const CRITERIOS: { value: CriterioPoke; label: string }[] = [
  { value: 'level', label: 'Nível' },
  { value: 'atkFis', label: 'Dano Físico' },
  { value: 'atkEsp', label: 'Dano Especial' },
  { value: 'hp', label: 'HP' },
  { value: 'def', label: 'Defesa' },
  { value: 'defEsp', label: 'Defesa Especial' },
  { value: 'speed', label: 'Velocidade' },
]

// Consulta de leitura pura: 60s de cache evita que trocar de aba (ou reabrir a
// tela) refaca a chamada a cada clique. Um ranking nao muda de segundo em
// segundo.
const STALE_MS = 60000

export function RankingMenu() {
  const [aba, setAba] = useState<Aba>('treinadores')
  const [criterio, setCriterio] = useState<CriterioPoke>('level')

  return (
    <div className="flex flex-col gap-[.5em]">
      <SegmentedTabs value={aba} onChange={setAba} options={ABAS} />
      {aba === 'treinadores' && <AbaTreinadores />}
      {aba === 'pokemon' && (
        <>
          <label className="flex items-center gap-[.5em] text-[.82em] text-menu-ink">
            Critério
            <GameSelect value={criterio} onChange={(e) => setCriterio(e.target.value as CriterioPoke)}>
              {CRITERIOS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </GameSelect>
          </label>
          <AbaPokemon criterio={criterio} />
        </>
      )}
      {aba === 'hall' && <AbaHall />}
      {aba === 'conquistas' && <AbaConquistas />}
    </div>
  )
}

function Estado({ carregando, erro, vazio, children }: {
  carregando: boolean; erro: unknown; vazio: boolean; children: React.ReactNode
}) {
  if (carregando) return <div className="p-[1em] text-center text-[.85em] text-menu-muted">Carregando…</div>
  if (erro) {
    return (
      <div className="p-[1em] text-center text-[.85em] text-bad">
        {erro instanceof Error ? erro.message : 'não foi possível carregar o ranking'}
      </div>
    )
  }
  if (vazio) return <div className="p-[1em] text-center text-[.85em] text-menu-muted">Ninguém por aqui ainda.</div>
  return <>{children}</>
}

function Posicao({ n }: { n: number }) {
  // Ouro/prata/bronze nos tres primeiros; o resto e so o numero.
  const cor = n === 1 ? 'text-gold' : n === 2 ? 'text-menu-ink' : n === 3 ? 'text-[#c07a3e]' : 'text-menu-muted'
  return <span className={cn('w-[2.2em] shrink-0 text-right font-mono text-[.9em] font-bold', cor)}>#{n}</span>
}

function Linha({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const classe = 'journey-ranking-row flex w-full items-center gap-[.45em] rounded-[.45em] border border-menu-line px-[.6em] py-[.4em] text-left'
  // `<button>` e nao um `<div onClick>`: a linha vira foco de teclado e
  // anuncia como acionavel, sem nenhum handler extra.
  if (!onClick) return <div className={classe}>{children}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(classe, 'cursor-pointer bg-transparent font-[inherit] text-[inherit] hover:border-menu-line hover:bg-menu-card')}
    >
      {children}
    </button>
  )
}

/**
 * Icone de pedir amizade no fim de uma linha do ranking (PH-214).
 *
 * Icone, e nao botao com texto: o ranking e uma LISTA pra ler, e um "Adicionar
 * amigo" escrito em cada linha competiria com o nome e o nivel, que sao o
 * conteudo. A regra e a resposta vem toda de `usePedirAmizade` — ver o cabecalho
 * daquele arquivo pra por que nada disso mora no cliente.
 */
function BotaoAdicionarAmigo({ nick }: { nick: string }) {
  const { pedir, enviando, souEu } = usePedirAmizade()
  if (souEu(nick)) return null
  return (
    <button
      type="button"
      aria-label={`Adicionar ${nick} como amigo`}
      title={`Adicionar ${nick} como amigo`}
      disabled={enviando}
      onClick={() => pedir(nick)}
      className="shrink-0 rounded-[.35em] p-[.25em] text-menu-muted transition-colors hover:bg-menu-wash hover:text-menu-ink disabled:opacity-40"
    >
      <UserPlus className="text-[1.05em]" />
    </button>
  )
}

function AbaTreinadores() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['ranking', 'treinadores'],
    queryFn: () => rankingRpc.rankingTreinadores(),
    staleTime: STALE_MS,
  })
  const entradas: EntradaTreinador[] = data?.entradas ?? []

  return (
    <Estado carregando={isLoading} erro={error} vazio={entradas.length === 0}>
      <div className="flex flex-col gap-[.3em]">
        {entradas.map((e, i) => (
          <Linha key={e.userId}>
            <Posicao n={i + 1} />
            <Crown className={cn('shrink-0 text-[1.1em]', i === 0 ? 'text-gold' : 'text-menu-muted')} />
            <AvatarDoTreinador userId={e.userId} tamanho={1.6} />
            <span className="journey-ranking-name min-w-0 flex-1 truncate">{e.nome}</span>
            <span className="shrink-0 text-[.85em] text-menu-ink">Lv {e.nivel}</span>
            <span className="shrink-0 font-mono text-[.75em] text-menu-muted">{e.exp.toLocaleString('pt-BR')} XP</span>
            {/* Ultimo da linha, e um icone: o ranking e uma LISTA pra ler, e um
                botao com texto em cada linha competiria com o nome e o nivel,
                que sao o conteudo. `Linha` sem `onClick` continua sendo `div`,
                entao nao ha botao dentro de botao. */}
            <BotaoAdicionarAmigo nick={e.nome} />
            <BotaoConvidarTroca userId={e.userId} />
          </Linha>
        ))}
      </div>
    </Estado>
  )
}

function AbaPokemon({ criterio }: { criterio: CriterioPoke }) {
  // Mesma janela de perfil de Equipe/Mochila/Loja/Pokedex — o POKE de outro
  // jogador abre exatamente o mesmo cartao, e por isso o campo "Treinador
  // original" dentro dele responde de quem ele e.
  const showProfile = usePokeProfileStore((s) => s.showProfile)
  const meuTime = useGameStateStore((s) => s.team)
  const activeIndex = useGameStateStore((s) => s.activeIndex)
  const { data, isLoading, error } = useQuery({
    queryKey: ['ranking', 'pokemon', criterio],
    queryFn: () => rankingRpc.rankingPokemon(criterio),
    staleTime: STALE_MS,
  })
  const entradas: EntradaPoke[] = data?.entradas ?? []

  return (
    <>
      <Estado carregando={isLoading} erro={error} vazio={entradas.length === 0}>
        <div className="flex flex-col gap-[.3em]">
          {entradas.map((e, i) => {
            const species = SPECIES[e.poke.speciesId]
            const url = faceIconUrl(e.poke.speciesId, e.poke.isShiny)
            const raridade = rarityOf(e.poke)
            const abrivel = Boolean(species)
            return (
              <Linha key={e.poke.uid}>
                <Posicao n={i + 1} />
                {url && (
                  <img
                    src={url}
                    alt=""
                    className="h-[1.8em] w-[1.8em] shrink-0 rounded-[.25em] border-2 object-cover"
                    style={{ borderColor: raridade.color }}
                  />
                )}
                <button
                  type="button"
                  disabled={!abrivel}
                  onClick={() => { if (species) showProfile(e.poke, species) }}
                  className="min-w-0 flex-1 cursor-pointer truncate bg-transparent p-0 text-left font-[inherit] text-[inherit] disabled:cursor-default"
                >
                  {e.poke.isShiny && <span className="text-shiny">✨ </span>}
                  {species?.name ?? e.poke.speciesId}
                  <span className="text-menu-muted"> · {e.treinadorOriginal ?? e.treinador}</span>
                </button>
                <span className="shrink-0 text-[.75em] text-menu-muted">Lv {e.poke.level}</span>
                <span className="shrink-0 font-mono text-[.9em] font-bold">{e.valor}</span>
                <GameButton
                  variant="ghost"
                  disabled={meuTime.length === 0}
                  title={meuTime.length === 0 ? 'Monte uma equipe antes de duelar' : `Duelar contra ${species?.name ?? e.poke.speciesId}`}
                  onClick={() => {
                    const meuPoke = meuTime[activeIndex] ?? meuTime[0]
                    if (!meuPoke) return
                    // Duelo local, sem stakes: arena com semente sorteada, sem veredito de servidor.
                    entrarNaArena({ semente: randomSeed(), meuTime: [meuPoke], rivalTime: [e.poke], nomeDoRival: e.treinador, rivalId: e.userId, veredito: null })
                  }}
                >
                  <Sword /> PvP
                </GameButton>
              </Linha>
            )
          })}
        </div>
      </Estado>
    </>
  )
}

function AbaHall() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['ranking', 'hall'],
    queryFn: () => rankingRpc.hallDaFama(),
    staleTime: STALE_MS,
  })
  const entradas: EntradaHall[] = data?.entradas ?? []

  return (
    <div className="flex flex-col gap-[.5em]">
      <SectionLabel>Primeiros a derrotar o Campeão Lance</SectionLabel>
      <Estado carregando={isLoading} erro={error} vazio={entradas.length === 0}>
        <div className="flex flex-col gap-[.3em]">
          {entradas.map((e, i) => (
            <Linha key={e.userId}>
              <Posicao n={i + 1} />
              <Medal className={cn('shrink-0 text-[1.1em]', i === 0 ? 'text-gold' : 'text-menu-muted')} />
              <AvatarDoTreinador userId={e.userId} tamanho={1.6} />
              <span className="min-w-0 flex-1 truncate">{e.nome}</span>
              <span className="shrink-0 text-[.75em] text-menu-muted">
                {new Date(e.conquistadoEm).toLocaleDateString('pt-BR')}
              </span>
            </Linha>
          ))}
        </div>
      </Estado>
    </div>
  )
}

// Total da platina (bronze/prata/ouro): o mesmo para todo mundo, sai do catalogo.
const TOTAL_DA_PLATINA = resumoDaPlatina(CATALOGO_DE_CONQUISTAS, {}).total

function AbaConquistas() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['ranking', 'conquistas'],
    queryFn: () => rankingConquistas(),
    staleTime: STALE_MS,
  })
  const entradas: EntradaRankingConquistas[] = data ?? []

  return (
    <Estado carregando={isLoading} erro={error} vazio={entradas.length === 0}>
      <div className="flex flex-col gap-[.3em]">
        {entradas.map((e, i) => {
          const moldura = nivelDaMoldura(e.feitas, TOTAL_DA_PLATINA, e.platinado)
          const cor = moldura ? COR_DO_NIVEL_DE_CONQUISTA[moldura] : undefined
          return (
            <Linha key={e.userId}>
              <Posicao n={i + 1} />
              <span
                className={cn('shrink-0 rounded-full', cor ? 'border-2' : 'border border-transparent')}
                style={cor ? { borderColor: cor } : undefined}
              >
                <AvatarDoTreinador userId={e.userId} tamanho={1.6} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="journey-ranking-name truncate">{e.nome}</span>
                <TituloDoTreinador id={e.titulo} className="truncate text-[.68em]" />
              </span>
              <span className="shrink-0 text-[.75em] text-menu-muted tabular-nums">{e.feitas}/{TOTAL_DA_PLATINA}</span>
              <span className="shrink-0 font-mono text-[.85em] font-bold tabular-nums">{e.pontos.toLocaleString('pt-BR')} pts</span>
            </Linha>
          )
        })}
      </div>
    </Estado>
  )
}
