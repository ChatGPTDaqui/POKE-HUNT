// Ranking: Treinadores, Pokemon (por sete criterios) e Hall da Fama.
//
// TUDO vem do servidor. O cliente nao tem como montar isso sozinho — ele so
// enxerga o proprio save, e a RLS (corretamente) nao deixa ler a linha de
// outro jogador. Sem `VITE_SERVIDOR_URL` a tela diz isso em vez de mostrar uma
// lista com um jogador so.
import { useState } from 'react'
import { Trophy, Crown, Medal } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import {
  servidor, servidorAtivo,
  type CriterioPoke, type EntradaTreinador, type EntradaPoke, type EntradaHall,
} from '@/data/remote/servidor'
import { SPECIES } from '@/data/pokes'
import { faceIconUrl } from '@/data/sprites'
import { rarityOf } from '@/data/rarity'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { SegmentedTabs, GameSelect, SectionLabel, ComingSoon } from '@/components/game/controls'
import { cn } from '@/lib/utils'

type Aba = 'treinadores' | 'pokemon' | 'hall'

const ABAS: { value: Aba; label: string }[] = [
  { value: 'treinadores', label: 'Treinadores' },
  { value: 'pokemon', label: 'Pokémon' },
  { value: 'hall', label: 'Hall da Fama' },
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

  if (!servidorAtivo()) {
    return (
      <ComingSoon icon={<Trophy />} title="Ranking exige o servidor">
        O ranking compara o progresso de todos os jogadores, e só o servidor de autoridade enxerga isso —
        o navegador só tem acesso ao próprio save. Rodando sem <code>VITE_SERVIDOR_URL</code>, não há o
        que comparar.
      </ComingSoon>
    )
  }

  return (
    <div className="flex flex-col gap-[.7em]">
      <SegmentedTabs value={aba} onChange={setAba} options={ABAS} />
      {aba === 'treinadores' && <AbaTreinadores />}
      {aba === 'pokemon' && (
        <>
          <label className="flex items-center gap-[.5em] text-[.82em] text-n300">
            Critério
            <GameSelect value={criterio} onChange={(e) => setCriterio(e.target.value as CriterioPoke)}>
              {CRITERIOS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </GameSelect>
          </label>
          <AbaPokemon criterio={criterio} />
        </>
      )}
      {aba === 'hall' && <AbaHall />}
    </div>
  )
}

function Estado({ carregando, erro, vazio, children }: {
  carregando: boolean; erro: unknown; vazio: boolean; children: React.ReactNode
}) {
  if (carregando) return <div className="p-[1.5em] text-center text-[.85em] text-n400">Carregando…</div>
  if (erro) {
    return (
      <div className="p-[1.5em] text-center text-[.85em] text-bad">
        {erro instanceof Error ? erro.message : 'nao foi possivel carregar o ranking'}
      </div>
    )
  }
  if (vazio) return <div className="p-[1.5em] text-center text-[.85em] text-n400">Ninguém por aqui ainda.</div>
  return <>{children}</>
}

function Posicao({ n }: { n: number }) {
  // Ouro/prata/bronze nos tres primeiros; o resto e so o numero.
  const cor = n === 1 ? 'text-gold' : n === 2 ? 'text-n200' : n === 3 ? 'text-[#c07a3e]' : 'text-n400'
  return <span className={cn('w-[2.2em] shrink-0 text-right font-mono text-[.9em] font-bold', cor)}>#{n}</span>
}

function Linha({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const classe = 'flex w-full items-center gap-[.6em] rounded-[.45em] border border-n800 px-[.6em] py-[.4em] text-left'
  // `<button>` e nao um `<div onClick>`: a linha vira foco de teclado e
  // anuncia como acionavel, sem nenhum handler extra.
  if (!onClick) return <div className={classe}>{children}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(classe, 'cursor-pointer bg-transparent font-[inherit] text-[inherit] hover:border-n600 hover:bg-n900')}
    >
      {children}
    </button>
  )
}

function AbaTreinadores() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['ranking', 'treinadores'],
    queryFn: () => servidor.rankingTreinadores(),
    staleTime: STALE_MS,
  })
  const entradas: EntradaTreinador[] = data?.entradas ?? []

  return (
    <Estado carregando={isLoading} erro={error} vazio={entradas.length === 0}>
      <div className="flex flex-col gap-[.3em]">
        {entradas.map((e, i) => (
          <Linha key={e.userId}>
            <Posicao n={i + 1} />
            <Crown className={cn('shrink-0 text-[1.1em]', i === 0 ? 'text-gold' : 'text-n600')} />
            <span className="min-w-0 flex-1 truncate">{e.nome}</span>
            <span className="shrink-0 text-[.85em] text-n300">Lv {e.nivel}</span>
            <span className="shrink-0 font-mono text-[.75em] text-n500">{e.exp.toLocaleString('pt-BR')} XP</span>
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
  const { data, isLoading, error } = useQuery({
    queryKey: ['ranking', 'pokemon', criterio],
    queryFn: () => servidor.rankingPokemon(criterio),
    staleTime: STALE_MS,
  })
  const entradas: EntradaPoke[] = data?.entradas ?? []

  return (
    <Estado carregando={isLoading} erro={error} vazio={entradas.length === 0}>
      <div className="flex flex-col gap-[.3em]">
        {entradas.map((e, i) => {
          const species = SPECIES[e.poke.speciesId]
          const url = faceIconUrl(e.poke.speciesId, e.poke.isShiny)
          const raridade = rarityOf(e.poke)
          // Uma especie desconhecida (renomeada/removida num sync depois do
          // POKE ter sido criado) ainda aparece na lista, mas nao abre o
          // perfil: o cartao inteiro e montado a partir de `species`.
          const abrivel = Boolean(species)
          return (
            <Linha
              key={e.poke.uid}
              onClick={abrivel ? () => showProfile(e.poke, species) : undefined}
            >
              <Posicao n={i + 1} />
              {url && (
                <img
                  src={url}
                  alt=""
                  className="h-[1.8em] w-[1.8em] shrink-0 rounded-[.25em] border-2 object-cover"
                  style={{ borderColor: raridade.color }}
                />
              )}
              <span className="min-w-0 flex-1 truncate">
                {e.poke.isShiny && <span className="text-shiny">✨ </span>}
                {species?.name ?? e.poke.speciesId}
                <span className="text-n500"> · {e.treinadorOriginal ?? e.treinador}</span>
              </span>
              <span className="shrink-0 text-[.75em] text-n500">Lv {e.poke.level}</span>
              <span className="shrink-0 font-mono text-[.9em] font-bold">{e.valor}</span>
            </Linha>
          )
        })}
      </div>
    </Estado>
  )
}

function AbaHall() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['ranking', 'hall'],
    queryFn: () => servidor.hallDaFama(),
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
              <Medal className={cn('shrink-0 text-[1.1em]', i === 0 ? 'text-gold' : 'text-n600')} />
              <span className="min-w-0 flex-1 truncate">{e.nome}</span>
              <span className="shrink-0 text-[.75em] text-n500">
                {new Date(e.conquistadoEm).toLocaleDateString('pt-BR')}
              </span>
            </Linha>
          ))}
        </div>
      </Estado>
    </div>
  )
}
