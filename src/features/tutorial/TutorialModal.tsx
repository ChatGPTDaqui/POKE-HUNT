// Tutorial passo a passo.
//
// Modal proprio (nao uma `ScreenName`) porque ele aparece POR CIMA de qualquer
// tela e e disparado por evento, nao por clique de menu — no primeiro boot ele
// abre sozinho.
import { useTutorialStore } from '@/stores/tutorialStore'
import { GameWindow } from '@/components/game/GameWindow'
import { GameButton } from '@/components/game/controls'
import { cn } from '@/lib/utils'

export function TutorialModal() {
  const aberto = useTutorialStore((s) => s.aberto)
  const passo = useTutorialStore((s) => s.passo)
  const fechar = useTutorialStore((s) => s.fechar)
  const proximo = useTutorialStore((s) => s.proximo)
  const anterior = useTutorialStore((s) => s.anterior)

  if (!aberto) return null
  const atual = aberto.passos[passo]
  const ultimo = passo === aberto.passos.length - 1

  return (
    <GameWindow
      winKey="tutorial"
      widthEm={30}
      // Acima do painel de menu (31) e do painel Auto (40): o tutorial do Bot
      // fala sobre o painel do Bot, entao os dois podem estar abertos juntos.
      zIndex={56}
      backdrop={{ zIndex: 55 }}
      onClose={fechar}
      title={aberto.titulo}
      footer={
        <div className="flex items-center justify-between gap-[.45em]">
          <div className="flex gap-[.3em]">
            {aberto.passos.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-[.45em] w-[.45em] rounded-full transition-colors',
                  i === passo ? 'bg-primary' : 'bg-n700',
                )}
              />
            ))}
          </div>
          <div className="flex gap-[.4em]">
            <GameButton onClick={anterior} disabled={passo === 0}>Voltar</GameButton>
            <GameButton variant="primary" onClick={proximo}>
              {ultimo ? 'Entendi' : 'Proximo'}
            </GameButton>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-[.45em]">
        <div className="text-[.72em] tracking-[.08em] text-n400 uppercase">
          Passo {passo + 1} de {aberto.passos.length}
        </div>
        <h3 className="text-[1.15em] font-semibold">{atual.titulo}</h3>
        <p className="text-[.9em] leading-[1.55] text-n200">{atual.corpo}</p>
      </div>
    </GameWindow>
  )
}
