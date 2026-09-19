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
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from 'react'
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
        <GameButton disabled={paginaAtual <= 1} onClick={() => irPara(paginaAtual - 1)} aria-label="Página anterior">
          <CaretLeft />
        </GameButton>
        <GameButton disabled={paginaAtual >= totalPaginas} onClick={() => irPara(paginaAtual + 1)} aria-label="Próxima página">
          <CaretRight />
        </GameButton>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Revelacao incremental por rolagem (PH-558)
// ---------------------------------------------------------------------------
// Alternativa ao par acima pras 3 grades da Mochila (Pokemons/Itens/TMs,
// origem na aba TMs — PH-557). NAO MUDA NADA sobre o que e buscado do
// Supabase: a colecao inteira (POKEs/itens da mochila) ja chega do servidor
// numa unica leitura, em `useMochila`, e fica inteira em memoria no cliente —
// isso e verdade tanto com `usePaginacao` quanto com este hook. A paginacao
// SEMPRE foi so sobre quantos NODES o navegador desenha de uma vez (ver o
// cabecalho do arquivo), nunca sobre economizar leitura de banco; nenhuma das
// duas formas muda o numero de linhas lidas do Postgres.
//
// A troca e so de UX: com `TAMANHO_PAGINA` fixo e a grade em `auto-fill`
// (numero de colunas variavel pela largura), a ultima linha de uma pagina
// raramente enche, sobrando celulas vazias que leem como "acabou aqui" mesmo
// havendo mais itens numa pagina seguinte (achado real com screenshot, ver
// PH-557). Revelar mais ao chegar perto do fim do scroll evita esse
// descompasso — a ultima linha parcial passa a significar so "o que carregou
// ate agora", que e a leitura correta de qualquer feed com scroll.
export const LOTE_INCREMENTAL = 24

export interface Incremental<T> {
  /** Fatia de `itens` a desenhar agora. */
  mostrados: T[]
  /** Handler pro `onScroll` do container rolavel (ex.: `GradeDeInventario`). */
  aoRolar: (evento: UIEvent<HTMLDivElement>) => void
  /**
   * `ref` do container rolavel — passa direto pro `ref` do `GradeDeInventario`
   * (que a encaminha pro `<div>` de verdade). Sem isto o hook nao tem como medir
   * se o lote atual ENCHEU a caixa; ver o BUG REAL no corpo do hook.
   */
  containerRef: (node: HTMLDivElement | null) => void
  /** Quantos itens ainda nao foram revelados. */
  restantes: number
}

/**
 * Revela `itens` em lotes conforme o container rola perto do fim, em vez de
 * cortar em paginas navegadas por seta.
 *
 * Reseta pro lote inicial sempre que a IDENTIDADE de `itens` muda — o que
 * cobre tanto "o filtro mudou" (o array filtrado/ordenado e recalculado, nova
 * identidade) quanto "os dados de origem mudaram" (flush do servidor). Quem
 * chama precisa passar um array ja memoizado (`useMemo`) com as dependencias
 * certas, ou o reset dispara a cada render.
 *
 * BUG REAL (PH-559), achado pelo dono do projeto com a mao na mochila: se o
 * LOTE_INCREMENTAL cabe inteiro dentro de `alturaMaxEm` sem estourar — comum
 * com colunas largas, ex. 24 itens em 8 colunas sao so 3 linhas, contra as ~5
 * que cabem em 20em —, o container nunca fica rolavel. Sem overflow nao ha
 * `onScroll` nenhum pra disparar, e o resto da lista trava pra sempre: "role
 * para ver mais" sem NADA que role. O efeito abaixo fecha esse buraco —
 * completa sozinho, lote atras de lote, ate a caixa realmente ficar cheia (ou
 * acabarem os itens) — ANTES de depender do gesto de rolagem do jogador.
 */
export function useRevelacaoIncremental<T>(itens: T[], lote = LOTE_INCREMENTAL): Incremental<T> {
  const [visivel, setVisivel] = useState(lote)
  const elRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useCallback((node: HTMLDivElement | null) => { elRef.current = node }, [])

  useEffect(() => { setVisivel(lote) }, [itens, lote])

  // Sem array de dependencias: precisa reler o DOM depois de CADA render (o
  // proprio `setVisivel` daqui inclusive), pra saber se o lote que acabou de
  // entrar ja produziu overflow. Converge sozinho — a condicao `visivel <
  // itens.length` para de bater assim que mostrar tudo, mesmo que a caixa
  // nunca preencha (lista curta: fim de lista de verdade, nao bug).
  useEffect(() => {
    const el = elRef.current
    if (el && visivel < itens.length && el.scrollHeight <= el.clientHeight) {
      setVisivel((v) => Math.min(v + lote, itens.length))
    }
  })

  // Cobre o caso de a JANELA crescer (redimensionar, girar o celular): a
  // caixa que estava cheia pode deixar de estar, e sem isto o preenchimento
  // automatico so rodaria de novo no proximo filtro/ordenacao. Recriado a
  // cada mudanca de `itens`/`lote` (e nao so uma vez): senao o closure do
  // callback ficaria preso nos valores do primeiro render pra sempre, e um
  // filtro que reduzisse a lista deixaria a guarda `visivel < itens.length`
  // comparando contra um `itens.length` velho.
  useEffect(() => {
    const el = elRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (visivel < itens.length && el.scrollHeight <= el.clientHeight) {
        setVisivel((v) => Math.min(v + lote, itens.length))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [itens, lote, visivel])

  function aoRolar(evento: UIEvent<HTMLDivElement>) {
    const el = evento.currentTarget
    if (visivel < itens.length && el.scrollTop + el.clientHeight >= el.scrollHeight - 96) {
      setVisivel((v) => Math.min(v + lote, itens.length))
    }
  }

  const mostrados = useMemo(() => itens.slice(0, Math.min(visivel, itens.length)), [itens, visivel])
  return { mostrados, aoRolar, containerRef, restantes: itens.length - mostrados.length }
}

/**
 * Rodape da revelacao incremental — equivalente ao `<Paginacao>` acima, mas
 * sem controles: nao ha pagina pra navegar, so um aviso enquanto falta
 * revelar. Nao renderiza nada quando ja mostrou tudo (mesma convencao do
 * `<Paginacao>`: sem sobra visual quando nao ha mais nada a fazer).
 */
export function RevelacaoIncremental({ estado, rotulo }: { estado: Incremental<unknown>; rotulo: string }) {
  const total = estado.mostrados.length + estado.restantes
  if (total === 0) return null
  return (
    <p className="text-[.75em] text-n500">
      {estado.mostrados.length} de {total} {rotulo}{estado.restantes > 0 ? ' · role para ver mais' : ''}
    </p>
  )
}
