// "Repetir Tutoriais": a lista de tudo que o jogo ja explicou, pra rever
// quando quiser.
import { GraduationCap, CheckCircle } from '@phosphor-icons/react'
import { TUTORIAIS } from '@/data/tutoriais'
import { useTutorialStore } from '@/stores/tutorialStore'
import { GameButton, GameCard, SectionLabel } from '@/components/game/controls'

export function TutoriaisMenu() {
  const abrir = useTutorialStore((s) => s.abrir)
  const vistos = useTutorialStore((s) => s.vistos)

  return (
    <div className="flex flex-col gap-[.7em]">
      <SectionLabel>Explicacoes do jogo</SectionLabel>
      {TUTORIAIS.map((tutorial) => (
        <GameCard key={tutorial.id}>
          <div className="flex items-start gap-[.7em]">
            <GraduationCap className="mt-[.15em] shrink-0 text-[1.4em] text-n300" />
            <div className="flex min-w-0 flex-1 flex-col gap-[.3em]">
              <div className="flex items-center gap-[.4em]">
                <span className="font-semibold">{tutorial.titulo}</span>
                {vistos.has(tutorial.id) && (
                  <span title="Ja visto" className="flex items-center">
                    <CheckCircle className="text-[1em] text-ok" />
                  </span>
                )}
              </div>
              <p className="text-[.82em] leading-[1.45] text-n300">{tutorial.resumo}</p>
              <div className="mt-[.2em] flex items-center gap-[.5em]">
                <GameButton onClick={() => abrir(tutorial.id)}>
                  {vistos.has(tutorial.id) ? 'Rever' : 'Ver agora'}
                </GameButton>
                <span className="text-[.75em] text-n400">{tutorial.passos.length} passos</span>
              </div>
            </div>
          </div>
        </GameCard>
      ))}
    </div>
  )
}
