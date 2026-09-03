// Moldura dos avisos que pertencem AO CAMPO DE BATALHA.
//
// Pedido explicito do usuario: "os avisos que aparecem na tela (como a
// contagem de 5 segundos do revive) nao devem cobrir os menus inferiores de
// forma alguma; restrinja a renderizacao desses overlays estritamente a area
// do background".
//
// Antes eles eram `fixed inset-0` com fundo escuro — cobriam a tela inteira,
// inclusive a barra de golpes e o menu do rodape. Durante os 5 segundos da
// contagem do Auto-Revive o jogador nao conseguia nem abrir a Mochila pra ver
// se ainda tinha Revive, que e exatamente o que ele quer fazer naquele
// momento.
//
// A MEDIDA DA FAIXA SAIU DAQUI na PH-482, pra `hooks/useFaixaDoCampo.ts`: a
// cutscene de area passou a usar a mesma, e duas copias da conta divergiriam no
// dia em que o rodape mudar de altura. O porque de a conta ser medida e nao
// chutada esta la, junto dela.
import type { ReactNode } from 'react'
import { useFaixaDoCampo } from '@/hooks/useFaixaDoCampo'
import { cn } from '@/lib/utils'

export function CampoOverlay({
  children, className, interativo = false,
}: {
  children: ReactNode
  className?: string
  /** `true` quando ha botao dentro. Aviso puramente informativo fica `false`
   *  pra o clique atravessar e chegar no canvas. */
  interativo?: boolean
}) {
  const faixa = useFaixaDoCampo()

  return (
    <div
      className={cn(
        'fixed left-0 right-0 z-[55] flex flex-col items-center justify-center gap-2',
        // O escurecimento fica DENTRO desta faixa: escurecer a tela inteira
        // (como era) e o que fazia o aviso "cobrir" o menu mesmo sem bloquear
        // o clique.
        'rounded-[.6em] bg-black/55',
        interativo ? 'pointer-events-auto' : 'pointer-events-none',
        className,
      )}
      style={faixa}
    >
      {children}
    </div>
  )
}
