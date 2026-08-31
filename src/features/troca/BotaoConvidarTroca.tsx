// PH-314 — o gatilho de "convidar pra trocar" ao lado de um jogador que ja esta
// na tela.
//
// COMPONENTE, E NAO SO O HOOK, porque os dois lugares que o usam desenham a
// MESMA coisa: um icone no fim de uma linha. Isso e o oposto de
// `usePedirAmizade`, que virou hook porque o Ranking mostra icone e o Chat usa o
// proprio nick como gatilho — la nao havia forma comum pra compartilhar.
//
// `stopPropagation` sempre, e nao so no Correio: la a linha inteira e clicavel
// (abre o fio), e sem isso convidar pra trocar abriria a conversa por baixo. No
// Ranking a linha nao tem clique, entao a chamada e inofensiva — e deixar a
// decisao "aqui precisa, ali nao" com quem monta o componente e como se esquece
// dela na terceira tela.
import { ArrowsLeftRight } from '@phosphor-icons/react'
import { useConvidarTroca } from './useConvidarTroca'

export function BotaoConvidarTroca({ userId }: { userId: string }) {
  const { convidar, enviando, souEu } = useConvidarTroca()
  // Nao oferecer a acao pra si mesmo e APRESENTACAO, nao regra: o servidor
  // continua recusando ("Voce nao pode trocar com voce mesmo."). Esconder aqui
  // so evita fazer o jogador clicar pra descobrir o obvio.
  if (souEu(userId)) return null
  return (
    <button
      type="button"
      aria-label="Convidar para trocar"
      title="Convidar para trocar"
      disabled={enviando}
      onClick={(e) => { e.stopPropagation(); convidar(userId) }}
      className="shrink-0 rounded-[.35em] p-[.25em] text-n500 transition-colors hover:bg-n800 hover:text-n100 disabled:opacity-40"
    >
      <ArrowsLeftRight className="text-[1.05em]" />
    </button>
  )
}
