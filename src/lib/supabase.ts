// Cliente Supabase do navegador. Usa a `anon` key, que e publica por
// natureza (vai dentro do bundle) — quem protege o dado nao e ela, e a RLS
// no Postgres. A `service_role` NUNCA aparece aqui: ela ignora RLS e vive so
// no `.env` da raiz, usado por script/servidor.
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { secureAuthStorage } from './secureAuthStorage'

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
// Schema alvo no PostgREST -- 'public' (default, producao) ou 'dev' (ambiente
// de teste clonado no mesmo projeto Supabase). database.types.ts so cobre
// `public`; apontar pra `dev` mantem o client funcional mas perde o
// type-check de tabela/coluna (regenerar tipos contra dev cobre isso depois).
export const schema = (import.meta.env.VITE_SUPABASE_SCHEMA || 'public') as 'public'

export const supabase = createClient<Database>(url, anonKey, {
  db: { schema },
  auth: {
    // Mantem a sessao entre reloads e renova o token sozinho. `detectSessionInUrl`
    // e o que faz o retorno de magic-link / confirmacao de email funcionar.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Token no localStorage vai criptografado (AES) — mitigacao parcial,
    // nao protege contra XSS ativo. Ver PH-30 em _Architecture.md.
    storage: secureAuthStorage,
  },
})
