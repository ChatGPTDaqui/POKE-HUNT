// v1 deliberadamente simples (YAGNI, decidido no brainstorm): sem paginacao,
// sem filtro, sem busca. Volume esperado e baixo — error_logs agrupa por
// assinatura (reportar_erro faz upsert), entao um bug repetindo mil vezes
// ainda e UMA linha aqui, com contador.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface ErrorLog {
  id: string
  origem: string
  mensagem: string
  rota: string | null
  ocorrencias: number
  primeira_vez: string
  ultima_vez: string
}

export function AdminErrorsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-error-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('error_logs')
        .select('id, origem, mensagem, rota, ocorrencias, primeira_vez, ultima_vez')
        .order('ultima_vez', { ascending: false })
      if (error) throw error
      return data as ErrorLog[]
    },
    refetchInterval: 30000,
  })

  return (
    <div className="min-h-svh bg-background p-6 text-foreground">
      <h1 className="mb-4 text-lg font-semibold">Erros — client + servidor</h1>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {error && <p className="text-sm text-bad">Falha ao carregar: {error.message}</p>}
      {data && data.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum erro registrado ainda.</p>
      )}
      {data && data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-n700 text-muted-foreground">
                <th className="py-2 pr-3">Origem</th>
                <th className="py-2 pr-3">Rota</th>
                <th className="py-2 pr-3">Mensagem</th>
                <th className="py-2 pr-3">Ocorrências</th>
                <th className="py-2 pr-3">Última vez</th>
              </tr>
            </thead>
            <tbody>
              {data.map((linha) => (
                <tr key={linha.id} className="border-b border-n800">
                  <td className="py-2 pr-3">{linha.origem}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{linha.rota ?? '—'}</td>
                  <td className="py-2 pr-3 max-w-[480px] truncate" title={linha.mensagem}>{linha.mensagem}</td>
                  <td className="py-2 pr-3">{linha.ocorrencias}</td>
                  <td className="py-2 pr-3 text-xs">{new Date(linha.ultima_vez).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
