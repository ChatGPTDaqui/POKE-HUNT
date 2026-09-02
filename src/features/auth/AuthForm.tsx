// Formulario compartilhado por Login e Registro — os dois tem exatamente os
// mesmos campos e a mesma validacao; so muda o texto e qual funcao da
// authStore e chamada. Manter um componente evita as duas telas divergirem
// (mensagem de erro diferente pro mesmo caso, validacao aplicada num e nao no
// outro).
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Espelha o que o servidor exige (supabase/config.toml: minimum_password_length
// = 8, password_requirements = "letters_digits"). Validar aqui e so UX — poupa
// um round-trip e da mensagem melhor; quem de fato barra e o Supabase.
export const MIN_SENHA = 8

export function validaSenha(senha: string): string | null {
  if (senha.length < MIN_SENHA) return `A senha precisa de pelo menos ${MIN_SENHA} caracteres.`
  if (!/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) return 'A senha precisa misturar letras e números.'
  return null
}

// O nick e identidade publica: aparece no chat, no ranking, no Mercado e e o
// que o Social usa pra achar alguem. Dai os limites serem mais duros que os de
// um campo de texto comum — e dai ele ser UNICO no banco (indice unico sobre
// `lower(trainer_name)`).
const MIN_NICK = 3
const MAX_NICK = 16
const NICK_VALIDO = /^[A-Za-z0-9_]+$/

function validaNick(nick: string): string | null {
  if (nick.length < MIN_NICK || nick.length > MAX_NICK) {
    return `O nome do treinador precisa ter de ${MIN_NICK} a ${MAX_NICK} caracteres.`
  }
  if (!NICK_VALIDO.test(nick)) return 'Use apenas letras, números e _ no nome do treinador.'
  return null
}

export interface AuthFormProps {
  titulo: string
  descricao: string
  rotuloAcao: string
  onSubmit: (email: string, senha: string, nomeTreinador?: string) => Promise<{ error: string | null }>
  rodape: { texto: string; linkTexto: string; para: string }
  // Registro pede confirmacao de senha; login nao.
  confirmarSenha?: boolean
  // Registro pede o nome do treinador; login nao.
  pedirNomeTreinador?: boolean
  // So o Login mostra o link — recuperar senha de uma conta que ainda nao
  // existe (Registro) nao faz sentido.
  mostrarEsqueciSenha?: boolean
  aoConcluir?: () => void
}

export function AuthForm({
  titulo, descricao, rotuloAcao, onSubmit, rodape,
  confirmarSenha = false, pedirNomeTreinador = false, mostrarEsqueciSenha = false, aoConcluir,
}: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [nick, setNick] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    const problemaSenha = validaSenha(senha)
    if (problemaSenha) return setErro(problemaSenha)
    if (confirmarSenha && senha !== senha2) return setErro('As senhas não conferem.')

    const nickLimpo = nick.trim()
    if (pedirNomeTreinador) {
      const problemaNick = validaNick(nickLimpo)
      if (problemaNick) return setErro(problemaNick)

      // Checagem de disponibilidade ANTES de criar a conta. E consulta, nao
      // reserva: entre esta resposta e o cadastro alguem pode levar o nome. O
      // trigger `handle_new_user` cobre esse caso desambiguando com sufixo em
      // vez de derrubar o cadastro — perder a conta por causa de um nick seria
      // desproporcional. Aqui a checagem existe pra o caso comum (nome ja
      // usado ha meses) dar uma mensagem util em vez de um nome com sufixo
      // aparecendo do nada.
      const { data, error } = await supabase.rpc('nome_de_treinador_disponivel', { nome: nickLimpo })
      if (!error && data === false) {
        return setErro(`O nome "${nickLimpo}" já esta em uso. Escolha outro.`)
      }
    }

    setEnviando(true)
    const { error } = await onSubmit(email.trim(), senha, pedirNomeTreinador ? nickLimpo : undefined)
    setEnviando(false)
    if (error) return setErro(error)
    aoConcluir?.()
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5 rounded-lg border bg-card p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{titulo}</h1>
          <p className="text-sm text-muted-foreground">{descricao}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email" type="email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {pedirNomeTreinador && (
          <div className="space-y-2">
            <Label htmlFor="nick">Nome do treinador</Label>
            <Input
              id="nick" name="nick" required autoComplete="nickname"
              maxLength={MAX_NICK} placeholder="Como você aparece no mundo"
              value={nick} onChange={(e) => setNick(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {MIN_NICK} a {MAX_NICK} caracteres, letras/numeros/_ . Aparece no chat, no ranking e no Mercado.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="senha">Senha</Label>
          <Input
            id="senha" type="password" required
            autoComplete={confirmarSenha ? 'new-password' : 'current-password'}
            value={senha} onChange={(e) => setSenha(e.target.value)}
          />
          {confirmarSenha && (
            <p className="text-xs text-muted-foreground">Pelo menos {MIN_SENHA} caracteres, com letras e números.</p>
          )}
          {mostrarEsqueciSenha && (
            <Link to="/esqueci-senha" className="inline-block text-xs text-muted-foreground underline underline-offset-4">
              Esqueci minha senha
            </Link>
          )}
        </div>

        {confirmarSenha && (
          <div className="space-y-2">
            <Label htmlFor="senha2">Confirme a senha</Label>
            <Input
              id="senha2" type="password" required autoComplete="new-password"
              value={senha2} onChange={(e) => setSenha2(e.target.value)}
            />
          </div>
        )}

        {erro && (
          <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={enviando}>
          {enviando ? 'Aguarde...' : rotuloAcao}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          {rodape.texto}{' '}
          <Link to={rodape.para} className="font-medium text-foreground underline underline-offset-4">
            {rodape.linkTexto}
          </Link>
        </p>
      </form>
    </div>
  )
}
