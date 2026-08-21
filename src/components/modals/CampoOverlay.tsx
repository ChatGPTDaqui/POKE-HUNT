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
// O limite de baixo e MEDIDO (`uiStore.footerHeight`, alimentado por um
// ResizeObserver no HudLayer), nao um `em` chutado: a altura do rodape muda
// com a largura da tela (o menu quebra em mais fileiras) E com o `hudScale` —
// qualquer constante erra em algum dos dois eixos. Mesma decisao ja tomada
// pelo chat e pelo botao Auto.
import type { ReactNode } from 'react'
import { useUiStore } from '@/stores/uiStore'
import { cn } from '@/lib/utils'

// Folga acima da barra de golpes/doca.
const FOLGA_INFERIOR_EM = 0.8
// Abaixo do trilho de status. Era 7.5em, medida da "fileira de cards do topo"
// (POKE ativo + treinador + bloco central) que nao existe mais: o trilho tem
// ~3.7em com a folga. Os 3.8em a mais eram faixa morta no topo do aviso.
const TOPO_EM = 4.4

export function CampoOverlay({
  children, className, interativo = false,
}: {
  children: ReactNode
  className?: string
  /** `true` quando ha botao dentro. Aviso puramente informativo fica `false`
   *  pra o clique atravessar e chegar no canvas. */
  interativo?: boolean
}) {
  const footerHeight = useUiStore((s) => s.footerHeight)
  // Enquanto a medida nao chega (primeiro paint), um valor conservador que
  // cobre o pior caso comum de rodape.
  //
  // `--sa-*` entra na conta porque este overlay e `fixed` — ele nao esta dentro
  // da `.hud-safe`, entao os recortes do aparelho (home indicator, notch) sao
  // dele pra resolver. Sem isso o aviso encostava na doca por baixo num iPhone,
  // que e exatamente o que ele existe pra nao fazer.
  const bottom = footerHeight
    ? `calc(${footerHeight}px + ${FOLGA_INFERIOR_EM}em + var(--sa-bottom, 0px))`
    : `calc(11em + var(--sa-bottom, 0px))`
  const top = `calc(${TOPO_EM}em + var(--sa-top, 0px))`

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
      style={{ top, bottom, marginLeft: 'var(--sa-left, 0px)', marginRight: 'var(--sa-right, 0px)' }}
    >
      {children}
    </div>
  )
}
