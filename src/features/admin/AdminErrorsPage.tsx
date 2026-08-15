// audit_logs guarda UMA LINHA POR EVENTO (sem dedup por assinatura como a
// antiga error_logs) — volume bem maior. Por isso: paginação offset-based
// (50 por página), sem refetchInterval (trocaria a página debaixo do
// usuário), botão manual "Atualizar", filtro por fonte e busca de rota
// client-side no array já carregado (server-side fica fora de escopo da v1).
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface AuditLogRow {
  id: string
  fonte: string
  rota: string | null
  user_id: string | null
  nivel: string
  mensagem: string
  contexto: unknown
  ocorrido_em: string
  criado_em: string
}

const PAGE_SIZE = 50

export function AdminErrorsPage() {
  const [page, setPage] = useState(0)
  const [fonte, setFonte] = useState<'todas' | 'client' | 'log-puller'>('todas')
  const [busca, setBusca] = useState('')
  const queryClient = useQueryClient()

  const queryKey = ['admin-audit-logs', page, fonte]

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from('audit_logs')
        .select('id, fonte, rota, user_id, nivel, mensagem, contexto, ocorrido_em, criado_em')
        .order('ocorrido_em', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      if (fonte !== 'todas') {
        query = query.eq('fonte', fonte)
      }
      const { data, error } = await query
      if (error) throw error
      return data as AuditLogRow[]
    },
  })

  const linhas = (data ?? []).filter((linha) =>
    busca.trim() === '' ? true : (linha.rota ?? '').toLowerCase().includes(busca.trim().toLowerCase()),
  )

  const userIds = [...new Set(linhas.map((l) => l.user_id).filter((id): id is string => id != null))]

  const { data: nicks } = useQuery({
    queryKey: ['admin-audit-logs-nicks', userIds],
    queryFn: async () => {
      const { data, error } = await supabase.from('players').select('user_id, trainer_name').in('user_id', userIds)
      if (error) throw error
      return Object.fromEntries(data.map((p) => [p.user_id, p.trainer_name])) as Record<string, string>
    },
    enabled: userIds.length > 0,
  })

  return (
    <div className="min-h-svh bg-background p-6 text-foreground">
      <h1 className="mb-4 text-lg font-semibold">Erros — client + servidor</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          className="border border-n700 bg-background px-2 py-1 text-sm"
          value={fonte}
          onChange={(e) => {
            setFonte(e.target.value as typeof fonte)
            setPage(0)
          }}
        >
          <option value="todas">Todas as fontes</option>
          <option value="client">client</option>
          <option value="log-puller">log-puller</option>
        </select>
        <input
          className="border border-n700 bg-background px-2 py-1 text-sm"
          placeholder="Buscar por rota..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button
          type="button"
          className="border border-n700 px-3 py-1 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => queryClient.invalidateQueries({ queryKey })}
        >
          Atualizar
        </button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {error && <p className="text-sm text-bad">Falha ao carregar: {error.message}</p>}
      {data && linhas.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum erro registrado ainda.</p>
      )}
      {data && linhas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-n700 text-muted-foreground">
                <th className="py-2 pr-3">Fonte</th>
                <th className="py-2 pr-3">Rota</th>
                <th className="py-2 pr-3">Usuário</th>
                <th className="py-2 pr-3">Mensagem</th>
                <th className="py-2 pr-3">Momento</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.id} className="border-b border-n800">
                  <td className="py-2 pr-3">{linha.fonte}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{linha.rota ?? '—'}</td>
                  <td className="py-2 pr-3 text-xs">
                    {linha.user_id ? (nicks?.[linha.user_id] ?? linha.user_id.slice(0, 8)) : '—'}
                  </td>
                  <td className="py-2 pr-3 max-w-[480px] truncate" title={linha.mensagem}>{linha.mensagem}</td>
                  <td className="py-2 pr-3 text-xs">{new Date(linha.ocorrido_em).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          className="border border-n700 px-3 py-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Anterior
        </button>
        <span className="text-sm text-muted-foreground">Página {page + 1}</span>
        <button
          type="button"
          className="border border-n700 px-3 py-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
          disabled={!data || data.length < PAGE_SIZE}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  )
}
