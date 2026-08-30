// Quantas coisas estao esperando uma acao do jogador em cada menu.
//
// As duas consultas usam as MESMAS `queryKey` das telas de Correio e Mercado.
// Isso nao e detalhe: com a chave compartilhada, abrir o Correio e ler uma
// mensagem invalida o cache e o contador some sozinho — se cada lado tivesse a
// propria chave, a bolinha continuaria la ate o proximo intervalo.
//
// ---------------------------------------------------------------------------
// CUSTO: ESTES DOIS POLLS SAO O SEGUNDO MAIOR CONSUMO DE BANCO DO JOGO
// ---------------------------------------------------------------------------
// `ActionDock` esta sempre montado, entao os dois intervalos rodam durante a
// sessao inteira, mesmo que o jogador nunca abra Correio ou Mercado. Nos valores
// antigos (60s e 120s) eram ~90 requisicoes por hora por aba, so pra manter dois
// contadores — atras somente do flush de sessao no consumo de Egress do plano
// Free.
//
// O que mudou: o Correio passou a ser servido por REALTIME (a assinatura vive
// aqui, ver `useCorreioAoVivo`) e o poll dele virou rede de seguranca de 5
// minutos, nao mais o caminho principal. O do Mercado tambem foi pra 5 minutos:
// ele nao tem Realtime e e a consulta mais cara das duas (ordens, anuncios e
// ofertas dos dois lados), mas um lance recebido pode esperar — e o proprio
// jogador dando lance ja invalida a chave na hora.
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { correio, assinarCorreioAoVivo } from '@/data/remote/correioRealtime'
import { mercadoMeus } from '@/data/remote/mercadoRpc'
import { supabase } from '@/lib/supabase'

// Rede de seguranca, nao caminho principal: cobre Realtime cair, websocket
// bloqueado por rede corporativa, e a janela entre o login e a assinatura subir.
const INTERVALO_CORREIO_MS = 300000
// Sem Realtime (a tabela do Mercado nao esta na publication), entao aqui o poll
// AINDA e o caminho principal — so mais espacado.
const INTERVALO_MERCADO_MS = 300000

// ---------------------------------------------------------------------------
// Assinatura UNICA de Realtime do correio, com contagem de referencia
// ---------------------------------------------------------------------------
// Estado de modulo, e nao `useRef`, porque `usePendenciasDoCorreio` e chamado de
// DOIS componentes ao mesmo tempo (`ActionDock` e o sheet "Mais"). Uma assinatura
// por chamador estouraria: `assinarCorreioAoVivo` usa `supabase.channel()` com
// nome fixo por usuario (`correio-<uid>`), e pedir o mesmo nome antes de remover
// o canal anterior devolve o canal JA inscrito — `.on()` nele lanca "cannot add
// postgres_changes callbacks after subscribe()". Esse bug ja aconteceu no
// `CorreioMenu` (ver o comentario que sobrou la) e a contagem de referencia e o
// que impede a terceira ocorrencia.
let assinantes = 0
let cancelarAssinatura: (() => void) | null = null

function useCorreioAoVivo(): void {
  const qc = useQueryClient()
  useEffect(() => {
    assinantes += 1
    if (assinantes === 1 && !cancelarAssinatura) {
      void supabase.auth.getSession().then(({ data }) => {
        const uid = data.session?.user.id
        // `assinantes === 0` cobre a desmontagem acontecendo DENTRO do gap
        // assincrono do `getSession` (StrictMode, remount rapido): sem isto a
        // assinatura subiria depois da limpeza e ficaria orfa.
        if (!uid || assinantes === 0 || cancelarAssinatura) return
        cancelarAssinatura = assinarCorreioAoVivo(uid, () => {
          void qc.invalidateQueries({ queryKey: ['correio'] })
        })
      })
    }
    return () => {
      assinantes -= 1
      if (assinantes === 0) {
        cancelarAssinatura?.()
        cancelarAssinatura = null
      }
    }
  }, [qc])
}

/**
 * O que esta esperando o jogador no Correio, SEPARADO POR NATUREZA (PH-287).
 *
 * Era um numero so, e o numero sozinho mentia por omissao. Carta com item
 * anexado conta DUAS vezes — uma como mensagem por ler, outra como anexo por
 * coletar (PH-22/PH-164, comportamento deliberado pra o presente nao sumir do
 * sino antes de ser recolhido). O jogador lia a mensagem, via o contador cair de
 * 2 pra 1, e o sino continuava aceso sem NADA na tela dizendo que ainda faltava
 * pegar o item. Foi provavelmente o que originou o relato da PH-213, fechada
 * como nao reproduzida: o estado sempre esteve certo, a comunicacao e que nao
 * existia.
 */
