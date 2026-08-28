// O que o LURE esta fazendo agora (ver engine/systems/lureSystem.ts).
//
// Existe pra a mecanica nao ler como bug. Durante a reuniao o POKE atravessa a
// hunt passando ao lado de inimigos SEM bater neles, o que e exatamente o
// sintoma de "a IA travou" — e a diferenca entre as duas coisas nao esta em
// lugar nenhum da tela sem este chip. Mesmo motivo pelo qual o `SalaChip` mostra
// a barra de abates: "quanto falta" era invisivel.
//
// Some inteiro quando o lure esta inativo (desligado na config, Hospital,
// jogador desmaiado): chip vazio pendurado no HUD e pior que chip nenhum.
import { useWorldStore } from '@/stores/worldStore'

export function LureChip() {
  // CAMPOS soltos, nunca o objeto `world.lure`: `stepWorld` reescreve ele a cada
  // tick, e um selector que devolvesse o objeto re-renderizaria este componente
  // 60 vezes por segundo (ver a nota de topo de stores/worldStore.ts).
  const fase = useWorldStore((s) => s.lure?.fase ?? null)
  const reunidos = useWorldStore((s) => s.lure?.reunidos ?? 0)
  const alvo = useWorldStore((s) => s.lure?.alvo ?? 0)
  const esperando = useWorldStore((s) => s.lure?.esperandoRetardatario ?? false)

  if (fase == null) return null

  const reunindo = fase === 'reunindo'
  const progresso = alvo > 0 ? Math.min(1, reunidos / alvo) : 0

  return (
    <div className="vidro flex items-center gap-[.6em] overflow-hidden rounded-full px-[.9em] py-[.35em]">
      <span className="text-[.72em] font-medium text-n100">Lure</span>
      <span className="text-[.72em] text-n400">
        {reunindo ? (esperando ? 'esperando retardatário' : 'reunindo') : 'lutando'}
      </span>
      {/* A barra vale mais que o numero de relance: ela e a resposta pra "isso
          esta andando ou travou?", que e a duvida que este chip existe pra
          matar. Cheia = a conta fechou e a luta comecou. */}
      <span className="relative h-[.4em] w-[3.5em] overflow-hidden rounded-full bg-n800">
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
          style={{ width: `${progresso * 100}%`, background: reunindo ? 'var(--color-warn)' : 'var(--color-ok)' }}
        />
      </span>
      <span className="shrink-0 text-[.7em] tabular-nums text-n500">{reunidos}/{alvo}</span>
    </div>
  )
}
