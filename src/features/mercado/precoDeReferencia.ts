// Preco de referencia do Mercado (27/10/2026): busca em lote + regras de tela.
// Spec: docs/planos/2026-10-27-mercado-preco-medio-design.md
//
// BUSCA EM LOTE. A ficha, o tooltip e a tela de vender pedem o preco de UMA
// chave cada; quando varios aparecem no mesmo instante (a lista de Vender abre
// com dez POKEs), dez RPCs viram uma. As chaves pedidas no mesmo tique se
// juntam numa chamada so; cada `useQuery` continua com a propria chave de
// cache, entao reabrir a ficha do mesmo POKE nao volta ao servidor.
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as mercadoRpc from '@/data/remote/mercadoRpc'
import type { PrecoDeReferencia } from '@/data/remote/mercadoRpc'
import { fmt, STALE_MS } from './utils'

type Moeda = 'gold' | 'diamond'
type Pendente = { resolver: (r: PrecoDeReferencia[]) => void; rejeitar: (e: unknown) => void }

let fila = new Map<string, Pendente[]>()
let agendado = false

function despachar(): void {
  agendado = false
  const lote = fila
  fila = new Map()
  const chaves = [...lote.keys()]
  mercadoRpc.precoDeReferencia(chaves).then(
    (linhas) => {
      for (const [chave, quem] of lote) {
        const minhas = linhas.filter((l) => l.chave === chave)
        for (const p of quem) p.resolver(minhas)
      }
    },
    (erro) => { for (const quem of lote.values()) for (const p of quem) p.rejeitar(erro) },
  )
}

/** Exportada pra teste. Junta pedidos do mesmo tique numa chamada. */
export function buscarPreco(chave: string): Promise<PrecoDeReferencia[]> {
  return new Promise((resolver, rejeitar) => {
    const lista = fila.get(chave) ?? []
    lista.push({ resolver, rejeitar })
    fila.set(chave, lista)
    if (!agendado) {
      agendado = true
      setTimeout(despachar, 0)
    }
  })
}

/** Linhas da chave (uma por moeda). `chave` nula nao busca nada. */
export function usePrecoDeReferencia(chave: string | null) {
  return useQuery({
    queryKey: ['mercado', 'preco', chave],
    queryFn: () => buscarPreco(chave!),
    enabled: !!chave,
    staleTime: STALE_MS,
  })
}

export function precoNaMoeda(linhas: PrecoDeReferencia[] | undefined, moeda: Moeda): PrecoDeReferencia | null {
  return linhas?.find((l) => l.currency === moeda) ?? null
}

/**
 * O numero contra o qual o preco do jogador e comparado: a mediana de 7 dias
 * ou, sem venda, o menor anuncio aberto. `null` = nada pra comparar.
 */
export function referenciaDe(p: PrecoDeReferencia | null): number | null {
  if (!p) return null
  return p.medianaDe7Dias ?? p.aPartirDe
}

/**
 * Preco sugerido ao abrir o formulario de venda: a mediana; sem ela, um abaixo
 * do mais barato anunciado (pra ser o primeiro da fila); sem nenhum dos dois,
 * `null` (o campo fica como sempre ficou).
 */
export function precoSugerido(p: PrecoDeReferencia | null): number | null {
  if (!p) return null
  if (p.medianaDe7Dias != null) return p.medianaDe7Dias
  if (p.aPartirDe != null) return Math.max(1, p.aPartirDe - 1)
  return null
}

export type AvisoDePreco = { tipo: 'baixo' | 'alto'; referencia: number } | null

/**
 * Abaixo de 50% da referencia: provavel erro de digitacao (um zero a menos) —
 * a tela pede confirmacao. Acima de 200%: so avisa que pode demorar.
 */
export function avisoDePreco(preco: number | null, p: PrecoDeReferencia | null): AvisoDePreco {
  const referencia = referenciaDe(p)
  if (preco == null || !Number.isFinite(preco) || preco <= 0 || referencia == null) return null
  if (preco < referencia * 0.5) return { tipo: 'baixo', referencia }
  if (preco > referencia * 2) return { tipo: 'alto', referencia }
  return null
}

export function simbolo(moeda: Moeda): string {
  return moeda === 'diamond' ? '◆' : '🪙'
}

/** Texto da referencia — exportado pra teste. */
export function textoDaReferencia(p: PrecoDeReferencia | null, moeda: Moeda): string {
  const s = simbolo(moeda)
  if (p?.medianaDe7Dias != null) {
    const vendas = p.vendasDe7Dias === 1 ? '1 venda' : `${p.vendasDe7Dias} vendas`
    return `Preço médio ${s} ${fmt.format(p.medianaDe7Dias)} (${vendas} em 7 dias)`
  }
  if (p?.aPartirDe != null) return `Sem vendas recentes · à venda a partir de ${s} ${fmt.format(p.aPartirDe)}`
  return 'Sem vendas recentes'
}

/**
 * Formulario de venda: busca a referencia, PREENCHE o preco uma vez por grupo
 * (so enquanto o jogador nao mexeu no campo) e devolve o aviso de 50%/200%.
 *
 * `editado` volta a falso quando a chave muda: escolher outro POKE na lista e
 * pedir uma sugestao nova, nao herdar o numero digitado pro anterior.
 */
export function useReferenciaNaVenda(
  chave: string | null, moeda: Moeda, preco: number | null, setPreco: (p: number) => void,
  /** Qual CAMPO recebe a sugestao (preco fixo x lance minimo): trocar de campo sugere de novo. */
  campo = 'preco',
) {
  const { data } = usePrecoDeReferencia(chave)
  const p = precoNaMoeda(data, moeda)
  const editado = useRef(false)
  const sugeridoPara = useRef<string | null>(null)
  const [confirmandoBaixo, setConfirmandoBaixo] = useState(false)

  useEffect(() => {
    editado.current = false
    setConfirmandoBaixo(false)
  }, [chave, moeda, campo])

  const sugestao = precoSugerido(p)
  const marca = `${chave}|${moeda}|${campo}`
  useEffect(() => {
    if (sugestao == null || editado.current || sugeridoPara.current === marca) return
    sugeridoPara.current = marca
    setPreco(sugestao)
  }, [sugestao, marca, setPreco])

  const aviso = avisoDePreco(preco, p)
  return {
    referencia: p,
    aviso,
    /** Chamar no onChange do campo de preco. */
    marcarEditado: () => { editado.current = true; setConfirmandoBaixo(false) },
    /**
     * Preco muito baixo pede DOIS cliques: o primeiro so arma. Devolve `true`
     * quando pode seguir com a venda.
     */
    podeConfirmar: () => {
      if (aviso?.tipo !== 'baixo' || confirmandoBaixo) return true
      setConfirmandoBaixo(true)
      return false
    },
    confirmandoBaixo,
  }
}

