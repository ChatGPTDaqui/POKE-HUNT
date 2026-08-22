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
import { flushAgora } from '@/data/remote/gameStatePersistence'
import { pararFlushPeriodico } from '@/data/remote/autoridade'

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
  // `true` quando o login desta aba detectou outra sessao ainda viva pra este
  // usuario. Enquanto isso, o app mostra a tela de "Jogar por aqui?" no lugar
  // do jogo (App.tsx) — a sessao NOVA ja existe (login foi aceito), so o
  // dispositivo antigo ainda nao foi avisado. Ver `assumirControle`.
  precisaConfirmarDispositivo: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, trainerName?: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  atualizarSenha: (novaSenha: string) => Promise<{ error: string | null }>
  enviarRecuperacaoDeSenha: (email: string) => Promise<{ error: string | null }>
  // Fecha a tela de recuperacao explicitamente, DEPOIS que o jogador viu a
  // confirmacao ("Senha atualizada.") e clicou pra seguir — ver o comentario
  // em `atualizarSenha` pro motivo de nao fazer isso sozinho.
  sairDaRecuperacaoDeSenha: () => void
  // Confirma a troca: derruba a(s) outra(s) sessao(oes) e libera o jogo aqui.
  assumirControle: () => Promise<void>
  // Desiste da troca: desfaz o login desta aba, devolve pra tela de entrar —
  // o dispositivo antigo nunca chega a saber que isto aconteceu.
  cancelarTrocaDeDispositivo: () => Promise<void>
}

type RpcSemArgs = (nome: string) => Promise<{ data: unknown; error: { message: string } | null }>
// `database.types.ts` (gerado antes da RPC existir) nao conhece esta funcao —
// mesmo cast local que `acoesRpc.ts#rpcDinamica` ja usa, mesmo motivo (nao
// regenerar o arquivo inteiro no meio de uma migracao pequena).
const rpcSemArgs = ((nome: string) => supabase.rpc(nome as never)) as unknown as RpcSemArgs

async function temOutraSessaoAtiva(): Promise<boolean> {
  const { data, error } = await rpcSemArgs('tem_outra_sessao_de_auth_ativa')
  if (error) return false // rede ruim aqui nao pode travar login — so pula o aviso
  return data === true
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
  precisaConfirmarDispositivo: false,

  // Um dispositivo logado por vez, mas quem decide QUANDO derrubar o antigo e
  // o jogador — pedido explicito: mostrar "Jogar por aqui?" no aparelho NOVO
  // em vez de kickar sozinho. O login em si sempre autentica normalmente
  // (senha certa = sessao criada); so a REVOGACAO da(s) sessao(oes) antiga(s)
  // fica pendurada em `precisaConfirmarDispositivo` ate `assumirControle`.
  //
  // `scope: 'others'` (Supabase Auth) revoga o REFRESH TOKEN de toda sessao
  // anterior deste usuario, sem precisar saber quantas existem nem onde. O
  // dispositivo antigo nao e derrubado NA HORA mesmo apos confirmado — o
  // access token dele (JWT, `jwt_expiry = 3600` em supabase/config.toml)
  // continua validando localmente ate expirar, porque o servidor verifica a
  // assinatura do JWT sem bater no banco (commit "verifica o JWT localmente":
  // decisao de performance, reintroduzir checagem por sessao aqui desfaria
  // aquilo) — perde a sessao na proxima renovacao de token, em ate 1h.
  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: traduzErro(error.message) }
    const outraViva = await temOutraSessaoAtiva()
    if (outraViva) {
      useAuthStore.setState({ precisaConfirmarDispositivo: true })
    }
    return { error: null }
  },

  assumirControle: async () => {
    await supabase.auth.signOut({ scope: 'others' }).catch(() => {
      // Falha aqui (rede) nao pode travar o jogador nesta tela pra sempre —
      // ele so nao vai ter derrubado o outro aparelho desta vez.
    })
    useAuthStore.setState({ precisaConfirmarDispositivo: false })
  },

  cancelarTrocaDeDispositivo: async () => {
    await supabase.auth.signOut()
    useAuthStore.setState({ precisaConfirmarDispositivo: false })
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
    // Sem isto, uma hunt aberta deixa `timerFlush` (autoridade.ts) chamando
    // `/sessao/flush` de 30 em 30s pra sempre — o timer e modulo, nao
    // componente React, entao nenhum unmount da arvore do jogo o cancela.
    // Ele sobrevive ao logout: enquanto deslogado cada tick 401 ("sem sessao"),
    // e se o jogador logar de novo antes do proximo boot liquidar a sessao, um
    // tick que ainda pegue o timer vivo consome o gap "offline" em silencio —
    // o Farm Offline credita mas o modal de "Bem-vindo de volta" nao aparece
    // (o `assentarSessaoPendente` do proximo boot ve kills=0, ja gasto aqui).
    pararFlushPeriodico()
    // PH-17: sem isto, o cleanup reativo de useProgressoRemoto (que roda
    // depois que `user` vira null no store) so chama flushAgora() DEPOIS que
    // signOut() ja invalidou o token local — RLS filtra o UPDATE final pra 0
    // linhas, e Postgrest nao trata isso como erro, entao os ~3s de
    // progresso pendente do debounce somem em silencio. Flush com o token
    // AINDA valido, antes de invalidar a sessao. Nao relanca: uma falha de
    // save nao pode travar o jogador logado.
    await flushAgora().catch((erro) => {
      console.warn('Falha ao salvar progresso antes do logout:', erro)
    })
    await supabase.auth.signOut()
  },

  // NAO fecha `emRecuperacaoDeSenha` aqui: App.tsx troca de tela no MESMO
  // ciclo de commit que o `setState`, entao ResetPasswordPage seria
  // desmontada antes de conseguir mostrar "Senha atualizada." — o jogador
  // caia direto na tela de login sem nenhuma confirmacao. `sairDaRecuperacaoDeSenha`
  // fecha explicitamente, chamada só depois que o jogador VIU a confirmacao.
  atualizarSenha: async (novaSenha) => {
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    return { error: error ? traduzErro(error.message) : null }
  },

  sairDaRecuperacaoDeSenha: () => {
    useAuthStore.setState({ emRecuperacaoDeSenha: false })
  },

  // `redirectTo: '/login'` e nao proposito, mesmo pra quem chegou de /registro
  // ou de dentro do jogo: o link de recovery loga o usuario e ResetPasswordPage
  // intercepta ANTES do roteamento normal decidir pra onde ir (App.tsx,
  // `emRecuperacaoDeSenha` fora do <Routes>) — o path so precisa estar na
  // allow-list de Redirect URLs do projeto Supabase, e /login ja e a rota
  // publica mais obvia pra isso.
  //
  // O Supabase de proposito NAO diz se o email existe (mesma resposta de
  // sucesso nos dois casos) — enumeracao de conta e o motivo, nao um detalhe
  // que falta aqui.
  enviarRecuperacaoDeSenha: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    return { error: error ? traduzErro(error.message) : null }
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
