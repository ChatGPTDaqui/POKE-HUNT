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
