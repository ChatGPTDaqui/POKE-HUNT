/// <reference types="vite/client" />

// Tipa as variaveis de ambiente do app (ver web/.env.example). Sem isto,
// `import.meta.env.VITE_SUPABASE_URL` seria `any` e um typo no nome passaria
// batido no type-check.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
