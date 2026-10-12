// Treinador integrado ao StatusRail no PC: foto, nome, nível, carteira e EXP.
// No mobile, TreinadorNoCabecalho reserva uma coluna menor na mesma superfície.
import { trainerExpProgress } from '@/engine/systems/progressionSystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useUiStore } from '@/stores/uiStore'
import { Carteira } from '@/components/hud/Carteira'
import { AvatarDoTreinador } from '@/components/shared/AvatarDoTreinador'
import { useAuthStore } from '@/stores/authStore'

export function CardDoTreinador() {
  const trainer = useGameStateStore((s) => s.trainer)
  const setPerfilOpen = useUiStore((s) => s.setPerfilOpen)
  const meuId = useAuthStore((s) => s.user?.id ?? null)
  const progress = trainerExpProgress(trainer)
  const expPct = Math.max(0, Math.min(100, (progress.into / progress.needed) * 100))

  return (
    <button
      type="button"
      data-keep-open
      aria-label="Perfil do treinador"
      onClick={() => setPerfilOpen(true)}
      className={
        'pointer-events-auto relative flex shrink-0 cursor-pointer items-center gap-[.4em] '
        + 'rounded-[.7em] p-[.25em] pr-[.35em]'
      }
    >
      {/* PH-548: a foto escolhida no perfil; sem foto, o icone de sempre. */}
      <AvatarDoTreinador userId={meuId} tamanho={2} nome={trainer.name} />
      <span className="flex flex-col items-start gap-[.2em] pr-[.2em]">
        <span className="max-w-[7em] truncate text-[.78em] leading-none">{trainer.name}</span>
        <span className="text-[.7em] leading-none text-n400">Lv {trainer.level}</span>
      </span>
      {/* Carteira sempre abreviada (PH-279): dentro do card nao ha largura pro
          valor cheio sem empurrar o nome do treinador, e o cheio ja esta no
          `title` dela e no perfil.

          Largura MINIMA reservada: sem ela, `1B` e `9` ocupam tamanhos
          diferentes e o card mudava de largura a cada abate — a mesma tremida
          que o PH-157 tirou da barra de HP, reintroduzida pela porta do card. */}
      <span className="ml-[.15em] h-[1.6em] w-px shrink-0 self-center bg-n700" aria-hidden />
      <span className="flex min-w-[3.4em] shrink-0 justify-end">
        <Carteira abreviada />
      </span>
      {/* Anel de EXP do treinador em vez de barra: o progresso e um dado de
          fundo — a borda inferior preenchendo ja diz "esta subindo". */}
      <span
        className="absolute inset-x-[.25em] bottom-[.15em] h-[.15em] overflow-hidden rounded-full bg-n800"
        aria-hidden
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-gold" style={{ width: `${expPct}%` }} />
      </span>
    </button>
  )
}
