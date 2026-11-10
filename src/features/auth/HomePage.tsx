// Landing publica. Nao carrega o jogo nem toca no Supabase alem de checar se
// ja existe sessao (feito pelo authStore no boot) — quem ja esta logado e
// mandado direto pro jogo pelo <Navigate> abaixo.
//
// Primeira tela de quem chega pelo link: antes era so titulo + um paragrafo,
// sem nenhuma arte. Os iniciais e tres frases sobre o que se faz no jogo dizem
// em segundos o que e o jogo. So importa o helper de URL dos GIFs (sem
// catalogo), pra landing continuar leve.
import { Link, Navigate } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { gen5SpriteUrl } from '@/data/gen5Sprites'
import { useAuthStore } from '@/stores/authStore'

const INICIAIS = ['bulbasaur', 'charmander', 'squirtle'] as const

const DESTAQUES = [
  ['Capture', 'Centenas de espécies, com raridades até Mítico e versões shiny.'],
  ['Evolua', 'Sua equipe luta sozinha enquanto o jogo está aberto e sobe de nível.'],
  ['Dispute', 'Ginásios, PvP, Mercado e ranking com outros treinadores.'],
] as const

export function HomePage() {
  const session = useAuthStore((s) => s.session)
  const loading = useAuthStore((s) => s.loading)

  if (loading) return null
  if (session) return <Navigate to="/jogo" replace />

  return (
    <div data-appearance="journey" className="journey-entry flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <div className="flex items-end justify-center gap-2" aria-hidden="true">
        {INICIAIS.map((id) => (
          <img
            key={id}
            src={gen5SpriteUrl(id)}
            alt=""
            className="h-20 w-20 object-contain [image-rendering:pixelated] sm:h-24 sm:w-24"
          />
        ))}
      </div>
      <div className="space-y-3">
        <h1 className="text-3xl font-bold">NOVO POKE IDLE</h1>
        <p className="max-w-md text-muted-foreground">
          Um idle de captura e batalha automática. Escolha seu inicial, explore as hunts e evolua
          sua equipe — a caçada roda sozinha enquanto o jogo está aberto.
        </p>
      </div>
      <ul className="grid w-full max-w-md gap-2 text-left sm:max-w-2xl sm:grid-cols-3">
        {DESTAQUES.map(([titulo, texto]) => (
          <li key={titulo} className="rounded-lg border bg-card p-3">
            <div className="font-semibold">{titulo}</div>
            <div className="text-sm text-muted-foreground">{texto}</div>
          </li>
        ))}
      </ul>
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
