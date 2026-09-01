// Descricao FUNCIONAL de um item, derivada dos numeros reais dele.
//
// A planilha guarda uma descricao generica por CATEGORIA — as quatro bolas
// dizem "Item de captura.", as quatro pocoes dizem "Restaura HP.". Isso nao
// responde a unica pergunta que o jogador tem com o mouse parado em cima do
// item: "esta e melhor que a que eu ja tenho?".
//
// Por isso o texto e DERIVADO (`healAmount`, `captureRate`, `reviveHpPercent`,
// preco) em vez de escrito a mao numa segunda lista: reequilibrar a Hyper
// Potion na planilha muda a descricao junto, sem ninguem lembrar de vir aqui.
// A frase da planilha continua aparecendo como primeira linha.
import { SPECIAL_EVOLUTION_LEVEL, SPECIAL_EVOLUTION_STONE_COUNT } from './pokes'
import type { AnyItem } from './items'

const fmt = new Intl.NumberFormat('pt-BR')

export interface InfoDeItem {
  /** A frase de catalogo (vem da planilha ou do gerador de Stones). */
  resumo: string
  /** O que ele faz, em numeros. Uma linha por efeito real. */
  efeitos: string[]
  /** Preco de compra (quando vendido na Loja) e de venda. */
  precos: string[]
}

export function infoDoItem(item: AnyItem): InfoDeItem {
  const efeitos: string[] = []

  if (item.kind === 'potion' && item.healAmount != null) {
    efeitos.push(
      // `Infinity` e o valor real da Max Potion no dado gerado — imprimir
      // "Infinity HP" seria vazamento de detalhe interno.
      Number.isFinite(item.healAmount)
        ? `Restaura ${fmt.format(item.healAmount)} de HP do POKE em campo.`
        : 'Restaura TODO o HP do POKE em campo.',
    )
    efeitos.push('Não funciona com o POKE desmaiado — use um Revive.')
  }

  if (item.kind === 'revive' && item.reviveHpPercent != null) {
    efeitos.push(`Reanima um POKE desmaiado com ${Math.round(item.reviveHpPercent * 100)}% do HP máximo.`)
  }

  if (item.kind === 'ball' && item.captureRate != null) {
    efeitos.push(`Multiplica a chance de captura por ${item.captureRate}x.`)
    efeitos.push('Capturados entram na Mochila no Nível 1.')
  }

  if (item.kind === 'rod') {
    efeitos.push('A pesca ainda não existe no jogo — esta vara não faz nada.')
  }

  if (item.kind === 'stone') {
    // Numero INTERPOLADO, nao escrito a mao (PH-136): estava `20` literal aqui
    // enquanto a constante dizia outra coisa, e a ficha que o jogador le e
    // exatamente o lugar onde essa divergencia nao aparece como bug — aparece
    // como o jogo mentindo.
    efeitos.push(
      `Evolução especial: ${SPECIAL_EVOLUTION_STONE_COUNT} unidades no Nível ${SPECIAL_EVOLUTION_LEVEL}`
      + ` evoluem um POKE de tipo ${item.stoneType}.`,
    )
    efeitos.push('Não e vendida na Loja: só cai de POKEs derrotados do mesmo tipo.')
  }

  const precos: string[] = []
  if ('buyPrice' in item && item.buyPrice > 0) precos.push(`Compra: ${fmt.format(item.buyPrice)} de ouro`)
  if (item.sellPrice > 0) precos.push(`Venda: ${fmt.format(item.sellPrice)} de ouro`)

  return { resumo: item.description, efeitos, precos }
}
