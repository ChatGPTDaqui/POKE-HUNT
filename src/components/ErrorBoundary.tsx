// Sem isto, um erro de RENDER (nao de rede — esse ja passa por reportarErro
// via toastStore) derrubava a tela inteira em branco, sem nada salvo em
// lugar nenhum. `componentDidCatch` e o unico jeito de capturar isso — nao
// existe hook equivalente.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  children: ReactNode
}

interface State {
  crashed: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false }

  static getDerivedStateFromError(): State {
    return { crashed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void supabase.rpc('reportar_erro', {
      p_origem: 'client',
      p_rota: 'render-crash',
      p_mensagem: `${error.message}\n${info.componentStack ?? ''}`,
    }).then(() => {}, () => {})
  }

  render(): ReactNode {
    if (this.state.crashed) {
      return (
        <div className="flex min-h-svh items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground">
          <div>
            <p className="mb-3 text-base font-medium text-foreground">O jogo travou.</p>
            <p className="mb-4">Recarregue a página — seu progresso já está salvo no servidor.</p>
            <button
              type="button"
              className="rounded-md border border-n700 px-3 py-1.5 text-foreground"
              onClick={() => window.location.reload()}
            >
              Recarregar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
