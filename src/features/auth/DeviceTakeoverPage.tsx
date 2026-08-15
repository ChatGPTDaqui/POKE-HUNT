// Mostrada quando o login desta aba encontra outra sessao ainda viva pra
// este usuario (App.tsx troca pra ca via authStore.precisaConfirmarDispositivo,
// mesmo padrao de ResetPasswordPage/emRecuperacaoDeSenha). O jogador escolhe
// se quer JOGAR POR AQUI (derruba o aparelho antigo) ou desistir.
import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'

export function DeviceTakeoverPage() {
  const assumirControle = useAuthStore((s) => s.assumirControle)
  const cancelarTrocaDeDispositivo = useAuthStore((s) => s.cancelarTrocaDeDispositivo)
  const [processando, setProcessando] = useState<'assumir' | 'cancelar' | null>(null)

  async function aoAssumir() {
    setProcessando('assumir')
    await assumirControle()
    // Sem setProcessando(null) aqui: sucesso troca a tela inteira (o gate em
    // App.tsx sai desta pagina assim que `precisaConfirmarDispositivo` vira
    // false) — deixar o botao "carregando" ate la evita um segundo clique
    // durante a troca.
  }

  async function aoCancelar() {
    setProcessando('cancelar')
    await cancelarTrocaDeDispositivo()
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-5 rounded-lg border bg-card p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Jogar por aqui?</h1>
          <p className="text-sm text-muted-foreground">
            Sua conta ja esta conectada em outro aparelho. Continuar aqui vai desconectar
            o outro — so um aparelho joga por vez.
          </p>
        </div>

        <div className="space-y-2">
          <Button className="w-full" onClick={aoAssumir} disabled={processando !== null}>
            {processando === 'assumir' ? 'Assumindo...' : 'Jogar por aqui'}
          </Button>
          <Button
            type="button" variant="outline" className="w-full"
            onClick={aoCancelar} disabled={processando !== null}
          >
            {processando === 'cancelar' ? 'Saindo...' : 'Cancelar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
