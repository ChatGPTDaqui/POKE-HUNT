// Painel de automacoes. O BOTAO que o abre vive na doca
// (`ActionDock#BotaoAuto`): solto no canto ele tinha que medir a altura do
// rodape a cada regime pra nao ficar por tras do menu.
//
// Passou a usar o `Painel` (janela no desktop, sheet no celular) em vez de ter
// posicionamento proprio. O que ele tinha de especial — nao escurecer o jogo,
// viver acima das telas de menu — virou parametro: sem `backdropZIndex`, em
// z-40.
import { Storefront } from '@phosphor-icons/react'
import { useUiStore } from '@/stores/uiStore'
import { GameIconButton } from '@/components/game/controls'
import { Painel } from '@/components/game/Painel'
import { AutoPanel } from './AutoPanel'

// O badge de contagem de bolas que ficava logo ABAIXO do botao "auto" foi
// removido (pedido explicito do usuario, limpeza de interface). A informacao nao
// se perdeu: as mesmas contagens aparecem ao lado de cada `<select>` de item
// DENTRO do painel Auto (`AutoPanel`, `.item-count-badge`), que e onde o jogador
// esta quando essa informacao importa. Fora dali era um bloco permanente sobre o
// campo de batalha repetindo dado que ninguem estava olhando.

export function AutoWindow() {
  const open = useUiStore((s) => s.autoOpen)
  const setOpen = useUiStore((s) => s.setAutoOpen)

  if (!open) return null

  // Atalho pra Loja (pedido explicito): a decisao "estou sem Poke Ball" nasce
  // olhando as contagens DESTE painel, e ate entao exigia fechar tudo e
  // procurar a Loja no menu. Fecha o painel junto porque a Loja abre por cima
  // dele, e painel escondido atras de outro so atrapalha o fechar-ao-tocar-fora.
  const titulo = (
    <span className="inline-flex items-center gap-[.4em]">
      Automações
      <GameIconButton
        variant="ghost"
        title="Comprar itens na Loja"
        aria-label="Comprar itens na Loja"
        onClick={() => {
          setOpen(false)
          useUiStore.getState().openScreen('loja')
        }}
      >
        <Storefront />
      </GameIconButton>
    </span>
  )

  return (
    // `backdropZIndex` ausente: este e o unico painel que NAO escurece o jogo.
    // O pedido original era poder ver o campo de batalha enquanto se mexe nas
    // automacoes, e por isso ele tambem vive acima das telas de menu (z-40).
    <Painel
      winKey="auto"
      widthEm={19}
      zIndex={40}
      // Nao escurece o jogo, mas SEMPRE fechou ao clicar fora — as duas coisas
      // andavam juntas na GameWindow e aqui precisam andar separadas.
      fecharAoTocarFora
      snap="meia"
      onClose={() => setOpen(false)}
      title={titulo}
    >
      <AutoPanel />
    </Painel>
  )
}
