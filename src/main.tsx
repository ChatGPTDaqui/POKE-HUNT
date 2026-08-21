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

function mostrarDevtools(): boolean {
  return typeof window !== 'undefined' && window.innerWidth >= 820
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
        {/* O botao flutuante das devtools mora no canto inferior direito, que
            desde a HUD mobile e exatamente onde fica o slot "Mais" da doca —
            em 390px ele cobre o botao e rouba o toque. Some em tela estreita;
            no desktop, onde ha canto sobrando, continua. */}
        {mostrarDevtools() && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
