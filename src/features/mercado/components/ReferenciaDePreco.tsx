// Preco medio na tela de vender e na mochila (27/10/2026).
//
// "Preco medio" e a mediana das vendas de 7 dias do grupo; sem venda, a linha
// diz isso com todas as letras e mostra o mais barato a venda. Nunca escreve
// um preco que ninguem pagou — ver o spec, decisao do dono.
import type { PrecoDeReferencia } from '@/data/remote/mercadoRpc'
import { fmt } from '../utils'
import { avisoDePreco, precoNaMoeda, simbolo, textoDaReferencia, usePrecoDeReferencia } from '../precoDeReferencia'

type Moeda = 'gold' | 'diamond'

/**
 * Linha curta pra mochila (tooltip de item, ficha do POKE). Some enquanto
 * carrega e quando o servidor falha: e informacao de apoio, e uma linha de
 * "erro" no meio da ficha seria ruido maior que a ausencia dela.
 */
export function LinhaDePrecoNoMercado({ chave, moeda = 'gold' }: { chave: string | null; moeda?: Moeda }) {
  const { data, isSuccess } = usePrecoDeReferencia(chave)
  if (!chave || !isSuccess) return null
  return (
    <p className="text-[.78em] text-menu-muted tabular-nums" data-testid="preco-no-mercado">
      {textoDaReferencia(precoNaMoeda(data, moeda), moeda)}
    </p>
  )
}

export function AvisoDaReferencia({ referencia, aviso, moeda, confirmandoBaixo }: {
  referencia: PrecoDeReferencia | null
  aviso: ReturnType<typeof avisoDePreco>
  moeda: Moeda
  confirmandoBaixo: boolean
}) {
  const s = simbolo(moeda)
  return (
    <div className="flex flex-col gap-[.15em] text-[.78em] tabular-nums">
      <span className="text-menu-muted">{textoDaReferencia(referencia, moeda)}</span>
      {aviso?.tipo === 'baixo' && (
        <span className="font-medium text-destructive" role="alert">
          Muito abaixo do preço médio ({s} {fmt.format(aviso.referencia)}).
          {confirmandoBaixo ? ' Clique de novo para confirmar.' : ''}
        </span>
      )}
      {aviso?.tipo === 'alto' && (
        <span className="text-gold">
          Bem acima do preço médio ({s} {fmt.format(aviso.referencia)}) — pode demorar a vender.
        </span>
      )}
    </div>
  )
}

/**
 * So o numero do preco medio, pra uma linha que ja tem o "a partir de" ao lado
 * (lista de itens do Comprar). Sem venda em 7 dias nao desenha nada: a linha
 * vizinha ja diz o que esta a venda.
 */
export function PrecoMedioCurto({ chave }: { chave: string }) {
  const { data } = usePrecoDeReferencia(chave)
  const p = precoNaMoeda(data, 'gold')
  if (p?.medianaDe7Dias == null) return null
  return (
    <span className="text-[.75em] text-menu-muted tabular-nums">
      preço médio <b className="text-gold">{fmt.format(p.medianaDe7Dias)}</b>
    </span>
  )
}
