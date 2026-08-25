// O icone de um item DENTRO de um slot da grade de inventario (PH-114/PH-118).
//
// ---------------------------------------------------------------------------
// POR QUE ESTE ARQUIVO EXISTE
// ---------------------------------------------------------------------------
// O par `itemIconUrl`/`itemIconBorderColor` estava repetido inline em Mochila,
// Loja e Mercado — o PH-114 registrou isso em voz alta e deixou a unificacao pra
// depois, porque naquele momento eram tres copias de uma coisa que FUNCIONAVA.
//
// O PH-123 mudou a conta: `Good Rod` e `Old Rod` nao tem arte no acervo, e na
// grade elas viraram quadrado anonimo (na lista antiga o nome estava ali do
// lado). Consertar isso em tres copias e como se ganha a quarta divergencia,
// entao a unificacao virou o caminho mais curto.
//
// Fica de fora de proposito: o `ItemIcon` da Loja (`features/shop/components/
// shared.tsx`), usado nos cards de COMPRA, onde o nome do item aparece escrito
// ao lado — ali a sigla seria redundante.
import { itemIconUrl, itemIconBorderColor } from '@/data/sprites'
import { cn } from '@/lib/utils'

/**
 * Sigla de fallback pra item sem arte.
 *
 * Duas palavras ou mais viram iniciais ("Good Rod" -> "GR"); uma palavra vira as
 * tres primeiras letras ("Antidote" -> "ANT"). Curta de proposito: o slot tem
 * 3.2em e divide espaco com o contador.
 */
export function siglaDoItem(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean)
  if (palavras.length >= 2) return palavras.slice(0, 3).map((p) => p[0]).join('').toUpperCase()
  return (palavras[0] ?? '?').slice(0, 3).toUpperCase()
}

export function IconeDeItemNaGrade({
  itemId, nome, tamanho,
}: {
  itemId: string
  /** Nome do item — usado na sigla quando nao ha arte. */
  nome: string
  /** Lado fixo (ex. '2.6em') pra ficha. Ausente: ocupa o slot inteiro. */
  tamanho?: string
}) {
  const url = itemIconUrl(itemId)
  // Stones compartilham UM icone base; a distincao entre os 17 tipos vem da COR
  // DA BORDA (nao existem 17 sprites no pack de origem) — e e por isso que a
  // borda nao e enfeite aqui.
  const borda = itemIconBorderColor(itemId)
  const estilo = tamanho ? { height: tamanho, width: tamanho } : undefined

  if (!url) {
    return (
      <span
        // `aria-hidden`: o nome do item ja esta no `aria-label` do slot, e a
        // sigla repetida faria o leitor de tela dizer "GR Good Rod".
        aria-hidden
        className={cn(
          'flex items-center justify-center rounded-[.25em] border border-n700 font-semibold text-[.7em] leading-none text-n300',
          tamanho ? 'shrink-0' : 'h-full w-full',
        )}
        style={estilo}
      >
        {siglaDoItem(nome)}
      </span>
    )
  }
  return (
    <img
      src={url}
      alt=""
      className={cn('rounded-[.3em] object-contain', tamanho ? 'shrink-0' : 'h-full w-full')}
      style={{ ...estilo, ...(borda ? { border: `2px solid ${borda}` } : null) }}
    />
  )
}
