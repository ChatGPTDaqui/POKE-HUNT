// Raiz de roteamento. O jogo em si vive em features/game/GameShell.tsx.
//
// Duas camadas de navegacao, de proposito:
// - React Router escolhe o SHELL (publico / jogo). Rotas de verdade porque
//   Home, Login e Registro precisam de URL propria — sao paginas que alguem
//   compartilha, o navegador guarda no historico e o Auth usa como allow-list
//   de redirect.
// - Dentro do jogo, a troca de tela (Equipe/Mochila/Loja/...) continua sendo
//   estado no `uiStore`, nao rota. Isso ja era assim no vanilla (UIManager) e
//   nao ha motivo pra virar URL: nenhuma delas e compartilhavel ou faz sentido
//   como deep-link, e transformar em rota so somaria remount de tela cheia num
//   app com canvas rodando por baixo.
import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from '@/features/auth/HomePage'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { DeviceTakeoverPage } from '@/features/auth/DeviceTakeoverPage'
import { RequireAdmin } from '@/features/admin/RequireAdmin'
import { useAuthStore } from '@/stores/authStore'

// O jogo e o painel de admin em CHUNKS PROPRIOS. Com tudo num bundle so, a Home
// e o Login baixavam o motor, o catalogo e o Canvas inteiros (2,9 MB, ~730 kB
// em Brotli, medido em 12/10/2026) antes de mostrar um formulario. Agora quem
// abre a Home baixa so a casca publica, e o jogo vem quando a rota /jogo monta
// — com a sessao ja recuperada, entao o download corre em paralelo com o boot.
const GameShell = lazy(() => import('@/features/game/GameShell').then((m) => ({ default: m.GameShell })))
const AdminErrorsPage = lazy(() => import('@/features/admin/AdminErrorsPage').then((m) => ({ default: m.AdminErrorsPage })))

function CarregandoChunk() {
  return (
    <div data-appearance="journey" className="journey-entry flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
      Carregando...
    </div>
  )
}

function App() {
  // O Supabase trata o token do link de recovery como sessao valida — sem
  // este desvio, HomePage veria "tem sessao" e mandaria direto pro jogo
  // (ver HomePage.tsx), pulando a troca de senha que era o motivo do link.
  // Fora do <Routes> de proposito: o hash do link pode cair em qualquer path
  // (depende do Site URL configurado no Supabase), entao a troca de senha
  // precisa interceptar antes do roteamento normal decidir pra onde ir.
  const emRecuperacaoDeSenha = useAuthStore((s) => s.emRecuperacaoDeSenha)
  // Mesmo desvio de ResetPasswordPage, fora do <Routes>: o login pode ter
  // acontecido em qualquer path (Home ou /login), entao a checagem de
  // "outro aparelho conectado" precisa interceptar antes do roteamento
  // normal decidir pra onde ir — nao so na rota /jogo.
  const precisaConfirmarDispositivo = useAuthStore((s) => s.precisaConfirmarDispositivo)

  return (
    <BrowserRouter>
      {emRecuperacaoDeSenha ? (
        <ResetPasswordPage />
      ) : precisaConfirmarDispositivo ? (
        <DeviceTakeoverPage />
      ) : (
        <Suspense fallback={<CarregandoChunk />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegisterPage />} />
          <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
          <Route
            path="/jogo"
            element={
              <RequireAuth>
                <GameShell />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <RequireAdmin>
                  <AdminErrorsPage />
                </RequireAdmin>
              </RequireAuth>
            }
          />
          {/* URL desconhecida volta pra home em vez de tela branca. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      )}
    </BrowserRouter>
  )
}

export default App
