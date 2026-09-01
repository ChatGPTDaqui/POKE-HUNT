// Confirmacao de acao destrutiva: "Vender Tudo", apagar o save, sair da conta.
//
// PH-376 — A MARCACAO ESTAVA MENTINDO. O container declarava `role="dialog"` e
// `aria-modal="true"` sem implementar nenhuma das tres coisas que essa dupla
// promete: o foco nao entrava no dialogo, nao ficava preso nele, e nao voltava
// pro gatilho ao fechar. Na pratica, quem usa teclado continuava tabulando
// pelos botoes ATRAS do escurecimento — e um Enter ali disparava a acao de tras,
// com uma confirmacao destrutiva aberta na frente.
//
// `aria-modal` nao e decorativo: ele diz ao leitor de tela pra ignorar tudo
// fora deste no. Sem o foco entrar, o leitor anuncia o dialogo e o usuario nao
// tem como chegar nele.
//
// As tres pecas, e por que cada uma:
//   - foco inicial no CANCELAR, nao no confirmar. O dialogo so existe pra
//     interromper; abrir com o dedo em cima do gatilho da acao destrutiva
//     transforma um Enter reflexo em "Vender Tudo".
//   - Tab preso no dialogo, ciclando entre os dois botoes.
//   - foco devolvido ao elemento que abriu, ao fechar por qualquer caminho
//     (X, ESC, clique fora, confirmar).
import { useCallback, useEffect, useRef } from 'react'
import { useConfirmDialogStore } from '@/stores/confirmDialogStore'
import { useFecharComEsc } from '@/hooks/useFecharComEsc'
import { GameButton } from '@/components/game/controls'

// Mesma camada declarada no mapa do `HudLayer`: a confirmacao fica acima de
// tudo, e por isso ganha o ESC antes de qualquer painel aberto atras dela.
const Z_INDEX = 60

export function ConfirmDialog() {
  const request = useConfirmDialogStore((s) => s.request)
  const close = useConfirmDialogStore((s) => s.close)

  return request ? <Dialogo aoFechar={close} request={request} /> : null
}

/**
 * Corpo em componente proprio pra os hooks so existirem com o dialogo ABERTO.
 *
 * No `ConfirmDialog` eles cairiam antes do `if (!request) return null` e teriam
 * de conviver com o caso fechado — o que significa um `keydown` global vivo o
 * tempo todo e um `ref` de foco anterior guardando lixo de sessoes passadas.
 */
function Dialogo({
  request, aoFechar,
}: {
  request: NonNullable<ReturnType<typeof useConfirmDialogStore.getState>['request']>
  aoFechar: () => void
}) {
  const caixaRef = useRef<HTMLDivElement>(null)

  useFecharComEsc(aoFechar, Z_INDEX)

  // Foco inicial no cancelar + devolucao ao gatilho. O `focoAnterior` e lido no
  // MOMENTO DO MOUNT: depois de o foco ja ter ido pro dialogo, `activeElement`
  // seria o proprio botao de cancelar.
  useEffect(() => {
    const focoAnterior = document.activeElement as HTMLElement | null
    // O PRIMEIRO botao da caixa e o Cancelar, e a ordem do DOM aqui e a mesma
    // ordem de leitura. Query em vez de `ref` no `GameButton` pra nao abrir uma
    // API de ref no primitivo por causa de um unico chamador.
    caixaRef.current?.querySelector<HTMLElement>('button')?.focus()
    return () => {
      // `isConnected`: o gatilho pode ter saido do DOM junto com a acao (o botao
      // "Vender" de uma linha que a propria venda tirou da lista). Devolver foco
      // pra um no solto joga o foco no `<body>` e o leitor de tela perde o
      // lugar; deixar como esta e melhor que isso.
      if (focoAnterior?.isConnected) focoAnterior.focus()
    }
  }, [])

  // Tab preso: e o que `aria-modal="true"` promete. Sem isto o Tab sai do
  // dialogo pros botoes de tras, que continuam no DOM e continuam focaveis.
  const aoTeclar = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const focaveis = caixaRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])')
    if (!focaveis || focaveis.length === 0) return
    const primeiro = focaveis[0]
    const ultimo = focaveis[focaveis.length - 1]
    const atual = document.activeElement
    if (event.shiftKey && atual === primeiro) {
      event.preventDefault()
      ultimo.focus()
    } else if (!event.shiftKey && atual === ultimo) {
      event.preventDefault()
      primeiro.focus()
    }
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-keep-open
      onKeyDown={aoTeclar}
      className="pointer-events-auto absolute inset-0 z-[60] flex items-center justify-center bg-black/60"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) aoFechar()
      }}
    >
      <div
        ref={caixaRef}
        className="flex w-[22em] max-w-[calc(100vw-2em)] flex-col gap-[.5em] rounded-xl border border-n700 bg-background p-[1.1em] shadow-2xl"
      >
        <div className="font-medium">{request.title}</div>
        <div className="text-[.85em] text-n400">{request.message}</div>
        <div className="flex justify-end gap-[.5em]">
          <GameButton variant="ghost" onClick={aoFechar}>
            {request.cancelLabel ?? 'Cancelar'}
          </GameButton>
          <GameButton
            variant="danger"
            onClick={() => {
              aoFechar()
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
