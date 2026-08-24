// Dialogo de confirmacao generico pra qualquer acao destrutiva o bastante pra
// merecer um segundo clique (venda de shiny, apagar o save).
//
// NAO e arrastavel de proposito: e um aviso transitorio e modal, nao uma janela
// de trabalho — arrastar so daria ao jogador uma forma de empurrar a pergunta
// pra fora da tela sem responder. Mesmo motivo dos toasts ficarem de fora.
import { useConfirmDialogStore } from '@/stores/confirmDialogStore'
import { GameButton } from '@/components/game/controls'

export function ConfirmDialog() {
  const request = useConfirmDialogStore((s) => s.request)
  const close = useConfirmDialogStore((s) => s.close)

  if (!request) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      // `data-keep-open` e obrigatorio aqui, nao decoracao: `GameWindow` fecha
      // a janela em QUALQUER `pointerdown` cujo alvo nao esteja dentro de
      // `[data-window]` ou `[data-keep-open]`, e este dialogo e montado como
      // IRMAO da arvore de janelas (em JogoCarregado). Sem o marcador, abrir a
      // confirmacao condena a janela de tras: clicar em "Vender" fechava a
      // Loja junto, e clicar em "Cancelar" tambem.
      //
      // `data-keep-open` e nao `data-window`: isto nao e uma janela de
      // trabalho (ver a nota de nao ser arrastavel acima), e o que se quer
      // dizer e exatamente "clicar aqui nao fecha o que esta atras".
      data-keep-open
      className="pointer-events-auto absolute inset-0 z-[60] flex items-center justify-center bg-black/60"
      // `pointerdown`, nao `mousedown`: no toque o evento de mouse de
      // compatibilidade so sai depois do `touchend`, e nao sai quando o gesto
      // vira rolagem — tocar fora do dialogo ora fechava com atraso, ora nao
      // fechava. Mesma troca ja feita nas janelas e nos sheets.
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="flex w-[22em] max-w-[calc(100vw-2em)] flex-col gap-[.5em] rounded-xl border border-n700 bg-background p-[1.1em] shadow-2xl">
        <div className="font-medium">{request.title}</div>
        <div className="text-[.85em] text-n400">{request.message}</div>
        <div className="flex justify-end gap-[.5em]">
          <GameButton variant="ghost" onClick={close}>{request.cancelLabel ?? 'Cancelar'}</GameButton>
          <GameButton
            variant="danger"
            onClick={() => {
              close()
              request.onConfirm()
            }}
          >
            {request.confirmLabel ?? 'Confirmar'}
          </GameButton>
        </div>
      </div>
    </div>
  )
}
