// Perfil do Treinador — abre clicando na foto, no card do topo direito.
//
// Regra que vale a pena registrar: TUDO aqui e dado real. Rank, total de
// jogadores, tempo de jogo e a data do Hall da Fama vem do servidor
// (`/perfil`); o resto sai do save. Os dois blocos que o pedido descreve mas
// que ainda nao tem sistema por tras — "Outfit" (skins) e "Especialidades" —
// ficam com o layout pronto e um aviso honesto, e nao com numero inventado.
// Barra que nunca anda e botao que nao faz nada lem como bug, nao como
// recurso futuro (mesma decisao ja tomada em Tasks/Correio/Mercado).
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { User, Coins, Diamond, Trophy, Sword, Clock, BookOpen, Sparkle, TShirt, Star } from '@phosphor-icons/react'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useUiStore } from '@/stores/uiStore'
import { perfil } from '@/data/remote/rankingRpc'
import { trainerExpProgress } from '@/engine/systems/progressionSystem'
import { SPECIES } from '@/data/pokes'
import { faceIconUrl } from '@/data/sprites'
import { rarityOf } from '@/data/rarity'
import { GameWindow } from '@/components/game/GameWindow'
import { GameButton, GameCard, Meter, SectionLabel, SegmentedTabs } from '@/components/game/controls'
import { cn } from '@/lib/utils'

const TOTAL_ESPECIES = Object.keys(SPECIES).length
const CAPTURAS_NO_LOG = 12

type Aba = 'resumo' | 'capturas' | 'especialidades'

const ABAS: { value: Aba; label: string }[] = [
  { value: 'resumo', label: 'Resumo' },
  { value: 'capturas', label: 'Capturas' },
  { value: 'especialidades', label: 'Especialidades' },
]

