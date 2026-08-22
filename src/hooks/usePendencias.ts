// Quantas coisas estao esperando uma acao do jogador em cada menu.
//
// As duas consultas usam as MESMAS `queryKey` das telas de Correio e Mercado.
// Isso nao e detalhe: com a chave compartilhada, abrir o Correio e ler uma
// mensagem invalida o cache e o contador some sozinho — se cada lado tivesse a
// propria chave, a bolinha continuaria la ate o proximo intervalo.
//
import { useQuery } from '@tanstack/react-query'
import { correio } from '@/data/remote/correioRealtime'
import { mercadoMeus } from '@/data/remote/mercadoRpc'

const INTERVALO_CORREIO_MS = 60000
// O Mercado e mais caro por consulta (ordens + anuncios + ofertas dos dois
// lados) e menos urgente: um lance pendente pode esperar dois minutos.
const INTERVALO_MERCADO_MS = 120000

/** Mensagem de conversa nao lida + aviso pendente + anexo ainda nao coletado. */
export function usePendenciasDoCorreio(): number {
  const { data } = useQuery({
    queryKey: ['correio'],
    queryFn: () => correio(),
    staleTime: INTERVALO_CORREIO_MS / 2,
    refetchInterval: INTERVALO_CORREIO_MS,
  })
  if (!data) return 0
  // As conversas (PH-81) trazem `naoLidas` e `anexosPendentes` ja contados pela
  // RPC, por contato. Somar os dois aqui e o que faz o sino avisar tambem
  // quando o que chegou foi um ITEM, e nao um texto novo — sem isso, mensagem
  // ja lida com anexo por coletar sumiria do contador com o item preso dentro.
  const naConversa = data.conversas.reduce((t, c) => t + c.naoLidas + c.anexosPendentes, 0)
  // Aviso de sistema e pedido de amizade ficam fora das conversas, mas nao
  // fora do contador: pro sino do HUD e tudo "tem coisa esperando voce".
  const emAvisos = data.avisos.filter((m) => {
    const temAnexoPendente = (m.anexo_itens?.length ?? 0) > 0 && !m.anexo_coletado_em
    return temAnexoPendente || m.estado === 'pendente'
  }).length
  return naConversa + emAvisos
}

/** Lances recebidos que ainda esperam aceitar/recusar. */
export function usePendenciasDoMercado(): number {
  const { data } = useQuery({
    queryKey: ['mercado', 'meus'],
    queryFn: () => mercadoMeus(),
    staleTime: INTERVALO_MERCADO_MS / 2,
    refetchInterval: INTERVALO_MERCADO_MS,
  })
  return data?.ofertasRecebidas?.length ?? 0
}
