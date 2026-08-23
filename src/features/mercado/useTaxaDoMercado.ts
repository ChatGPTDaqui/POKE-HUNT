// Regra da taxa de venda, LIDA DO SERVIDOR (PH-98).
//
// ---------------------------------------------------------------------------
// POR QUE NAO E UMA CONSTANTE AQUI
// ---------------------------------------------------------------------------
// A tela precisa mostrar "voce recebe X (taxa de 5%: Y)" ANTES de o jogador
// confirmar — descobrir a taxa depois de vender e indistinguivel de bug de ouro
// faltando, que e a classe de reclamacao mais cara de diagnosticar.
//
// O caminho obvio seria um `const TAXA = 0.05` neste arquivo. O projeto ja usa
// esse padrao em `STARTING_ITEMS` ("Espelha `concessao_inicial_de_itens()`... o
// servidor e quem manda, esta copia so serve pro estado local"), e la ele e
// aceitavel porque divergir vira "um piscar de numeros errados no HUD no
// primeiro segundo".
//
// Aqui o custo de divergir e outro: a tela prometeria um valor liquido e o banco
// creditaria outro. Nao e um piscar — e o jogador contando o ouro e achando que
// falta. Entao a regra vem de `taxa_do_mercado()`, que e a MESMA funcao que as
// RPCs de venda usam pra calcular o desconto.
//
// Custo: uma chamada por sessao. `staleTime: Infinity` porque um percentual de
// taxa nao muda enquanto a aba esta aberta — se mudar, muda por deploy, e o
// deploy recarrega a pagina.
import { useQuery } from '@tanstack/react-query'
import * as mercadoRpc from '@/data/remote/mercadoRpc'

export interface RegraDeTaxa {
  percentual: number
  moedasIsentas: string[]
}

/**
 * Fallback enquanto a leitura esta no ar, e se ela falhar.
 *
 * Percentual ZERO de propósito, e nao 5: com zero a tela mostra o valor CHEIO
 * como liquido — otimista — mas nao INVENTA um desconto que talvez nao exista.
 * O oposto (chutar 5% e o servidor cobrar 0) faria a tela prometer menos do que
 * o jogador recebe, o que e mais seguro pro bolso dele mas ensina a nao
 * confiar no numero. Nenhum dos dois e bom; o que resolve de verdade e o
 * `carregando` que esta exposto abaixo, pra a tela poder esperar em vez de
 * chutar.
 */
const SEM_REGRA: RegraDeTaxa = { percentual: 0, moedasIsentas: [] }

export function useTaxaDoMercado(): { regra: RegraDeTaxa; carregando: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['mercado', 'taxa'],
    queryFn: () => mercadoRpc.taxaDoMercado(),
    staleTime: Infinity,
    // A tela de venda funciona sem a taxa (ela so nao mostra o liquido); nao
    // vale insistir num retry longo e deixar o painel em "carregando".
    retry: 1,
  })
  return { regra: data ?? SEM_REGRA, carregando: isLoading }
}

/**
 * A MESMA conta do servidor: divisao inteira, que trunca — e truncar positivo e
 * floor. Ver o cabecalho da migration 20260823060000: sem fixar isso, 5% de 19
 * vira 0 num lado e 1 no outro.
 */
export function taxaDeVenda(valor: number, moeda: string, regra: RegraDeTaxa): number {
  if (!(valor > 0)) return 0
  if (regra.moedasIsentas.includes(moeda)) return 0
  return Math.floor((valor * regra.percentual) / 100)
}
