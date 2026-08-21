// Selo de status (VEN, QUE, PAR, SON, CON, CNF).
//
// POR QUE UM COMPONENTE, e nao markup solto onde precisa: o status aparece no
// card do POKE em campo, na ficha do perfil e na lista da equipe. Tres copias
// divergiriam na primeira mudanca de cor — e a cor aqui NAO e decorativa, e o
// que distingue veneno de queimadura de relance.
//
// Sem status nao renderiza nada (devolve null), pra quem chama nao precisar
// repetir o `&&`.
import { type StatusAtivo } from '@/data/statusEffects'
import { verbeteDoStatus } from '@/data/glossario'
import { corDoStatus, siglaDoStatus } from '@/data/statusColors'
import { cn } from '@/lib/utils'
import { Palavra } from './Explicacao'

export function StatusBadge(
  { status, className }: { status: StatusAtivo | null | undefined; className?: string },
) {
  if (!status) return null
  const cor = corDoStatus(status.tipo)
  return (
    // O nome por extenso e o efeito vivia num `title=`, ou seja: no celular a
    // sigla de 3 letras era um enigma sem legenda nenhuma. A bolha abre nos dois
    // (ver Explicacao.tsx) e agora diz o que o status FAZ, nao so como se chama.
    <Palavra verbete={verbeteDoStatus(status)} className="no-underline">
      <span
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
    </Palavra>
  )
}
