// Renderiza uma linha de log/toast pintando UM trecho dela numa cor propria.
//
// Usado pro nome de um POKE sair na cor da raridade dele (ver
// stores/toastStore.ts#ToastRealce). Fica num componente compartilhado porque
// o chat e a pilha de toasts mostram a MESMA linha — duas implementacoes
// divergiriam no primeiro ajuste.
import type { ToastRealce } from '@/stores/toastStore'

export function TextoComRealce({ texto, realce }: { texto: string; realce?: ToastRealce }) {
  if (!realce?.texto) return <>{texto}</>
  const i = texto.indexOf(realce.texto)
  if (i === -1) return <>{texto}</>
  return (
    <>
      {texto.slice(0, i)}
      <span style={{ color: realce.cor, fontWeight: 600 }}>{realce.texto}</span>
      {texto.slice(i + realce.texto.length)}
    </>
  )
}
