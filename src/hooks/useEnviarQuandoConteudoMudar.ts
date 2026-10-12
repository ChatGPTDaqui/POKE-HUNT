// Chama `enviar` quando o CONTEUDO de `valor` muda — nao a referencia.
//
// POR QUE NAO `useEffect(..., [valor])`: todo flush aplica o estado do servidor
// com `...doServidor` (aplicarEstadoDoServidor), e isso troca a referencia de
// toda config de auto mesmo quando nada mudou. Com dependencia por referencia,
// cada flush virava um `configurar_auto` de volta pro servidor — medido em
// producao em 12/10/2026: ~850 escritas por dia em `players` pra 1 jogador, uma
// por flush, cada uma subindo `updated_at` e arriscando colisao no CAS do flush
// seguinte.
//
// O primeiro valor visto e a linha de base e nao e enviado: ele e o estado que
// acabou de chegar DO servidor.
import { useEffect, useRef } from 'react'

/** JSON com chaves ordenadas: o mesmo objeto vindo do servidor ou do store local da a mesma assinatura. */
export function assinaturaEstavel(valor: unknown): string {
  return JSON.stringify(valor, (_chave, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const ordenado: Record<string, unknown> = {}
      for (const k of Object.keys(v).sort()) ordenado[k] = (v as Record<string, unknown>)[k]
      return ordenado
    }
    return v
  })
}

export function useEnviarQuandoConteudoMudar(valor: unknown, enviar: () => void): void {
  const assinatura = assinaturaEstavel(valor)
  const ultima = useRef<string | null>(null)
  const enviarRef = useRef(enviar)
  enviarRef.current = enviar

  useEffect(() => {
    if (ultima.current === null) {
      ultima.current = assinatura
      return
    }
    if (assinatura === ultima.current) return
    ultima.current = assinatura
    enviarRef.current()
  }, [assinatura])
}
