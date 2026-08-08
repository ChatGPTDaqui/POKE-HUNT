// Quantas coisas estao esperando uma acao do jogador em cada menu.
//
// As duas consultas usam as MESMAS `queryKey` das telas de Correio e Mercado.
// Isso nao e detalhe: com a chave compartilhada, abrir o Correio e ler uma
// mensagem invalida o cache e o contador some sozinho — se cada lado tivesse a
// propria chave, a bolinha continuaria la ate o proximo intervalo.
//
// Sem servidor configurado nao ha correio nem mercado: as consultas ficam
// desligadas e os contadores sao 0.
import { useQuery } from '@tanstack/react-query'
import { servidor, servidorAtivo } from '@/data/remote/servidor'

const INTERVALO_CORREIO_MS = 60000
// O Mercado e mais caro por consulta (ordens + anuncios + ofertas dos dois
// lados) e menos urgente: um lance pendente pode esperar dois minutos.
const INTERVALO_MERCADO_MS = 120000

/** Mensagens nao lidas + anexos ainda nao coletados. */
export function usePendenciasDoCorreio(): number {
  const { data } = useQuery({
    queryKey: ['correio'],
    queryFn: () => servidor.correio(),
    enabled: servidorAtivo(),
    staleTime: INTERVALO_CORREIO_MS / 2,
    refetchInterval: INTERVALO_CORREIO_MS,
  })
  if (!data) return 0
  return data.mensagens.filter((m) => {
    const temAnexoPendente = (m.anexo_itens?.length ?? 0) > 0 && !m.anexo_coletado_em
    return temAnexoPendente || m.estado === 'pendente'
  }).length
}

/** Lances recebidos que ainda esperam aceitar/recusar. */
export function usePendenciasDoMercado(): number {
  const { data } = useQuery({
    queryKey: ['mercado', 'meus'],
    queryFn: () => servidor.mercadoMeus(),
    enabled: servidorAtivo(),
    staleTime: INTERVALO_MERCADO_MS / 2,
    refetchInterval: INTERVALO_MERCADO_MS,
  })
  return data?.ofertasRecebidas?.length ?? 0
}
