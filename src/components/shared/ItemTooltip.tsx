// Tooltip de item: o que ele FAZ, em numeros.
//
// Um componente so, usado na Mochila, na Loja e no Mercado — o texto e derivado
// (ver data/itemInfo.ts), entao as tres telas nunca discordam sobre quanto uma
// Hyper Potion cura.
import type { ReactNode } from 'react'
import { infoDoItem } from '@/data/itemInfo'
import type { AnyItem } from '@/data/items'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function ItemTooltip({ item, children }: { item: AnyItem; children: ReactNode }) {
  const info = infoDoItem(item)
  return (
    <Tooltip>
      {/* `render` com um <span> e nao `asChild`: o gatilho embrulha conteudo
          arbitrario (icone, nome, card inteiro) e um <button> implicito
          engoliria o clique de quem esta por baixo. */}
      <TooltipTrigger render={<span className="contents" />}>{children}</TooltipTrigger>
      <TooltipContent className="max-w-[20em] bg-popover text-popover-foreground">
        <div className="flex flex-col gap-[.3em] text-[.95em]">
          <b>{item.name}</b>
          <span className="opacity-80">{info.resumo}</span>
          {info.efeitos.map((linha) => (
            <span key={linha}>• {linha}</span>
          ))}
          {info.precos.length > 0 && (
            <span className="opacity-70">{info.precos.join(' · ')}</span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
