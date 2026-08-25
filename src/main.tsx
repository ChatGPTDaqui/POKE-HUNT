import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { TooltipProvider } from '@/components/ui/tooltip'
import { queryClient } from '@/lib/query-client'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { registrarErrosGlobais } from '@/lib/globalErrorHandlers'
import { iniciarCapturaDeErroDeToast } from '@/lib/errorToastReporting'
import './index.css'
import App from './App.tsx'

/**
 * DUAS condicoes, e cada uma responde por uma coisa diferente (PH-127):
 *
 * `import.meta.env.DEV` — o painel e ferramenta de desenvolvimento, e o gate
 * tem que dizer isso. Antes so a largura decidia, e o pacote se
 * auto-neutralizava no build de producao (a versao de producao dele e um stub).
 * Funcionava por acidente da biblioteca, nao por decisao daqui: bastava a
 * `@tanstack/react-query-devtools` mudar esse comportamento pra o painel
 * aparecer pro jogador num desktop qualquer. E o `vite preview`, que roda build
 * de producao na maquina do dev, ja mostrava o gate mentindo.
 *
 * `innerWidth >= 820` — o botao flutuante mora no canto inferior direito, que
 * desde a HUD mobile e exatamente onde fica o slot "Mais" da doca; em 390px ele
 * cobre o botao e rouba o toque. Some em tela estreita; no desktop, onde ha
 * canto sobrando, continua.
 */
function mostrarDevtools(): boolean {
  return import.meta.env.DEV && typeof window !== 'undefined' && window.innerWidth >= 820
}

registrarErrosGlobais()
iniciarCapturaDeErroDeToast()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <App />
        </TooltipProvider>
        {mostrarDevtools() && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
