// Selo de status (VEN, QUE, PAR, SON, CON, CNF).
//
// POR QUE UM COMPONENTE, e nao markup solto onde precisa: o status aparece no
// card do POKE em campo, na ficha do perfil e na lista da equipe. Tres copias
// divergiriam na primeira mudanca de cor — e a cor aqui NAO e decorativa, e o
// que distingue veneno de queimadura de relance.
//
// Sem status nao renderiza nada (devolve null), pra quem chama nao precisar
// repetir o `&&`.
import { nomeDoStatus, type StatusAtivo } from '@/data/statusEffects'
import { corDoStatus, siglaDoStatus } from '@/data/statusColors'
import { cn } from '@/lib/utils'

export function StatusBadge(
  { status, className }: { status: StatusAtivo | null | undefined; className?: string },
) {
  if (!status) return null
  const cor = corDoStatus(status.tipo)
  return (
    <span
      // O titulo carrega o nome por extenso e os turnos restantes: a sigla de 3
      // letras cabe no HUD, mas sozinha nao diz o que e pra quem nunca viu.
      title={
        status.turnosRestantes != null
          ? `${nomeDoStatus(status.tipo)} — ${status.turnosRestantes} turno(s)`
          : `${nomeDoStatus(status.tipo)} — nao passa sozinho`
      }
      className={cn(
        'inline-block rounded-[.25em] px-[.35em] py-[.05em] text-[.65em] font-bold tracking-[.06em]',
        className,
      )}
      style={{
        color: cor,
        // Fundo e borda derivados da MESMA cor, em vez de uma paleta paralela:
        // adicionar um status novo passa a exigir uma cor so.
        background: `color-mix(in srgb, ${cor} 18%, transparent)`,
        border: `1px solid color-mix(in srgb, ${cor} 45%, transparent)`,
      }}
    >
      {siglaDoStatus(status.tipo)}
    </span>
  )
}
