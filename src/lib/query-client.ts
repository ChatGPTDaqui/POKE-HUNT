import { QueryClient } from '@tanstack/react-query'

// Sem servidor ainda (jogo 100% local/localStorage) — este client fica pronto
// pro dia que existir uma API real por trás. Nao usar useQuery/useMutation pra
// ler/escrever o save local hoje: isso so adicionaria indirecao sem ganho
// (ver "React Query: preparado, nao forcado sobre localStorage" no plano).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      gcTime: 1000 * 60 * 5,
      retry: 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
})