function formatarDuracao(segundos: number): string {
  if (segundos < 60) return `${Math.floor(segundos)}s`
  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return `${minutos}min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `${horas}h ${minutos % 60}min`
  return `${Math.floor(horas / 24)}d ${horas % 24}h`
}

export function PerfilTreinador() {
  const aberto = useUiStore((s) => s.perfilOpen)
  const setAberto = useUiStore((s) => s.setPerfilOpen)
  const [aba, setAba] = useState<Aba>('resumo')

  const trainer = useGameStateStore((s) => s.trainer)
  const wallet = useGameStateStore((s) => s.wallet)
  const pokedexKills = useGameStateStore((s) => s.pokedexKills)
  const team = useGameStateStore((s) => s.team)
  const bagPokes = useGameStateStore((s) => s.bagPokes)

  // So consulta o servidor com o modal aberto: rank e tempo de jogo nao
  // interessam a ninguem enquanto ele esta fechado.
  const { data: remoto } = useQuery({
    queryKey: ['perfil'],
    queryFn: () => perfil(),
    enabled: aberto,
    staleTime: 60000,
  })

  if (!aberto) return null

  const progresso = trainerExpProgress(trainer)
  const expPct = Math.max(0, Math.min(100, (progresso.into / progresso.needed) * 100))

  const especiesVistas = Object.keys(pokedexKills).length
  const pokedexPct = (especiesVistas / TOTAL_ESPECIES) * 100

  // "Batalhas vencidas" sai da Pokedex, e nao de `perfStats`: perfStats zera a
  // cada entrada em hunt (e a amostra do piso do farm offline), entao ele
  // nunca foi um total de carreira. A contagem por especie e cumulativa e
  // persistida.
  let batalhas = 0
  let batalhasShiny = 0
  for (const contagem of Object.values(pokedexKills)) {
    batalhas += (contagem.normal ?? 0) + (contagem.shiny ?? 0)
    batalhasShiny += contagem.shiny ?? 0
  }

  const capturas = [...team, ...bagPokes]
    .filter((p) => p.capturedAt)
    .sort((a, b) => (b.capturedAt ?? '').localeCompare(a.capturedAt ?? ''))
    .slice(0, CAPTURAS_NO_LOG)

  return (
    <GameWindow
      winKey="perfil"
      widthEm={32}
      zIndex={46}
      backdrop={{ zIndex: 45 }}
      onClose={() => setAberto(false)}
      title="Perfil do Treinador"
      header={
        <div className="flex items-center gap-[.6em] border-b border-n800 px-[.65em] pb-[.6em]">
          <div className="flex h-[4.6em] w-[4.6em] shrink-0 items-center justify-center rounded-[.7em] border border-n700 bg-n900">
            <User className="text-[2.2em] text-n300" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-[.25em]">
            <div className="truncate text-[1.15em] font-semibold">{trainer.name}</div>
            <div className="flex items-center gap-[.5em] text-[.8em] text-n300">
              <span>Nível {trainer.level}</span>
              {remoto && (
                <span className="flex items-center gap-[.25em] text-gold">
                  <Trophy className="text-[1em]" /> Rank #{remoto.rank}
                  <span className="text-n500">de {remoto.totalJogadores}</span>
                </span>
              )}
            </div>
            <Meter pct={expPct} height=".4em" color="var(--color-gold)" />
            <div className="text-[.7em] text-n500">
              {Math.floor(progresso.into).toLocaleString('pt-BR')} / {Math.floor(progresso.needed).toLocaleString('pt-BR')} XP
            </div>
          </div>
        </div>
      }
      subheader={<div className="px-[.65em] py-[.5em]"><SegmentedTabs value={aba} onChange={setAba} options={ABAS} /></div>}
    >
      {aba === 'resumo' && (
        <div className="flex flex-col gap-[.5em]">
          <div className="grid grid-cols-2 gap-[.45em]">
            <Estatistica icon={<Coins />} rotulo="Ouro" valor={wallet.gold.toLocaleString('pt-BR')} cor="text-gold" />
            <Estatistica icon={<Diamond />} rotulo="Diamantes" valor={String(wallet.diamonds)} cor="text-diamond" />
            <Estatistica icon={<Sword />} rotulo="Batalhas vencidas" valor={batalhas.toLocaleString('pt-BR')} />
            <Estatistica icon={<Sparkle />} rotulo="Shinys derrotados" valor={batalhasShiny.toLocaleString('pt-BR')} cor="text-shiny" />
            <Estatistica
              icon={<Clock />}
              rotulo="Tempo de jogo"
              valor={remoto ? formatarDuracao(remoto.segundosJogados) : '—'}
            />
            <Estatistica
              icon={<BookOpen />}
              rotulo="Pokédex"
              valor={`${pokedexPct.toFixed(1)}%`}
            />
          </div>

          <div className="flex flex-col gap-[.35em]">
            <SectionLabel>Pokédex — {especiesVistas} de {TOTAL_ESPECIES} espécies</SectionLabel>
            <Meter pct={pokedexPct} height=".5em" color="var(--color-exp)" />
          </div>

          {remoto?.noHallDaFama && (
            <GameCard>
              <div className="flex items-center gap-[.5em] text-[.85em]">
                <Trophy className="text-[1.2em] text-gold" />
                <span>
                  No Hall da Fama desde{' '}
                  <b>{new Date(remoto.noHallDaFama).toLocaleDateString('pt-BR')}</b> — Campeão Lance derrotado.
                </span>
              </div>
            </GameCard>
          )}

          <div className="flex flex-col gap-[.35em]">
            <SectionLabel>Outfit</SectionLabel>
            <GameCard>
              <div className="flex items-center gap-[.45em]">
                <TShirt className="text-[1.5em] text-n400" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[.85em]">Nenhuma skin disponível</span>
                  <span className="text-[.75em] text-n500">
                    O jogo ainda não tem skins de treinador: não há arte alternativa no repositório nem
                    campo de aparência no save. O botão fica aqui para quando existir.
                  </span>
                </div>
                <GameButton disabled>Trocar</GameButton>
              </div>
            </GameCard>
          </div>
        </div>
      )}

      {aba === 'capturas' && (
        <div className="flex flex-col gap-[.4em]">
          <SectionLabel>Últimas {CAPTURAS_NO_LOG} aquisições</SectionLabel>
          {capturas.length === 0 ? (
            <div className="p-[1.2em] text-center text-[.85em] text-n400">
              Nenhuma captura registrada ainda. Ligue o Auto-Catch no painel do Bot.
            </div>
          ) : (
            capturas.map((poke) => {
              const species = SPECIES[poke.speciesId]
              const url = faceIconUrl(poke.speciesId, poke.isShiny)
              const raridade = rarityOf(poke)
              return (
                <div key={poke.uid} className="flex items-center gap-[.55em] rounded-[.45em] border border-n800 px-[.55em] py-[.35em]">
                  {url && (
                    <img
                      src={url}
                      alt=""
                      className="h-[1.9em] w-[1.9em] shrink-0 rounded-[.25em] border-2 object-cover"
                      style={{ borderColor: raridade.color }}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[.88em]">
                    {poke.isShiny && <span className="text-shiny">✨ </span>}
                    {species?.name ?? poke.speciesId}
                    <span className="text-n500"> · {raridade.label}</span>
                  </span>
                  <span className="shrink-0 text-[.75em] text-n400">Lv {poke.level}</span>
                  <span className="shrink-0 text-[.7em] text-n500">
                    {poke.capturedAt ? new Date(poke.capturedAt).toLocaleDateString('pt-BR') : ''}
                  </span>
                </div>
              )
            })
          )}
        </div>
      )}

      {aba === 'especialidades' && (
        <div className="flex flex-col gap-[.5em]">
          <SectionLabel>Especialidades</SectionLabel>
          <GameCard>
            <div className="flex items-start gap-[.45em]">
              <Star className="mt-[.15em] shrink-0 text-[1.4em] text-n400" />
              <div className="flex flex-col gap-[.3em] text-[.82em] text-n300">
                <span className="font-medium text-foreground">Ainda não implementado</span>
                <span>
                  Especialidades seriam bônus permanentes escolhidos pelo treinador (mais ouro, mais chance
                  de captura, mais EXP). Nada no save guarda escolha desse tipo e nenhuma fórmula lê um
                  bônus assim — este espaço fica reservado, com o layout pronto, em vez de mostrar
                  bônus falsos.
                </span>
              </div>
            </div>
          </GameCard>
        </div>
      )}
    </GameWindow>
  )
}

function Estatistica({ icon, rotulo, valor, cor }: {
  icon: React.ReactNode; rotulo: string; valor: string; cor?: string
}) {
  return (
    <div className="flex items-center gap-[.5em] rounded-[.45em] border border-n800 px-[.55em] py-[.45em]">
      <span className={cn('shrink-0 text-[1.2em]', cor ?? 'text-n400')}>{icon}</span>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[.7em] tracking-[.04em] text-n500 uppercase">{rotulo}</span>
        <span className={cn('truncate font-mono text-[.95em] font-bold', cor)}>{valor}</span>
      </div>
    </div>
  )
}
