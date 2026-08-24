// O selo de tempo restante de um leilao (PH-101). A mecanica do relogio — por
// que um timer so pra toda a lista, e por que o tempo pode ficar negativo — esta
// em `../tempoDeLeilao.ts`.
import { useSegundosRestantes, formatarRestante } from '../tempoDeLeilao'

export function TempoRestante({ expiraEm }: { expiraEm: string | null | undefined }) {
  const segundos = useSegundosRestantes(expiraEm)
  if (segundos == null) return null
  // Abaixo de um minuto o numero fica vermelho: e a janela em que um lance novo
  // estica o relogio, e o jogador precisa PERCEBER que esta nela.
  const urgente = segundos <= 60
  return (
    <span
      className={urgente ? 'font-medium text-bad tabular-nums' : 'text-n400 tabular-nums'}
      // O contador muda a cada segundo; sem isso um leitor de tela anunciaria
      // cada tique.
      aria-live="off"
    >
      {formatarRestante(segundos)}
    </span>
  )
}
