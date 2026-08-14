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

registrarErrosGlobais()
iniciarCapturaDeErroDeToast()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <App />
        </TooltipProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
