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
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from '@/features/auth/HomePage'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { GameShell } from '@/features/game/GameShell'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registro" element={<RegisterPage />} />
        <Route
          path="/jogo"
          element={
            <RequireAuth>
              <GameShell />
            </RequireAuth>
          }
        />
        {/* URL desconhecida volta pra home em vez de tela branca. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
