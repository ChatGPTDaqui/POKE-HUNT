// Landing publica. Nao carrega o jogo nem toca no Supabase alem de checar se
// ja existe sessao (feito pelo authStore no boot) — quem ja esta logado e
// mandado direto pro jogo pelo <Navigate> abaixo.
import { Link, Navigate } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { useAuthStore } from '@/stores/authStore'

export function HomePage() {
  const session = useAuthStore((s) => s.session)
  const loading = useAuthStore((s) => s.loading)

  if (loading) return null
  if (session) return <Navigate to="/jogo" replace />

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold">NOVO POKE IDLE</h1>
        <p className="max-w-md text-muted-foreground">
          Um idle de captura e batalha automatica. Escolha seu inicial, explore as hunts e evolua
          sua equipe — o progresso continua rodando enquanto voce esta fora.
        </p>
      </div>
      {/* `buttonVariants` em vez de <Button asChild>: este Button (base-ui)
          não expoe `asChild`, e um <button> não pode envolver um <a>. */}
      <div className="flex gap-3">
        <Link to="/registro" className={buttonVariants({ size: 'lg' })}>
          Criar conta
        </Link>
        <Link to="/login" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
          Entrar
        </Link>
      </div>
    </div>
  )
}
