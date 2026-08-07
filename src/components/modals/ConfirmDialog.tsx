// Port de js/ui/panels/confirmModal.js — dialogo de confirmacao generico pra
// qualquer acao destrutiva o bastante pra merecer um segundo clique (venda de
// shiny na Loja, reset de jogo no Config...).
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useConfirmDialogStore } from '@/stores/confirmDialogStore'

export function ConfirmDialog() {
  const request = useConfirmDialogStore((s) => s.request)
  const close = useConfirmDialogStore((s) => s.close)

  if (!request) return null

  return (
    <AlertDialog open onOpenChange={(next) => !next && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request.title}</AlertDialogTitle>
          <AlertDialogDescription>{request.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>{request.cancelLabel ?? 'Cancelar'}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              close()
              request.onConfirm()
            }}
          >
            {request.confirmLabel ?? 'Confirmar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
