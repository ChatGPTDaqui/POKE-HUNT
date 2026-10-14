// Bloco "Conquistas" do perfil publico: titulo, pontos, platina e a vitrine
// que o treinador escolheu. Tudo de leitura publica (treinadores_publico e
// player_conquistas); a soma sai do catalogo do bundle.
import { useQuery } from '@tanstack/react-query'
import { Medal } from '@phosphor-icons/react'
import { CATALOGO_DE_CONQUISTAS } from '@/data/generated/conquistas.generated'
import { conquistasPublicas } from '@/data/remote/conquistasRpc'
import { COR_DO_NIVEL_DE_CONQUISTA, NOME_DO_NIVEL_DE_CONQUISTA } from './nivelDeConquista'
import { nivelDaMoldura, resumoDaPlatina } from './resumoDeConquistas'

const POR_ID = new Map(CATALOGO_DE_CONQUISTAS.map((c) => [c.id, c]))

/** Leitura publica, com o mesmo cache para o bloco e a moldura do retrato. */
export function useConquistasPublicas(userId: string | null) {
  return useQuery({
    queryKey: ['conquistas-publicas', userId],
    queryFn: () => conquistasPublicas(userId!),
    enabled: !!userId,
    staleTime: 60_000,
  })
}

/** Cor da moldura do retrato desse treinador, ou `undefined` sem moldura. */
export function useCorDaMoldura(userId: string | null): string | undefined {
  const { data } = useConquistasPublicas(userId)
  if (!data) return undefined
  const desbloqueadas = Object.fromEntries(data.ids.map((id) => [id, '']))
  const r = resumoDaPlatina(CATALOGO_DE_CONQUISTAS, desbloqueadas)
  const platina = CATALOGO_DE_CONQUISTAS.find((c) => c.nivel === 'platina')
  const nivel = nivelDaMoldura(r.feitas, r.total, platina ? data.ids.includes(platina.id) : false)
  return nivel ? COR_DO_NIVEL_DE_CONQUISTA[nivel] : undefined
}

/** O titulo exibido, com a cor do nivel da conquista que o deu. */
export function TituloDoTreinador({ id, className }: { id: string | null; className?: string }) {
  const c = id ? POR_ID.get(id) : undefined
  if (!c) return null
  return (
    <span className={className} style={{ color: COR_DO_NIVEL_DE_CONQUISTA[c.nivel] }}>
      {c.nome}
    </span>
  )
}

export function ConquistasDoTreinador({ userId }: { userId: string }) {
  const { data } = useConquistasPublicas(userId)
  if (!data) return null
  const desbloqueadas = Object.fromEntries(data.ids.map((id) => [id, '']))
  const r = resumoDaPlatina(CATALOGO_DE_CONQUISTAS, desbloqueadas)
  const vitrine = data.vitrine.map((id) => POR_ID.get(id)).filter((c) => c != null)

  return (
    <div className="flex flex-col gap-[.4em] rounded-[.45em] border border-menu-line px-[.55em] py-[.45em]">
      <div className="flex items-center justify-between text-[.8em]">
        <span className="text-[.85em] tracking-[.04em] text-menu-muted uppercase">Conquistas</span>
        <span className="font-mono font-bold tabular-nums">{r.pontos} pts</span>
      </div>
      <div className="text-[.75em] text-menu-muted">
        Platina {r.feitas}/{r.total}
        {r.lendasFeitas > 0 && (
          <> · <span style={{ color: COR_DO_NIVEL_DE_CONQUISTA.impossivel }}>Lenda Viva {r.lendasFeitas}</span></>
        )}
      </div>
      {vitrine.length > 0 && (
        <ul className="flex flex-col gap-[.25em]">
          {vitrine.map((c) => (
            <li key={c.id} className="flex items-center gap-[.4em] text-[.8em]">
              <Medal weight="fill" className="shrink-0" style={{ color: COR_DO_NIVEL_DE_CONQUISTA[c.nivel] }} />
              <span className="min-w-0 flex-1 truncate font-medium">{c.nome}</span>
              <span className="shrink-0 text-[.75em] uppercase" style={{ color: COR_DO_NIVEL_DE_CONQUISTA[c.nivel] }}>
                {NOME_DO_NIVEL_DE_CONQUISTA[c.nivel]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
