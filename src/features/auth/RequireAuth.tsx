// Gate de rota autenticada.
//
// Isto e UX, NAO controle de acesso (spec §7.4): qualquer um abre o DevTools,
// pega o client Supabase da pagina e chama as tabelas direto, ignorando o
// roteamento inteiro. Quem de fato impede acesso a dado alheio e a RLS no
// Postgres. Este componente so evita renderizar o jogo sem sessao.
//
// Reage a `session` da store (alimentada por onAuthStateChange), entao um
// token que expira ou um ban aplicado no meio da sessao derrubam o jogador
// para o login sozinhos, sem precisar de reload.
import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuthStore } from '@/stores/authStore'

export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useAuthStore((s) => s.session)
  const loading = useAuthStore((s) => s.loading)
  const location = useLocation()

  // Sem isto, quem ja esta logado ve um flash da tela de login enquanto a
  // sessao e recuperada do storage.
  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
        Carregando...
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace state={{ de: location.pathname }} />

  return <>{children}</>
}
