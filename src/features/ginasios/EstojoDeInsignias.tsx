// Estojo de insignias (23/10/2026): 18 tipos x 5 ligas, no perfil do treinador
// e no perfil publico. Colecao cosmetica — sem bonus de poder (design de 19/10).
import { useQuery } from '@tanstack/react-query'
import { Medal } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { FAIXAS_DE_GINASIO, TIPOS_DE_GINASIO, idDoGinasio } from '@/data/ginasios'
import { BrasaoDeGinasio, METAL_DA_LIGA } from './BrasaoDeGinasio'

const db = supabase as unknown as { from: (t: string) => any }

async function insigniasDe(userId: string): Promise<Set<string>> {
  const { data, error } = await db.from('player_insignias').select('ginasio_id').eq('user_id', userId)
  if (error) throw new Error(error.message)
  return new Set(((data ?? []) as { ginasio_id: string }[]).map((r) => r.ginasio_id))
}

export function EstojoDeInsignias({ userId }: { userId: string | null }) {
  const { data } = useQuery({
    queryKey: ['insignias', userId],
    queryFn: () => insigniasDe(userId!),
    enabled: !!userId,
    staleTime: 60_000,
  })
  if (!userId || !data) return null
  return (
    <div className="flex flex-col gap-[.3em] rounded-[.45em] border border-menu-line px-[.55em] py-[.45em]">
      <div className="flex items-center justify-between text-[.8em]">
        <span className="flex items-center gap-[.3em] text-[.85em] tracking-[.04em] text-menu-muted uppercase"><Medal aria-hidden /> Insígnias</span>
        <span className="font-mono font-bold tabular-nums">{data.size}/90</span>
      </div>
      {FAIXAS_DE_GINASIO.map((f) => (
        <div key={f.nivel} className="flex items-center gap-[.35em]">
          <span className="w-[4.6em] shrink-0 truncate text-[.65em]" style={{ color: METAL_DA_LIGA[f.nivel].cor }}>{f.liga.replace('Liga ', '')}</span>
          <div className="grid flex-1 grid-cols-[repeat(18,minmax(0,1fr))] gap-0">
            {TIPOS_DE_GINASIO.map((t) => {
              const tem = data.has(idDoGinasio(t, f.nivel))
              return (
                <BrasaoDeGinasio key={t} tipo={t} faixa={f.nivel} aceso={tem} className="w-full"
                  rotulo={`${t} ${f.nivel}${tem ? ' (conquistada)' : ''}`} />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
