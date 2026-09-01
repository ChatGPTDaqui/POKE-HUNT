import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { AuthForm } from './AuthForm'

export function LoginPage() {
  const signIn = useAuthStore((s) => s.signIn)
  const navigate = useNavigate()

  return (
    <AuthForm
      titulo="Entrar"
      descricao="Acesse sua conta para continuar de onde parou."
      rotuloAcao="Entrar"
      onSubmit={signIn}
      mostrarEsqueciSenha
      aoConcluir={() => navigate('/jogo', { replace: true })}
      rodape={{ texto: 'Ainda não tem conta?', linkTexto: 'Criar conta', para: '/registro' }}
    />
  )
}
