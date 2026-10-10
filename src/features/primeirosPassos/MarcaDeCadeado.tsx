import { LockSimple } from '@phosphor-icons/react'
import { textoDoRequisito } from '@/data/desbloqueios'

/**
 * Cadeado no canto de um botão de menu, com o passo que libera ("Passo 6").
 * O botão continua visível e tocável: o toque explica o requisito.
 */
export function MarcaDeCadeado({ passoId }: { passoId: string }) {
  return (
    <span className="pointer-events-none absolute -top-[.2em] -right-[.2em] flex items-center gap-[.1em] whitespace-nowrap rounded-full border border-n700 bg-n900 px-[.3em] py-[.05em] text-[.55em] font-bold text-n300">
      <LockSimple weight="fill" aria-hidden />
      {textoDoRequisito(passoId, true)}
    </span>
  )
}
