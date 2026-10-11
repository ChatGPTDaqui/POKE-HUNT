import { useCallback } from 'react'
import CryptoJS from 'crypto-js'

// Preferências locais, nunca credenciais. Chaves VITE entram no bundle:
// AES aqui é ofuscação em repouso, não proteção contra XSS.
const secret = import.meta.env.VITE_AUTH_STORAGE_KEY
const prefix = 'enc:'

export function useSecureStorage() {
  const getItem = useCallback(<T,>(key: string, fallback: T | null = null): T | null => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw === null) return fallback
      const payload = raw.startsWith(prefix)
        ? secret ? CryptoJS.AES.decrypt(raw.slice(prefix.length), secret).toString(CryptoJS.enc.Utf8) : ''
        : raw
      return payload ? JSON.parse(payload) as T : fallback
    } catch {
      return fallback
    }
  }, [])

  const setItem = useCallback(<T,>(key: string, value: T): boolean => {
    try {
      const payload = JSON.stringify(value)
      window.localStorage.setItem(key, secret ? prefix + CryptoJS.AES.encrypt(payload, secret).toString() : payload)
      return true
    } catch {
      // Storage bloqueado/cheio não impede o ajuste em memória.
      return false
    }
  }, [])

  return { getItem, setItem }
}
