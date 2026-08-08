// Paginacao de lista para Mochila/Loja.
//
// O PROBLEMA: a Mochila e a aba Pokemons da Loja renderizavam UM CARD POR POKE
// da mochila inteira. Cada card monta sprite, chips de tipo/raridade, cadeado,
// tooltip e (na Loja) checkbox + calculo de preco de venda — com algumas centenas
// de POKEs isso e alguns milhares de nodes por abertura de tela, e a lista e
// reconstruida a cada tecla digitada na busca, a cada troca de filtro e a cada
// resposta do servidor (que sobrescreve o estado local inteiro).
//
// POR QUE PAGINACAO E NAO VIRTUALIZACAO: a lista vive dentro do corpo rolavel de
// uma `GameWindow` que o jogador pode arrastar e REDIMENSIONAR (`resize: both` do
// CSS, sem JS). Uma lista virtualizada precisa saber a altura da viewport de
// scroll e a altura de cada linha; aqui as duas variam com o redimensionamento da
// janela, com o `hudScale` e com o proprio conteudo (o card quebra em duas linhas
// quando o nome e longo). Isso levaria a medicao continua e a um scroll
// aninhado dentro de um container ja rolavel — ruim no toque. Paginar corta o
// custo pelo mesmo fator sem medir nada.
//
// A paginacao e aplicada DEPOIS de filtrar/ordenar, entao a busca continua vendo
// a colecao inteira (o filtro nao enxerga so a pagina atual — seria o bug obvio).
import { useEffect, useMemo, useState } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { GameButton } from './controls'

export const TAMANHO_PAGINA = 30

export interface Paginado<T> {
  pagina: T[]
  paginaAtual: number
  totalPaginas: number
  total: number
  irPara: (p: number) => void
}

/** Recorta `itens` na pagina atual. Volta pra pagina 1 quando o filtro muda. */
export function usePaginacao<T>(itens: T[], tamanho = TAMANHO_PAGINA): Paginado<T> {
  const [paginaAtual, setPaginaAtual] = useState(1)
  const totalPaginas = Math.max(1, Math.ceil(itens.length / tamanho))

  // Filtrar/ordenar/vender pode encurtar a lista com o jogador numa pagina que
  // deixou de existir — sem isto a tela ficaria vazia sem explicacao.
  useEffect(() => {
    if (paginaAtual > totalPaginas) setPaginaAtual(1)
  }, [paginaAtual, totalPaginas])

  const pagina = useMemo(() => {
    const inicio = (Math.min(paginaAtual, totalPaginas) - 1) * tamanho
    return itens.slice(inicio, inicio + tamanho)
  }, [itens, paginaAtual, totalPaginas, tamanho])

  return {
    pagina,
    paginaAtual: Math.min(paginaAtual, totalPaginas),
    totalPaginas,
    total: itens.length,
    irPara: setPaginaAtual,
  }
}

/** Controles de pagina. Nao renderiza nada quando ha uma pagina so. */
export function Paginacao({ estado, rotulo }: { estado: Paginado<unknown>; rotulo: string }) {
  if (estado.totalPaginas <= 1) return null
  const { paginaAtual, totalPaginas, total, irPara } = estado
  return (
    <div className="flex flex-wrap items-center justify-between gap-[.5em] border-t border-n800 pt-[.5em]">
      <span className="text-[.75em] text-n500">
        {total} {rotulo} · pagina {paginaAtual}/{totalPaginas}
      </span>
      <div className="flex items-center gap-[.35em]">
        <GameButton disabled={paginaAtual <= 1} onClick={() => irPara(paginaAtual - 1)} aria-label="Pagina anterior">
          <CaretLeft />
        </GameButton>
        <GameButton disabled={paginaAtual >= totalPaginas} onClick={() => irPara(paginaAtual + 1)} aria-label="Proxima pagina">
          <CaretRight />
        </GameButton>
      </div>
    </div>
  )
}
