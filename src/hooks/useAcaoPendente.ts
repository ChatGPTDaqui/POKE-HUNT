// Estado de "esperando o servidor" pros botoes que fazem round-trip (Entrar
// numa hunt, Comprar, Vender, Evoluir, Desbloquear).
//
// Antes desses botoes nao terem estado nenhum, clicar tres vezes numa compra
// mandava tres intencoes — e sob autoridade do servidor cada uma cobra de
// verdade. O `pendingKey` e por LINHA (id do item/POKE) e nao um booleano
// global: uma lista de 30 itens nao pode congelar inteira porque um deles esta
// no ar.
import { useCallback, useEffect, useRef, useState } from 'react'

export interface AcaoPendente {
  pendingKey: string | null
  isPending: (key: string) => boolean
  run: (key: string, fn: () => Promise<unknown> | unknown) => Promise<void>
}

export function useAcaoPendente(): AcaoPendente {
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const montado = useRef(true)

  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  const run = useCallback(async (key: string, fn: () => Promise<unknown> | unknown) => {
    // Guarda de reentrancia: sem ela, dois cliques rapidos na MESMA linha
    // disparam duas acoes antes de o primeiro `setPendingKey` chegar ao DOM.
    if (pendingKey != null) return
    setPendingKey(key)
    try {
      await fn()
    } finally {
      // A janela pode ter fechado no meio (varias acoes fecham a tela ao
      // terminar) — escrever estado num componente desmontado nao quebra, mas
      // tambem nao serve pra nada.
      if (montado.current) setPendingKey(null)
    }
  }, [pendingKey])

  return {
    pendingKey,
    isPending: useCallback((key: string) => pendingKey === key, [pendingKey]),
    run,
  }
}
