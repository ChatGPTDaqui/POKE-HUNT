// Tela de "definir senha nova", mostrada quando o link de recovery do email
// loga o usuario (App.tsx troca pra ca via authStore.emRecuperacaoDeSenha em
// vez de deixar o fluxo normal mandar direto pro jogo).
import { useState, type FormEvent } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MIN_SENHA, validaSenha } from './AuthForm'

export function ResetPasswordPage() {
  const atualizarSenha = useAuthStore((s) => s.atualizarSenha)
  const sairDaRecuperacaoDeSenha = useAuthStore((s) => s.sairDaRecuperacaoDeSenha)
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [concluido, setConcluido] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    const problema = validaSenha(senha)
    if (problema) return setErro(problema)
    if (senha !== senha2) return setErro('As senhas nao conferem.')

    setEnviando(true)
    const { error } = await atualizarSenha(senha)
    setEnviando(false)
    if (error) return setErro(error)
    setConcluido(true)
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-5 rounded-lg border bg-card p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Definir senha nova</h1>
          <p className="text-sm text-muted-foreground">
            {concluido ? 'Senha atualizada.' : 'Escolha uma senha nova pra sua conta.'}
          </p>
        </div>

        {concluido ? (
          <Button
            className="w-full"
            onClick={() => {
              sairDaRecuperacaoDeSenha()
              window.location.href = '/jogo'
            }}
          >
            Ir pro jogo
          </Button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="senha">Senha nova</Label>
              <Input
                id="senha" type="password" required autoComplete="new-password"
                value={senha} onChange={(e) => setSenha(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Pelo menos {MIN_SENHA} caracteres, com letras e numeros.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha2">Confirme a senha</Label>
              <Input
                id="senha2" type="password" required autoComplete="new-password"
                value={senha2} onChange={(e) => setSenha2(e.target.value)}
              />
            </div>

            {erro && (
              <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando ? 'Aguarde...' : 'Salvar senha'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
