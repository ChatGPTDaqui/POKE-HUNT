// Adapter de storage pro token de sessao do Supabase Auth. Criptografa o
// valor com AES antes de gravar no localStorage.
//
// IMPORTANTE: isso e mitigacao PARCIAL, nao protecao contra XSS. A chave
// (`VITE_AUTH_STORAGE_KEY`) e uma env var VITE_*, entao vai inlinada em texto
// puro no bundle JS publico — um atacante com XSS ativo roda o mesmo
// `decrypt` que o app roda e le o token igual. O que isso evita e leitura
// casual do token em texto puro (devtools, screenshot, extensao de browser
// fazendo scan de valores obvios tipo JWT). Contra XSS de verdade, a unica
// defesa real seria cookie httpOnly setado por um servidor — sem BFF no
// projeto, essa rota nao existe hoje. Decisao registrada em _Architecture.md
// (PH-30).
import CryptoJS from 'crypto-js'

const STORAGE_SECRET = import.meta.env.VITE_AUTH_STORAGE_KEY as string | undefined
const ENCRYPTION_PREFIX = 'enc:'

if (!STORAGE_SECRET && import.meta.env.PROD) {
  throw new Error(
    'VITE_AUTH_STORAGE_KEY nao configurada. Sem ela o token de sessao seria salvo em texto puro.',
  )
}

// --- varredura de chaves orfas no localStorage (PH-50) ---------------------
//
// Nada no app varria o localStorage atras de chaves que ele mesmo deixou de
// usar. Troca de projeto Supabase, rotacao de VITE_AUTH_STORAGE_KEY, ou a
// migracao do save local pro Postgres deixavam a entrada antiga no browser
// pra sempre — inclusive `refresh_token` em texto puro (chave de projeto
// morto nunca mais lida por `secureAuthStorage.getItem`, entao nunca passa
// pelo decrypt, entao nunca teve o prefixo `enc:` aplicado; ver header do
// arquivo pro porque criptografar isso importa).
//
// Denylist estreita de proposito, NUNCA allowlist: varrer e apagar tudo que
// nao reconhece derrubaria `novo-poke-idle:tutoriais-vistos`, `:hud-scale`,
// `:vidro-fosco` e qualquer chave nova que um `localStorage.setItem` futuro
// venha a criar sem eu saber sobre ela hoje.
const PADRAO_AUTH_TOKEN = /^sb-[a-z0-9]+-auth-token$/

function refDoProjetoAtual(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!url) return null
  try {
    // supabase-js grava sob `sb-<ref>-auth-token`, onde <ref> e o primeiro
    // rotulo do hostname (`https://<ref>.supabase.co`).
    return new URL(url).hostname.split('.')[0] || null
  } catch {
    return null
  }
}

// `novo-poke-idle:save` era o save do adaptador de localStorage puro, antes
// da Fase 4 trocar pro `postgresStorage` (ver gameStateStore.ts). Nenhum
// caminho de leitura hoje consulta essa chave (`lerSaveLocalLegado` existe
// mas nao tem chamador — confirmado antes de escrever isto).
const CHAVE_SAVE_LEGADO = 'novo-poke-idle:save'

/**
 * Roda uma vez no boot (chamada no fim deste modulo). Devolve as chaves
 * removidas so pra teste/log — nada no app le o retorno.
 */
export function limparStorageOrfao(): string[] {
  if (typeof window === 'undefined') return []
  const refAtual = refDoProjetoAtual()
  const removidas: string[] = []
  for (const chave of Object.keys(window.localStorage)) {
    // `refAtual === null` (env faltando/malformada): nao mexe em NENHUMA
    // `sb-*-auth-token` — sem saber qual e a viva, apagar seria apagar a
    // sessao atual tambem.
    const authOrfa = refAtual !== null && PADRAO_AUTH_TOKEN.test(chave) && chave !== `sb-${refAtual}-auth-token`
    const saveObsoleto = chave === CHAVE_SAVE_LEGADO
    if (!authOrfa && !saveObsoleto) continue
    window.localStorage.removeItem(chave)
    removidas.push(chave)
  }
  return removidas
}

limparStorageOrfao()

function encryptValue(value: string): string {
  // Simetrico com `decryptValue`: nunca lanca. Sem isso, uma falha aqui
  // estourava dentro do `setItem` que o supabase-js chama pra persistir o
  // token depois de um refresh bem-sucedido — o refresh acontecia na rede
  // mas nunca gravava local, entao a proxima leitura pegava token velho ou
  // nenhum. Cai pra texto puro (que `decryptValue` ja sabe ler, por nao ter
  // o prefixo) em vez de perder a escrita.
  try {
    return ENCRYPTION_PREFIX + CryptoJS.AES.encrypt(value, STORAGE_SECRET!).toString()
  } catch (erro) {
    console.error('secureAuthStorage: falha ao criptografar, gravando sem criptografia', erro)
    return value
  }
}

function decryptValue(value: string): string | null {
  if (!value.startsWith(ENCRYPTION_PREFIX)) return value
  try {
    const ciphertext = value.slice(ENCRYPTION_PREFIX.length)
    const bytes = CryptoJS.AES.decrypt(ciphertext, STORAGE_SECRET!)
    const decrypted = bytes.toString(CryptoJS.enc.Utf8)
    return decrypted || null
  } catch {
    return null
  }
}

// Interface `SupportedStorage` do supabase-js (auth.storage).
export const secureAuthStorage = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(key)
    if (raw === null) return null
    if (!STORAGE_SECRET) return raw
    return decryptValue(raw)
  },
  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, STORAGE_SECRET ? encryptValue(value) : value)
  },
  removeItem(key: string): void {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(key)
  },
}
