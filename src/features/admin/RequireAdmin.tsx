// Gate de /admin. Igual RequireAuth (UX, nao controle de acesso de verdade —
// quem impede leitura de quem nao e admin e a RLS de audit_logs, policy
// "so admin le audit_logs"). A policy "admin reads own row" de `admins` ja
// existia antes desta feature, cobre exatamente este SELECT.
import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export function RequireAdmin({ children }: { children: ReactNode }) {
  const userId = useAuthStore((s) => s.user?.id)

  const { data: souAdmin, isLoading } = useQuery({
    queryKey: ['sou-admin', userId],
    queryFn: async () => {
      const { data } = await supabase.from('admins').select('user_id').maybeSingle()
      return data != null
    },
    enabled: !!userId,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
        Carregando...
      </div>
    )
  }

  if (!souAdmin) return <Navigate to="/jogo" replace />

  return <>{children}</>
}
