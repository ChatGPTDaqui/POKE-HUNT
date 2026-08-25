// Previsao de "quanto tempo os suprimentos ainda duram".
//
// O jogo NAO grava consumo de item em lugar nenhum: `perfStats` conta ouro, XP,
// abates e shinys, e nada mais. Entao a taxa e MEDIDA aqui, comparando o
// estoque de agora com o estoque no inicio da amostra — exatamente o que o
// jogador veria olhando a mochila duas vezes.
//
// Por que nao estimar por formula (ex.: "1 bola por abate x abates/hora"): ela
// erraria justamente nos casos que importam. O bot so joga bola em quem
// sobrevive ao ultimo golpe, so usa pocao quando o HP cruza o limite, e as
// regras por especie fazem bolas diferentes serem gastas em ritmos diferentes.
// Medir o estoque cobre tudo isso sem saber nada sobre as regras.
//
// A amostra e reiniciada junto com `perfStats.since` (ou seja, a cada entrada em
// hunt), pelo mesmo motivo que a taxa de ouro reinicia: o consumo numa hunt de
// nivel 5 nao diz nada sobre uma de nivel 90.
import { useEffect, useState } from 'react'
import { useGameStateStore } from '@/stores/gameStateStore'
import { estoqueDoItemDeRegra, rotuloDaFamilia } from './estoqueBaixo'

/** So avisa quando faltar menos que isto (pedido explicito). */
export const LIMIAR_PREVISAO_HORAS = 2
// Abaixo disto a divisao vira ruido: 20 segundos de amostra com duas bolas
// gastas projetariam 360 bolas/hora.
const AMOSTRA_MINIMA_SEGUNDOS = 60

interface Marco {
  desde: number
  quantidade: number
}

// Module-level: a amostra tem que sobreviver ao painel Auto sendo fechado e
// reaberto — e justamente quando ele esta fechado que o consumo acontece.
const marcos = new Map<string, Marco>()
let ancoraDaAmostra = 0

function marcoDe(itemId: string, quantidade: number, agora: number): Marco {
  const atual = marcos.get(itemId)
  // Estoque SUBIU (compra, drop, entrega do Mercado): a amostra anterior nao
  // vale mais — a taxa sairia negativa e depois absurdamente baixa.
  if (!atual || quantidade > atual.quantidade) {
    const novo = { desde: agora, quantidade }
    marcos.set(itemId, novo)
    return novo
  }
  return atual
}

export interface PrevisaoDeItem {
  itemId: string
  quantidade: number
  porHora: number
  horasRestantes: number
}

/**
 * Devolve a previsao dos itens informados, ja filtrada: so entra o que esta
 * ACABANDO (abaixo do limiar) e o que tem amostra suficiente pra a conta
 * significar alguma coisa.
 */
export function usePrevisaoDeConsumo(itemIds: string[]): PrevisaoDeItem[] {
  const items = useGameStateStore((s) => s.items)
  // PH-144: a familia de cura de status depende de quais itens o jogador
  // deixou habilitados, entao a conta de estoque precisa do config.
  const autoStatusConfig = useGameStateStore((s) => s.autoStatusConfig)
  const since = useGameStateStore((s) => s.perfStats.since)
  const [, tick] = useState(0)

  // Recomeca a medicao quando a amostra de taxa recomeca (entrada em hunt).
  useEffect(() => {
    if (ancoraDaAmostra !== since) {
      ancoraDaAmostra = since
      marcos.clear()
    }
  }, [since])

  // A previsao muda com o TEMPO, nao so com o estoque: sem este timer ela
  // congelaria entre um consumo e outro.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000)
    return () => clearInterval(id)
  }, [])

  const agora = Date.now()
  const saida: PrevisaoDeItem[] = []
  for (const itemId of new Set(itemIds)) {
    // Id de FAMILIA nao e um item: o estoque relevante e a soma do grupo
    // ("Escolher melhor" soma as pocoes, a familia de revive soma os revives).
    const quantidade = estoqueDoItemDeRegra(items, itemId, autoStatusConfig)
    const marco = marcoDe(itemId, quantidade, agora)
    const segundos = (agora - marco.desde) / 1000
    if (segundos < AMOSTRA_MINIMA_SEGUNDOS) continue
    const gasto = marco.quantidade - quantidade
    if (gasto <= 0) continue
    const porHora = (gasto / segundos) * 3600
    const horasRestantes = quantidade / porHora
    if (horasRestantes >= LIMIAR_PREVISAO_HORAS) continue
    saida.push({ itemId, quantidade, porHora, horasRestantes })
  }
  return saida.sort((a, b) => a.horasRestantes - b.horasRestantes)
}

export function formatarTempoRestante(horas: number): string {
  if (horas < 1 / 60) return 'acabando agora'
  if (horas < 1) return `~${Math.round(horas * 60)} min`
  return `~${horas.toFixed(1)} h`
}

/** Rotulo do recurso pra previsao — id de FAMILIA nao tem nome de item. */
export function rotuloDoRecurso(itemId: string, nomeDoItem: (id: string) => string): string {
  return rotuloDaFamilia(itemId) ?? nomeDoItem(itemId)
}
