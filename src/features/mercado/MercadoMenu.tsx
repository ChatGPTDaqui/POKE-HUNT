// Mercado entre jogadores — stub, exatamente como o handoff previa ("o painel
// Mercado é um stub"). O desenho da tela depende de decidir como o mercado
// funciona (leilao? preco fixo? taxa?), e nada disso foi definido.
import { Storefront } from '@phosphor-icons/react'
import { ComingSoon } from '@/components/game/controls'

export function MercadoMenu() {
  return (
    <ComingSoon icon={<Storefront />} title="Mercado entre jogadores">
      Compra e venda de POKEs e itens entre jogadores. Espaço reservado — as regras (leilão ou preço fixo,
      taxa, o que pode ser negociado) precisam ser definidas antes de a tela existir.
    </ComingSoon>
  )
}
