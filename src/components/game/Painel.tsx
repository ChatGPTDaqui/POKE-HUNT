// Uma janela flutuante no desktop, um bottom sheet no celular — e quem abre
// nao precisa saber em qual dos dois esta.
//
// Existe pra que a escolha seja feita em UM lugar. Sem ele, cada tela que abre
// uma janela repetiria o mesmo `if (usaSheet)`, e a proxima nasceria so com o
// caminho do desktop — que e como o jogo chegou aqui: perfil do POKE, perfil do
// treinador e Hunt Analyzer continuavam janelas arrastaveis (com canto de
// redimensionar de 16px e barra de titulo pra arrastar) num aparelho onde nada
// disso funciona.
import type { ReactNode } from 'react'
import { useDeviceMode } from '@/stores/uiStore'
import { GameWindow } from './GameWindow'
import { Sheet, type SheetSnap } from './Sheet'

export interface PainelProps {
  winKey: 'panel' | 'profile' | 'perfil' | 'analyzer' | 'auto' | 'offline'
  /** Largura da JANELA, em `em`. Ignorada no sheet, que ocupa a tela. */
  widthEm: number
  zIndex: number
  /** Camada do escurecimento. Ausente = nao escurece (painel Auto). */
  backdropZIndex?: number
  /** Fecha ao tocar fora. Padrao: acompanha o escurecimento. */
  fecharAoTocarFora?: boolean
  /** Altura do SHEET. Ignorada na janela. */
  snap?: SheetSnap
  defaultTop?: string
  onClose: () => void
  title?: ReactNode
  header?: ReactNode
  subheader?: ReactNode
  footer?: ReactNode
  children: ReactNode
  bodyClassName?: string
}

export function Painel({
  winKey, widthEm, zIndex, backdropZIndex, fecharAoTocarFora, snap, defaultTop,
  onClose, title, header, subheader, footer, children, bodyClassName,
}: PainelProps) {
  const { usaSheet } = useDeviceMode()

  if (usaSheet) {
    return (
      <Sheet
        winKey={winKey}
        zIndex={zIndex}
        backdrop={backdropZIndex != null}
        snap={snap}
        onClose={onClose}
        title={title}
        header={header}
        subheader={subheader}
        footer={footer}
        bodyClassName={bodyClassName}
      >
        {children}
      </Sheet>
    )
  }

  return (
    <GameWindow
      winKey={winKey}
      widthEm={widthEm}
      defaultTop={defaultTop}
      zIndex={zIndex}
      backdrop={backdropZIndex != null ? { zIndex: backdropZIndex } : undefined}
      fecharAoTocarFora={fecharAoTocarFora}
      onClose={onClose}
      title={title}
      header={header}
      subheader={subheader}
      footer={footer}
      bodyClassName={bodyClassName}
    >
      {children}
    </GameWindow>
  )
}
