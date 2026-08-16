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
  // `pendingKey` (state) so reflete no DOM no proximo render — dois cliques
  // sincronos (ou disparados no mesmo tick) leem o mesmo valor antigo fechado
  // no closure e passam os dois pela guarda (PH-8, PH-13: mesmo defeito que
  // `mutation.isPending` do TanStack Query tinha, so que reimplementado com
  // state). A guarda de verdade precisa ser sincrona.
  const pendingRef = useRef<string | null>(null)
  const montado = useRef(true)

  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  const run = useCallback(async (key: string, fn: () => Promise<unknown> | unknown) => {
    if (pendingRef.current != null) return
    pendingRef.current = key
    setPendingKey(key)
    try {
      await fn()
    } finally {
      pendingRef.current = null
      // A janela pode ter fechado no meio (varias acoes fecham a tela ao
      // terminar) — escrever estado num componente desmontado nao quebra, mas
      // tambem nao serve pra nada.
      if (montado.current) setPendingKey(null)
    }
  }, [])

  return {
    pendingKey,
    // Sem useCallback: a dependencia e o proprio `pendingKey`, entao a funcao
    // ja seria recriada toda vez que o resultado de `isPending` mudasse -- o
    // memo nao estabilizava nada, so pagava o custo da comparacao de deps.
    isPending: (key: string) => pendingKey === key,
    run,
  }
}
