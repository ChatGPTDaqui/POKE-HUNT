// Tela de "esqueci minha senha" — so pede o email e dispara o link de
// recovery. A troca de senha em si acontece em ResetPasswordPage.tsx, quando
// o jogador volta pelo link do email.
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ForgotPasswordPage() {
  const enviarRecuperacaoDeSenha = useAuthStore((s) => s.enviarRecuperacaoDeSenha)
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    const { error } = await enviarRecuperacaoDeSenha(email.trim())
    setEnviando(false)
    if (error) return setErro(error)
    setEnviado(true)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-5 rounded-lg border bg-card p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Recuperar senha</h1>
          <p className="text-sm text-muted-foreground">
            {enviado
              ? 'Se existir uma conta com este email, enviamos um link pra trocar a senha.'
              : 'Digite o email da sua conta pra receber um link de recuperacao.'}
          </p>
        </div>

        {enviado ? (
          <Button className="w-full" onClick={() => navigate('/login')}>
            Voltar pro login
          </Button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email" type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {erro && (
              <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando ? 'Aguarde...' : 'Enviar link de recuperacao'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
                Voltar pro login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
