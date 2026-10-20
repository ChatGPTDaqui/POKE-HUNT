// Cartao de um ovo (20/10/2026): na Mochila ele espera; na equipe ele choca
// com os abates da cacada. Pronto (0 abates), o botao Chocar abre a revelacao.
import { useState } from 'react'
import { SPECIES } from '@/data/pokes'
import { RARITIES } from '@/data/rarity'
import { ABATES_PARA_CHOCAR, vagasOcupadas, type Ovo } from '@/data/ovos'
import { MAX_TEAM_SIZE, useGameStateStore } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'
import { chocarOvo, moverOvo, type Nascimento } from '@/data/remote/muralRpc'
import { GameButton, Meter } from '@/components/game/controls'
import { cn } from '@/lib/utils'
import { OvoArte } from './OvoArte'
import { RevelacaoDoOvo } from './RevelacaoDoOvo'
import './ovos.css'

const fmt = new Intl.NumberFormat('pt-BR')

export function CartaoDoOvo({ ovo }: { ovo: Ovo }) {
  const especie = SPECIES[ovo.speciesId]
  const cheia = useGameStateStore((s) => vagasOcupadas(s.team, s.ovos) >= MAX_TEAM_SIZE)
  const [ocupado, setOcupado] = useState(false)
  const [chocando, setChocando] = useState<Promise<Nascimento> | null>(null)
  const total = ABATES_PARA_CHOCAR[ovo.raridade]
  const pronto = ovo.abatesRestantes <= 0
  const feitos = total - ovo.abatesRestantes

  async function mover(paraEquipe: boolean) {
    setOcupado(true)
    try {
      useToastStore.getState().pushToast(await moverOvo(ovo.id, paraEquipe), 'success', 'world')
    } catch (e) {
      useToastStore.getState().pushToast(e instanceof Error ? e.message : String(e), 'error', 'world')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className={cn('flex items-center gap-[.6em] rounded-[.6em] border p-[.5em]', pronto && 'ovo-pronto')}
      style={{ borderColor: RARITIES[ovo.raridade].color, background: 'var(--color-menu-paper)' }}>
      <OvoArte raridade={ovo.raridade} shiny={ovo.shiny} tamanho={3.2} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-[.35em]">
          <b className="truncate text-[.9em]">Ovo de {especie?.name ?? ovo.speciesId}</b>
          <span className="rounded-full px-[.45em] text-[.65em] font-semibold text-[#0b0e18]" style={{ background: RARITIES[ovo.raridade].color }}>
            {RARITIES[ovo.raridade].label}
          </span>
          {ovo.shiny && <span className="text-[.7em] text-gold">✨ shiny 25%</span>}
        </div>
        <div className="text-[.72em] text-menu-muted">
          {pronto ? 'Pronto para chocar!'
            : ovo.naEquipe ? `Chocando na equipe · faltam ${fmt.format(ovo.abatesRestantes)} abates`
              : `Na Mochila não choca · ${fmt.format(ovo.abatesRestantes)} abates na equipe`}
        </div>
        {!pronto && <Meter pct={(feitos / total) * 100} height=".3em" color={RARITIES[ovo.raridade].color} className="mt-[.3em]" />}
      </div>
      <div className="flex shrink-0 flex-col gap-[.3em]">
        {pronto ? (
          <GameButton variant="accent" onClick={() => setChocando(chocarOvo(ovo.id))}>Chocar</GameButton>
        ) : ovo.naEquipe ? (
          <GameButton variant="ghost" disabled={ocupado} onClick={() => mover(false)}>Guardar</GameButton>
        ) : (
          <GameButton variant="primary" disabled={ocupado || cheia} onClick={() => mover(true)}
            title={cheia ? 'Equipe cheia: ovos contam nas 6 vagas.' : undefined}>
            Levar na equipe
          </GameButton>
        )}
      </div>
      {chocando && <RevelacaoDoOvo ovo={ovo} promessa={chocando} onFechar={() => setChocando(null)} />}
    </div>
  )
}

/** Lista de ovos de um lugar (equipe ou mochila). Some quando nao ha nenhum. */
export function ListaDeOvos({ onde, titulo }: { onde: 'equipe' | 'mochila' | 'todos'; titulo?: string }) {
  const ovos = useGameStateStore((s) => s.ovos)
  const lista = ovos.filter((o) => onde === 'todos' || (onde === 'equipe' ? o.naEquipe : !o.naEquipe))
  if (!lista.length) return null
  return (
    <section className="flex flex-col gap-[.4em]" aria-label={titulo ?? 'Ovos'}>
      {titulo && <h3 className="text-[.8em] font-semibold tracking-wide text-menu-muted uppercase">{titulo}</h3>}
      {lista.map((o) => <CartaoDoOvo key={o.id} ovo={o} />)}
    </section>
  )
}
