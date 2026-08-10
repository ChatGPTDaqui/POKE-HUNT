// Sessao do Supabase Auth exposta como store Zustand, no mesmo padrao das
// outras stores do app.
//
// Por que uma store e nao so `supabase.auth.getSession()` onde precisar: a
// sessao muda por fora de qualquer render (token expira e e renovado sozinho,
// login em outra aba, ban aplicado no meio da sessao). `onAuthStateChange` e
// a unica forma de reagir a isso — a spec §7.4 registra isso explicitamente,
// porque sem o listener o cliente segue rodando com um JWT ja rejeitado e as
// queries falham em silencio, sem redirecionar pro login.
import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { ehFalhaSemResposta, mensagemDeFalhaDeRede } from '@/lib/erroDeRede'

interface AuthState {
  session: Session | null
  user: User | null
  // `true` ate a primeira resposta do Supabase. Sem isso, o app pisca a tela
  // de login por um instante para quem JA esta logado, porque a sessao vem do
  // storage de forma assincrona.
  loading: boolean
  // `true` quando o link de "esqueci minha senha" acabou de logar o usuario.
  // O Supabase trata o token de recovery como uma sessao valida de verdade —
  // sem esta flag, o app veria "tem sessao" e mandaria direto pro jogo (App.tsx
  // ja faz isso pra sessao normal), pulando a troca de senha que era o motivo
  // do link. Some assim que a senha nova e confirmada.
  emRecuperacaoDeSenha: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, trainerName?: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  atualizarSenha: (novaSenha: string) => Promise<{ error: string | null }>
}

// Mensagens do Supabase vem em ingles e algumas sao cripticas para o jogador.
// So as mais comuns sao traduzidas; o resto passa como veio, em vez de virar
// um "erro desconhecido" generico que esconde a causa real.
function traduzErro(mensagem: string): string {
  const m = mensagem.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Email ou senha incorretos.'
  if (m.includes('user already registered')) return 'Ja existe uma conta com este email.'
  if (m.includes('password should be at least')) return 'A senha precisa de pelo menos 8 caracteres, com letras e numeros.'
  if (m.includes('password') && m.includes('weak')) return 'Senha fraca: use pelo menos 8 caracteres, com letras e numeros.'
  if (m.includes('unable to validate email')) return 'Email invalido.'
  if (m.includes('email rate limit') || m.includes('over_email_send_rate_limit')) {
    return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
  }
  // Sem esta traducao a tela de login mostrava a string crua do navegador, em
  // ingles: o jogador com bloqueador via "Failed to fetch" e nao tinha o que
  // fazer com isso. Ver lib/erroDeRede.ts pro porque da mensagem citar
  // bloqueador de anuncios.
  if (ehFalhaSemResposta(mensagem)) return mensagemDeFalhaDeRede()
  return mensagem
}

// Sem `set` no criador de proposito: a escrita de sessao acontece so nos dois
// callbacks do Supabase no fim do arquivo (via `setState`), pra existir um
// unico dono desse campo. As acoes abaixo apenas chamam a API e devolvem erro.
export const useAuthStore = create<AuthState>(() => ({
  session: null,
  user: null,
  loading: true,
  emRecuperacaoDeSenha: false,

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? traduzErro(error.message) : null }
  },

  // O nome do treinador viaja em `options.data` (= `raw_user_meta_data` no
  // Postgres) e e lido pelo trigger `handle_new_user`, que cria a linha em
  // `players` na MESMA transacao do cadastro. A alternativa seria o cliente
  // fazer um UPDATE logo depois — que a RLS proibe desde a Fase D (o cliente
  // perdeu a escrita) e que deixaria uma janela com o nome errado.
  signUp: async (email, password, trainerName) => {
    const nome = trainerName?.trim()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      ...(nome ? { options: { data: { trainer_name: nome } } } : {}),
    })
    return { error: error ? traduzErro(error.message) : null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
  },

  atualizarSenha: async (novaSenha) => {
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    if (error) return { error: traduzErro(error.message) }
    useAuthStore.setState({ emRecuperacaoDeSenha: false })
    return { error: null }
  },
}))

// Ligado uma vez, no carregamento do modulo — nao dentro de um componente.
// Um `useEffect` seria desmontado/remontado junto com a arvore e poderia
// perder um evento de auth exatamente durante uma troca de rota.
supabase.auth.getSession().then(({ data }) => {
  useAuthStore.setState({ session: data.session, user: data.session?.user ?? null, loading: false })
})

supabase.auth.onAuthStateChange((event, session) => {
  useAuthStore.setState({
    session,
    user: session?.user ?? null,
    loading: false,
    ...(event === 'PASSWORD_RECOVERY' ? { emRecuperacaoDeSenha: true } : {}),
  })
})
