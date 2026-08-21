// Tooltip de item: o que ele FAZ, em numeros.
//
// Um componente so, usado na Mochila, na Loja e no Mercado — o texto e derivado
// (ver data/itemInfo.ts), entao as tres telas nunca discordam sobre quanto uma
// Hyper Potion cura.
//
// No DEDO nao existe hover, e este era o unico lugar que dizia quanto cada item
// cura ou quanto vale — a Loja mostra nome e preco, mais nada. Entao no toque o
// mesmo conteudo abre num sheet. Mesmo remendo do slot de golpe e da faixa de
// status, e pelo mesmo motivo: informacao presa no hover e informacao que o
// jogador de celular nunca ve.
import { useState, type ReactNode } from 'react'
import { infoDoItem } from '@/data/itemInfo'
import type { AnyItem } from '@/data/items'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Sheet } from '@/components/game/Sheet'
import { useDeviceMode } from '@/stores/uiStore'

export function ItemTooltip({ item, children }: { item: AnyItem; children: ReactNode }) {
  const info = infoDoItem(item)
  const { coarse } = useDeviceMode()
  const [aberto, setAberto] = useState(false)

  if (coarse) {
    return (
      <>
        <span
          role="button"
          tabIndex={0}
          aria-label={`O que faz: ${item.name}`}
          data-keep-open
          // `stopPropagation`: o card em volta tem `onClick` proprio (linkar no
          // chat, abrir perfil). Abrir a ficha do item nao pode disparar os dois.
          onClick={(e) => {
            e.stopPropagation()
            setAberto(true)
          }}
          className="contents"
        >
          {children}
        </span>
        {aberto && (
          <Sheet winKey="item" snap="conteudo" zIndex={34} onClose={() => setAberto(false)} title={item.name}>
            <div className="flex flex-col gap-[.45em] text-[.9em]">
              <span className="text-n300">{info.resumo}</span>
              {info.efeitos.map((linha) => (
                <span key={linha} className="text-n200">• {linha}</span>
              ))}
              {info.precos.length > 0 && (
                <span className="text-[.9em] text-n400">{info.precos.join(' · ')}</span>
              )}
            </div>
          </Sheet>
        )}
      </>
    )
  }

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
