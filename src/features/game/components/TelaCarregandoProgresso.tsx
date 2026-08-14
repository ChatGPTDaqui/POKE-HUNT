import { type EstadoProgresso } from '../useProgressoRemoto'

export function TelaCarregandoProgresso({ estado }: { estado: EstadoProgresso }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      {estado.fase === 'erro' ? (
        <>
          <p className="font-medium text-destructive">Nao foi possivel carregar seu progresso.</p>
          <p className="max-w-md text-sm text-muted-foreground">{estado.mensagem}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
          >
            Tentar de novo
          </button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Carregando seu progresso...</p>
      )}
    </div>
  )
}
