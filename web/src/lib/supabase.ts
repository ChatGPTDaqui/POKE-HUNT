// Cliente Supabase do navegador. Usa a `anon` key, que e publica por
// natureza (vai dentro do bundle) — quem protege o dado nao e ela, e a RLS
// no Postgres. A `service_role` NUNCA aparece aqui: ela ignora RLS e vive so
// no `.env` da raiz, usado por script/servidor.
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Falha barulhenta e cedo: sem isso o app so quebraria na primeira query, com
// um erro de rede generico que nao diz que o problema e configuracao faltando.
if (!url || !anonKey) {
  throw new Error(
    'Supabase nao configurado. Copie web/.env.example para web/.env.local e preencha ' +
      'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (Dashboard > Project Settings > API).',
  )
}

// Tipado com o schema real do banco (`database.types.ts`, gerado por
// `npm run db:types`) — um typo em nome de tabela/coluna vira erro de
// compilacao em vez de erro de runtime em producao.
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    // Mantem a sessao entre reloads e renova o token sozinho. `detectSessionInUrl`
    // e o que faz o retorno de magic-link / confirmacao de email funcionar.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
