// Formulario compartilhado por Login e Registro — os dois tem exatamente os
// mesmos campos e a mesma validacao; so muda o texto e qual funcao da
// authStore e chamada. Manter um componente evita as duas telas divergirem
// (mensagem de erro diferente pro mesmo caso, validacao aplicada num e nao no
// outro).
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Espelha o que o servidor exige (supabase/config.toml: minimum_password_length
// = 8, password_requirements = "letters_digits"). Validar aqui e so UX — poupa
// um round-trip e da mensagem melhor; quem de fato barra e o Supabase.
const MIN_SENHA = 8

function validaSenha(senha: string): string | null {
  if (senha.length < MIN_SENHA) return `A senha precisa de pelo menos ${MIN_SENHA} caracteres.`
  if (!/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) return 'A senha precisa misturar letras e numeros.'
  return null
}

export interface AuthFormProps {
  titulo: string
  descricao: string
  rotuloAcao: string
  onSubmit: (email: string, senha: string) => Promise<{ error: string | null }>
  rodape: { texto: string; linkTexto: string; para: string }
  // Registro pede confirmacao de senha; login nao.
  confirmarSenha?: boolean
  aoConcluir?: () => void
}

export function AuthForm({ titulo, descricao, rotuloAcao, onSubmit, rodape, confirmarSenha = false, aoConcluir }: AuthFormProps) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    const problemaSenha = validaSenha(senha)
    if (problemaSenha) return setErro(problemaSenha)
    if (confirmarSenha && senha !== senha2) return setErro('As senhas nao conferem.')

    setEnviando(true)
    const { error } = await onSubmit(email.trim(), senha)
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

        <div className="space-y-2">
          <Label htmlFor="senha">Senha</Label>
          <Input
            id="senha" type="password" required
            autoComplete={confirmarSenha ? 'new-password' : 'current-password'}
            value={senha} onChange={(e) => setSenha(e.target.value)}
          />
          {confirmarSenha && (
            <p className="text-xs text-muted-foreground">Pelo menos {MIN_SENHA} caracteres, com letras e numeros.</p>
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
