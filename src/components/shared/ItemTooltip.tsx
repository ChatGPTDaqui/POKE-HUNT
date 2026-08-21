// Tooltip de item: o que ele FAZ, em numeros.
//
// Um componente so, usado na Mochila, na Loja e no Mercado — o texto e derivado
// (ver data/itemInfo.ts), entao as tres telas nunca discordam sobre quanto uma
// Hyper Potion cura. Era o unico lugar do jogo que dizia quanto cada item cura
// ou quanto vale: a Loja mostra nome e preco, mais nada.
//
// Este arquivo tinha um ramo proprio por `useDeviceMode().coarse` que abria um
// `Sheet` no dedo, com o MESMO conteudo escrito duas vezes em dois formatos.
// Virou `Explicacao`, o mecanismo unico que abre no mouse e no dedo — uma copia
// do conteudo, e o ramo por media query fora do caminho (notebook com tela de
// toque e as duas coisas ao mesmo tempo; ver components/shared/Explicacao.tsx).
import type { ReactNode } from 'react'
import { infoDoItem } from '@/data/itemInfo'
import type { AnyItem } from '@/data/items'
import { Explicacao } from './Explicacao'

export function ItemTooltip({ item, children }: { item: AnyItem; children: ReactNode }) {
  const info = infoDoItem(item)

  return (
    <Explicacao
      // `bloco` porque o gatilho embrulha conteudo arbitrario (icone, nome, bloco
      // inteiro do card) e nao pode mudar o layout dele.
      envolve="bloco"
      classeDoConteudo="max-w-[20em]"
      conteudo={
        <div className="flex flex-col gap-[.3em] text-left">
          <b>{item.name}</b>
          <span className="opacity-80">{info.resumo}</span>
          {info.efeitos.map((linha) => (
            <span key={linha}>• {linha}</span>
          ))}
          {info.precos.length > 0 && (
            <span className="opacity-70">{info.precos.join(' · ')}</span>
          )}
        </div>
      }
    >
      {children}
    </Explicacao>
  )
}
