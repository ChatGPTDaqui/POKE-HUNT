// Mural de lideres (24/10/2026, pedido do dono): quem lidera cada ginasio agora
// e o hall da fama (defesas vencidas e mandatos). Tocar no nome abre o perfil.
import { useQuery } from '@tanstack/react-query'
import { Crown, ShieldCheck, Trophy } from '@phosphor-icons/react'
import { muralDeLideres } from '@/data/remote/ginasiosRpc'
import { partesDoGinasio } from '@/data/ginasios'
import { useUiStore } from '@/stores/uiStore'
import { BrasaoDeGinasio, nomeDoGinasio } from './BrasaoDeGinasio'

function diasRestantes(iso: string): string {
  const h = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000))
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h`
}

function Nome({ userId, nome }: { userId: string; nome: string }) {
  return (
    <button type="button" className="truncate text-left font-bold underline-offset-2 hover:underline"
      onClick={() => useUiStore.getState().abrirPerfilPublico({ userId, nome })}>
      {nome}
    </button>
  )
}

export function MuralDeLideres() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['mural-de-lideres'], queryFn: muralDeLideres, staleTime: 60_000 })
  if (isLoading) return <p className="text-[.8em] text-menu-muted">Carregando mural…</p>
  if (isError || !data) return <p className="text-[.8em] text-menu-muted">Não foi possível carregar o mural.</p>
  return (
    <div className="flex flex-col gap-[.7em]">
      <section aria-label="Líderes atuais" className="flex flex-col gap-[.3em]">
        <div className="flex items-center gap-[.3em] text-[.8em] text-menu-muted"><Crown weight="fill" className="text-gold" aria-hidden /> Líderes atuais</div>
        {data.atuais.length === 0
          ? <p className="text-[.75em] text-menu-muted">Todos os ginásios ainda têm líder NPC. Vença um duelo para destronar e seja o primeiro.</p>
          : (
            <ul className="flex flex-col">
              {data.atuais.map((a) => {
                const partes = partesDoGinasio(a.ginasioId)
                if (!partes) return null
                return (
                  <li key={a.ginasioId} className="flex items-center gap-[.5em] border-t border-menu-line py-[.3em] text-[.8em] first:border-t-0">
                    <BrasaoDeGinasio tipo={partes.tipo} faixa={partes.faixa.nivel} className="w-[2.2em] shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <Nome userId={a.liderId} nome={a.liderNome} />
                      <span className="truncate text-[.85em] text-menu-muted">{nomeDoGinasio(partes.tipo)} · {partes.faixa.liga}</span>
                    </span>
                    <span className="shrink-0 text-[.8em] text-menu-muted">{diasRestantes(a.mandatoAte)}</span>
                  </li>
                )
              })}
            </ul>
          )}
      </section>

      <section aria-label="Hall da fama" className="flex flex-col gap-[.3em]">
        <div className="flex items-center gap-[.3em] text-[.8em] text-menu-muted"><Trophy weight="fill" className="text-gold" aria-hidden /> Hall da fama</div>
        {data.hall.length === 0
          ? <p className="text-[.75em] text-menu-muted">Ninguém defendeu um ginásio ainda.</p>
          : (
            <ol className="flex flex-col">
              {data.hall.map((h, i) => (
                <li key={h.userId} className="flex items-center gap-[.5em] border-t border-menu-line py-[.3em] text-[.8em] first:border-t-0">
                  <span className={`w-[1.6em] shrink-0 text-center font-mono font-bold ${i < 3 ? 'text-gold' : 'text-menu-muted'}`}>{i + 1}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Nome userId={h.userId} nome={h.nome} />
                    {h.ginasiosAtuais > 0 && <span className="text-[.85em] text-gold">Lidera {h.ginasiosAtuais} ginásio{h.ginasiosAtuais > 1 ? 's' : ''}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-[.25em]" aria-label={`${h.defesas} defesas vencidas`}><ShieldCheck aria-hidden />{h.defesas}</span>
                  <span className="flex shrink-0 items-center gap-[.25em] text-menu-muted" aria-label={`${h.mandatos} mandatos`}><Crown aria-hidden />{h.mandatos}</span>
                </li>
              ))}
            </ol>
          )}
      </section>
    </div>
  )
}
