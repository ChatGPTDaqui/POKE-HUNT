import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { AuthForm } from './AuthForm'

export function RegisterPage() {
  const signUp = useAuthStore((s) => s.signUp)
  const navigate = useNavigate()

  return (
    <AuthForm
      titulo="Criar conta"
      descricao="Seu progresso fica salvo na nuvem e acompanha voce em qualquer dispositivo."
      rotuloAcao="Criar conta"
      confirmarSenha
      pedirNomeTreinador
      onSubmit={signUp}
      // Com `enable_confirmations = false` (ver supabase/config.toml), o
      // signUp ja devolve sessao ativa e da pra ir direto pro jogo. Quando a
      // confirmacao por email for ligada antes do lancamento publico, isto
      // precisa virar uma tela de "confira seu email" — o usuario NAO estara
      // logado neste ponto.
      aoConcluir={() => navigate('/jogo', { replace: true })}
      rodape={{ texto: 'Ja tem conta?', linkTexto: 'Entrar', para: '/login' }}
    />
  )
}
