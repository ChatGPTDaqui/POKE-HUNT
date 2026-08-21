import { useEffect, useState } from 'react'

/**
 * Re-renderiza o componente a cada `ms`. Para valores derivados do RELOGIO
 * (taxa por hora, contagem regressiva) que nao mudam por evento nenhum — sem
 * isto eles congelam no ultimo estado que por acaso mudou.
 *
 * Devolve o contador so pra quem quiser usa-lo como chave; o efeito colateral
 * (o re-render) e o motivo de existir.
 */
export function useIntervalo(ms: number): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), ms)
    return () => clearInterval(id)
  }, [ms])
  return tick
}