export interface PendenciasDoCorreio {
  /** O que o sino mostra. Continua sendo a soma — no badge nao cabe mais que um numero. */
  total: number
  /** Mensagens e pedidos que o jogador ainda nao abriu. */
  porLer: number
  /** Itens e POKEs presos em carta, esperando serem recolhidos. */
  anexos: number
}

/**
 * A conta, separada da consulta pra poder ser testada sem React e sem rede.
 *
 * `data` e o retorno de `correio()`; o parametro estrutural evita arrastar o
 * tipo inteiro da RPC pra ca so pra somar tres campos.
 */
export function resumoDoCorreio(data: {
  conversas: { naoLidas: number; anexosPendentes: number }[]
  avisos: {
    estado?: string | null
    anexo_itens?: unknown[] | null
    anexo_poke?: unknown
    anexo_coletado_em?: string | null
  }[]
} | undefined): PendenciasDoCorreio {
  if (!data) return { total: 0, porLer: 0, anexos: 0 }

  // As conversas (PH-81) trazem `naoLidas` e `anexosPendentes` ja contados pela
  // RPC, por contato — a separacao que esta issue precisa ja existia na origem,
  // e era jogada fora aqui.
  let porLer = data.conversas.reduce((t, c) => t + c.naoLidas, 0)
  let anexos = data.conversas.reduce((t, c) => t + c.anexosPendentes, 0)

  // Aviso de sistema e pedido de amizade ficam fora das conversas, mas nao fora
  // do contador: pro sino do HUD e tudo "tem coisa esperando voce".
  for (const m of data.avisos) {
    // PH-164: o anexo de POKE conta igual. Sem ele, a carta do Eevee marcada
    // como lida sumia do sino com o presente ainda preso dentro — o mesmo
    // buraco que a PH-22 fechou pro anexo de item.
    const temAlgoAnexado = (m.anexo_itens?.length ?? 0) > 0 || Boolean(m.anexo_poke)
    // `else if`, e nao dois `if`: aqui o aviso e UMA carta, e ela conta uma vez
    // — era assim que o `filter(...).length` de antes contava, e mudar isso
    // inflaria o sino sem que nada tivesse chegado. Na CONVERSA o caso e outro:
    // `naoLidas` e `anexosPendentes` sao contagens de mensagens diferentes, e
    // por isso somam mesmo.
    if (temAlgoAnexado && !m.anexo_coletado_em) anexos += 1
    else if (m.estado === 'pendente') porLer += 1
  }

  return { total: porLer + anexos, porLer, anexos }
}

/** Mensagem de conversa nao lida + aviso pendente + anexo ainda nao coletado. */
export function usePendenciasDoCorreio(): PendenciasDoCorreio {
  useCorreioAoVivo()
  const { data } = useQuery({
    queryKey: ['correio'],
    queryFn: () => correio(),
    staleTime: INTERVALO_CORREIO_MS / 2,
    refetchInterval: INTERVALO_CORREIO_MS,
    // Explicito, apesar de ser o default: aba oculta nao tem contador pra
    // ninguem ver, e um jogo idle passa horas em segundo plano.
    refetchIntervalInBackground: false,
  })
  return resumoDoCorreio(data)
}

/**
 * O que o sino do Correio esta dizendo, em uma frase (PH-287).
 *
 * `null` quando nao ha nada — quem chama trata como "sem bolha", e a tela sem
 * pendencia continua exatamente como era.
 */
export function fraseDasPendencias(p: PendenciasDoCorreio): string | null {
  if (p.total === 0) return null
  const partes: string[] = []
  if (p.porLer > 0) {
    partes.push(`${p.porLer} ${p.porLer === 1 ? 'mensagem por ler' : 'mensagens por ler'}`)
  }
  // "por coletar", e nao "anexo pendente": o jogador precisa saber que a acao e
  // PEGAR, e "anexo" e palavra de e-mail, nao de jogo.
  if (p.anexos > 0) {
    partes.push(`${p.anexos} ${p.anexos === 1 ? 'item por coletar' : 'itens por coletar'}`)
  }
  return partes.join(' e ')
}

/** Lances recebidos que ainda esperam aceitar/recusar. */
export function usePendenciasDoMercado(): number {
  const { data } = useQuery({
    queryKey: ['mercado', 'meus'],
    queryFn: () => mercadoMeus(),
    staleTime: INTERVALO_MERCADO_MS / 2,
    refetchInterval: INTERVALO_MERCADO_MS,
    refetchIntervalInBackground: false,
  })
  return data?.ofertasRecebidas?.length ?? 0
}
